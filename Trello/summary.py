from __future__ import annotations

import json
import os
import sys
from datetime import datetime

import requests
from openai import OpenAI

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

# --- KONFIGURATION ---
def get_env_value(name: str) -> str:
    value = os.environ.get(name)
    if value:
        return value.strip()

    if sys.platform == "win32":
        try:
            import winreg

            registry_scopes = (
                (winreg.HKEY_CURRENT_USER, "Environment"),
                (
                    winreg.HKEY_LOCAL_MACHINE,
                    r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
                ),
            )
            for root_key, key_path in registry_scopes:
                try:
                    with winreg.OpenKey(root_key, key_path) as key:
                        registry_value, _value_type = winreg.QueryValueEx(key, name)
                except OSError:
                    continue
                if registry_value:
                    return str(registry_value).strip()
        except OSError:
            pass

    return ""


TRELLO_API_KEY = get_env_value("TRELLO_API_KEY")
TRELLO_TOKEN = get_env_value("TRELLO_TOKEN")
OPENAI_API_KEY = get_env_value("OPENAI_API_KEY")
# --- DLL FIX FUER WINDOWS / WEASYPRINT ---
weasyprint_dll_dir = get_env_value("WEASYPRINT_DLL_DIR")
if weasyprint_dll_dir and os.path.exists(weasyprint_dll_dir):
    os.add_dll_directory(weasyprint_dll_dir)

# Boards, deren offene Aufgaben durch die KI ausgewertet werden.
QUELL_BOARD_IDS = [
    "6a04646fad0b7a351f4def9b",
]
ZIEL_BOARD_ID = "6825fba39c8fc8b0fdddc921"

AUTH_PARAMS = {"key": TRELLO_API_KEY, "token": TRELLO_TOKEN}
BASE_URL = "https://api.trello.com/1"
REQUEST_TIMEOUT_SECONDS = 30

# Fuer jeden Lauf wird auf dem Zielboard eine neue Liste erstellt.
TARGET_LIST_NAME_PREFIX = "KI-Aufgaben"
SUMMARY_CARD_PREFIXES = ("KI-Zusammenfassung", "KI-Aufgaben")

# OpenAI-Modell
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")

# Trello-Beschreibungen sollten nicht unbegrenzt lang werden.
MAX_TRELLO_DESCRIPTION_LENGTH = 8000
MAX_TASK_CARDS = 80
TASK_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "tasks": {
            "type": "array",
            "maxItems": MAX_TASK_CARDS,
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "priority": {
                        "type": "string",
                        "enum": ["hoch", "mittel", "niedrig"],
                    },
                    "source_board": {"type": "string"},
                    "source_list": {"type": "string"},
                    "due": {"type": "string"},
                    "reason": {"type": "string"},
                    "next_step": {"type": "string"},
                    "source_links": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": [
                    "title",
                    "priority",
                    "source_board",
                    "source_list",
                    "due",
                    "reason",
                    "next_step",
                    "source_links",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["tasks"],
    "additionalProperties": False,
}

openai_client = OpenAI(api_key=OPENAI_API_KEY)

session = requests.Session()
session.headers.update({"Accept": "application/json"})


def validate_configuration() -> None:
    missing = []

    if not TRELLO_API_KEY:
        missing.append("TRELLO_API_KEY")
    if not TRELLO_TOKEN:
        missing.append("TRELLO_TOKEN")
    if not OPENAI_API_KEY:
        missing.append("OPENAI_API_KEY")
    if not QUELL_BOARD_IDS:
        missing.append("QUELL_BOARD_IDS")
    if not ZIEL_BOARD_ID or ZIEL_BOARD_ID == "ID_DES_ZIELBOARDS":
        missing.append("ZIEL_BOARD_ID")

    if missing:
        print("Folgende Konfiguration fehlt:")
        for value in missing:
            print(f"- {value}")
        sys.exit(1)


