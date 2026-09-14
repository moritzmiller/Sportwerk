import base64
import html
import json
import os.path
import re
from typing import Any

from openai import OpenAI

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


client = OpenAI()


# ============================================================
# KONFIGURATION
# ============================================================

MODEL = "gpt-5.6"

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive"
]

EMAIL_KATEGORIEN = [
    "KI_MACHT_DAS",
    "DELEGIEREN",
    "SELBST_MACHEN",
    "LOESCHEN",
]

KATEGORIE_TITEL = {
    "KI_MACHT_DAS": "KI MACHT DAS",
    "DELEGIEREN": "AN KOLLEGEN DELEGIEREN",
    "SELBST_MACHEN": "SELBST MACHEN",
    "LOESCHEN": "LÖSCHVORSCHLÄGE",
}


# ============================================================
# GMAIL-INHALTE AUSLESEN
# ============================================================

def dekodiere_base64url(data: str) -> str:
    """
    Dekodiert Gmail-Inhalte aus URL-safe Base64.
    """

    padding = "=" * (-len(data) % 4)

    return base64.urlsafe_b64decode(
        data + padding
    ).decode(
        "utf-8",
        errors="replace",
    )


def html_zu_text(html_inhalt: str) -> str:
    """
    Wandelt HTML-Mailinhalt in normalen Text um.
    """

    text = re.sub(
        r"<(script|style).*?>.*?</\1>",
        "",
        html_inhalt,
        flags=re.DOTALL | re.IGNORECASE,
    )

    text = re.sub(
        r"<[^>]+>",
        " ",
        text,
    )

    text = html.unescape(text)

    text = re.sub(
        r"[ \t]+",
        " ",
        text,
    )

    text = re.sub(
        r"\n\s*\n",
        "\n\n",
        text,
    )

    return text.strip()


def hole_email_text(
    payload: dict[str, Any],
) -> str:
    """
    Liest den Textinhalt einer Gmail-Nachricht aus.

    text/plain wird bevorzugt.
    text/html wird als Alternative verwendet.
    """

    text_inhalte: list[str] = []
    html_inhalte: list[str] = []

    def durchsuche_part(
        part: dict[str, Any],
    ) -> None:
        mime_type = part.get(
            "mimeType",
            "",
        )

        body = part.get(
            "body",
            {},
        )

        data = body.get("data")

        if data:
            dekodierter_inhalt = (
                dekodiere_base64url(data)
            )

            if mime_type == "text/plain":
                text_inhalte.append(
                    dekodierter_inhalt
                )

            elif mime_type == "text/html":
                html_inhalte.append(
                    dekodierter_inhalt
                )

        for unter_part in part.get(
            "parts",
            [],
        ):
            durchsuche_part(
                unter_part
            )

    durchsuche_part(payload)

    if text_inhalte:
        return "\n\n".join(
            text_inhalte
        ).strip()

    if html_inhalte:
        return html_zu_text(
            "\n\n".join(
                html_inhalte
            )
        )

    return ""


def hole_header(
    headers: list[dict[str, str]],
    gesuchter_name: str,
    standardwert: str = "",
) -> str:
    """
    Liest einen bestimmten E-Mail-Header aus.
    """

    for header in headers:
        header_name = header.get(
            "name",
            "",
        )

        if (
            header_name.lower()
            == gesuchter_name.lower()
        ):
            return header.get(
                "value",
                standardwert,
            )

    return standardwert


# ============================================================
# GMAIL-VERBINDUNG
# ============================================================

