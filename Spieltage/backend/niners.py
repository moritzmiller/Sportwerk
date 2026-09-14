from bs4 import BeautifulSoup
import requests
import sqlite3
import re

url = "https://www.chemnitz99.de/saison"

response = requests.get(url)
html = response.text

soup = BeautifulSoup(html, 'html.parser')

games = soup.find_all("div", {"class": "game"})

conn = sqlite3.connect('niners.db')
cursor = conn.cursor()

cursor.execute("""CREATE TABLE IF NOT EXISTS niners (
               id INTEGER PRIMARY KEY,
               hometeam TEXT NOT NULL,
               homegoals INTEGER NULL,
               awayteam TEXT NOT NULL,
               awaygoals INTEGER NULL,
               place INTEGER NOT NULL,
               winner INTEGER NULL,
               date DATE NOT NULL
            )""")

muster = r"([\d-]+)\s*:\s*([\d-]+)\s+(.+?)vs\.(.+?)(Auswärts|Heimspiel|Heim)\s+(\d{2}\.\d{2}\.\d{4})"

for game in games:
    ausgabe = " ".join(game.text.split())
    match = re.match(muster, ausgabe)
    if match:
        # Zuweisung in einzelne Variablen
        p_heim = match.group(1)
        p_gast = match.group(2)

        punkte_heim = int(p_heim) if p_heim.isdigit() else None
        punkte_gast = int(p_gast) if p_gast.isdigit() else None

        team_heim = match.group(3).strip()
        team_gast = match.group(4).strip()

        if match.group(5) == "Heimspiel":
            spielort = 1
        else:
            spielort = 0

        if punkte_heim is None or punkte_gast is None:
            sieger = None
        elif punkte_heim > punkte_gast:
            sieger = 1
        else:
            sieger = 0

        datum = match.group(6)

        cursor.execute("""
                    INSERT INTO niners (homegoals, awaygoals, hometeam, awayteam, place, winner, date) 
                    VALUES (?,?,?,?,?,?,?)
                """, (punkte_heim, punkte_gast, team_heim, team_gast, spielort, sieger, datum))
    print(game.text)
conn.commit()
conn.close()