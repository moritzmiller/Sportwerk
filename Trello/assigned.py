from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)


def get_env_value(name: str, default: str = "") -> str:
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

    return default.strip()


TRELLO_API_KEY = get_env_value("TRELLO_API_KEY")
TRELLO_TOKEN = get_env_value("TRELLO_TOKEN")

DEFAULT_SOURCE_BOARD_IDS = [
    "67288e5ca19579506ed451b9",
    "6825fba39c8fc8b0fdddc921",
    "6a5e0894fe4f656b5fd0041f",
]
DEFAULT_TARGET_BOARD_ID = "6992d5ae33ec3ce92ca60962"

SOURCE_BOARD_IDS = [
    value.strip()
    for value in get_env_value("TRELLO_ASSIGNED_SOURCE_BOARD_IDS", ",".join(DEFAULT_SOURCE_BOARD_IDS)).split(",")
    if value.strip()
]
TARGET_BOARD_ID = get_env_value("TRELLO_ASSIGNED_TARGET_BOARD_ID", DEFAULT_TARGET_BOARD_ID)
TARGET_MEMBER_ID = get_env_value("TRELLO_ASSIGNED_MEMBER_ID", "me")

AUTH_PARAMS = {"key": TRELLO_API_KEY, "token": TRELLO_TOKEN}
BASE_URL = "https://api.trello.com/1"
REQUEST_TIMEOUT_SECONDS = 30
CARD_COPY_FIELDS = "all"
SOURCE_MARKER_PREFIX = "Sportwerk-Source-Card-ID:"
THIS_WEEK_LIST_NAME = "Diese Woche"
OVERDUE_LIST_NAME = "over due"
LOCAL_TIMEZONE = ZoneInfo(get_env_value("TRELLO_ASSIGNED_TIMEZONE", "Europe/Berlin"))

session = requests.Session()
session.headers.update({"Accept": "application/json"})


def validate_configuration() -> None:
    missing = []
    if not TRELLO_API_KEY:
        missing.append("TRELLO_API_KEY")
    if not TRELLO_TOKEN:
        missing.append("TRELLO_TOKEN")
    if not SOURCE_BOARD_IDS:
        missing.append("TRELLO_ASSIGNED_SOURCE_BOARD_IDS")
    if not TARGET_BOARD_ID:
        missing.append("TRELLO_ASSIGNED_TARGET_BOARD_ID")
    if missing:
        print("Folgende Konfiguration fehlt oder ist ungueltig:")
        for value in missing:
            print(f"- {value}")
        sys.exit(1)


def trello_request(method: str, endpoint: str, params=None, json_body=None):
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


def get_current_member_id(member_id: str) -> str:
    if member_id != "me":
        return member_id
    member = trello_request("GET", "/members/me", params={"fields": "id,fullName,username"})
    print(f"Zugewiesene Karten fuer: {member.get('fullName') or member.get('username')}")
    return member["id"]


def get_board(board_id: str) -> dict:
    return trello_request("GET", f"/boards/{board_id}", params={"fields": "name,url"})


def get_board_lists(board_id: str) -> list[dict]:
    return trello_request("GET", f"/boards/{board_id}/lists", params={"filter": "open", "fields": "name,pos"})


def get_board_cards(board_id: str) -> list[dict]:
    return trello_request(
        "GET",
        f"/boards/{board_id}/cards",
        params={
            "filter": "open",
            "fields": "name,desc,due,dueComplete,idList,idMembers,shortUrl,url",
            "labels": "all",
        },
    )


def get_target_cards(board_id: str) -> list[dict]:
    return trello_request("GET", f"/boards/{board_id}/cards", params={"filter": "open", "fields": "name,desc,idList"})


def create_list(board_id: str, list_name: str) -> dict:
    return trello_request("POST", f"/boards/{board_id}/lists", json_body={"name": list_name, "pos": "bottom"})


def move_card_to_list(card_id: str, list_id: str) -> dict:
    return trello_request("PUT", f"/cards/{card_id}", json_body={"idList": list_id})


def get_card_checklists(card_id: str) -> list[dict]:
    return trello_request(
        "GET",
        f"/cards/{card_id}/checklists",
        params={"checkItems": "all", "fields": "name"},
    )


