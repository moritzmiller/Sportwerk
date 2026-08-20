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

Optional:

```bash
PORT=5000
HOST=0.0.0.0
SPORTWERK_ALLOWED_DOMAINS=
SPORTWERK_ALLOWED_EMAILS=
TRELLO_API_KEY=
TRELLO_TOKEN=
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
gunicorn -w 2 -b 0.0.0.0:${PORT:-5000} app:app
```

Apache sollte dabei als Reverse Proxy vor Gunicorn laufen. Gunicorn bedient die Python-App lokal, Apache uebernimmt Domain, TLS und Weiterleitung.

Beispiel fuer einen Apache VirtualHost:

```apache
<VirtualHost *:80>
    ServerName example.com

    ProxyPreserveHost On
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