def trello_request(method: str, endpoint: str, params=None, json_body=None):
    """Fuehrt einen Trello-API-Aufruf aus und behandelt Fehler zentral."""
    url = f"{BASE_URL}{endpoint}"
    request_params = {**AUTH_PARAMS, **(params or {})}

    try:
        response = session.request(
            method=method,
            url=url,
            params=request_params,
            json=json_body,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()

        if not response.content:
            return None
        return response.json()

    except requests.exceptions.Timeout as error:
        raise RuntimeError(f"Trello-API-Timeout bei {method} {endpoint}") from error
    except requests.RequestException as error:
        detail = ""
        if error.response is not None:
            detail = f" Antwort von Trello: {error.response.text[:500]}"
        raise RuntimeError(f"Trello-API-Fehler bei {method} {endpoint}.{detail}") from error


def get_board(board_id: str) -> dict:
    """Laedt grundlegende Informationen ueber das Board."""
    return trello_request(
        "GET",
        f"/boards/{board_id}",
        params={"fields": "name,url"},
    )


def get_lists(board_id: str) -> list[dict]:
    """Laedt alle offenen Listen des Boards."""
    return trello_request(
        "GET",
        f"/boards/{board_id}/lists",
        params={"filter": "open", "fields": "name,pos"},
    )


def get_cards_in_list(list_id: str) -> list[dict]:
    """Laedt alle offenen Karten einer Liste inklusive relevanter Metadaten."""
    return trello_request(
        "GET",
        f"/lists/{list_id}/cards",
        params={
            "filter": "open",
            "fields": "name,desc,due,dueComplete,labels,shortUrl,dateLastActivity,pos",
        },
    )


def create_list(board_id: str, list_name: str) -> dict:
    return trello_request(
        "POST",
        f"/boards/{board_id}/lists",
        json_body={"name": list_name, "pos": "top"},
    )


def create_task_card(list_id: str, task: dict, position: int) -> dict:
    """Erstellt eine einzelne KI-Aufgabenkarte."""
    card_name = sanitize_card_name(task.get("title") or "Offene Aufgabe")
    description = build_task_description(task)

    return trello_request(
        "POST",
        "/cards",
        json_body={
            "idList": list_id,
            "name": card_name,
            "desc": description[:MAX_TRELLO_DESCRIPTION_LENGTH],
            "pos": position + 1,
        },
    )


def sanitize_card_name(name: str) -> str:
    compact_name = " ".join(str(name).split())
    if len(compact_name) <= 180:
        return compact_name
    return compact_name[:177].rstrip() + "..."


def build_target_list_name(board_count: int) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"{TARGET_LIST_NAME_PREFIX} {timestamp} ({board_count} Boards)"


def format_card_for_prompt(board: dict, trello_list: dict, card: dict) -> str:
    """Bereitet eine einzelne Karte fuer den OpenAI-Prompt auf."""
    card_name = card.get("name", "Unbenannte Karte").strip()
    description = card.get("desc", "").strip()
    due = card.get("due")
    due_complete = card.get("dueComplete", False)
    card_url = card.get("shortUrl", "")

    labels = [
        label.get("name") or label.get("color")
        for label in card.get("labels", [])
        if label.get("name") or label.get("color")
    ]

    sections = [
        f"Board: {board['name']}",
        f"Liste: {trello_list['name']}",
        f"Karte: {card_name}",
    ]

    if description:
        sections.append(f"Beschreibung:\n{description}")
    else:
        sections.append("Beschreibung: Keine Beschreibung vorhanden.")

    if labels:
        sections.append(f"Labels: {', '.join(labels)}")

    if due:
        deadline_status = "erledigt" if due_complete else "offen"
        sections.append(f"Deadline: {due} ({deadline_status})")

    if card_url:
        sections.append(f"Trello-Link: {card_url}")

    return "\n".join(sections)


def should_skip_card(card: dict) -> bool:
    card_name = card.get("name", "").strip().lower()
    return any(card_name.startswith(prefix.lower()) for prefix in SUMMARY_CARD_PREFIXES)


def collect_boards_content(board_ids: list[str]) -> dict:
    """Liest alle Listen und Karten der konfigurierten Boards aus."""
    board_sections = []
    board_summaries = []
    total_cards = 0

    for board_id in board_ids:
        board = get_board(board_id)
        lists = get_lists(board_id)
        board_total = 0
        list_sections = []

        print(f"\nLese Board: {board['name']}")

        for trello_list in lists:
            cards = get_cards_in_list(trello_list["id"])
            relevant_cards = [card for card in cards if not should_skip_card(card)]

            skipped_count = len(cards) - len(relevant_cards)
            if skipped_count:
                print(f"  Ueberspringe {skipped_count} alte KI-Karten in '{trello_list['name']}'.")

            print(f"- Liste '{trello_list['name']}': {len(relevant_cards)} relevante Karten")

            if not relevant_cards:
                continue

            formatted_cards = [
                format_card_for_prompt(board, trello_list, card)
                for card in relevant_cards
            ]
            list_sections.append(
                f"## Liste: {trello_list['name']}\n\n"
                + "\n\n---\n\n".join(formatted_cards)
            )
            board_total += len(relevant_cards)

        board_summaries.append(
            {
                "board_id": board_id,
                "board_name": board["name"],
                "board_url": board.get("url", ""),
                "total_cards": board_total,
            }
        )
        total_cards += board_total

        if list_sections:
            board_sections.append(
                f"# Trello-Board: {board['name']}\n"
                f"Board-URL: {board.get('url', '')}\n"
                f"Anzahl beruecksichtigter Karten: {board_total}\n\n"
                + "\n\n==============================\n\n".join(list_sections)
            )

    return {
        "boards": board_summaries,
        "total_cards": total_cards,
        "content": "\n\n########################################\n\n".join(board_sections),
    }


def generate_task_cards(board_data: dict) -> list[dict]:
    """Sendet die Board-Inhalte an OpenAI und gibt einzelne Aufgaben zurueck."""
    if board_data["total_cards"] == 0:
        return [
            {
                "title": "Keine offenen Aufgaben gefunden",
                "priority": "niedrig",
                "source_board": "",
                "source_list": "",
                "due": "",
                "reason": "Auf den konfigurierten Boards wurden keine relevanten offenen Karten gefunden.",
                "next_step": "Keine Aktion erforderlich.",
                "source_links": [],
            }
        ]

    instructions = f"""
Du bist ein Projektmanager und analysierst mehrere Trello-Boards.

Erstelle aus den uebergebenen Listen und Karten ausschliesslich konkrete anstehende Aufgaben.
Das Ergebnis wird automatisch als einzelne Trello-Karten angelegt.

Gib ausschliesslich valides JSON im folgenden Format zurueck:
{{
  "tasks": [
    {{
      "title": "Kurzer Kartenname als konkrete Aufgabe",
      "priority": "hoch|mittel|niedrig",
      "source_board": "Name des Quellboards",
      "source_list": "Name der Ursprungsliste oder sinnvoller Bereich",
      "due": "Frist im ISO-Format oder leer",
      "reason": "Warum diese Aufgabe ansteht",
      "next_step": "Konkreter naechster Schritt",
      "source_links": ["https://trello.com/c/..."]
    }}
  ]
}}

Wichtige Regeln:
- Erfinde keine Aufgaben, Fristen, Links oder Zustaendigkeiten.
- Nutze ausschliesslich die bereitgestellten Board-Daten.
- Nimm nur Aufgaben auf, die noch anstehen oder erkennbar blockiert sind.
- Fasse eng zusammengehoerige Karten nur dann zusammen, wenn sie dieselbe konkrete Aufgabe beschreiben.
- Behalte wichtige Namen, Fristen und Ursprungskarten bei.
- Sortiere nach Dringlichkeit und Umsetzbarkeit: hoch zuerst, dann mittel, dann niedrig.
- Erstelle maximal {MAX_TASK_CARDS} Aufgaben.
- Schreibe auf Deutsch.
- Verwende keine Markdown-Tabellen.
"""

    try:
        response = openai_client.responses.create(
            model=OPENAI_MODEL,
            instructions=instructions,
            input=board_data["content"],
            max_output_tokens=12000,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "trello_task_cards",
                    "strict": True,
                    "schema": TASK_RESPONSE_SCHEMA,
                }
            },
        )

        raw_text = response.output_text.strip()
        if not raw_text:
            raise ValueError("OpenAI hat keinen Text zurueckgegeben.")

        payload = json.loads(raw_text)
        tasks = payload.get("tasks")
        if not isinstance(tasks, list):
            raise ValueError("OpenAI-Antwort enthaelt keine Aufgabenliste.")

        normalized_tasks = [normalize_task(task) for task in tasks[:MAX_TASK_CARDS]]
        return [task for task in normalized_tasks if task["title"]]

    except Exception as error:
        print(f"Fehler bei der OpenAI-Aufgabenerstellung: {error}")
        raise


