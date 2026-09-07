import re

import requests
from bs4 import BeautifulSoup


URL = "https://www.chemie-leipzig.de/teams/1-mannschaft/spielplan-ergebnisse/"
REQUEST_TIMEOUT_SECONDS = 30


def normalize_row_text(text: str) -> str:
    text = text.replace("\xa0", " ")
    for _ in range(2):
        repaired = None
        for encoding in ("cp1252", "latin1"):
            try:
                repaired = text.encode(encoding).decode("utf-8")
                break
            except UnicodeError:
                continue
        if repaired is None:
            break
        if repaired == text:
            break
        text = repaired
    text = text.replace("\u00e2\u0080\u0094", "\u2014")
    return " ".join(text.split())


def fetch_schedule_rows(url: str = URL) -> list[str]:
    response = requests.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    rows = []
    for row in soup.find_all("tr"):
        text = normalize_row_text(row.get_text(" ", strip=True))
        if text:
            rows.append(text)
    return rows


def main() -> None:
    pattern = re.compile(r"([0-9]+)")
    for text in fetch_schedule_rows():
        if pattern.search(text):
            print(text)


if __name__ == "__main__":
    main()
