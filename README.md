Sportwerk Web-App
=================

Die Flask-App wird weiterhin über `Pressespiegel/web_app.py` gestartet. Die gemeinsam genutzten Web-Dateien liegen aber im Sportwerk-Root:

- `templates/` für Dashboard, Pressespiegel, Trello und Teilnahmebedingungen
- `static/` für globale CSS-, JSX-Quell- und JavaScript-Dateien
- `static/compiled/` für die aus JSX erzeugten Browser-JavaScript-Dateien

Beim Deployment müssen deshalb der `Pressespiegel`-Ordner und die Root-Ordner `templates` sowie `static` gemeinsam auf demselben Stand sein. Nur den `Pressespiegel`-Ordner zu kopieren reicht nicht mehr.

Start aus dem Sportwerk-Root:

```powershell
python Pressespiegel\web_app.py
```

Alternativer lokaler Start mit explizitem Port:

```powershell
python scripts\run-sportwerk.py --port 8000
```

Google-Anmeldung
----------------

Vor dem Dashboard liegt eine Google-Anmeldung. Dafür braucht die laufende Umgebung diese Variablen:

```powershell
$env:SPORTWERK_SECRET_KEY = "lange-zufällige-zeichenfolge"
$env:GOOGLE_OAUTH_CLIENT_ID = "..."
$env:GOOGLE_OAUTH_CLIENT_SECRET = "..."
$env:GOOGLE_OAUTH_REDIRECT_URI = "http://127.0.0.1:8000/auth/google/callback"
```

Im Google-Cloud-Projekt muss ein OAuth-Client vom Typ Webanwendung angelegt werden. Als autorisierte Redirect-URI muss exakt die verwendete Callback-URL eingetragen sein, lokal also normalerweise:

```text
http://127.0.0.1:8000/auth/google/callback
```

Optional kann der Zugriff eingeschränkt werden:

```powershell
$env:SPORTWERK_ALLOWED_DOMAINS = "sportwerk.com"
$env:SPORTWERK_ALLOWED_EMAILS = "person@sportwerk.com"
```

Sind weder erlaubte Domains noch erlaubte E-Mail-Adressen gesetzt, darf jedes erfolgreich verifizierte Google-Konto in die App.

Nach Änderungen an `static/*.jsx`:

```powershell
node scripts\build-jsx.js
```

Lokaler Readiness-Check:

```powershell
python scripts\check-sportwerk.py
```
