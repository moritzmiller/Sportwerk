# Sportwerk Web-App

Sportwerk ist eine Flask-Webanwendung mit serverseitigen Python-Jobs fuer Pressespiegel-PDFs, Trello-Aktionen und Teilnahmebedingungen. Das Frontend liegt in `templates/` und `static/`; die eigentliche Fachlogik bleibt in den bestehenden Python-Modulen.

## Architekturentscheidung

Die Anwendung hatte bereits Flask-Routen, Jinja-Templates, statische Assets und API-artige Job-Endpunkte. Deshalb bleibt Flask das passende Framework: klein genug fuer die klassische Web-App, aber ausreichend fuer die vorhandenen Hintergrundjobs. Ein Rewrite auf FastAPI oder ein groesseres Framework waere fuer diese Struktur unnoetig.

Die App ist bewusst keine rein statische `index.html`: Apache kann statische HTML-Dateien ausliefern, aber Sportwerk braucht weiterhin Python fuer Auth, Jobs, API-Aufrufe, PDF-/DOCX-Erzeugung und Dateioperationen. Die Trennung ist deshalb:

```text
Browser -> Apache -> Gunicorn -> Flask/Python
                         |
                         -> templates/ + static/
```

`templates/base.html` enthaelt das gemeinsame HTML-Grundgeruest. Die einzelnen Seiten definieren nur noch Inhalt, Zusatz-Styles und benoetigte JavaScript-Bundles. Dadurch bleibt das Frontend sauberer, ohne Backend-Funktionen aus den Python-Skripten zu verlieren.

## Installation

```bash
pip install -r requirements.txt
playwright install chromium
```

## Umgebungsvariablen

Lege lokal optional eine `.env` an. `python app.py` und `python scripts/check-sportwerk.py` laden diese Datei automatisch, echte Umgebungsvariablen behalten Vorrang. `.env` ist durch `.gitignore` ausgeschlossen; `.env.example` enthaelt Platzhalter.

Erforderlich fuer Login und produktive Sessions:

```bash
SPORTWERK_SECRET_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
```

`SPORTWERK_SECRET_KEY` muss auf dem Server ein fester, langer Zufallswert sein und bei jedem Worker gleich geladen werden. Fehlt dieser Wert im Gunicorn-/Produktionsbetrieb, startet Sportwerk absichtlich nicht, weil Google-OAuth sonst mit `error=state` zufaellig fehlschlaegt.

`GOOGLE_OAUTH_REDIRECT_URI` muss exakt zu einer Authorized redirect URI im Google-Cloud-OAuth-Client passen. Fuer eine produktive Domain ist das normalerweise:

```text
https://deine-sportwerk-domain.example/auth/google/callback
```

Wenn hier versehentlich `http://127.0.0.1:8000/auth/google/callback`, `localhost` oder ein anderer Port steht, blockiert Google die Anmeldung mit `Fehler 400: redirect_uri_mismatch`.

Sportwerk faengt eine lokale/Loopback-Redirect-URI bei oeffentlichen Requests ab und leitet Google dann mit der aus Host und `X-Forwarded-Proto` abgeleiteten URL weiter. Das ist nur ein Schutznetz: Der Reverse Proxy muss dafuer `Host` und `X-Forwarded-Proto` korrekt weitergeben, und die abgeleitete URL muss in Google Cloud hinterlegt sein.

Einen neuen Wert erzeugst du mit:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Optional:

```bash
PORT=5000
HOST=0.0.0.0
SPORTWERK_ALLOWED_DOMAINS=
SPORTWERK_ALLOWED_EMAILS=
TRELLO_API_KEY=
TRELLO_TOKEN=
TRELLO_ASSIGNED_SOURCE_BOARD_IDS=
TRELLO_ASSIGNED_TARGET_BOARD_ID=
TRELLO_ASSIGNED_MEMBER_ID=me
TRELLO_ASSIGNED_TIMEZONE=Europe/Berlin
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
SPORTWERK_LAYOUT_CONFIG_PATH=
WEASYPRINT_DLL_DIR=
```

## Lokaler Start

```bash
python app.py
```

Standardadresse:

```text
http://localhost:5000
```

Alternativ:

```bash
python scripts/run-sportwerk.py --port 8000
```

## Produktionsstart mit Apache

