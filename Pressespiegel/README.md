# Pressespiegel

Der Pressespiegel-Generator ist als hostbare Web-App aufgebaut. Die PDF- und Artikel-Capture-Logik liegt weiterhin in `main.py`; die Server-Oberfläche liegt in `web_app.py`.

## Web-App lokal starten

```powershell
python -m pip install -r requirements_pressespiegel.txt
python -m playwright install chromium
python web_app.py
```

Danach ist die App lokal unter `http://localhost:8000` erreichbar.

## Auf einem Server hosten

Für einen Server muss Python inklusive der Abhängigkeiten aus `requirements_pressespiegel.txt` installiert sein. Zusätzlich braucht Playwright einmalig den Chromium-Browser:

```powershell
python -m playwright install chromium
```

Ein einfacher Produktionsstart kann über einen WSGI-Server erfolgen, zum Beispiel mit `waitress` auf Windows oder `gunicorn` auf Linux. Die Flask-App heißt:

```text
web_app:app
```

Upload-Assets und erzeugte PDFs werden unter `instance/` gespeichert. Dieser Ordner sollte auf dem Server beschreibbar sein.

## Bedienung

Auf der Webseite erstellt der Nutzer Artikelgruppen. Jede Gruppe besteht aus einer `Überschrift` und einem eigenen URL-Textfeld. Über `Neue Überschrift hinzufügen` wird eine weitere Gruppe angelegt.

Der Bereich `URLs ohne Abschnitte` bleibt als Fallback erhalten. Sobald mindestens eine gültige Artikelgruppe vorhanden ist, nutzt die App die Gruppen statt der freien URL-Liste.

## Paywall-Artikel

Wenn ein Artikel hinter einer Paywall oder Anmeldung liegt oder der Seitenscreenshot nur den reinen Artikelkörper enthält, versucht die App zuerst frei verfügbare strukturierte Artikeldaten zu verwenden. Sind dort Überschrift, Titelbild, Teaser und ausreichender Artikeltext enthalten, wird daraus ein lesbares Artikelbild für das PDF erzeugt.

Wenn der Volltext nicht frei verfügbar ist, fügt die App statt eines leeren Kastens eine Paywall-Hinweisseite in das PDF ein. Diese enthält Quelle, Datum, URL, Überschrift und frei sichtbaren Teaser. Geschützte Inhalte werden nicht automatisiert entsperrt oder umgangen.

## Layouts

Im Layoutbereich kann der Nutzer ein bestehendes Layout auswählen und danach Schriftart, Hintergrund, Titelseite, Titelseitenbild, Titeltext, Akzentfarbe und Hauptlogo anpassen.

Hintergründe können Farben oder Bilder sein. Hintergrundbilder werden serverseitig geprüft: PNG/JPG, mindestens `1240x1754 px`, ungefähr A4-Hochformat.

Die Titelseite kann zusätzlich als eigenes Bild gesetzt werden. Titelseitenbilder werden ebenfalls serverseitig geprüft: PNG/JPG, mindestens `1240x1754 px`, ungefähr A4-Hochformat.

Eigene Schriftarten können als TTF-/OTF-Datei hochgeladen werden. Hauptlogos werden als PNG/JPG/ICO akzeptiert und müssen mindestens `128x128 px` groß sein.

Über `Als neues Layout speichern` werden die aktuellen Werte als eigenes Layout gespeichert und beim nächsten Start wieder angeboten.

## Desktop-App

Die alte Tkinter-Oberfläche bleibt in `main.py` erhalten:

```powershell
python main.py
```

Der bisherige PyInstaller-Build ist weiterhin möglich:

```powershell
pyinstaller pressespiegel.spec
```
