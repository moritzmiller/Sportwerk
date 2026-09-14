from pathlib import Path
import re
import pandas as pd
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

INPUT_XLSX = "input.xlsx"
TEMPLATE_DIR = "."
TEMPLATE_NAME = "layout.html"
OUT_DIR = Path("out")

def safe_filename(s: str) -> str:
    s = str(s).strip()
    s = re.sub(r"[^\w\-\. ]+", "", s, flags=re.UNICODE)
    s = re.sub(r"\s+", "_", s)
    return s or "output"

def main():
    OUT_DIR.mkdir(exist_ok=True)

    # Excel lesen (Standard: erstes Tabellenblatt)
    df = pd.read_excel(INPUT_XLSX, engine="openpyxl")

    # Template vorbereiten
    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template(TEMPLATE_NAME)

    for i, row in df.iterrows():
        data = row.to_dict()

        # HTML aus Vorlage rendern
        html = template.render(**data)

        # Dateiname (z.B. mit Namen, sonst Index)
        base = safe_filename(f"{data.get('Nachname','')}_{data.get('Vorname','')}".strip("_"))
        filename = OUT_DIR / f"{i+1:02d}_{base}.pdf"

        # PDF schreiben
        HTML(string=html, base_url=str(Path(TEMPLATE_DIR).resolve())).write_pdf(str(filename))

    print(f"Fertig. PDFs liegen in: {OUT_DIR.resolve()}")

if __name__ == "__main__":
    main()