def normalize_task(task: dict) -> dict:
    if not isinstance(task, dict):
        return {
            "title": "",
            "priority": "mittel",
            "source_board": "",
            "source_list": "",
            "due": "",
            "reason": "",
            "next_step": "",
            "source_links": [],
        }

    links = task.get("source_links") or []
    if not isinstance(links, list):
        links = [str(links)]

    return {
        "title": str(task.get("title") or "").strip(),
        "priority": normalize_priority(task.get("priority")),
        "source_board": str(task.get("source_board") or "").strip(),
        "source_list": str(task.get("source_list") or "").strip(),
        "due": str(task.get("due") or "").strip(),
        "reason": str(task.get("reason") or "").strip(),
        "next_step": str(task.get("next_step") or "").strip(),
        "source_links": [str(link).strip() for link in links if str(link).strip()],
    }


def normalize_priority(priority) -> str:
    value = str(priority or "").strip().lower()
    if value in {"hoch", "mittel", "niedrig"}:
        return value
    return "mittel"


def build_task_description(task: dict) -> str:
    sections = [
        f"**Prioritaet:** {task['priority']}",
    ]

    if task["source_board"]:
        sections.append(f"**Quellboard:** {task['source_board']}")
    if task["source_list"]:
        sections.append(f"**Ursprungsliste:** {task['source_list']}")
    if task["due"]:
        sections.append(f"**Frist:** {task['due']}")
    if task["reason"]:
        sections.append(f"\n**Warum steht das an?**\n{task['reason']}")
    if task["next_step"]:
        sections.append(f"\n**Naechster Schritt**\n{task['next_step']}")
    if task["source_links"]:
        links = "\n".join(f"- {link}" for link in task["source_links"])
        sections.append(f"\n**Ursprungskarten**\n{links}")

    sections.append("\n_Erstellt automatisch aus der KI-Auswertung der konfigurierten Trello-Boards._")
    return "\n\n".join(sections)


