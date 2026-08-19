from bs4 import BeautifulSoup
import requests
import re

import kagglehub

path = kagglehub.dataset_download("jonathangmwl/nba-shot-locations")

url = "https://www.chemie-leipzig.de/teams/1-mannschaft/spielplan-ergebnisse/"

response = requests.get(url)
html = response.text

soup = BeautifulSoup(html, 'html.parser')

for date in soup.find_all("tr"):
    text = date.get_text(" ", strip=True)
    text = text.replace("â", "—")
    text = text.replace("Â\xa0", " ")
    text = text.replace("\xa0", " ")
    text = " ".join(text.split())

    pattern = re.compile(
        r"([0-9]+)"
    )
    if text:
        print(text)