def erstelle_gmail_service():
    """
    Erstellt eine Verbindung zur Gmail API.
    """

    skript_ordner = os.path.dirname(
        os.path.abspath(__file__)
    )

    credentials_path = os.path.join(
        skript_ordner,
        "credentials.json",
    )

    token_path = os.path.join(
        skript_ordner,
        "token.json",
    )

    creds = None

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(
            token_path,
            SCOPES,
        )

    if not creds or not creds.valid:
        if (
            creds
            and creds.expired
            and creds.refresh_token
        ):
            creds.refresh(
                Request()
            )

        else:
            flow = (
                InstalledAppFlow
                .from_client_secrets_file(
                    credentials_path,
                    SCOPES,
                )
            )

            creds = flow.run_local_server(
                port=0
            )

        with open(
            token_path,
            "w",
            encoding="utf-8",
        ) as token:
            token.write(
                creds.to_json()
            )

    return build(
        "gmail",
        "v1",
        credentials=creds,
    )


# ============================================================
# ROHE E-MAILS ABRUFEN
# ============================================================

def hole_emails_aus_gmail(
    max_emails: int,
    suchanfrage: str,
) -> list[dict[str, Any]]:
    """
    Ruft die E-Mails aus Gmail ab.

    Hier findet noch keine KI-Analyse statt.
    """

    if max_emails <= 0:
        return []

    service = erstelle_gmail_service()

    nachrichten_referenzen = []
    naechste_seite = None

    while len(
        nachrichten_referenzen
    ) < max_emails:
        verbleibende_anzahl = (
            max_emails
            - len(nachrichten_referenzen)
        )

        results = (
            service.users()
            .messages()
            .list(
                userId="me",
                q=suchanfrage,
                maxResults=min(
                    verbleibende_anzahl,
                    100,
                ),
                pageToken=naechste_seite,
            )
            .execute()
        )

        aktuelle_nachrichten = (
            results.get(
                "messages",
                [],
            )
        )

        nachrichten_referenzen.extend(
            aktuelle_nachrichten
        )

        naechste_seite = results.get(
            "nextPageToken"
        )

        if not naechste_seite:
            break

    emails = []

    for nachricht in nachrichten_referenzen[
        :max_emails
    ]:
        email_id = nachricht["id"]

        email_details = (
            service.users()
            .messages()
            .get(
                userId="me",
                id=email_id,
                format="full",
            )
            .execute()
        )

        payload = email_details.get(
            "payload",
            {},
        )

        headers = payload.get(
            "headers",
            [],
        )

        betreff = hole_header(
            headers,
            "Subject",
            "Kein Betreff",
        )

        absender = hole_header(
            headers,
            "From",
            "Unbekannter Absender",
        )

        empfaenger = hole_header(
            headers,
            "To",
            "",
        )

        datum = hole_header(
            headers,
            "Date",
            "",
        )

        inhalt = hole_email_text(
            payload
        )

        snippet = email_details.get(
            "snippet",
            "",
        )

        if not inhalt:
            inhalt = snippet

        emails.append(
            {
                "id": email_id,
                "thread_id": email_details.get(
                    "threadId",
                    "",
                ),
                "sender": absender,
                "recipient": empfaenger,
                "subject": betreff,
                "date": datum,
                "body": inhalt,
                "snippet": snippet,
                "labels": email_details.get(
                    "labelIds",
                    [],
                ),
                "internal_date": email_details.get(
                    "internalDate",
                    "",
                ),
            }
        )

    return emails


# ============================================================
# E-MAILS FÜR DIE KI VORBEREITEN
# ============================================================

def internal_date_als_zahl(
    email: dict,
) -> int:
    """
    Wandelt das Gmail-Datum in eine Zahl um.

    Dadurch können die E-Mails chronologisch sortiert werden.
    """

    try:
        return int(
            email.get(
                "internal_date",
                0,
            )
        )

    except (TypeError, ValueError):
        return 0


