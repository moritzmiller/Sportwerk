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

Auf Linux läuft der Freie-Presse-Login headless; ein X-Server oder `xvfb` ist dafür nicht erforderlich. Der angemeldete Administrator bedient die Loginseite während „Login erneuern“ direkt in der Weboberfläche. Auf dem Server müssen Playwright-Chromium und die dazugehörigen Linux-Systembibliotheken installiert sein.

Da Login-Browser und laufende Pressespiegel-Jobs ihren Zustand im Prozess halten, muss der WSGI-Dienst als einzelner Worker mit Threads betrieben werden, zum Beispiel aus diesem Verzeichnis:

```bash
gunicorn --workers 1 --threads 8 --timeout 180 web_app:app
```

Die Freie-Presse-Sitzung bleibt im vorhandenen `instance/auth/freiepresse/profile` und `storage_state.json` erhalten. Die Dateien werden nicht ins Repository aufgenommen (`instance/` ist ignoriert). Während das Profil geöffnet ist, verhindert eine Betriebssystem-Sperre einen parallelen Zugriff; Artikel-Jobs verwenden in diesem Fall die zuletzt gespeicherte Session-Kopie. Nach dem Anmelden muss der Administrator in der Oberfläche **Session speichern** wählen.

Upload-Assets und erzeugte PDFs werden unter `instance/` gespeichert. Dieser Ordner sollte auf dem Server beschreibbar sein.

## Bedienung

Auf der Webseite erstellt der Nutzer Artikelgruppen. Jede Gruppe besteht aus einer `Überschrift` und einem eigenen URL-Textfeld. Über `Neue Überschrift hinzufügen` wird eine weitere Gruppe angelegt.

Der Bereich `URLs ohne Abschnitte` bleibt als Fallback erhalten. Sobald mindestens eine gültige Artikelgruppe vorhanden ist, nutzt die App die Gruppen statt der freien URL-Liste.

## Paywall-Artikel

Wenn ein Artikel hinter einer Paywall oder Anmeldung liegt oder der Seitenscreenshot nur den reinen Artikelkörper enthält, versucht die App zuerst frei verfügbare strukturierte Artikeldaten zu verwenden. Sind dort Überschrift, Titelbild, Teaser und ausreichender Artikeltext enthalten, wird daraus ein lesbares Artikelbild für das PDF erzeugt.

Für die Freie Presse, Sächsische Zeitung, Leipziger Volkszeitung und Radio Dresden kann ein berechtigter Zugang einmalig in der Web-Oberfläche autorisiert werden. Der Button `Login erneuern` öffnet für die Freie Presse eine headless Browseransicht in der Web-App, in der ein Admin den Verlag normal anmeldet; die anderen Integrationen bleiben unverändert. Die App speichert die Browser-Sitzung unter `instance/auth/freiepresse/`, `instance/auth/saechsische/`, `instance/auth/lvz/` beziehungsweise `instance/auth/radiodresden/` und nutzt sie automatisch für Artikel der jeweiligen Quelle. Zugangsdaten werden nicht im Code oder in der Pressespiegel-Konfiguration gespeichert oder protokolliert.

Für die Freie Presse: **Login erneuern** anklicken, im Browserbildschirm die Anmeldeseite bedienen und das Eingabefeld der Web-App zum Übertragen von Benutzername/Passwort oder einem eingefügten Code verwenden. Danach **Session speichern** wählen. Ein abgebrochener oder abgelaufener Versuch wird nicht als bestätigter Login angezeigt.

Wenn kein autorisierter Zugang vorhanden ist oder der gespeicherte Login abgelaufen ist, fügt die App statt eines leeren Kastens eine Paywall-Hinweisseite in das PDF ein. Diese enthält Quelle, Datum, URL, Überschrift und frei sichtbaren Teaser.

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
