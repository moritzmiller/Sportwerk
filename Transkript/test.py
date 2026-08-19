import json

meeting_daten = {
    "datum": "2026-04-29",
    "beitraege": [
        {"sprecher": "Moritz"},
        {"sprecher": "Max"}
    ]
}

with open("speicher.json", "w") as f:
    json.dump(meeting_daten, f, indent=4, ensure_ascii=False)

print("Datei wurde erstellt")

with open("speicher.json", "r") as f:
    daten = json.load(f)

for beitrag in daten["beitraege"]:
    print(beitrag["sprecher"])