def bereite_emails_vor(
    emails: list[dict],
) -> tuple[list[dict], dict[str, dict]]:
    """
    Erstellt eine kompakte Liste aller E-Mails.

    Diese Liste wird später vollständig an die KI übergeben.
    """

    email_liste = []
    email_lookup = {}

    # Älteste E-Mail zuerst
    sortierte_emails = sorted(
        emails,
        key=internal_date_als_zahl,
    )

    for nummer, email in enumerate(
        sortierte_emails,
        start=1,
    ):
        email_ref = f"email_{nummer}"

        inhalt = (
            email.get("body")
            or email.get("snippet")
            or ""
        )

        # Verhindert, dass einzelne E-Mails
        # zu viele Tokens benötigen.
        inhalt = str(inhalt)[:4000]

        email_fuer_ki = {
            "email_ref": email_ref,
            "thread_id": email.get(
                "thread_id",
                "",
            ),
            "sender": email.get(
                "sender",
                "",
            ),
            "recipient": email.get(
                "recipient",
                "",
            ),
            "subject": email.get(
                "subject",
                "Kein Betreff",
            ),
            "date": email.get(
                "date",
                "",
            ),
            "inhalt": inhalt,
        }

        email_liste.append(
            email_fuer_ki
        )

        # Diese Daten werden später für die
        # Ausgabe und Zuordnung benötigt.
        email_lookup[email_ref] = {
            "id": email.get(
                "id",
                "",
            ),
            "thread_id": email.get(
                "thread_id",
                "",
            ),
            "sender": email.get(
                "sender",
                "",
            ),
            "recipient": email.get(
                "recipient",
                "",
            ),
            "subject": email.get(
                "subject",
                "Kein Betreff",
            ),
            "date": email.get(
                "date",
                "",
            ),
        }

    return email_liste, email_lookup


# ============================================================
# GEMEINSAME KI-ANALYSE
# ============================================================

def analysiere_emails_gemeinsam(
    email_liste: list[dict],
) -> list[dict]:
    """
    Analysiert alle E-Mails gemeinsam.

    Es wird genau ein KI-Aufruf durchgeführt.
    """

    response = client.responses.create(
        model=MODEL,
        store=False,
        instructions="""
Du analysierst berufliche E-Mails für Sportwerk.

Du erhältst alle E-Mails gemeinsam in einer Liste.

Erkenne zuerst, welche E-Mails zum gleichen Vorgang,
Projekt oder Gespräch gehören.

Hinweise auf einen gemeinsamen Zusammenhang sind:

- dieselbe thread_id
- gleiche oder ähnliche Betreffzeilen
- Re:, AW: oder Weiterleitungen
- gleicher Projektname
- gleicher Termin oder gleiche Veranstaltung
- gleiche konkrete Aufgabe
- zeitliche Fortsetzung eines Gesprächs

Gruppiere E-Mails nicht nur deshalb, weil sie vom
gleichen Absender stammen.

Jede email_ref muss genau einem Vorgang zugeordnet werden.

Ein Vorgang darf auch aus nur einer E-Mail bestehen.

Berücksichtige die zeitliche Reihenfolge.

Prüfe besonders, ob eine spätere Nachricht:

- eine frühere Frage beantwortet
- eine Aufgabe verändert
- eine Aufgabe bereits erledigt
- neue Informationen zum gleichen Vorgang liefert

Erstelle pro Vorgang:

- einen kurzen Titel
- eine gemeinsame Zusammenfassung
- eine Kategorie
- eine Begründung
- einen konkreten nächsten Schritt

Kategorien:

KI_MACHT_DAS:
Die KI kann die Aufgabe vorbereiten, recherchieren,
strukturieren, zusammenfassen oder einen Entwurf erstellen.

Die KI darf ohne Freigabe keine E-Mail versenden,
keine Zahlung auslösen und keine verbindliche Zusage machen.

DELEGIEREN:
Die Aufgabe gehört eindeutig zu einem Kollegen.

Erfinde keine zuständige Person.
Ist keine Person eindeutig erkennbar,
verwende delegieren_an = null.

SELBST_MACHEN:
Moritz muss persönlich entscheiden, freigeben,
verhandeln, abstimmen oder sensible Inhalte prüfen.

Nutze diese Kategorie auch bei Unsicherheit.

LOESCHEN:
Nur eindeutiger Spam, irrelevante Werbung oder
vollständig nutzlose automatische Benachrichtigungen.

Rechnungen, Verträge, Buchungen, Projektanfragen,
Terminanfragen und unklare E-Mails dürfen nicht
als LOESCHEN eingeordnet werden.
""",
        input=(
            "Analysiere alle folgenden E-Mails gemeinsam:\n\n"
            + json.dumps(
                email_liste,
                ensure_ascii=False,
            )
        ),
        text={
            "format": {
                "type": "json_schema",
                "name": "email_vorgaenge",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "vorgaenge": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "titel": {
                                        "type": "string",
                                    },
                                    "email_refs": {
                                        "type": "array",
                                        "items": {
                                            "type": "string",
                                        },
                                    },
                                    "zusammenfassung": {
                                        "type": "string",
                                    },
                                    "kategorie": {
                                        "type": "string",
                                        "enum": EMAIL_KATEGORIEN,
                                    },
                                    "begruendung": {
                                        "type": "string",
                                    },
                                    "naechster_schritt": {
                                        "type": "string",
                                    },
                                    "delegieren_an": {
                                        "type": [
                                            "string",
                                            "null",
                                        ],
                                    },
                                    "sicherheit": {
                                        "type": "number",
                                        "minimum": 0,
                                        "maximum": 1,
                                    },
                                },
                                "required": [
                                    "titel",
                                    "email_refs",
                                    "zusammenfassung",
                                    "kategorie",
                                    "begruendung",
                                    "naechster_schritt",
                                    "delegieren_an",
                                    "sicherheit",
                                ],
                                "additionalProperties": False,
                            },
                        }
                    },
                    "required": [
                        "vorgaenge",
                    ],
                    "additionalProperties": False,
                },
            }
        },
    )

    if not response.output_text:
        raise RuntimeError(
            "Die KI hat keine E-Mail-Analyse zurückgegeben."
        )

    ergebnis = json.loads(
        response.output_text
    )

    return ergebnis.get(
        "vorgaenge",
        [],
    )


