import os
import json
import re
from google.apps import meet_v2
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

from openai import OpenAI

# WICHTIG: Stelle sicher, dass dein OPENAI_API_KEY als Umgebungsvariable gesetzt ist
# oder gib ihn beim Client mit: client = OpenAI(api_key="DEIN_KEY")
from openai import OpenAI

# Benötigte Scopes
SCOPES = ['https://www.googleapis.com/auth/meetings.space.readonly']


def get_credentials():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return creds


def get_participant_map(client, record_name):
    """Erstellt ein Mapping von Teilnehmer-IDs zu Klarnamen."""
    try:
        participants = client.list_participants(parent=record_name)
        mapping = {}
        for p in participants:
            display_name = None
            if hasattr(p, 'signedin_user') and p.signedin_user:
                display_name = p.signedin_user.display_name
            elif hasattr(p, 'anonymous_user') and p.anonymous_user:
                display_name = p.anonymous_user.display_name
            elif hasattr(p, 'phone_user') and p.phone_user:
                display_name = p.phone_user.display_name

            if not display_name:
                display_name = f"Teilnehmer_{p.name.split('/')[-1][:5]}"
            mapping[p.name] = display_name
        return mapping
    except Exception as e:
        print(f"Fehler beim Laden der Teilnehmer für {record_name}: {e}")
        return {}


def main():
    creds = get_credentials()
    meet_client = meet_v2.ConferenceRecordsServiceClient(credentials=creds)

    # OpenAI Client initialisieren (einmalig)
    ai_client = OpenAI()  # Nutzt OPENAI_API_KEY aus den Umgebungsvariablen

    records = meet_client.list_conference_records()
    meetings_archiv = {}

    for record in records:
        record_id = record.name
        if record.start_time:
            timestamp_name = record.start_time.strftime('%Y-%m-%d_%H-%M-%S')
        else:
            timestamp_name = f"Unbekannt_{record_id.split('/')[-1]}"

        print(f"\n--- Verarbeite Meeting vom: {timestamp_name} ---")

        p_map = get_participant_map(meet_client, record_id)
        teilnehmer_liste = list(set(p_map.values()))

        meetings_archiv[record_id] = {
            "datum_uhrzeit": timestamp_name,
            "teilnehmer": teilnehmer_liste
        }

        transcripts = meet_client.list_transcripts(parent=record_id)
        has_transcript = False

        for transcript in transcripts:
            has_transcript = True
            entries = meet_client.list_transcript_entries(parent=transcript.name)

            txt_filename = f"{timestamp_name}.txt"
            transcript_text_for_ai = ""  # Variable zum Sammeln des Textes für OpenAI

            # 1. Transkript-Datei schreiben
            with open(txt_filename, "w", encoding="utf-8") as txt_file:
                header = f"Meeting vom: {timestamp_name}\nAnwesend: {', '.join(teilnehmer_liste)}\n" + "=" * 40 + "\n"
                txt_file.write(header)

                for entry in entries:
                    speaker = p_map.get(entry.participant, "Unbekannter Sprecher")
                    time_entry = entry.start_time.strftime('%H:%M:%S')
                    line = f"[{time_entry}] {speaker}: {entry.text}\n"
                    txt_file.write(line)
                    transcript_text_for_ai += line  # Text für die KI sammeln

            print(f"  [Speichern] Transkript -> {txt_filename}")

            # 2. Protokoll per OpenAI erstellen (INNERHALB der Schleife)
            print(f"  [KI] Erstelle Protokoll...")
            try:
                client = OpenAI()

                response = client.responses.create(
                    model="gpt-5.5",
                    input=f"Schreibe ein vollständiges Protokoll von diesem Transkript: {transcript_text_for_ai}. Es soll keine Informationen auslassen, aber alles zusammenfassen. Am Anfang sollen ersteinmal alle Aufgaben, welche verteilt wurde, für die jeweilige Person aufgelistet werden."
                )

                protokoll_filename = f"Protokoll_{timestamp_name}.txt"

                with open(protokoll_filename, "w", encoding="utf-8") as f:
                    f.write(response.output_text)
                print(f"  [Speichern] Protokoll -> {protokoll_filename}")

            except Exception as e:
                print(f"  [Fehler] OpenAI konnte Protokoll nicht erstellen: {e}")

        if not has_transcript:
            print(f"  [Info] Kein Transkript für {timestamp_name} gefunden.")

    # 3. JSON-Archiv speichern
    with open("meetings_index.json", "w", encoding="utf-8") as f:
        json.dump(meetings_archiv, f, indent=4, ensure_ascii=False)


if __name__ == "__main__":
    main()