Auf einem Linux-Server kann die App als WSGI-Anwendung gestartet werden:

```bash
gunicorn -w 2 -b 127.0.0.1:${PORT:-5000} app:app
```

Apache sollte dabei als Reverse Proxy vor Gunicorn laufen. Gunicorn bedient die Python-App lokal, Apache uebernimmt Domain, TLS und Weiterleitung.

Wichtig: Starte Gunicorn ueber `app:app` aus dem Sportwerk-Root, nicht direkt ueber `Pressespiegel.web_app:app`. `web_app.py` laedt die `.env` zwar ebenfalls als Schutz, aber `app:app` ist der vorgesehene Einstiegspunkt.

Beispiel fuer einen systemd-Service:

```ini
[Unit]
Description=Sportwerk Flask application
After=network.target

[Service]
WorkingDirectory=/var/www/sportwerk
EnvironmentFile=/var/www/sportwerk/.env
ExecStart=/var/www/sportwerk/.venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Beispiel fuer einen Apache VirtualHost:

```apache
<VirtualHost *:80>
    ServerName example.com

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    ProxyPass / http://127.0.0.1:5000/
    ProxyPassReverse / http://127.0.0.1:5000/

    ErrorLog ${APACHE_LOG_DIR}/sportwerk_error.log
    CustomLog ${APACHE_LOG_DIR}/sportwerk_access.log combined
</VirtualHost>
```

Dafuer muessen die Apache-Module `proxy`, `proxy_http`, `headers` und fuer HTTPS ueblicherweise `ssl` aktiv sein. In Produktion sollte Gunicorn am besten nur lokal auf `127.0.0.1:${PORT:-5000}` lauschen und Apache oeffentlich erreichbar sein.

## Projektstruktur

- `app.py`: Root-Einstiegspunkt fuer lokalen Start und WSGI-Server.
- `Pressespiegel/web_app.py`: Flask-Routen, Auth, Job-APIs und Download-Endpunkte.
- `Pressespiegel/main.py`: Pressespiegel-Crawling, Rendering und PDF-Erzeugung.
- `templates/base.html`: gemeinsames HTML-Grundgeruest fuer Styles, Session-Bar und Script-Bloecke.
- `templates/`: Jinja-HTML fuer Dashboard, Login, Fehlerseite und Tools.
- `static/`: CSS, JavaScript, React-Bundles, JSX-Quellen und Vendor-Dateien.
- `Trello/`: Trello-Synchronisierung und KI-Zusammenfassung.
- `Trello/assigned.py`: kopiert Karten aus konfigurierten Boards, die dem Trello-Token-Nutzer oder einer konfigurierten Member-ID zugewiesen sind, in eigene Ziellisten.
- `Teilnahmebedingungen/`: DOCX-Erzeugung fuer Teilnahmebedingungen.
- `scripts/check-sportwerk.py`: lokaler Readiness-Check.
- `scripts/build-jsx.js`: kompiliert JSX-Dateien nach `static/compiled/`.

Nach Aenderungen an `static/*.jsx`:

```bash
node scripts/build-jsx.js
```

Readiness-Check:

```bash
python scripts/check-sportwerk.py
```

## Trello: Zugewiesene Karten kopieren

Die Trello-Seite enthaelt die Aktion `Meine Karten`. Sie liest alle offenen Karten der konfigurierten Quellboards, filtert auf `TRELLO_ASSIGNED_MEMBER_ID` und kopiert nur diese Karten in das Zielboard.

Standardmaessig ist `TRELLO_ASSIGNED_MEMBER_ID=me`; damit wird der Nutzer des Trello-Tokens verwendet. Die Einsortierung laeuft dynamisch anhand der aktuellen Kalenderwoche in `TRELLO_ASSIGNED_TIMEZONE`:

- Karten mit offenem abgelaufenem Karten- oder Checklist-Due-Date landen in `over due`.
- Karten mit offenem Karten- oder Checklist-Due-Date innerhalb der aktuellen KW landen in `Diese Woche`.
- Alle anderen Karten landen in einer Liste mit dem Namen des Quellboards.

Das Skript schreibt eine `Sportwerk-Source-Card-ID` in die kopierten Karten. Dadurch werden Karten bei spaeteren Laeufen nicht doppelt angelegt.
