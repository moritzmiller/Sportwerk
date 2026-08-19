import os
import requests
import sys
from openai import OpenAI

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)

# --- KONFIGURATION ---
# Bitte generiere diese Keys neu, da sie öffentlich sichtbar waren!
API_KEY = os.getenv("TRELLO_API_KEY")
TOKEN = os.getenv("TRELLO_TOKEN")

# --- DLL FIX FÜR WINDOWS / WEASYPRINT ---
msys_path = r"C:\Program Files\msys2\ucrt64\bin"
if os.path.exists(msys_path):
    os.add_dll_directory(msys_path)

# HIER DEINE QUELL-BOARDS EINTRAGEN:
QUELL_BOARD_IDS = [
    "67288e5ca19579506ed451b9",
    "6825fba39c8fc8b0fdddc921",
    "6a5e0894fe4f656b5fd0041f"
]
ZIEL_BOARD_ID = "6a4e66d0d6b8b3ffb929c736"

BOARD_FARBEN = ["blue", "green", "orange", "purple", "pink", "sky", "yellow"]

AUTH_PARAMS = {"key": API_KEY, "token": TOKEN}
BASE_URL = "https://api.trello.com/1"
REQUEST_TIMEOUT_SECONDS = 30
CARD_COPY_FIELDS = "all"


