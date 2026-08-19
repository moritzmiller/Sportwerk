import sqlite3
from bs4 import BeautifulSoup
import requests

url ="https://www.del-2.org/spielplan/?round=146"

response = requests.get(url)
soup = BeautifulSoup(response.content, "html.parser")

conn = sqlite3.connect("del2.db")
cursor = conn.cursor()

cursor.execute("""CREATE TABLE IF NOT EXISTS spiel_daten (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        gameID INTEGER NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        hometeam TEXT NOT NULL,
        homegoals INTEGER NULL,
        awayteam TEXT NOT NULL,
        awaygoals INTEGER NULL,
        overtime TEXT NULL
    )""")

spiel_daten = []

all_games = soup.find_all("td")
for game in all_games:
    cells = game.text.strip().replace("\n", " ")

    if cells:
        spiel_daten.append(cells)

    if len(spiel_daten) == 6:
        date = spiel_daten[0]
        time = spiel_daten[1]
        hometeam = spiel_daten[2]
        score = spiel_daten[3]

        overtime = ""
        if "(OT)" in score:
            overtime = "OT"
            score = score.replace("(OT)", "").strip()
        elif "(SO)" in score:
            overtime = "SO"
            score = score.replace("(SO)", "").strip()
        elif "(OR)" in score:
            overtime = "OR"
            score = score.replace("(OR)", "").strip()

        # 2. Am Bindestrich trennen
        tore_liste = score.split("-")

        # 3. In Zahlen umwandeln und Variablen zuweisen
        homegoals = int(tore_liste[0].strip())
        awaygoals = int(tore_liste[1].strip())

        awayteam = spiel_daten[4]
        game = spiel_daten[5]

        print(awaygoals)

        cursor.execute("INSERT INTO spiel_daten (gameID, date, time, hometeam, homegoals, awayteam, awaygoals, overtime) Values (?, ?, ?, ?, ?, ?, ?, ?)", (game, date, time, hometeam, homegoals, awayteam, awaygoals, overtime))

        spiel_daten = []

conn.commit()
conn.close()