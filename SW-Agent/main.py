from Teilnahmebedingungen.main import teilnahmebedingungen
from Trello.main import trello_meeting
from Google.mailing import gmail

from openai import OpenAI

import json


client = OpenAI()

# ============================================================
# TOOLS FÜR DAS MODELL
# ============================================================

with open("tools.json","r",encoding="utf-8") as f:
    tools = json.load(f)

# ============================================================
# KONFIGURATION
# ============================================================

MODEL = "gpt-5.6"


EXIT_LIST = {
    "nichts",
    "ende",
    "quit",
    "nein",
    "exit",
}

# ============================================================
# ALLGEMEINE HILFSFUNKTIONEN
# ============================================================

def append_to_input(
    input_list: list,
    call_id: str,
    result: dict | list,
) -> None:
    """
    Fügt das Ergebnis eines lokalen Tools zum Gesprächsverlauf hinzu.
    """

    input_list.append(
        {
            "type": "function_call_output",
            "call_id": call_id,
            "output": json.dumps(
                result,
                ensure_ascii=False,
            ),
        }
    )


def erstelle_fehlerergebnis(
    tool_name: str,
    error: Exception,
) -> dict:
    """
    Erstellt ein einheitliches Fehlerergebnis.
    """

    print(
        f"\nFehler in {tool_name}: "
        f"{type(error).__name__}: {error}"
    )

    return {
        "success": False,
        "tool": tool_name,
        "message": str(error),
    }

# ============================================================
# E-MAIL-AUSGABE
# ============================================================

def gruppiere_vorgaenge(
    analysierte_vorgaenge: list[dict],
) -> dict[str, list]:
    """
    Gruppiert die Vorgänge nach Kategorie.
    """

    gruppen = {
        kategorie: []
        for kategorie in EMAIL_KATEGORIEN
    }

    for vorgang in analysierte_vorgaenge:
        kategorie = vorgang.get(
            "kategorie",
            "SELBST_MACHEN",
        )

        if kategorie not in gruppen:
            kategorie = "SELBST_MACHEN"
            vorgang["kategorie"] = kategorie

        gruppen[kategorie].append(vorgang)

    return gruppen


def fuehre_trello_tool_aus() -> dict:
    """
    Führt das Trello-Meeting-Tool aus.
    """

    try:
        result = trello_meeting()

        if result is None:
            return {
                "success": True,
                "message": (
                    "Die Trello-Übersicht wurde "
                    "erfolgreich erstellt."
                ),
            }

        return {
            "success": True,
            "result": result,
        }

    except Exception as error:
        return erstelle_fehlerergebnis(
            "trello_meeting",
            error,
        )


def fuehre_teilnahmebedingungen_tool_aus() -> dict:
    """
    Führt das Teilnahmebedingungen-Tool aus.
    """

    try:
        result = teilnahmebedingungen()

        if result is None:
            return {
                "success": True,
                "message": (
                    "Die Teilnahmebedingungen wurden "
                    "erfolgreich erstellt."
                ),
            }

        return {
            "success": True,
            "result": result,
        }

    except Exception as error:
        return erstelle_fehlerergebnis(
            "teilnahmebedingungen",
            error,
        )


def fuehre_gmail_tool_aus() -> dict:
    """
    Ruft die vollständige E-Mail-Analyse aus mailing.py auf.
    """

    try:
        return gmail(
            max_emails=20,
            suchanfrage="in:inbox newer_than:7d",
        )

    except Exception as error:
        return erstelle_fehlerergebnis(
            "gmail",
            error,
        )

# ============================================================
# AGENT
# ============================================================

def main() -> None:
    input_list = []

    instructions = """
Du bist ein Assistent für Sportwerk.

Beantworte allgemeine Wissens- und Verständnisfragen direkt.

Nutze trello_meeting ausschließlich, wenn der Nutzer ausdrücklich
eine Trello-Projektübersicht für das Montagsmeeting erstellen oder
aktualisieren möchte.

Nutze teilnahmebedingungen ausschließlich, wenn konkrete
Teilnahmebedingungen für eine Sachsenlotto-Ticketverlosung erstellt
werden sollen.

Nutze gmail, wenn der Nutzer seine E-Mails abrufen, analysieren,
priorisieren oder kategorisieren möchte.

Nutze die Websuche für Fragen, die aktuelle oder externe
Informationen benötigen.

Führe keine E-Mail-Löschung, Weiterleitung oder Versendung ohne
ausdrückliche Bestätigung des Nutzers durch.
"""

    while True:
        user_input = input(
            "\nWie kann ich dir helfen? "
        ).strip()

        if user_input.lower() in EXIT_LIST:
            print("Agent wird beendet.")
            break

        if not user_input:
            continue

        input_list.append(
            {
                "role": "user",
                "content": user_input,
            }
        )

        try:
            response = client.responses.create(
                model=MODEL,
                store=False,
                instructions=instructions,
                tools=tools,
                tool_choice="auto",
                input=input_list,
            )

        except Exception as error:
            print(
                "\nDie Modellanfrage ist fehlgeschlagen:"
            )
            print(
                f"{type(error).__name__}: {error}"
            )
            continue

        # Erste Antwort oder Tool-Aufrufe speichern.
        input_list.extend(
            response.output
        )

        tool_wurde_ausgefuehrt = False

        for item in response.output:
            if item.type != "function_call":
                continue

            tool_wurde_ausgefuehrt = True

            if item.name == "trello_meeting":
                result = fuehre_trello_tool_aus()

            elif item.name == "teilnahmebedingungen":
                result = (
                    fuehre_teilnahmebedingungen_tool_aus()
                )

            elif item.name == "gmail":
                result = fuehre_gmail_tool_aus()

            else:
                result = {
                    "success": False,
                    "message": (
                        f"Das angeforderte Tool "
                        f"'{item.name}' ist unbekannt."
                    ),
                }

            append_to_input(
                input_list=input_list,
                call_id=item.call_id,
                result=result,
            )

        if tool_wurde_ausgefuehrt:
            try:
                final_response = (
                    client.responses.create(
                        model=MODEL,
                        store=False,
                        instructions=(
                            "Formuliere anhand der "
                            "Tool-Ergebnisse eine kurze und "
                            "klare Antwort. Nenne bei der "
                            "E-Mail-Analyse die Anzahl der "
                            "E-Mails, die Anzahl der erkannten "
                            "Vorgänge und die wichtigsten "
                            "nächsten Schritte. Wiederhole "
                            "nicht die vollständige "
                            "Terminalausgabe."
                        ),
                        input=input_list,
                    )
                )

                if final_response.output_text:
                    print(
                        "\nAssistent:",
                        final_response.output_text,
                    )

                input_list.extend(
                    final_response.output
                )

            except Exception as error:
                print(
                    "\nDie abschließende Antwort "
                    "konnte nicht erstellt werden:"
                )
                print(
                    f"{type(error).__name__}: {error}"
                )

        else:
            if response.output_text:
                print(
                    "\nAssistent:",
                    response.output_text,
                )
            else:
                print(
                    "\nDas Modell hat keine "
                    "Textantwort zurückgegeben."
                )


if __name__ == "__main__":
    main()