# ============================================================
# KI-ERGEBNIS MIT E-MAILS VERBINDEN
# ============================================================

def verbinde_vorgaenge_mit_emails(
    vorgaenge: list[dict],
    email_lookup: dict[str, dict],
) -> list[dict]:
    """
    Verbindet die KI-Vorgänge mit den tatsächlichen E-Mails.
    """

    analysierte_vorgaenge = []
    verwendete_email_refs = set()

    for nummer, vorgang in enumerate(
        vorgaenge,
        start=1,
    ):
        gueltige_email_refs = []

        for email_ref in vorgang.get(
            "email_refs",
            [],
        ):
            if email_ref not in email_lookup:
                continue

            if email_ref in verwendete_email_refs:
                continue

            gueltige_email_refs.append(
                email_ref
            )

            verwendete_email_refs.add(
                email_ref
            )

        if not gueltige_email_refs:
            continue

        kategorie = vorgang.get(
            "kategorie",
            "SELBST_MACHEN",
        )

        begruendung = vorgang.get(
            "begruendung",
            "",
        )

        try:
            sicherheit = float(
                vorgang.get(
                    "sicherheit",
                    0,
                )
            )

        except (TypeError, ValueError):
            sicherheit = 0

        # Sicherheitsregel:
        # Unsichere Fälle immer manuell prüfen.
        if sicherheit < 0.8:
            kategorie = "SELBST_MACHEN"

            begruendung += (
                " Die Einordnung wurde automatisch "
                "auf SELBST_MACHEN gesetzt, weil die "
                "Sicherheit unter 80 Prozent liegt."
            )

        analysierte_vorgaenge.append(
            {
                "vorgang_id": (
                    f"vorgang_{nummer}"
                ),
                "titel": vorgang.get(
                    "titel",
                    "Unbenannter Vorgang",
                ),
                "zusammenfassung": vorgang.get(
                    "zusammenfassung",
                    "",
                ),
                "kategorie": kategorie,
                "begruendung": begruendung,
                "naechster_schritt": vorgang.get(
                    "naechster_schritt",
                    "Vorgang prüfen.",
                ),
                "delegieren_an": vorgang.get(
                    "delegieren_an"
                ),
                "sicherheit": sicherheit,
                "emails": [
                    email_lookup[email_ref]
                    for email_ref
                    in gueltige_email_refs
                ],
            }
        )

    # Prüfen, ob die KI eine E-Mail vergessen hat.
    for email_ref, email in email_lookup.items():
        if email_ref in verwendete_email_refs:
            continue

        analysierte_vorgaenge.append(
            {
                "vorgang_id": (
                    f"vorgang_"
                    f"{len(analysierte_vorgaenge) + 1}"
                ),
                "titel": email.get(
                    "subject",
                    "Nicht zugeordnete E-Mail",
                ),
                "zusammenfassung": (
                    "Diese E-Mail konnte keinem "
                    "eindeutigen Vorgang zugeordnet werden."
                ),
                "kategorie": "SELBST_MACHEN",
                "begruendung": (
                    "Die automatische Zuordnung "
                    "war nicht vollständig."
                ),
                "naechster_schritt": (
                    "E-Mail manuell prüfen."
                ),
                "delegieren_an": None,
                "sicherheit": 0,
                "emails": [
                    email,
                ],
            }
        )

    return analysierte_vorgaenge