def main() -> None:
    validate_configuration()

    try:
        print("Starte die Trello-KI-Aufgabenerstellung ...")
        print(f"Konfigurierte Quellboards: {len(QUELL_BOARD_IDS)}")

        board_data = collect_boards_content(QUELL_BOARD_IDS)
        print(f"\nInsgesamt wurden {board_data['total_cards']} Karten ausgelesen.")

        print("Erstelle einzelne Aufgaben mit OpenAI ...")
        tasks = generate_task_cards(board_data)
        if not tasks:
            raise ValueError("Die KI hat keine Aufgaben zurueckgegeben.")

        target_list_name = build_target_list_name(len(QUELL_BOARD_IDS))
        print(f"Erstelle Zielliste auf dem Zielboard: {target_list_name}")
        target_list = create_list(ZIEL_BOARD_ID, target_list_name)

        print(f"Erstelle {len(tasks)} Aufgabenkarte(n) ...")
        created_cards = []
        for index, task in enumerate(tasks):
            card = create_task_card(target_list["id"], task, index)
            created_cards.append(card)
            print(f"- Karte erstellt: {card.get('name')}")

        print("\nKI-Aufgaben erfolgreich erstellt!")
        print(f"Zielliste: {target_list.get('name')}")
        print(f"Erstellte Karten: {len(created_cards)}")

    except Exception as error:
        print("\nDie KI-Aufgaben konnten nicht erstellt werden.")
        print(f"Fehler: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