def trello_request(method, endpoint, *, params=None, json=None):
    url = f"{BASE_URL}{endpoint}"
    try:
        response = requests.request(
            method,
            url,
            params=params,
            json=json,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout as exc:
        raise RuntimeError(f"Trello-API-Timeout bei {method} {endpoint}") from exc
    except requests.exceptions.RequestException as exc:
        detail = ""
        if exc.response is not None:
            detail = f" Antwort: {exc.response.text[:500]}"
        raise RuntimeError(f"Trello-API-Fehler bei {method} {endpoint}.{detail}") from exc


# --- HELFER-FUNKTIONEN ---
def get_lists(board_id):
    return trello_request("GET", f"/boards/{board_id}/lists", params=AUTH_PARAMS)


def get_cards_in_list(list_id):
    return trello_request("GET", f"/lists/{list_id}/cards", params=AUTH_PARAMS)


def create_list(board_id, list_name):
    payload = {**AUTH_PARAMS, "name": list_name}
    return trello_request("POST", f"/boards/{board_id}/lists", json=payload)


def mirror_card_to_list(card_id, card_name, target_list_id, label_color=None):
    """
    Kopiert eine Quellkarte ins Zielboard und uebernimmt die von Trello
    unterstuetzten Kartendetails statt nur einen Link anzulegen.
    """
    payload_create = {
        **AUTH_PARAMS,
        "idList": target_list_id,
        "idCardSource": card_id,
        "keepFromSource": CARD_COPY_FIELDS,
        "name": card_name,
    }
    new_card = trello_request("POST", "/cards", json=payload_create)

    if "id" in new_card:
        new_card_id = new_card["id"]

        # Zusaetzliches Herkunftslabel bleibt erhalten; die eigentlichen
        # Kartendaten kommen aus idCardSource/keepFromSource.
        if label_color:
            payload_label = {
                **AUTH_PARAMS,
                "color": label_color,
                "name": "Herkunft: Board"
            }
            trello_request("POST", f"/cards/{new_card_id}/labels", params=payload_label)

    return new_card


def clear_all_cards_on_board(board_id):
    """Archiviert alle Karten auf dem angegebenen Board."""
    print(f"Leere Board {board_id}...")
    listen = get_lists(board_id)

    if "message" in listen or not isinstance(listen, list):
        print("Fehler beim Abrufen der Listen.")
        return

    for liste in listen:
        list_id = liste["id"]
        print(f"-> Archiviere Karten in Liste: {liste['name']}")
        trello_request("POST", f"/lists/{list_id}/archiveAllCards", params=AUTH_PARAMS)

    print("Das Board wurde erfolgreich geleert!")


def delete_empty_lists_on_board(board_id):
    """Löscht (archiviert) alle Listen auf dem Board, die keine Karten enthalten."""
    print(f"\n--- Bereinige leere Listen auf Board {board_id} ---")

    # 1. Alle Listen des Boards holen
    listen = get_lists(board_id)
    if "message" in listen or not isinstance(listen, list):
        print("Fehler beim Abrufen der Listen zur Bereinigung.")
        return

    for liste in listen:
        list_id = liste["id"]

        # 2. Prüfen, ob Karten in dieser Liste liegen
        karten = get_cards_in_list(list_id)

        if isinstance(karten, list) and len(karten) == 0:
            print(f"-> Lösche leere Liste: '{liste['name']}'")
            # In Trello werden Listen "gelöscht", indem man ihren 'closed'-Status auf True setzt
            payload = {**AUTH_PARAMS, "value": "true"}
            trello_request("PUT", f"/lists/{list_id}", params={"closed": "true"}, json=payload)

def clear_all_lists_and_cards_on_board(board_id):
    """Archiviert alle Listen (und damit auch deren Karten) auf dem angegebenen Board."""
    print(f"Setze Board {board_id} komplett zurück (archiviere alle Listen)...")
    listen = get_lists(board_id)

    if "message" in listen or not isinstance(listen, list):
        print("Fehler beim Abrufen der Listen.")
        return

    for liste in listen:
        list_id = liste["id"]
        print(f"-> Archiviere Liste: {liste['name']}")
        # Wir schließen die gesamte Liste. Das archiviert automatisch alle Karten darin.
        payload = {**AUTH_PARAMS, "value": "true"}
        trello_request("PUT", f"/lists/{list_id}", params={"closed": "true"}, json=payload)

    print("Das Board wurde erfolgreich komplett zurückgesetzt!")

# --- HAUPTLOGIK ---
def main():
    # Sicherheitsabfrage/Warnung, falls Quell- und Zielboard identisch sind
    if ZIEL_BOARD_ID in QUELL_BOARD_IDS:
        print("WARNUNG: Das Zielboard ist auch als Quellboard eingetragen!")
        print("Durch das Leeren des Zielboards verlierst du die Quellkarten dieses Boards.")
        auswahl = input("Möchtest du trotzdem fortfahren? (j/n): ")
        if auswahl.lower() != 'j':
            print("Abgebrochen.")
            return

    print("Starte den Multi-Board Spiegel-Vorgang mit Farbzuweisung...")
    clear_all_lists_and_cards_on_board(ZIEL_BOARD_ID)

    # 1. Listen des zentralen Zielboards holen & indexieren
    ziel_listen = get_lists(ZIEL_BOARD_ID)
    ziel_listen_dict = {lst["name"]: lst["id"] for lst in ziel_listen}

    # 2. Schleife über JEDES Quell-Board
    for index, board_id in enumerate(QUELL_BOARD_IDS):
        farbe = BOARD_FARBEN[index % len(BOARD_FARBEN)]
        print(f"\n--- Verarbeite Quell-Board: {board_id} (Farbe: {farbe.upper()}) ---")

        quell_listen = get_lists(board_id)

        if "message" in quell_listen or not isinstance(quell_listen, list):
            print(f"Fehler beim Laden von Board {board_id}. Überspringe...")
            continue

        for q_liste in quell_listen:
            listen_name = q_liste["name"]

            if listen_name not in ziel_listen_dict:
                neue_liste = create_list(ZIEL_BOARD_ID, listen_name)
                ziel_listen_dict[listen_name] = neue_liste["id"]
                print(f"-> Liste '{listen_name}' im Zielboard neu angelegt.")

            ziel_liste_id = ziel_listen_dict[listen_name]
            karten = get_cards_in_list(q_liste["id"])

            for karte in karten:
                print(f"   Kopiere Karte: [{listen_name}] -> {karte['name']} ({farbe})")
                mirror_card_to_list(
                    card_id=karte["id"],
                    card_name=karte["name"],
                    target_list_id=ziel_liste_id,
                    label_color=farbe
                )

    #delete_empty_lists_on_board(ZIEL_BOARD_ID)

    print("\nAlle Boards wurden erfolgreich via Verknüpfung zusammengeführt!")


if __name__ == "__main__":
    main()