# ============================================================
# KATEGORIEN ZÄHLEN
# ============================================================

def erstelle_kategorie_zaehler(
    analysierte_vorgaenge: list[dict],
) -> tuple[dict[str, int], dict[str, int]]:
    """
    Zählt Vorgänge und E-Mails pro Kategorie.
    """

    vorgaenge_pro_kategorie = {
        kategorie: 0
        for kategorie in EMAIL_KATEGORIEN
    }

    emails_pro_kategorie = {
        kategorie: 0
        for kategorie in EMAIL_KATEGORIEN
    }

    for vorgang in analysierte_vorgaenge:
        kategorie = vorgang.get(
            "kategorie",
            "SELBST_MACHEN",
        )

        if kategorie not in EMAIL_KATEGORIEN:
            kategorie = "SELBST_MACHEN"

        vorgaenge_pro_kategorie[
            kategorie
        ] += 1

        emails_pro_kategorie[
            kategorie
        ] += len(
            vorgang.get(
                "emails",
                [],
            )
        )

    return (
        vorgaenge_pro_kategorie,
        emails_pro_kategorie,
    )


# ============================================================
# AUSGABE FÜR DIREKTEN TEST
# ============================================================

def formatiere_email_auswertung(
    analysierte_vorgaenge: list[dict],
) -> str:
    """
    Erstellt eine ausführliche Ausgabe.

    Diese Funktion wird nur benötigt, wenn mailing.py
    direkt zum Testen ausgeführt wird.
    """

    ausgabe = [
        "",
        "=" * 72,
        "E-MAIL-AUSWERTUNG",
        "=" * 72,
    ]

    for kategorie in EMAIL_KATEGORIEN:
        passende_vorgaenge = [
            vorgang
            for vorgang in analysierte_vorgaenge
            if vorgang.get("kategorie") == kategorie
        ]

        ausgabe.extend(
            [
                "",
                "-" * 72,
                (
                    f"{KATEGORIE_TITEL[kategorie]} "
                    f"({len(passende_vorgaenge)})"
                ),
                "-" * 72,
            ]
        )

        if not passende_vorgaenge:
            ausgabe.append(
                "Keine Vorgänge in dieser Kategorie."
            )
            continue

        for nummer, vorgang in enumerate(
            passende_vorgaenge,
            start=1,
        ):
            sicherheit = (
                vorgang.get(
                    "sicherheit",
                    0,
                )
                * 100
            )

            ausgabe.extend(
                [
                    "",
                    (
                        f"{nummer}. "
                        f"{vorgang.get('titel', 'Ohne Titel')}"
                    ),
                    (
                        "   Zusammenfassung: "
                        f"{vorgang.get('zusammenfassung', '')}"
                    ),
                    (
                        "   Begründung: "
                        f"{vorgang.get('begruendung', '')}"
                    ),
                    (
                        "   Nächster Schritt: "
                        f"{vorgang.get('naechster_schritt', '')}"
                    ),
                    (
                        "   Sicherheit: "
                        f"{sicherheit:.0f} %"
                    ),
                    (
                        "   E-Mails im Vorgang: "
                        f"{len(vorgang.get('emails', []))}"
                    ),
                ]
            )

            if kategorie == "DELEGIEREN":
                delegieren_an = (
                    vorgang.get("delegieren_an")
                    or "Zuständigkeit prüfen"
                )

                ausgabe.append(
                    f"   Delegieren an: {delegieren_an}"
                )

            for email in vorgang.get(
                "emails",
                [],
            ):
                ausgabe.append(
                    "      - "
                    f"{email.get('subject', 'Kein Betreff')} "
                    f"| {email.get('sender', 'Unbekannt')}"
                )

    return "\n".join(
        ausgabe
    )