def parse_trello_datetime(raw_value: str | None) -> datetime | None:
    if not raw_value:
        return None
    try:
        return datetime.fromisoformat(raw_value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def build_due_bucket(raw_due: str | None) -> str:
    due = parse_trello_datetime(raw_due)
    if due is None:
        return "Ohne Faelligkeit"

    now = datetime.now(timezone.utc)
    if due < now:
        return "Ueberfaellig"
    if due.date() == now.date():
        return "Heute"
    return due.strftime("%Y-%m")


def iter_open_due_dates(card: dict):
    if card.get("due") and not card.get("dueComplete"):
        due = parse_trello_datetime(card.get("due"))
        if due is not None:
            yield due

    for checklist in card.get("checklists", []):
        for item in checklist.get("checkItems", []):
            if item.get("state") == "complete":
                continue
            due = parse_trello_datetime(item.get("due"))
            if due is not None:
                yield due


def is_current_calendar_week(due: datetime, now: datetime) -> bool:
    due_week = due.astimezone(LOCAL_TIMEZONE).isocalendar()
    now_week = now.astimezone(LOCAL_TIMEZONE).isocalendar()
    return due_week.year == now_week.year and due_week.week == now_week.week


def build_list_name(board: dict, source_list: dict | None, card: dict, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    due_dates = list(iter_open_due_dates(card))
    if any(due < now for due in due_dates):
        return OVERDUE_LIST_NAME
    if any(is_current_calendar_week(due, now) for due in due_dates):
        return THIS_WEEK_LIST_NAME
    return board.get("name") or "Unbekanntes Board"


def extract_source_card_id(description: str | None) -> str | None:
    for line in (description or "").splitlines():
        line = line.strip()
        if line.startswith(SOURCE_MARKER_PREFIX):
            return line.removeprefix(SOURCE_MARKER_PREFIX).strip()
    return None


def build_existing_source_index(cards: list[dict]) -> dict[str, dict]:
    index = {}
    for card in cards:
        source_card_id = extract_source_card_id(card.get("desc"))
        if source_card_id:
            index[source_card_id] = card
    return index


def build_source_marker(source_card: dict, board: dict, source_list: dict | None) -> str:
    parts = [
        "",
        "---",
        f"{SOURCE_MARKER_PREFIX} {source_card['id']}",
        f"Sportwerk-Source-Board: {board.get('name', '')}",
    ]
    if source_list:
        parts.append(f"Sportwerk-Source-List: {source_list.get('name', '')}")
    if source_card.get("shortUrl"):
        parts.append(f"Sportwerk-Source-URL: {source_card['shortUrl']}")
    return "\n".join(parts)


def copy_card_to_list(source_card: dict, board: dict, source_list: dict | None, target_list_id: str) -> dict:
    new_card = trello_request(
        "POST",
        "/cards",
        json_body={
            "idList": target_list_id,
            "idCardSource": source_card["id"],
            "keepFromSource": CARD_COPY_FIELDS,
            "name": source_card.get("name") or "Unbenannte Karte",
        },
    )
    source_description = source_card.get("desc") or ""
    trello_request(
        "PUT",
        f"/cards/{new_card['id']}",
        json_body={"desc": f"{source_description}{build_source_marker(source_card, board, source_list)}"[:16000]},
    )
    return new_card


def main() -> None:
    validate_configuration()
    member_id = get_current_member_id(TARGET_MEMBER_ID)

    print("Starte Sammlung zugewiesener Trello-Karten ...")
    print(f"Quellboards: {len(SOURCE_BOARD_IDS)}")
    target_lists = {trello_list["name"]: trello_list["id"] for trello_list in get_board_lists(TARGET_BOARD_ID)}
    existing_by_source = build_existing_source_index(get_target_cards(TARGET_BOARD_ID))

    copied = 0
    skipped = 0
    moved = 0
    scanned = 0

    for board_id in SOURCE_BOARD_IDS:
        board = get_board(board_id)
        lists_by_id = {trello_list["id"]: trello_list for trello_list in get_board_lists(board_id)}
        cards = get_board_cards(board_id)
        assigned_cards = [card for card in cards if member_id in (card.get("idMembers") or [])]
        scanned += len(cards)

        print(f"\nBoard: {board['name']}")
        print(f"- Offene Karten: {len(cards)}")
        print(f"- Dir zugewiesen: {len(assigned_cards)}")

        for card in assigned_cards:
            source_list = lists_by_id.get(card.get("idList"))
            card["checklists"] = get_card_checklists(card["id"])
            list_name = build_list_name(board, source_list, card)
            if list_name not in target_lists:
                created_list = create_list(TARGET_BOARD_ID, list_name)
                target_lists[list_name] = created_list["id"]
                print(f"  Zielliste angelegt: {list_name}")

            target_list_id = target_lists[list_name]
            existing_card = existing_by_source.get(card["id"])
            if existing_card:
                if existing_card.get("idList") != target_list_id:
                    move_card_to_list(existing_card["id"], target_list_id)
                    existing_card["idList"] = target_list_id
                    moved += 1
                    print(f"  Verschoben nach '{list_name}': {existing_card.get('name')}")
                else:
                    skipped += 1
                    print(f"  Bereits richtig einsortiert: {card.get('name')}")
                continue

            new_card = copy_card_to_list(card, board, source_list, target_list_id)
            existing_by_source[card["id"]] = new_card
            copied += 1
            print(f"  Kopiert nach '{list_name}': {new_card.get('name')}")

    print("\nZugewiesene Trello-Karten wurden verarbeitet.")
    print(f"Gescannt: {scanned}")
    print(f"Kopiert: {copied}")
    print(f"Verschoben: {moved}")
    print(f"Bereits vorhanden: {skipped}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("\nZugewiesene Trello-Karten konnten nicht kopiert werden.")
        print(f"Fehler: {error}")
        sys.exit(1)