# ============================================================
# ÖFFENTLICHE GMAIL-FUNKTION
# ============================================================

def gmail(
    max_emails: int = 30,
    suchanfrage: str = "in:inbox",
) -> dict:
    """
    Führt den vollständigen E-Mail-Ablauf aus.

    Diese Funktion wird vom Agenten als Tool aufgerufen.
    """

    try:
        rohe_emails = hole_emails_aus_gmail(
            max_emails=max_emails,
            suchanfrage=suchanfrage,
        )

        if not rohe_emails:
            return {
                "success": True,
                "message": (
                    "Es wurden keine passenden "
                    "E-Mails gefunden."
                ),
                "anzahl_emails": 0,
                "anzahl_vorgaenge": 0,
                "vorgaenge_pro_kategorie": {
                    kategorie: 0
                    for kategorie
                    in EMAIL_KATEGORIEN
                },
                "emails_pro_kategorie": {
                    kategorie: 0
                    for kategorie
                    in EMAIL_KATEGORIEN
                },
                "vorgaenge": [],
            }

        email_liste, email_lookup = (
            bereite_emails_vor(
                rohe_emails
            )
        )

        vorgaenge = (
            analysiere_emails_gemeinsam(
                email_liste
            )
        )

        analysierte_vorgaenge = (
            verbinde_vorgaenge_mit_emails(
                vorgaenge,
                email_lookup,
            )
        )

        (
            vorgaenge_pro_kategorie,
            emails_pro_kategorie,
        ) = erstelle_kategorie_zaehler(
            analysierte_vorgaenge
        )

        return {
            "success": True,
            "message": (
                f"{len(email_lookup)} E-Mails wurden "
                f"als {len(analysierte_vorgaenge)} "
                f"zusammenhängende Vorgänge analysiert."
            ),
            "anzahl_emails": len(
                email_lookup
            ),
            "anzahl_vorgaenge": len(
                analysierte_vorgaenge
            ),
            "vorgaenge_pro_kategorie": (
                vorgaenge_pro_kategorie
            ),
            "emails_pro_kategorie": (
                emails_pro_kategorie
            ),
            "vorgaenge": (
                analysierte_vorgaenge
            ),
        }

    except HttpError as error:
        raise RuntimeError(
            f"Gmail-API-Fehler: {error}"
        ) from error


# ============================================================
# DIREKTER TEST
# ============================================================

if __name__ == "__main__":
    ergebnis = gmail(
        max_emails=10,
        suchanfrage="in:inbox newer_than:7d",
    )

    if not ergebnis["success"]:
        print(
            ergebnis.get(
                "message",
                "Unbekannter Fehler",
            )
        )

    elif not ergebnis["vorgaenge"]:
        print(
            ergebnis["message"]
        )

    else:
        print(
            formatiere_email_auswertung(
                ergebnis["vorgaenge"]
            )
        )