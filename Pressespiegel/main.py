from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import os
import re
import ssl
import subprocess
import sys
import tempfile
import threading
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Callable
from urllib.parse import parse_qs, unquote, urljoin, urlparse, urlunparse
from urllib.request import Request, urlopen

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, scrolledtext, simpledialog, ttk
except ImportError:
    tk = None
    filedialog = messagebox = scrolledtext = simpledialog = ttk = None

from bs4 import BeautifulSoup
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps
from playwright.async_api import BrowserContext, Error as PlaywrightError
from playwright.async_api import Locator, Page, async_playwright
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


APP_NAME = "Pressespiegel Generator"
APP_ID = "FamousDesigns.Pressespiegel.Automatisierung"
ACCENT = HexColor("#303030")
DARK = HexColor("#171717")
TEXT = HexColor("#2C2C2C")
MUTED = HexColor("#6B7280")
LIGHT = HexColor("#F4F5F7")
BORDER = HexColor("#D9DDE3")
PDF_LOGO_BOX_WIDTH = 168
PDF_LOGO_BOX_HEIGHT = 34
PDF_SECTION_TITLE_FONT_SIZE = 28
PDF_SECTION_TITLE_LINE_HEIGHT = 34
PDF_SECTION_TITLE_MAX_LINES = 4
SOURCE_LOGO_SUFFIXES = {".png", ".svg"}
LOGO_STOP_WORDS = {
    "logo",
    "logos",
    "media",
    "source",
    "quelle",
    "presse",
    "news",
    "nachrichten",
    "www",
}

StatusCallback = Callable[[str], None]
ProgressCallback = Callable[[float], None]
LogCallback = Callable[[str], None]

PRESS_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = PRESS_DIR / "instance"
FREIE_PRESSE_AUTH_DIR = INSTANCE_DIR / "auth" / "freiepresse"
FREIE_PRESSE_PROFILE_DIR = FREIE_PRESSE_AUTH_DIR / "profile"
FREIE_PRESSE_STORAGE_STATE_PATH = FREIE_PRESSE_AUTH_DIR / "storage_state.json"
FREIE_PRESSE_LOGIN_URL = "https://www.freiepresse.de/"
FREIE_PRESSE_DOMAINS = {"freiepresse.de", "www.freiepresse.de"}
SAECHSISCHE_AUTH_DIR = INSTANCE_DIR / "auth" / "saechsische"
SAECHSISCHE_PROFILE_DIR = SAECHSISCHE_AUTH_DIR / "human-profile"
SAECHSISCHE_STORAGE_STATE_PATH = SAECHSISCHE_AUTH_DIR / "storage_state.json"
SAECHSISCHE_LOGIN_URL = "https://www.saechsische.de/"
LVZ_AUTH_DIR = INSTANCE_DIR / "auth" / "lvz"
LVZ_PROFILE_DIR = LVZ_AUTH_DIR / "human-profile"
LVZ_STORAGE_STATE_PATH = LVZ_AUTH_DIR / "storage_state.json"
LVZ_LOGIN_URL = "https://www.lvz.de/"
RADIO_DRESDEN_AUTH_DIR = INSTANCE_DIR / "auth" / "radiodresden"
RADIO_DRESDEN_PROFILE_DIR = RADIO_DRESDEN_AUTH_DIR / "human-profile"
RADIO_DRESDEN_STORAGE_STATE_PATH = RADIO_DRESDEN_AUTH_DIR / "storage_state.json"
RADIO_DRESDEN_LOGIN_URL = "https://www.radiodresden.de/"
BROWSER_CONTEXT_OPTIONS = {
    "viewport": {"width": 1440, "height": 1000},
    "screen": {"width": 1440, "height": 1000},
    "locale": "de-DE",
    "color_scheme": "light",
    "device_scale_factor": 1,
}
PREFERRED_PERSISTENT_BROWSER_CHANNELS = ("chrome", "msedge")


def is_freie_presse_url(url: str) -> bool:
    hostname = (urlparse(url).hostname or "").lower().removeprefix("www.")
    return hostname == "freiepresse.de" or hostname.endswith(".freiepresse.de")


def freie_presse_storage_state_path() -> Path:
    return FREIE_PRESSE_STORAGE_STATE_PATH


def has_persistent_profile_state(profile_dir: Path) -> bool:
    default_profile = profile_dir / "Default"
    return default_profile.exists() and any(default_profile.iterdir())


def has_freie_presse_auth_state() -> bool:
    return (
        FREIE_PRESSE_STORAGE_STATE_PATH.exists()
        and FREIE_PRESSE_STORAGE_STATE_PATH.stat().st_size > 0
    ) or has_persistent_profile_state(FREIE_PRESSE_PROFILE_DIR)


def saechsische_storage_state_path() -> Path:
    return SAECHSISCHE_STORAGE_STATE_PATH


def has_saechsische_auth_state() -> bool:
    return has_persistent_profile_state(SAECHSISCHE_PROFILE_DIR)


def is_lvz_url(url: str) -> bool:
    hostname = (urlparse(url).hostname or "").lower()
    return hostname == "lvz.de" or hostname.endswith(".lvz.de")


def lvz_storage_state_path() -> Path:
    return LVZ_STORAGE_STATE_PATH


def has_lvz_auth_state() -> bool:
    return (
        LVZ_STORAGE_STATE_PATH.exists()
        and LVZ_STORAGE_STATE_PATH.stat().st_size > 0
    ) or has_persistent_profile_state(LVZ_PROFILE_DIR)


def is_radio_dresden_url(url: str) -> bool:
    hostname = (urlparse(url).hostname or "").lower()
    return hostname == "radiodresden.de" or hostname.endswith(".radiodresden.de")


def radio_dresden_storage_state_path() -> Path:
    return RADIO_DRESDEN_STORAGE_STATE_PATH


def has_radio_dresden_auth_state() -> bool:
    return (
        RADIO_DRESDEN_STORAGE_STATE_PATH.exists()
        and RADIO_DRESDEN_STORAGE_STATE_PATH.stat().st_size > 0
    ) or has_persistent_profile_state(RADIO_DRESDEN_PROFILE_DIR)


def source_login_context_options() -> dict:
    options = dict(BROWSER_CONTEXT_OPTIONS)
    options["no_viewport"] = True
    options["args"] = [
        *options.get("args", []),
        "--start-maximized",
        "--window-position=0,0",
    ]
    options.pop("viewport", None)
    options.pop("screen", None)
    options.pop("device_scale_factor", None)
    return options


async def launch_persistent_source_context(
    playwright,
    profile_dir: Path,
    *,
    headless: bool,
    login_window: bool = False,
) -> BrowserContext:
    options = source_login_context_options() if login_window else dict(BROWSER_CONTEXT_OPTIONS)
    last_error: Exception | None = None
    for channel in (*PREFERRED_PERSISTENT_BROWSER_CHANNELS, None):
        try:
            launch_options = {
                "user_data_dir": str(profile_dir),
                "headless": headless,
                **options,
            }
            if channel is not None:
                launch_options["channel"] = channel
            return await playwright.chromium.launch_persistent_context(**launch_options)
        except PlaywrightError as exc:
            message = str(exc)
            last_error = exc
            if channel is not None and (
                "Chromium distribution" in message
                or "Executable doesn't exist" in message
                or "not found" in message
            ):
                continue
            raise
    if last_error is not None:
        raise last_error
    raise RuntimeError("Persistenter Browser-Kontext konnte nicht gestartet werden.")


async def create_pressespiegel_context(browser, storage_state_path: Path | None = None):
    options = dict(BROWSER_CONTEXT_OPTIONS)
    if storage_state_path and storage_state_path.exists():
        options["storage_state"] = str(storage_state_path)
    return await browser.new_context(**options)


async def create_source_pressespiegel_context(
    playwright,
    browser,
    profile_dir: Path,
    storage_state_path: Path,
) -> BrowserContext:
    if has_persistent_profile_state(profile_dir):
        return await launch_persistent_source_context(
            playwright,
            profile_dir,
            headless=True,
        )
    return await create_pressespiegel_context(browser, storage_state_path)


if sys.platform.startswith("win"):
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
    except Exception:
        pass


@dataclass(slots=True)
class ArticleResult:
    url: str
    source_url: str | None = None
    title: str = "Unbekannter Titel"
    site_name: str = "Unbekannte Quelle"
    article_date: str = "Unbekanntes Datum"
    image_path: Path | None = None
    logo_path: Path | None = None
    section_heading: str | None = None
    capture_note: str | None = None
    logo_warning: str | None = None
    error: str | None = None

    @property
    def successful(self) -> bool:
        return self.image_path is not None and self.error is None


@dataclass(slots=True)
class BuildSummary:
    output_path: Path
    articles: list[ArticleResult]
    cancelled: bool = False

    @property
    def successful_articles(self) -> list[ArticleResult]:
        return [article for article in self.articles if article.successful]

    @property
    def failed_articles(self) -> list[ArticleResult]:
        return [article for article in self.articles if not article.successful]


@dataclass(slots=True)
class SectionPlanEntry:
    heading: str
    urls: list[str]


@dataclass(slots=True)
class ArticleTextBlock:
    kind: str
    text: str


@dataclass(slots=True)
class RssArticleFallback:
    title: str
    site_name: str
    article_date: str
    description: str
    image_url: str | None = None


@dataclass(frozen=True, slots=True)
class PdfFontFamily:
    label: str
    regular: str
    bold: str
    source_path: str | None = None


@dataclass(frozen=True, slots=True)
class PdfLayout:
    layout_id: str
    name: str
    font_family: str
    background_hex: str
    cover_style: str
    main_logo_path: str | None
    accent_hex: str
    title_text: str = "PRESSESPIEGEL"
    background_kind: str = "color"
    background_image_path: str | None = None
    cover_image_path: str | None = None
    is_custom: bool = False


PDF_FONT_FAMILIES: dict[str, PdfFontFamily] = {
    "Helvetica": PdfFontFamily("Helvetica", "Helvetica", "Helvetica-Bold"),
    "Times": PdfFontFamily("Times", "Times-Roman", "Times-Bold"),
    "Courier": PdfFontFamily("Courier", "Courier", "Courier-Bold"),
}

PDF_LAYOUTS: tuple[PdfLayout, ...] = (
    PdfLayout(
        layout_id="default",
        name="Default layout",
        font_family="Helvetica",
        background_hex="#FFFFFF",
        cover_style="classic",
        main_logo_path="FD_Icon_white-black.ico",
        accent_hex="#303030",
    ),
    PdfLayout(
        layout_id="sportwerk",
        name="Sportwerk hell",
        font_family="Helvetica",
        background_hex="#FFFFFF",
        cover_style="brand_band",
        main_logo_path="FD_Icon_white-black.ico",
        accent_hex="#303030",
    ),
    PdfLayout(
        layout_id="editorial",
        name="Editorial ruhig",
        font_family="Times",
        background_hex="#F7F7F8",
        cover_style="editorial",
        main_logo_path="FD_Icon_white-black.ico",
        accent_hex="#303030",
    ),
)
PDF_LAYOUT_BY_ID = {layout.layout_id: layout for layout in PDF_LAYOUTS}
CUSTOM_LAYOUTS_PATH = Path(
    os.environ.get(
        "SPORTWERK_LAYOUT_CONFIG_PATH",
        Path(__file__).resolve().parent / "instance" / "pressespiegel_layouts.json",
    )
).expanduser()
MIN_BACKGROUND_WIDTH = 1240
MIN_BACKGROUND_HEIGHT = 1754
BACKGROUND_ASPECT_RATIO_RANGE = (0.62, 0.80)
SUPPORTED_BACKGROUND_FORMATS = {"JPEG", "PNG"}
SUPPORTED_LOGO_FORMATS = {"JPEG", "PNG", "ICO"}
SUPPORTED_FONT_SUFFIXES = {".ttf", ".otf"}


class UserCancelled(Exception):
    """Wird ausgelöst, wenn die Verarbeitung vom Benutzer abgebrochen wurde."""


# =====================================================================
# URL- UND METADATEN-HILFSFUNKTIONEN
# =====================================================================


def _normalize_http_url(raw_url: str) -> str | None:
    """Normalisiert eine URL und verwirft offensichtlich ungültige Eingaben."""
    value = raw_url.strip()
    if not value:
        return None

    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value):
        value = f"https://{value}"

    if re.search(r"\s", value):
        return None

    parsed = urlparse(value)
    hostname = parsed.hostname or ""
    looks_like_host = (
        "." in hostname
        or hostname == "localhost"
        or bool(re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", hostname))
    )
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or not looks_like_host:
        return None

    # Fragmente sind für das Laden eines Artikels normalerweise nicht relevant.
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, parsed.query, ""))


def normalize_url(raw_url: str) -> str | None:
    """Normalisiert eine URL und entpackt bekannte Redirect-Links auf die Ziel-URL."""
    normalized = _normalize_http_url(raw_url)
    if normalized is None:
        return None
    return _google_redirect_target_url(normalized) or normalized


def _is_google_host(hostname: str) -> bool:
    host = hostname.lower().removeprefix("www.")
    return host in {"google.de", "google.com"} or host.endswith(".google.de") or host.endswith(".google.com")


def _google_redirect_target_url(raw_url: str) -> str | None:
    normalized_url = _normalize_http_url(raw_url)
    if normalized_url is None:
        return None

    parsed = urlparse(normalized_url)
    if not _is_google_host(parsed.hostname or ""):
        return None

    query = parse_qs(parsed.query, keep_blank_values=False)
    for key in ("url", "u", "q", "adurl"):
        for raw_value in query.get(key, []):
            candidate = _normalize_http_url(unquote(raw_value))
            if candidate and not _is_google_host(urlparse(candidate).hostname or ""):
                return candidate

    marker = "/amp/s/"
    if marker in parsed.path:
        candidate = _normalize_http_url("https://" + parsed.path.split(marker, 1)[1])
        if candidate:
            return candidate

    return None


def split_url_input(raw_lines: list[str]) -> list[str]:
    """Teilt Semikolon- oder zeilengetrennte Eingaben in einzelne URL-Kandidaten."""
    candidates: list[str] = []
    for raw_line in raw_lines:
        for candidate in re.split(r"[;\n\r]+", raw_line):
            value = candidate.strip().strip(",")
            if value:
                candidates.append(value)
    return candidates


def prepare_urls(raw_lines: list[str]) -> tuple[list[str], list[str]]:
    """Validiert URLs und liefert ungültige Zeilen separat zurück."""
    valid: list[str] = []
    invalid: list[str] = []

    for raw_line in split_url_input(raw_lines):
        normalized = normalize_url(raw_line)
        if normalized is None:
            if raw_line.strip():
                invalid.append(raw_line.strip())
            continue
        valid.append(normalized)

    return valid, invalid


def prepare_section_groups(raw_groups: list[tuple[str, list[str]]]) -> tuple[list[SectionPlanEntry], list[str]]:
    """Validiert Abschnittsgruppen aus Überschrift und URL-Zeilen."""
    sections: list[SectionPlanEntry] = []
    invalid: list[str] = []

    for group_index, (raw_heading, raw_url_lines) in enumerate(raw_groups, start=1):
        heading = re.sub(r"\s+", " ", raw_heading).strip()
        url_lines = split_url_input(raw_url_lines)
        if not heading and not url_lines:
            continue

        if not heading:
            invalid.append(f"Abschnitt {group_index}: Überschrift fehlt")
            continue

        urls: list[str] = []
        for raw_line in url_lines:
            normalized = normalize_url(raw_line)
            if normalized is None:
                invalid.append(f"{heading}: {raw_line.strip()}")
                continue
            urls.append(normalized)

        if not urls:
            invalid.append(f"{heading}: keine gültige URL")
            continue

        sections.append(SectionPlanEntry(heading=heading, urls=urls))

    return sections, invalid


def flatten_section_urls(sections: list[SectionPlanEntry]) -> list[tuple[str, str | None]]:
    """Erzeugt die Verarbeitungsreihenfolge und markiert Abschnittsanfänge."""
    jobs: list[tuple[str, str | None]] = []
    for section in sections:
        for url_index, url in enumerate(section.urls):
            jobs.append((url, section.heading if url_index == 0 else None))
    return jobs


def _iter_json_nodes(value: object):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _iter_json_nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_json_nodes(child)


def _first_meta_content(soup: BeautifulSoup, selectors: list[tuple[str, dict[str, str]]]) -> str | None:
    for tag_name, attrs in selectors:
        node = soup.find(tag_name, attrs=attrs)
        if node and node.get("content"):
            return str(node["content"]).strip()
    return None


def _first_selector_text(soup: BeautifulSoup, selectors: tuple[str, ...]) -> str | None:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            value = node.get_text(" ", strip=True)
            if value:
                return value
    return None


def source_host_from_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if "@" in host:
        host = host.rsplit("@", 1)[1]
    if ":" in host:
        host = host.split(":", 1)[0]
    return host.rstrip(".")


def _format_german_text_date(value: str) -> str | None:
    month_numbers = {
        "januar": 1,
        "februar": 2,
        "maerz": 3,
        "marz": 3,
        "april": 4,
        "mai": 5,
        "juni": 6,
        "juli": 7,
        "august": 8,
        "september": 9,
        "oktober": 10,
        "november": 11,
        "dezember": 12,
    }
    match = re.search(
        r"\b(\d{1,2})\.\s*([A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]+)\s+(\d{4})\b",
        value,
    )
    if not match:
        return None

    month_name = (
        match.group(2)
        .casefold()
        .replace("\u00e4", "ae")
        .replace("\u00f6", "oe")
        .replace("\u00fc", "ue")
        .replace("\u00df", "ss")
    )
    month = month_numbers.get(month_name)
    if month is None:
        return None
    return f"{int(match.group(1)):02d}.{month:02d}.{match.group(3)}"


def _format_date(raw_date: str | None) -> str:
    if not raw_date:
        return "Unbekanntes Datum"

    value = re.sub(r"\s+", " ", raw_date).strip()
    if not value:
        return "Unbekanntes Datum"

    iso_candidate = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(iso_candidate)
        return parsed.strftime("%d.%m.%Y")
    except ValueError:
        pass

    known_formats = (
        "%Y-%m-%d",
        "%d.%m.%Y",
        "%d.%m.%y",
        "%d/%m/%Y",
        "%Y/%m/%d",
    )
    for fmt in known_formats:
        try:
            return datetime.strptime(value[:10], fmt).strftime("%d.%m.%Y")
        except ValueError:
            continue

    german_date = _format_german_text_date(value)
    if german_date:
        return german_date

    date_match = re.search(r"\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b", value)
    return date_match.group(1) if date_match else value[:30]


def extract_canonical_article_url(html_content: str, fallback_url: str) -> str | None:
    """Ermittelt die kanonische Artikel-URL aus Seitenmetadaten."""
    soup = BeautifulSoup(html_content, "html.parser")
    candidates: list[str] = []

    for selector in (
        ("meta", {"property": "og:url"}),
        ("meta", {"name": "twitter:url"}),
    ):
        value = _first_meta_content(soup, [selector])
        if value:
            candidates.append(value)

    canonical = soup.find("link", rel=lambda value: value and "canonical" in value)
    if canonical and canonical.get("href"):
        candidates.append(str(canonical["href"]).strip())

    for script in soup.find_all("script", type="application/ld+json"):
        raw_json = script.string or script.get_text(strip=True)
        if not raw_json:
            continue
        try:
            data = json.loads(raw_json)
        except (json.JSONDecodeError, TypeError):
            continue

        for node in _iter_json_nodes(data):
            for key in ("url", "mainEntityOfPage"):
                value = node.get(key)
                if isinstance(value, str):
                    candidates.append(value)
                elif isinstance(value, dict):
                    node_id = value.get("@id") or value.get("url")
                    if isinstance(node_id, str):
                        candidates.append(node_id)

    for candidate in candidates:
        normalized = normalize_url(urljoin(fallback_url, candidate))
        if normalized and not _is_google_host(urlparse(normalized).hostname or ""):
            return normalized

    return None


def resolve_article_source_url(html_content: str, loaded_url: str, input_url: str) -> str:
    canonical_url = extract_canonical_article_url(html_content, loaded_url)
    if canonical_url:
        return canonical_url

    loaded_redirect_target = _google_redirect_target_url(loaded_url)
    if loaded_redirect_target:
        return loaded_redirect_target

    normalized_loaded_url = normalize_url(loaded_url)
    if normalized_loaded_url and not _is_google_host(urlparse(normalized_loaded_url).hostname or ""):
        return normalized_loaded_url

    input_redirect_target = _google_redirect_target_url(input_url)
    if input_redirect_target:
        return input_redirect_target

    return normalized_loaded_url or normalize_url(input_url) or input_url


def extract_article_metadata(html_content: str, fallback_url: str) -> tuple[str, str, str]:
    """Liest Titel, Quelle und Veröffentlichungsdatum aus HTML und JSON-LD."""
    soup = BeautifulSoup(html_content, "html.parser")

    json_title: str | None = None
    json_site: str | None = None
    json_date: str | None = None

    for script in soup.find_all("script", type="application/ld+json"):
        raw_json = script.string or script.get_text(strip=True)
        if not raw_json:
            continue
        try:
            data = json.loads(raw_json)
        except (json.JSONDecodeError, TypeError):
            continue

        for node in _iter_json_nodes(data):
            node_type = node.get("@type")
            types = node_type if isinstance(node_type, list) else [node_type]
            is_article = any(
                value in {"Article", "NewsArticle", "ReportageNewsArticle", "BlogPosting"}
                for value in types
            )

            if is_article or not json_title:
                json_title = json_title or node.get("headline") or node.get("name")
                json_date = json_date or node.get("datePublished") or node.get("dateCreated")

            publisher = node.get("publisher")
            if isinstance(publisher, dict):
                json_site = json_site or publisher.get("name")

    title = (
        _first_meta_content(
            soup,
            [
                ("meta", {"property": "og:title"}),
                ("meta", {"name": "twitter:title"}),
            ],
        )
        or json_title
    )
    if not title:
        heading = soup.find("h1")
        title = heading.get_text(" ", strip=True) if heading else None
    if not title and soup.title:
        title = soup.title.get_text(" ", strip=True)
    title = re.sub(r"\s+", " ", title or "Unbekannter Titel").strip()

    site_name = (
        source_host_from_url(fallback_url)
        or _first_meta_content(soup, [("meta", {"property": "og:site_name"})])
        or json_site
        or "Unbekannte Quelle"
    )
    site_name = re.sub(r"\s+", " ", site_name).strip()

    raw_date = (
        json_date
        or _first_meta_content(
            soup,
            [
                ("meta", {"property": "article:published_time"}),
                ("meta", {"name": "date"}),
                ("meta", {"name": "dcterms.created"}),
                ("meta", {"itemprop": "datePublished"}),
            ],
        )
    )
    if not raw_date:
        time_tag = soup.find("time")
        if time_tag:
            raw_date = time_tag.get("datetime") or time_tag.get_text(" ", strip=True)
    if not raw_date:
        raw_date = _first_selector_text(
            soup,
            (
                ".site-info .date",
                ".article-date",
                ".date",
                ".datum",
                "[class*='date' i]",
                "[class*='datum' i]",
            ),
        )

    return title, site_name, _format_date(raw_date)


def extract_article_teaser(html_content: str) -> str:
    """Liest eine frei sichtbare Kurzbeschreibung für Fallback-Seiten."""
    soup = BeautifulSoup(html_content, "html.parser")
    candidates: list[str] = []

    for selector in (
        ("meta", {"property": "og:description"}),
        ("meta", {"name": "twitter:description"}),
        ("meta", {"name": "description"}),
    ):
        value = _first_meta_content(soup, [selector])
        if value:
            candidates.append(value)

    for script in soup.find_all("script", type="application/ld+json"):
        raw_json = script.string or script.get_text(strip=True)
        if not raw_json:
            continue
        try:
            data = json.loads(raw_json)
        except (json.JSONDecodeError, TypeError):
            continue
        for node in _iter_json_nodes(data):
            for key in ("description", "abstract"):
                value = node.get(key)
                if isinstance(value, str):
                    candidates.append(value)

    for candidate in candidates:
        teaser = _clean_article_text(candidate)
        if teaser and not _looks_like_non_article_text(teaser):
            return teaser
    return ""


def _article_json_nodes(soup: BeautifulSoup) -> list[dict]:
    article_nodes: list[dict] = []
    for script in soup.find_all("script", type="application/ld+json"):
        raw_json = script.string or script.get_text(strip=True)
        if not raw_json:
            continue
        try:
            data = json.loads(raw_json)
        except (json.JSONDecodeError, TypeError):
            continue
        for node in _iter_json_nodes(data):
            if not isinstance(node, dict):
                continue
            node_type = node.get("@type")
            types = node_type if isinstance(node_type, list) else [node_type]
            if any(value in {"Article", "NewsArticle", "ReportageNewsArticle", "BlogPosting"} for value in types):
                article_nodes.append(node)
    return article_nodes


def _json_image_candidates(value: object) -> list[str]:
    candidates: list[str] = []
    if isinstance(value, str):
        candidates.append(value)
    elif isinstance(value, dict):
        for key in ("url", "contentUrl", "thumbnailUrl"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                candidates.append(candidate)
        nested = value.get("image")
        if nested is not value:
            candidates.extend(_json_image_candidates(nested))
    elif isinstance(value, list):
        for item in value:
            candidates.extend(_json_image_candidates(item))
    return candidates


def extract_article_image_url(html_content: str, base_url: str) -> str | None:
    """Liest ein frei verlinktes Artikel-/Titelbild aus Meta-Tags oder JSON-LD."""
    soup = BeautifulSoup(html_content, "html.parser")
    candidates: list[str] = []

    for selector in (
        ("meta", {"property": "og:image"}),
        ("meta", {"property": "og:image:url"}),
        ("meta", {"name": "twitter:image"}),
        ("meta", {"name": "twitter:image:src"}),
        ("link", {"rel": "image_src"}),
    ):
        tag_name, attrs = selector
        node = soup.find(tag_name, attrs=attrs)
        value = None
        if node:
            value = node.get("content") or node.get("href")
        if value:
            candidates.append(str(value).strip())

    for node in _article_json_nodes(soup):
        candidates.extend(_json_image_candidates(node.get("image")))

    article_roots = soup.select("article, main, [data-testid*='article' i], [class*='article' i]")
    search_roots = article_roots if article_roots else [soup]
    for root in search_roots:
        for image_node in root.select("picture source, img"):
            for attr_name in ("src", "data-src", "data-original", "data-lazy-src", "content"):
                value = image_node.get(attr_name)
                if value:
                    candidates.append(str(value).strip())
            srcset = image_node.get("srcset") or image_node.get("data-srcset")
            if srcset:
                candidates.extend(_srcset_image_candidates(str(srcset)))

    seen: set[str] = set()
    for candidate in candidates:
        normalized = urljoin(base_url, candidate.strip())
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        parsed = urlparse(normalized)
        if parsed.scheme in {"http", "https"}:
            return normalized
    return None


def _srcset_image_candidates(srcset: str) -> list[str]:
    candidates: list[tuple[float, str]] = []
    for raw_candidate in srcset.split(","):
        value = raw_candidate.strip()
        if not value:
            continue
        parts = value.split()
        url = parts[0]
        descriptor = parts[1] if len(parts) > 1 else ""
        score = 0.0
        if descriptor.endswith("w"):
            try:
                score = float(descriptor[:-1])
            except ValueError:
                score = 0.0
        elif descriptor.endswith("x"):
            try:
                score = float(descriptor[:-1]) * 1000
            except ValueError:
                score = 0.0
        candidates.append((score, url))
    candidates.sort(key=lambda item: item[0], reverse=True)
    return [url for _score, url in candidates]


def _is_certificate_error(exc: BaseException) -> bool:
    current: BaseException | None = exc
    while current is not None:
        if isinstance(current, ssl.SSLCertVerificationError):
            return True
        current = current.__cause__ or current.__context__
    return "certificate verify failed" in str(exc).lower()


def _open_image_request(request: Request, timeout: int = 20):
    try:
        return urlopen(request, timeout=timeout)
    except OSError as exc:
        if not _is_certificate_error(exc):
            raise

    try:
        import certifi

        context = ssl.create_default_context(cafile=certifi.where())
        return urlopen(request, timeout=timeout, context=context)
    except (ImportError, OSError) as exc:
        if not _is_certificate_error(exc):
            raise

    return urlopen(request, timeout=timeout, context=ssl._create_unverified_context())


def download_remote_image(image_url: str, page_url: str, destination: Path) -> Path | None:
    try:
        request = Request(
            image_url,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "Referer": page_url,
            },
        )
        with _open_image_request(request, timeout=20) as response:
            content_type = response.headers.get("Content-Type", "").lower()
            payload = response.read(8_000_000)
        if "svg" in content_type or len(payload) < 5_000:
            return None
        with Image.open(io.BytesIO(payload)) as source:
            image = source.convert("RGB")
            if image.width < 500 or image.height < 250:
                return None
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, format="PNG", optimize=True)
    except (OSError, ValueError):
        return None

    return destination if destination.exists() else None


def download_article_hero_image(html_content: str, page_url: str, destination: Path) -> Path | None:
    image_url = extract_article_image_url(html_content, page_url)
    if not image_url:
        return None
    return download_remote_image(image_url, page_url, destination)


def is_saechsische_url(url: str) -> bool:
    hostname = (urlparse(url).hostname or "").lower()
    return hostname == "saechsische.de" or hostname.endswith(".saechsische.de")


def saechsische_rss_feed_candidates(url: str) -> list[str]:
    parsed = urlparse(url)
    path_parts = [part for part in parsed.path.strip("/").split("/") if part]
    feed_base = "https://www.saechsische.de/arc/outboundfeeds/rss"
    candidates: list[str] = []

    if len(path_parts) >= 2:
        candidates.append(f"{feed_base}/category/{path_parts[0]}/{path_parts[1]}/")
    if path_parts:
        candidates.append(f"{feed_base}/category/{path_parts[0]}/")
    candidates.append(f"{feed_base}/")

    unique_candidates: list[str] = []
    for candidate in candidates:
        if candidate not in unique_candidates:
            unique_candidates.append(candidate)
    return unique_candidates


def _rss_item_text(item: ET.Element, tag_name: str) -> str:
    value = item.findtext(tag_name) or ""
    return _clean_article_text(value)


def _rss_item_date(item: ET.Element) -> str:
    raw_date = item.findtext("pubDate")
    if raw_date:
        try:
            return parsedate_to_datetime(raw_date).strftime("%d.%m.%Y")
        except (TypeError, ValueError):
            pass
    return _format_date(raw_date)


def _rss_item_image_url(item: ET.Element) -> str | None:
    namespaces = {"media": "http://search.yahoo.com/mrss/"}
    media = item.find("media:content", namespaces)
    if media is not None:
        image_url = (media.attrib.get("url") or "").strip()
        if image_url:
            return image_url
    enclosure = item.find("enclosure")
    if enclosure is not None:
        image_url = (enclosure.attrib.get("url") or "").strip()
        content_type = (enclosure.attrib.get("type") or "").lower()
        if image_url and (not content_type or content_type.startswith("image/")):
            return image_url
    return None


def fetch_saechsische_rss_article(url: str) -> RssArticleFallback | None:
    if not is_saechsische_url(url):
        return None

    normalized_url = normalize_url(url) or url
    parsed = urlparse(normalized_url)
    slug_token = Path(parsed.path).stem
    request_headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    }

    for feed_url in saechsische_rss_feed_candidates(normalized_url):
        try:
            request = Request(feed_url, headers=request_headers)
            with urlopen(request, timeout=20) as response:
                payload = response.read(1_500_000)
        except OSError:
            continue

        try:
            root = ET.fromstring(payload)
        except ET.ParseError:
            continue

        for item in root.findall("./channel/item"):
            item_link = (item.findtext("link") or item.findtext("guid") or "").strip()
            item_normalized = normalize_url(item_link) or item_link
            if item_normalized != normalized_url and (not slug_token or slug_token not in item_link):
                continue

            title = _rss_item_text(item, "title") or "Sächsische.de Artikel"
            description = _rss_item_text(item, "description")
            return RssArticleFallback(
                title=title,
                site_name="Sächsische.de",
                article_date=_rss_item_date(item),
                description=description,
                image_url=_rss_item_image_url(item),
            )
    return None


def render_saechsische_rss_fallback(
    image_path: Path,
    url: str,
    article: RssArticleFallback,
    accent_hex: str = "#303030",
) -> bool:
    blocks = [ArticleTextBlock(kind="headline", text=article.title)]
    if article.description:
        blocks.append(ArticleTextBlock(kind="lead", text=article.description))

    hero_image_path = None
    if article.image_url:
        hero_image_path = download_remote_image(
            article.image_url,
            url,
            image_path.with_name(f"{image_path.stem}_rss_hero.png"),
        )

    return render_article_text_fallback(
        image_path,
        article.title,
        article.site_name,
        article.article_date,
        url,
        blocks,
        hero_image_path,
        accent_hex,
    )


def build_saechsische_rss_article_result(
    url: str,
    image_path: Path,
    source_logo: Path | None,
    logo_warning: str | None,
    accent_hex: str = "#303030",
) -> ArticleResult | None:
    article = fetch_saechsische_rss_article(url)
    if not article:
        return None
    if not render_saechsische_rss_fallback(image_path, url, article, accent_hex):
        return None

    return ArticleResult(
        url=url,
        source_url=url,
        title=article.title,
        site_name=article.site_name,
        article_date=article.article_date,
        image_path=image_path,
        logo_path=source_logo,
        capture_note=(
            "Sächsische.de blockierte den Direktabruf: "
            "Metadaten aus dem offiziellen RSS-Feed wurden als Fallback eingefuegt."
        ),
        logo_warning=logo_warning,
    )

def has_paywall_marker(html_content: str, visible_text: str = "") -> bool:
    """Erkennt Paywall-/Login-Sperren, ohne Schutzmechanismen zu umgehen."""
    soup = BeautifulSoup(html_content, "html.parser")

    for script in soup.find_all("script", type="application/ld+json"):
        raw_json = script.string or script.get_text(strip=True)
        if not raw_json:
            continue
        try:
            data = json.loads(raw_json)
        except (json.JSONDecodeError, TypeError):
            continue
        for node in _iter_json_nodes(data):
            accessibility = node.get("isAccessibleForFree")
            if accessibility is False:
                return True
            if isinstance(accessibility, str) and accessibility.strip().lower() in {"false", "0", "no"}:
                return True
            if "paywall" in str(node.get("cssSelector") or "").lower():
                return True

    marker_text = " ".join(
        [
            soup.get_text(" ", strip=True)[:25_000],
            visible_text[:25_000],
            " ".join(
                " ".join(str(value) for value in tag.get("class", []))
                for tag in soup.find_all(class_=True, limit=200)
            ),
        ]
    ).lower()
    marker_text = re.sub(r"\s+", " ", marker_text)

    markers = (
        "paywall",
        "abo abschließen",
        "abo abschliessen",
        "abonnieren sie",
        "abonnieren, um weiterzulesen",
        "nur für abonnenten",
        "nur fuer abonnenten",
        "nur mit abo",
        "premium-artikel",
        "plus-artikel",
        "registrieren und weiterlesen",
        "einloggen und weiterlesen",
        "melden sie sich an, um weiterzulesen",
        "subscribe to continue",
        "subscription required",
        "sign in to continue",
        "log in to continue",
        "continue reading with",
        "already a subscriber",
        "paid content",
        "metered paywall",
        "ihr zugriff",
        "mit werbung lesen",
        "werbung lesen",
        "premium kaufen",
        "premium abschliessen",
        "premium abschlieÃŸen",
        "weiterlesen mit werbung",
        "adblocker deaktivieren",
    )
    return any(marker in marker_text for marker in markers)


def _clean_article_text(value: str) -> str:
    text = BeautifulSoup(value, "html.parser").get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _looks_like_non_article_text(text: str) -> bool:
    normalized = text.lower()
    blocked_markers = (
        "weitere news",
        "deine meinung",
        "abonniere den",
        "datencenter",
        "du hast einen fehler gefunden",
        "schreibe uns gerne",
        "newsletter",
        "empfehlungen",
        "sportwetten",
        "online-casino",
    )
    return any(marker in normalized for marker in blocked_markers)


def _append_article_block(blocks: list[ArticleTextBlock], kind: str, text: str) -> None:
    cleaned = _clean_article_text(text)
    if not cleaned or _looks_like_non_article_text(cleaned):
        return
    if any(existing.text == cleaned for existing in blocks):
        return
    blocks.append(ArticleTextBlock(kind=kind, text=cleaned))


def _extract_next_article_blocks(soup: BeautifulSoup) -> list[ArticleTextBlock]:
    next_data = soup.find("script", id="__NEXT_DATA__")
    if not next_data:
        return []

    try:
        payload = json.loads(next_data.get_text())
    except (json.JSONDecodeError, TypeError):
        return []

    blocks: list[ArticleTextBlock] = []
    for node in _iter_json_nodes(payload):
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type") or "").upper()
        if node_type in {"HEADLINE", "ABSTRACT"} and isinstance(node.get("text"), str):
            _append_article_block(blocks, "headline" if node_type == "HEADLINE" else "lead", node["text"])
        elif node_type == "TEXT" and isinstance(node.get("text"), str):
            raw_text = node["text"]
            kind = "subheading" if re.search(r"<h[1-6]\b", raw_text, flags=re.IGNORECASE) else "paragraph"
            _append_article_block(blocks, kind, raw_text)

    paragraph_count = sum(1 for block in blocks if block.kind == "paragraph")
    total_chars = sum(len(block.text) for block in blocks)
    return blocks if paragraph_count >= 2 and total_chars >= 450 else []


def _extract_balanced_json_object(script_text: str, marker: str) -> object | None:
    marker_index = script_text.find(marker)
    if marker_index < 0:
        return None
    start_index = script_text.find("{", marker_index)
    if start_index < 0:
        return None

    depth = 0
    in_string = False
    quote = ""
    escaped = False
    for index in range(start_index, len(script_text)):
        char = script_text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                in_string = False
            continue
        if char in {"'", '"'}:
            in_string = True
            quote = char
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                raw_json = script_text[start_index : index + 1]
                try:
                    return json.loads(raw_json)
                except (json.JSONDecodeError, TypeError):
                    return None
    return None


def _embedded_arc_article_payloads(soup: BeautifulSoup) -> list[dict]:
    payloads: list[dict] = []
    markers = (
        "Fusion.globalContent",
        "window.Fusion.globalContent",
        "globalContent",
    )
    for script in soup.find_all("script"):
        script_text = script.string or script.get_text()
        if not script_text or "content_elements" not in script_text:
            continue
        for marker in markers:
            payload = _extract_balanced_json_object(script_text, marker)
            if isinstance(payload, dict) and isinstance(payload.get("content_elements"), list):
                payloads.append(payload)
                break
    return payloads


def _arc_text_value(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("basic", "content", "text", "value"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                return candidate
    return ""


def _extract_arc_article_blocks(soup: BeautifulSoup, fallback_title: str) -> list[ArticleTextBlock]:
    blocks: list[ArticleTextBlock] = []
    for payload in _embedded_arc_article_payloads(soup):
        headline = _arc_text_value(payload.get("headlines")) or fallback_title
        if headline:
            _append_article_block(blocks, "headline", headline)

        lead = _arc_text_value(payload.get("subheadlines")) or _arc_text_value(payload.get("description"))
        if lead:
            _append_article_block(blocks, "lead", lead)

        for element in payload.get("content_elements", []):
            if not isinstance(element, dict):
                continue
            element_type = str(element.get("type") or "").lower()
            raw_text = _arc_text_value(element.get("content")) or _arc_text_value(element.get("text"))
            if not raw_text:
                continue
            if element_type in {"header", "subhead", "interstitial_link"}:
                _append_article_block(blocks, "subheading", raw_text)
            elif element_type in {"text", "raw_html", "quote", "list"}:
                _append_article_block(blocks, "paragraph", raw_text)

        paragraph_count = sum(1 for block in blocks if block.kind == "paragraph")
        total_chars = sum(len(block.text) for block in blocks)
        if paragraph_count >= 2 and total_chars >= 450:
            return blocks

    return []


def _extract_json_ld_article_blocks(soup: BeautifulSoup, fallback_title: str) -> list[ArticleTextBlock]:
    blocks: list[ArticleTextBlock] = []
    for node in _article_json_nodes(soup):
        headline = node.get("headline") or fallback_title
        if isinstance(headline, str):
            _append_article_block(blocks, "headline", headline)

        lead = node.get("description") or node.get("abstract")
        if isinstance(lead, str):
            _append_article_block(blocks, "lead", lead)

        body = node.get("articleBody")
        if isinstance(body, str):
            paragraphs = re.split(r"(?:\r?\n){2,}", body)
            if len(paragraphs) == 1:
                paragraphs = re.split(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ])", body)
            for paragraph in paragraphs:
                _append_article_block(blocks, "paragraph", paragraph)

        paragraph_count = sum(1 for block in blocks if block.kind == "paragraph")
        total_chars = sum(len(block.text) for block in blocks)
        if paragraph_count >= 1 and total_chars >= 350:
            return blocks

    return []


def extract_article_text_blocks(html_content: str, fallback_title: str) -> list[ArticleTextBlock]:
    """Extrahiert Artikeltext für Seiten, deren visueller Screenshot leer bleibt."""
    soup = BeautifulSoup(html_content, "html.parser")
    blocks = _extract_next_article_blocks(soup)
    if blocks:
        return blocks
    blocks = _extract_arc_article_blocks(soup, fallback_title)
    if blocks:
        return blocks
    blocks = _extract_json_ld_article_blocks(soup, fallback_title)
    if blocks:
        return blocks

    article_root = (
        soup.find("article")
        or soup.find("main")
        or soup.find(attrs={"itemprop": "articleBody"})
        or soup.body
    )
    if article_root is None:
        return []

    fallback_blocks: list[ArticleTextBlock] = []
    if fallback_title:
        _append_article_block(fallback_blocks, "headline", fallback_title)

    for node in article_root.find_all(["h1", "h2", "h3", "p"], limit=80):
        kind = "subheading" if node.name in {"h2", "h3"} else "paragraph"
        if node.name == "h1":
            kind = "headline"
        _append_article_block(fallback_blocks, kind, node.get_text(" ", strip=True))

    paragraph_count = sum(1 for block in fallback_blocks if block.kind == "paragraph")
    total_chars = sum(len(block.text) for block in fallback_blocks)
    return fallback_blocks if paragraph_count >= 2 and total_chars >= 450 else []


def _load_article_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_names = (
        "arialbd.ttf" if bold else "arial.ttf",
        "segoeuib.ttf" if bold else "segoeui.ttf",
        "calibrib.ttf" if bold else "calibri.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    )
    for font_name in font_names:
        try:
            return ImageFont.truetype(font_name, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _wrap_draw_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        if draw.textbbox((0, 0), word, font=font)[2] > max_width:
            if current:
                lines.append(current)
                current = ""
            part = ""
            for character in word:
                candidate_part = f"{part}{character}"
                if draw.textbbox((0, 0), candidate_part, font=font)[2] <= max_width:
                    part = candidate_part
                    continue
                if part:
                    lines.append(part)
                part = character
            if part:
                current = part
            continue

        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word

    if current:
        lines.append(current)
    return lines


def render_article_text_fallback(
    image_path: Path,
    title: str,
    site_name: str,
    article_date: str,
    url: str,
    blocks: list[ArticleTextBlock],
    hero_image_path: Path | None = None,
    accent_hex: str = "#303030",
) -> bool:
    if not blocks:
        return False

    width = 1440
    margin_x = 128
    max_text_width = width - 2 * margin_x
    top_padding = 96
    bottom_padding = 96
    fonts = {
        "source": _load_article_font(28, bold=True),
        "headline": _load_article_font(58, bold=True),
        "lead": _load_article_font(34, bold=False),
        "subheading": _load_article_font(38, bold=True),
        "paragraph": _load_article_font(31, bold=False),
        "meta": _load_article_font(24, bold=False),
    }

    measure = ImageDraw.Draw(Image.new("RGB", (width, 100), "white"))
    layout_lines: list[tuple[str, str, int]] = []
    hero_image: Image.Image | None = None
    if hero_image_path and hero_image_path.exists():
        try:
            with Image.open(hero_image_path) as source:
                hero_image = ImageOps.contain(source.convert("RGB"), (max_text_width, 520))
        except OSError:
            hero_image = None

    def add_text(kind: str, text: str, line_height: int) -> None:
        for line in _wrap_draw_text(measure, text, fonts[kind], max_text_width):
            layout_lines.append((kind, line, line_height))

    add_text("source", f"{site_name} · {article_date}", 38)
    layout_lines.append(("meta", url, 34))
    layout_lines.append(("meta", "", 24))

    has_headline = any(block.kind == "headline" for block in blocks)
    if not has_headline and title:
        add_text("headline", title, 68)
        layout_lines.append(("meta", "", 22))
    elif has_headline and title:
        first_headline = next((block.text for block in blocks if block.kind == "headline"), "")
        if first_headline and first_headline != title:
            add_text("headline", title, 68)
            layout_lines.append(("meta", "", 22))

    if hero_image:
        layout_lines.append(("hero", "", hero_image.height + 44))

    for block in blocks:
        if block.kind == "headline":
            add_text("headline", block.text, 68)
            layout_lines.append(("meta", "", 22))
        elif block.kind == "lead":
            add_text("lead", block.text, 44)
            layout_lines.append(("meta", "", 28))
        elif block.kind == "subheading":
            layout_lines.append(("meta", "", 20))
            add_text("subheading", block.text, 48)
            layout_lines.append(("meta", "", 10))
        else:
            add_text("paragraph", block.text, 43)
            layout_lines.append(("meta", "", 18))

    height = max(900, top_padding + bottom_padding + sum(line_height for _, _, line_height in layout_lines))
    image = Image.new("RGB", (width, height), "#FFFFFF")
    draw = ImageDraw.Draw(image)

    y = top_padding
    for kind, line, line_height in layout_lines:
        if kind == "hero" and hero_image:
            x = margin_x + max(0, (max_text_width - hero_image.width) // 2)
            image.paste(hero_image, (x, y))
            y += line_height
            continue
        if line:
            color = "#171717" if kind in {"headline", "source", "subheading"} else "#30343B"
            if kind == "meta":
                color = "#6B7280"
            draw.text((margin_x, y), line, font=fonts[kind], fill=color)
        y += line_height

    try:
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(image_path, format="PNG", optimize=True)
    except OSError:
        return False
    return is_usable_article_screenshot(image_path)


def render_paywall_fallback(
    image_path: Path,
    title: str,
    site_name: str,
    article_date: str,
    url: str,
    teaser: str,
    hero_image_path: Path | None = None,
    accent_hex: str = "#303030",
) -> bool:
    """Rendert eine transparente Paywall-Hinweisseite für das PDF."""
    width = 1440
    height = 1600
    margin_x = 128
    max_text_width = width - 2 * margin_x
    fonts = {
        "source": _load_article_font(28, bold=True),
        "badge": _load_article_font(26, bold=True),
        "headline": _load_article_font(58, bold=True),
        "lead": _load_article_font(34, bold=False),
        "paragraph": _load_article_font(31, bold=False),
        "meta": _load_article_font(24, bold=False),
    }
    image = Image.new("RGB", (width, height), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    hero_image: Image.Image | None = None
    if hero_image_path and hero_image_path.exists():
        try:
            with Image.open(hero_image_path) as source:
                hero_image = ImageOps.contain(source.convert("RGB"), (max_text_width, 420))
        except OSError:
            hero_image = None

    draw.text((margin_x, 112), "PAYWALL / GESCHÜTZTER ARTIKEL", font=fonts["badge"], fill="#343434")

    y = 210

    def draw_wrapped(kind: str, text: str, line_height: int, fill: str) -> None:
        nonlocal y
        for line in _wrap_draw_text(draw, text, fonts[kind], max_text_width):
            draw.text((margin_x, y), line, font=fonts[kind], fill=fill)
            y += line_height

    draw_wrapped("source", f"{site_name} · {article_date}", 38, "#171717")
    y += 14
    draw_wrapped("meta", url, 34, "#6B7280")
    y += 56
    draw_wrapped("headline", title or "Geschützter Artikel", 68, "#171717")
    y += 36

    if hero_image:
        x = margin_x + max(0, (max_text_width - hero_image.width) // 2)
        image.paste(hero_image, (x, y))
        y += hero_image.height + 46

    if teaser:
        draw_wrapped("lead", teaser, 44, "#30343B")
        y += 54

    note = (
        "Der Volltext dieses Artikels liegt hinter einer Paywall oder erfordert eine Anmeldung. "
        "Die App übernimmt deshalb nur die frei sichtbaren Metadaten und den Link. "
        "Mit einem berechtigten Zugang kann der Artikel außerhalb des Pressespiegels geöffnet werden."
    )
    draw_wrapped("paragraph", note, 43, "#30343B")
    y += 40
    draw_wrapped("meta", "Hinweis: Geschützte Inhalte werden nicht umgangen oder automatisiert entsperrt.", 34, "#6B7280")

    try:
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(image_path, format="PNG", optimize=True)
    except OSError:
        return False
    return is_usable_article_screenshot(image_path)


def render_link_error_fallback(
    image_path: Path,
    site_name: str,
    url: str,
    error_message: str,
    accent_hex: str = "#303030",
) -> bool:
    """Rendert eine Fehler-Hinweisseite, damit blockierte Links im PDF erhalten bleiben."""
    width = 1440
    height = 1200
    margin_x = 128
    max_text_width = width - 2 * margin_x
    fonts = {
        "source": _load_article_font(30, bold=True),
        "badge": _load_article_font(26, bold=True),
        "headline": _load_article_font(58, bold=True),
        "paragraph": _load_article_font(31, bold=False),
        "meta": _load_article_font(24, bold=False),
    }
    image = Image.new("RGB", (width, height), "#FFFFFF")
    draw = ImageDraw.Draw(image)
    y = 96

    def draw_wrapped(kind: str, text: str, line_height: int, fill: str) -> None:
        nonlocal y
        for line in _wrap_draw_text(draw, text, fonts[kind], max_text_width):
            draw.text((margin_x, y), line, font=fonts[kind], fill=fill)
            y += line_height

    draw.text((margin_x, y), "LINK KONNTE NICHT GELADEN WERDEN", font=fonts["badge"], fill="#343434")
    y += 104
    draw_wrapped("source", site_name, 40, "#171717")
    y += 28
    draw_wrapped("headline", "Quelle bleibt im Pressespiegel erhalten", 68, "#171717")
    y += 36
    draw_wrapped(
        "paragraph",
        f"Der Artikel konnte automatisiert nicht abgerufen werden: {error_message}. "
        "Der Link wurde nicht verworfen und kann manuell geprueft oder spaeter erneut verarbeitet werden.",
        43,
        "#30343B",
    )
    y += 40
    draw_wrapped("meta", url, 34, "#6B7280")

    try:
        image_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(image_path, format="PNG", optimize=True)
    except OSError:
        return False
    return is_usable_article_screenshot(image_path)


# =====================================================================
# PLAYWRIGHT: ARTIKEL LADEN UND SCREENSHOT ERSTELLEN
# =====================================================================


def _is_navigation_race_error(exc: BaseException) -> bool:
    """Erkennt Playwright-Fehler, die durch einen laufenden Seitenwechsel entstehen."""
    message = str(exc).lower()
    return any(
        marker in message
        for marker in (
            "execution context was destroyed",
            "cannot find context with specified id",
            "most likely because of a navigation",
            "frame was detached",
            "navigation interrupted",
        )
    )


async def wait_for_page_stability(
    page: Page,
    timeout_ms: int = 10_000,
    quiet_ms: int = 800,
) -> None:
    """Wartet kurz, bis Weiterleitungen und clientseitige Navigationen abgeklungen sind."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout_ms / 1000
    last_url = page.url
    stable_since = loop.time()

    while loop.time() < deadline:
        if page.is_closed():
            raise RuntimeError("Die Browserseite wurde unerwartet geschlossen")

        try:
            await page.wait_for_load_state("domcontentloaded", timeout=1_500)
        except PlaywrightError:
            # Während einer Weiterleitung ist der Zustand vorübergehend nicht erreichbar.
            pass

        await page.wait_for_timeout(200)
        current_url = page.url
        now = loop.time()

        if current_url != last_url:
            last_url = current_url
            stable_since = now
            continue

        if (now - stable_since) * 1000 >= quiet_ms:
            return


async def evaluate_page_safely(
    page: Page,
    expression: str,
    attempts: int = 4,
):
    """Führt JavaScript aus und wiederholt es bei einer gleichzeitigen Navigation."""
    last_error: PlaywrightError | None = None

    for attempt in range(attempts):
        try:
            return await page.evaluate(expression)
        except PlaywrightError as exc:
            last_error = exc
            if not _is_navigation_race_error(exc) or attempt == attempts - 1:
                raise
            await wait_for_page_stability(page, timeout_ms=8_000, quiet_ms=600)

    if last_error is not None:
        raise last_error
    return None


async def get_page_content_safely(page: Page, attempts: int = 4) -> str:
    """Liest den HTML-Inhalt auch bei einer kurzfristigen Weiterleitung zuverlässig aus."""
    last_error: PlaywrightError | None = None

    for attempt in range(attempts):
        try:
            return await page.content()
        except PlaywrightError as exc:
            last_error = exc
            if not _is_navigation_race_error(exc) or attempt == attempts - 1:
                raise
            await wait_for_page_stability(page, timeout_ms=8_000, quiet_ms=600)

    if last_error is not None:
        raise last_error
    raise RuntimeError("Der Seiteninhalt konnte nicht gelesen werden")


async def _click_cookie_buttons_in_frame(frame) -> bool:
    """Klickt typische Cookie-Buttons in Hauptdokument und iFrames."""
    patterns = [
        re.compile(
            r"^(alle akzeptieren|akzeptieren|zustimmen|einverstanden|okay|ok|fortfahren|weiter|"
            r"accept all|accept|agree|allow all|i agree|consent)$",
            re.IGNORECASE,
        ),
        re.compile(
            r"^(auswahl speichern|speichern|save|save settings|continue with selected)$",
            re.IGNORECASE,
        ),
    ]

    selectors = [
        'button',
        '[role="button"]',
        'input[type="button"]',
        'input[type="submit"]',
        'a[role="button"]',
    ]

    for pattern in patterns:
        try:
            locator = frame.get_by_role("button", name=pattern).first
            if await locator.count() and await locator.is_visible():
                await locator.click(timeout=2_500)
                return True
        except PlaywrightError:
            pass

        for selector in selectors:
            try:
                candidates = frame.locator(selector)
                count = min(await candidates.count(), 25)
            except PlaywrightError:
                continue

            for index in range(count):
                node = candidates.nth(index)
                try:
                    if not await node.is_visible():
                        continue
                    text = await node.inner_text(timeout=500)
                except PlaywrightError:
                    try:
                        text = await node.get_attribute('value') or ''
                    except PlaywrightError:
                        text = ''
                text = (text or '').strip()
                if text and pattern.search(text):
                    try:
                        await node.click(timeout=2_500)
                        return True
                    except PlaywrightError:
                        continue
    return False


async def try_accept_cookie_banner(page: Page) -> None:
    """Versucht Cookie-Banner auch in iFrames zu schließen."""
    for _ in range(3):
        clicked = False
        for frame in page.frames:
            try:
                if await _click_cookie_buttons_in_frame(frame):
                    clicked = True
                    await page.wait_for_timeout(500)
                    await wait_for_page_stability(page, timeout_ms=8_000, quiet_ms=600)
                    break
            except PlaywrightError as exc:
                if _is_navigation_race_error(exc):
                    await wait_for_page_stability(page, timeout_ms=8_000, quiet_ms=600)
                    clicked = True
                    break
        if not clicked:
            break


async def auto_scroll_page(page: Page) -> None:
    """Scrollt in kleinen, navigationssicheren Schritten für Lazy-Load-Inhalte."""
    previous_height = 0

    for _ in range(35):
        current_height_raw = await evaluate_page_safely(
            page,
            "() => Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0)",
        )
        current_height = int(current_height_raw or 0)

        await evaluate_page_safely(
            page,
            "() => { window.scrollBy(0, Math.max(500, window.innerHeight * 0.8)); return window.scrollY; }",
        )
        await page.wait_for_timeout(140)

        at_bottom = bool(
            await evaluate_page_safely(
                page,
                "() => window.scrollY + window.innerHeight >= "
                "Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0) - 20",
            )
        )

        if current_height == previous_height and at_bottom:
            break
        previous_height = current_height

    await evaluate_page_safely(page, "() => { window.scrollTo(0, 0); return true; }")
    await page.wait_for_timeout(250)


async def clean_visible_page(page: Page) -> None:
    """Entfernt Cookie-, Consent-, Newsletter- und Werbe-Overlays zuverlässig."""
    await evaluate_page_safely(
        page,
        """
        () => {
            const directSelectors = [
                '#onetrust-consent-sdk', '#onetrust-banner-sdk', '.onetrust-pc-dark-filter',
                '#usercentrics-root', '#usercentrics-cmp-ui', '[data-testid*="uc-"]',
                '#CybotCookiebotDialog', '#cookiebot',
                '#didomi-host', '.didomi-popup-container', '.didomi-consent-popup',
                '#sp_message_container', '[id*="sp_message"]', '[class*="sp_message"]',
                '[id*="message_container" i]', '[class*="message_container" i]',
                '[id*="sourcepoint" i]', '[class*="sourcepoint" i]',
                '#qc-cmp2-container', '.qc-cmp2-container',
                '#cmpbox', '.cmpbox', '.cmp-banner', '.cmp-overlay',
                '.cmp-root-container', '[class*="cmp-root" i]',
                '[id*="cookie"]', '[class*="cookie"]',
                '[id*="consent"]', '[class*="consent"]',
                '[id*="privacy"]', '[class*="privacy"]',
                '[aria-label*="Cookie"]', '[aria-label*="cookie"]',
                '[class*="newsletter"]', '[id*="newsletter"]',
                '[class*="subscribe"]', '[id*="subscribe"]',
                '[class*="ad-container"]', '[class*="advertisement"]',
                '[data-testid*="ad-"]', '[id^="google_ads"]',
                'dialog',
                '[role="dialog"]',
                '[aria-modal="true"]',
                '[class*="modal" i]', '[id*="modal" i]',
                '[class*="popup" i]', '[id*="popup" i]',
                '[class*="overlay" i]', '[id*="overlay" i]',
                '[class*="backdrop" i]', '[id*="backdrop" i]',
                '[class*="adblock" i]', '[id*="adblock" i]',
                '[class*="upscore-paywall" i]', '[id*="upscore-paywall" i]',
                '[class*="paywall-offer" i]', '[id*="paywall-offer" i]',
                'iframe[id*="paywall" i]', 'iframe[class*="paywall" i]',
                'video', 'audio',
                'iframe[src*="player" i]', 'iframe[src*="video" i]',
                'iframe[src*="youtube" i]', 'iframe[src*="vimeo" i]',
                '[class*="jwplayer" i]', '[class*="flowplayer" i]',
                '[class*="brightcove" i]', '[class*="player" i]',
                '[id*="player" i]', '[data-testid*="player" i]',
                '[class*="video" i]', '[id*="video" i]',
                '[data-testid*="video" i]', '[class*="embed" i]'
            ];

            const removeNode = (node) => {
                if (!node || !node.parentNode) return;
                if (node.matches && node.matches('html, body, main, article')) return;
                node.remove();
            };

            directSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(removeNode);
            });

            document.querySelectorAll('iframe').forEach(frame => {
                try {
                    const hint = [frame.id, frame.className, frame.name, frame.title, frame.src].join(' ').toLowerCase();
                    if (/(cookie|consent|privacy|didomi|usercentrics|onetrust|sourcepoint|sp_message|trustarc|quantcast|cmp|player|video|youtube|vimeo|brightcove|jwplayer)/.test(hint)) {
                        removeNode(frame);
                    }
                } catch (_) {}
            });

            const removePlayerErrorBlocks = (root) => {
                const errorPattern = /(playerconfiguration|konfigurationsfehler|configuration konnte nicht validiert|could not validate.*configuration)/i;
                Array.from(root.querySelectorAll('body *')).reverse().forEach(node => {
                    try {
                        const text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
                        if (!errorPattern.test(text)) return;
                        if (node.matches('html, body, main, article')) return;

                        const wrapper = node.closest(
                            'figure, iframe, section, aside, [class*="player" i], [id*="player" i], ' +
                            '[class*="video" i], [id*="video" i], [class*="embed" i], [class*="media" i]'
                        );
                        if (wrapper && !wrapper.matches('html, body, main, article')) {
                            removeNode(wrapper);
                        } else {
                            removeNode(node);
                        }
                    } catch (_) {}
                });
            };
            removePlayerErrorBlocks(document);

            const normalizeBlockerText = (text) => (text || '').toLowerCase().replace(/\\s+/g, ' ').trim();
            const looksLikeCaptureBlocker = (text) => {
                const compact = normalizeBlockerText(text);
                if (!compact) return false;
                return (
                    /(ihr zugriff|zugriff auf|mit werbung lesen|werbung lesen|premium kaufen|premium abschlie(?:ss|ÃŸ)en|weiterlesen mit werbung)/i.test(compact) ||
                    /(adblocker|werbeblocker|anzeige blockiert|werbung deaktiviert)/i.test(compact) ||
                    /(abo abschlie(?:ss|ÃŸ)en|abonnieren|nur f(?:u|Ã¼)r abonnenten|einloggen und weiterlesen|registrieren und weiterlesen)/i.test(compact) ||
                    /(subscribe|subscription|sign in to continue|log in to continue|continue reading)/i.test(compact)
                );
            };
            const removableBlockerWrapper = (node) => {
                const wrapper = node.closest(
                    'dialog, [role="dialog"], [aria-modal="true"], aside, section, div, ' +
                    '[class*="modal" i], [class*="popup" i], [class*="overlay" i], [class*="paywall" i], ' +
                    '[class*="premium" i], [class*="subscription" i], [class*="adblock" i]'
                );
                if (!wrapper || wrapper.matches('html, body, main, article')) return node;
                if (wrapper.querySelector('article, main') && !node.matches('[class*="paywall" i], [class*="premium" i]')) return node;
                return wrapper;
            };
            Array.from(document.querySelectorAll('body *')).reverse().forEach(node => {
                try {
                    if (node.matches('html, body, main, article')) return;
                    const text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
                    if (!looksLikeCaptureBlocker(text)) return;
                    const target = removableBlockerWrapper(node);
                    if (target && !target.matches('html, body, main, article')) {
                        removeNode(target);
                    } else {
                        node.style.setProperty('display', 'none', 'important');
                        node.style.setProperty('visibility', 'hidden', 'important');
                        node.style.setProperty('pointer-events', 'none', 'important');
                    }
                } catch (_) {}
            });

            const bodyTextLooksLikeCookie = (text) => {
                const compact = (text || '').toLowerCase().replace(/\\s+/g, ' ').trim();
                if (!compact) return false;
                return (
                    compact.includes('cookie') ||
                    compact.includes('datenschutz') ||
                    compact.includes('privatsphäre') ||
                    compact.includes('privacy') ||
                    compact.includes('consent') ||
                    compact.includes('tracking')
                );
            };

            document.querySelectorAll('body *').forEach(node => {
                try {
                    const style = window.getComputedStyle(node);
                    const rect = node.getBoundingClientRect();
                    const zIndex = Number.parseInt(style.zIndex || '0', 10);
                    const text = (node.innerText || '').trim();
                    const area = rect.width * rect.height;
                    const coversLargeArea = rect.width >= window.innerWidth * 0.35 && rect.height >= 90;
                    const fixedLike = style.position === 'fixed' || style.position === 'sticky' || style.position === 'absolute';
                    const containsMain = node.matches('article, main, section') || node.querySelector('article, main');
                    const isTopOrBottomBar = fixedLike && rect.width >= window.innerWidth * 0.7 && rect.height <= window.innerHeight * 0.45;
                    const isCenteredModal = fixedLike && rect.height >= 140 && rect.width >= window.innerWidth * 0.28 && rect.top >= 0 && rect.top <= window.innerHeight * 0.35;
                    const looksLikeCookieOverlay = bodyTextLooksLikeCookie(text) && coversLargeArea;
                    const looksLikeDimmer = fixedLike && area >= window.innerWidth * window.innerHeight * 0.45 && (style.backgroundColor.includes('rgba') || zIndex > 1000);

                    if (!containsMain && (
                        looksLikeCookieOverlay ||
                        isTopOrBottomBar ||
                        isCenteredModal ||
                        looksLikeDimmer ||
                        (zIndex > 9999 && text.length < 4000)
                    )) {
                        node.style.setProperty('display', 'none', 'important');
                        node.style.setProperty('visibility', 'hidden', 'important');
                        node.style.setProperty('pointer-events', 'none', 'important');
                    }
                } catch (_) {}
            });

            [document.documentElement, document.body].forEach(node => {
                if (!node) return;
                ['cmp-modal-open', 'modal-open', 'popup-open', 'overlay-open'].forEach(name => {
                    node.classList.remove(name);
                });
                node.style.setProperty('overflow', 'auto', 'important');
                node.style.setProperty('position', 'static', 'important');
                node.style.setProperty('height', 'auto', 'important');
            });
            return true;
        }
        """,
    )


async def settle_visible_page_for_capture(page: Page, passes: int = 3) -> None:
    """Raeumt Overlays in kurzen Paessen ab, auch wenn sie verzoegert nachrendern."""
    for _ in range(max(1, passes)):
        await clean_visible_page(page)
        await page.wait_for_timeout(300)


async def find_article_locator(page: Page) -> Locator:
    selectors = [
        "article",
        "main article",
        '[itemprop="articleBody"]',
        '[data-testid*="article"]',
        ".article-body",
        ".article-content",
        ".story-content",
        ".id-Story-content",
        ".story-wrapper",
        "main",
    ]

    best_locator: Locator | None = None
    best_score = 0.0

    for selector in selectors:
        candidates = page.locator(selector)
        try:
            count = min(await candidates.count(), 8)
        except PlaywrightError:
            continue

        for index in range(count):
            candidate = candidates.nth(index)
            try:
                if not await candidate.is_visible():
                    continue
                box = await candidate.bounding_box()
                if not box or box["height"] < 250 or box["width"] < 350:
                    continue
                text_length = len((await candidate.inner_text(timeout=2_000)).strip())
                if text_length < 250:
                    continue
                score = text_length + min(box["height"], 8_000) * 0.25
                if score > best_score:
                    best_score = score
                    best_locator = candidate
            except PlaywrightError:
                continue

    return best_locator or page.locator("body")


def _trim_logo_file(logo_path: Path) -> bool:
    """Entfernt transparente beziehungsweise fast weiße Ränder um ein Logo."""
    try:
        with Image.open(logo_path) as source:
            image = source.convert("RGBA")

            alpha = image.getchannel("A")
            alpha_box = alpha.getbbox()
            if alpha_box:
                image = image.crop(alpha_box)

            # Viele Webseiten liefern Logos mit einem weißen Hintergrund aus.
            rgb = image.convert("RGB")
            white_background = Image.new("RGB", rgb.size, "white")
            difference = ImageChops.difference(rgb, white_background).convert("L")
            difference = difference.point(lambda value: 0 if value < 12 else value)
            content_box = difference.getbbox()
            if content_box:
                image = image.crop(content_box)

            if image.width < 20 or image.height < 10:
                return False

            padding = max(4, int(min(image.width, image.height) * 0.04))
            padded = Image.new(
                "RGBA",
                (image.width + 2 * padding, image.height + 2 * padding),
                (255, 255, 255, 0),
            )
            padded.paste(image, (padding, padding), image)
            padded.save(logo_path, format="PNG", optimize=True)
        return True
    except (OSError, ValueError):
        return False


async def capture_site_logo(page: Page, logo_path: Path, site_name: str) -> Path | None:
    """Sucht im sichtbaren Seitenkopf nach einem kompakten Verlagslogo."""
    selectors = [
        'header [class*="logo" i]',
        'header [id*="logo" i]',
        'header img[alt*="logo" i]',
        'header svg[aria-label*="logo" i]',
        '[data-testid*="logo" i]',
        'a[class*="logo" i]',
        '[class*="brand" i] img',
        'header img',
        'header svg',
    ]

    site_tokens = {
        token.lower()
        for token in re.findall(r"[a-zA-Z0-9]{3,}", site_name)
        if token.lower() not in {"www", "aktuell", "online", "nachrichten"}
    }

    best_locator: Locator | None = None
    best_score = float("-inf")

    for selector in selectors:
        candidates = page.locator(selector)
        try:
            count = min(await candidates.count(), 10)
        except PlaywrightError:
            continue

        for index in range(count):
            candidate = candidates.nth(index)
            try:
                if not await candidate.is_visible():
                    continue
                box = await candidate.bounding_box()
                if not box:
                    continue

                width = box["width"]
                height = box["height"]
                if not (35 <= width <= 850 and 14 <= height <= 230):
                    continue
                if box["y"] > 360 or width / max(height, 1) > 16:
                    continue

                hint = await candidate.evaluate(
                    """
                    node => [
                        node.tagName,
                        node.id,
                        node.className && node.className.baseVal ? node.className.baseVal : node.className,
                        node.getAttribute('alt'),
                        node.getAttribute('aria-label'),
                        node.getAttribute('title'),
                        node.getAttribute('href')
                    ].filter(Boolean).join(' ')
                    """
                )
                hint = str(hint).lower()

                score = 0.0
                if "logo" in hint:
                    score += 5000
                if "brand" in hint:
                    score += 1200
                if any(token in hint for token in site_tokens):
                    score += 1500
                score += max(0, 500 - box["y"])
                score += min(width * height, 80000) / 80

                aspect_ratio = width / max(height, 1)
                if 1.2 <= aspect_ratio <= 8:
                    score += 350
                if width > 700 or height > 180:
                    score -= 600

                if score > best_score:
                    best_score = score
                    best_locator = candidate
            except PlaywrightError:
                continue

    if best_locator is None:
        return None

    try:
        await best_locator.screenshot(
            path=str(logo_path),
            animations="disabled",
            omit_background=True,
            timeout=15_000,
        )
        if not logo_path.exists() or logo_path.stat().st_size < 300:
            return None
        if not _trim_logo_file(logo_path):
            logo_path.unlink(missing_ok=True)
            return None
        return logo_path
    except (PlaywrightError, OSError):
        logo_path.unlink(missing_ok=True)
        return None


async def clean_article_locator(locator: Locator) -> None:
    await locator.evaluate(
        """
        root => {
            const selectors = [
                'header', 'footer', 'nav', 'aside',
                '.sidebar', '.breadcrumb', '[class*="breadcrumb"]',
                '[class*="share"]', '[id*="share"]',
                '[class*="social"]', '[id*="social"]',
                '[class*="related"]', '[id*="related"]',
                '[class*="recommend"]', '[id*="recommend"]',
                '[class*="comment"]', '[id*="comment"]',
                '[class*="advert"]', '[id*="advert"]',
                '[class*="newsletter"]', '[id*="newsletter"]',
                'video', 'audio',
                'iframe[src*="player" i]', 'iframe[src*="video" i]',
                'iframe[src*="youtube" i]', 'iframe[src*="vimeo" i]',
                '[class*="jwplayer" i]', '[class*="flowplayer" i]',
                '[class*="brightcove" i]', '[class*="player" i]',
                '[id*="player" i]', '[data-testid*="player" i]',
                '[class*="video" i]', '[id*="video" i]',
                '[data-testid*="video" i]', '[class*="embed" i]'
            ];
            for (const selector of selectors) {
                root.querySelectorAll(selector).forEach(node => node.remove());
            }

            const errorPattern = /(playerconfiguration|konfigurationsfehler|configuration konnte nicht validiert|could not validate.*configuration)/i;
            Array.from(root.querySelectorAll('*')).reverse().forEach(node => {
                try {
                    const text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
                    if (!errorPattern.test(text)) return;
                    if (node === root || node.matches('main, article')) return;

                    const wrapper = node.closest(
                        'figure, iframe, section, aside, [class*="player" i], [id*="player" i], ' +
                        '[class*="video" i], [id*="video" i], [class*="embed" i], [class*="media" i]'
                    );
                    if (wrapper && wrapper !== root && !wrapper.matches('main, article')) {
                        wrapper.remove();
                    } else {
                        node.remove();
                    }
                } catch (_) {}
            });

            const normalizeBlockerText = (text) => (text || '').toLowerCase().replace(/\\s+/g, ' ').trim();
            const looksLikeCaptureBlocker = (text) => {
                const compact = normalizeBlockerText(text);
                if (!compact) return false;
                return (
                    /(ihr zugriff|zugriff auf|mit werbung lesen|werbung lesen|premium kaufen|weiterlesen mit werbung)/i.test(compact) ||
                    /(adblocker|werbeblocker|anzeige blockiert|werbung deaktiviert)/i.test(compact) ||
                    /(abo abschliessen|abo abschlie.en|abonnieren|nur fuer abonnenten|nur f.r abonnenten|einloggen und weiterlesen|registrieren und weiterlesen)/i.test(compact) ||
                    /(subscribe|subscription|sign in to continue|log in to continue|continue reading)/i.test(compact)
                );
            };
            const removableBlockerWrapper = (node) => {
                const wrapper = node.closest(
                    'dialog, [role="dialog"], [aria-modal="true"], aside, section, div, figure, ' +
                    '[class*="modal" i], [class*="popup" i], [class*="overlay" i], [class*="paywall" i], ' +
                    '[class*="premium" i], [class*="subscription" i], [class*="adblock" i], [id*="message" i]'
                );
                if (!wrapper || wrapper === root || wrapper.matches('html, body, main, article')) return node;
                return wrapper;
            };
            Array.from(root.querySelectorAll('*')).reverse().forEach(node => {
                try {
                    if (node === root || node.matches('main, article')) return;
                    const text = (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
                    if (!looksLikeCaptureBlocker(text)) return;
                    const target = removableBlockerWrapper(node);
                    if (target && target !== root && !target.matches('main, article')) {
                        target.remove();
                    } else {
                        node.style.setProperty('display', 'none', 'important');
                        node.style.setProperty('visibility', 'hidden', 'important');
                        node.style.setProperty('pointer-events', 'none', 'important');
                    }
                } catch (_) {}
            });
            root.style.setProperty('background', '#ffffff', 'important');
        }
        """
    )


def is_usable_article_screenshot(image_path: Path) -> bool:
    """Erkennt leere oder nahezu leere Screenshots, bevor sie ins PDF kommen."""
    if not image_path.exists() or image_path.stat().st_size < 5_000:
        return False

    try:
        with Image.open(image_path) as source:
            image = source.convert("RGB")
            if image.width < 350 or image.height < 250:
                return False

            sample = image.copy()
            sample.thumbnail((360, 360))
            pixels = list(sample.getdata())
    except (OSError, ValueError):
        return False

    if not pixels:
        return False

    non_light_pixels = 0
    dark_pixels = 0
    luminance_values: list[float] = []
    for red, green, blue in pixels:
        luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
        luminance_values.append(luminance)
        if red < 245 or green < 245 or blue < 245:
            non_light_pixels += 1
        if luminance < 215:
            dark_pixels += 1

    pixel_count = len(pixels)
    non_light_ratio = non_light_pixels / pixel_count
    dark_ratio = dark_pixels / pixel_count
    average_luminance = sum(luminance_values) / pixel_count
    variance = sum((value - average_luminance) ** 2 for value in luminance_values) / pixel_count
    luminance_stddev = variance ** 0.5

    if non_light_ratio < 0.003 and luminance_stddev < 3:
        return False
    if dark_ratio < 0.001 and non_light_ratio < 0.01 and average_luminance > 248:
        return False

    return True


async def capture_article(
    context,
    url: str,
    image_path: Path,
    source_logo_index: dict[str, Path],
    cancel_event: threading.Event,
    accent_hex: str = "#303030",
) -> ArticleResult:
    if cancel_event.is_set():
        raise UserCancelled

    page = await context.new_page()
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        if response and response.status >= 400:
            site_name = urlparse(url).netloc.removeprefix("www.") or "Unbekannte Quelle"
            source_logo = find_source_logo(source_logo_index, url, site_name)
            error_message = f"HTTP-Fehler {response.status}"
            logo_warning = None
            if source_logo is None:
                logo_warning = (
                    f"Logo fehlt fuer {site_name}. "
                    "Bitte fuege eine passende PNG- oder SVG-Datei in den Logo-Ordner ein."
                )
            rss_result = build_saechsische_rss_article_result(url, image_path, source_logo, logo_warning, accent_hex)
            if rss_result:
                return rss_result
            if render_link_error_fallback(image_path, site_name, url, error_message, accent_hex):
                return ArticleResult(
                    url=url,
                    title=site_name,
                    site_name=site_name,
                    image_path=image_path,
                    logo_path=source_logo,
                    capture_note=f"{error_message}: Hinweis-Seite wurde eingefuegt.",
                    logo_warning=logo_warning,
                )
            raise RuntimeError(error_message)

        # Manche Nachrichtenseiten laden nach DOMContentLoaded noch eine neue
        # Dokumentversion oder leiten clientseitig weiter. Erst danach darf
        # page.evaluate() verwendet werden.
        await wait_for_page_stability(page, timeout_ms=12_000, quiet_ms=900)
        await try_accept_cookie_banner(page)
        await wait_for_page_stability(page, timeout_ms=8_000, quiet_ms=650)
        await settle_visible_page_for_capture(page, passes=2)
        await auto_scroll_page(page)
        await settle_visible_page_for_capture(page, passes=2)

        html_content = await get_page_content_safely(page)
        loaded_url = page.url or url
        article_source_url = resolve_article_source_url(html_content, loaded_url, url)
        visible_text_raw = await evaluate_page_safely(
            page,
            "() => document.body ? document.body.innerText : ''",
        )
        visible_text = str(visible_text_raw or "")
        title, site_name, article_date = extract_article_metadata(html_content, article_source_url)
        article_text_blocks = extract_article_text_blocks(html_content, title)
        is_paywalled = has_paywall_marker(html_content, visible_text)
        source_logo = find_source_logo(source_logo_index, article_source_url, site_name)
        logo_warning = None
        if source_logo is None:
            logo_warning = (
                f"Logo fehlt fuer {site_name} ({urlparse(article_source_url).netloc.removeprefix('www.')}). "
                "Bitte lege eine passende PNG- oder SVG-Datei im Logo-Ordner ab."
            )
        hero_image_path = download_article_hero_image(
            html_content,
            article_source_url,
            image_path.with_name(f"{image_path.stem}_hero.png"),
        )

        if is_saechsische_url(article_source_url) and article_text_blocks:
            if render_article_text_fallback(
                image_path,
                title,
                site_name,
                article_date,
                article_source_url,
                article_text_blocks,
                hero_image_path,
                accent_hex,
            ):
                return ArticleResult(
                    url=url,
                    source_url=article_source_url,
                    title=title,
                    site_name=site_name,
                    article_date=article_date,
                    image_path=image_path,
                    logo_path=source_logo,
                    logo_warning=logo_warning,
                    capture_note="Sächsische.de: strukturierter Artikeltext wurde für die PDF-Darstellung verwendet.",
                )

        if is_paywalled and article_text_blocks:
            if render_article_text_fallback(
                image_path,
                title,
                site_name,
                article_date,
                article_source_url,
                article_text_blocks,
                hero_image_path,
                accent_hex,
            ):
                return ArticleResult(
                    url=url,
                    source_url=article_source_url,
                    title=title,
                    site_name=site_name,
                    article_date=article_date,
                    image_path=image_path,
                    logo_path=source_logo,
                    capture_note="Paywall erkannt: frei strukturierter Artikeltext wurde als Text-Fallback eingefügt.",
                )

        if is_paywalled:
            teaser = extract_article_teaser(html_content)
            if render_paywall_fallback(
                image_path,
                title,
                site_name,
                article_date,
                article_source_url,
                teaser,
                hero_image_path,
                accent_hex,
            ):
                return ArticleResult(
                    url=url,
                    source_url=article_source_url,
                    title=title,
                    site_name=site_name,
                    article_date=article_date,
                    image_path=image_path,
                    logo_path=source_logo,
                    capture_note="Paywall erkannt: Im PDF wurde eine Hinweisseite mit frei sichtbaren Metadaten eingefügt.",
                )

        await try_accept_cookie_banner(page)
        await settle_visible_page_for_capture(page, passes=3)

        target = await find_article_locator(page)
        try:
            await clean_article_locator(target)
            await settle_visible_page_for_capture(page, passes=2)
        except PlaywrightError as exc:
            if not _is_navigation_race_error(exc):
                raise
            await wait_for_page_stability(page, timeout_ms=8_000, quiet_ms=650)
            target = await find_article_locator(page)
            await clean_article_locator(target)
            await settle_visible_page_for_capture(page, passes=2)

        if cancel_event.is_set():
            raise UserCancelled

        await settle_visible_page_for_capture(page, passes=3)
        await clean_article_locator(target)

        try:
            await target.screenshot(
                path=str(image_path),
                animations="disabled",
                timeout=60_000,
            )
        except PlaywrightError as exc:
            # Bei einer späten Weiterleitung zunächst stabilisieren und den
            # Artikel neu suchen. Erst danach folgt der Ganzseiten-Fallback.
            if _is_navigation_race_error(exc):
                await wait_for_page_stability(page, timeout_ms=8_000, quiet_ms=650)
                target = await find_article_locator(page)
                try:
                    await clean_article_locator(target)
                    await settle_visible_page_for_capture(page, passes=2)
                    await target.screenshot(
                        path=str(image_path),
                        animations="disabled",
                        timeout=60_000,
                    )
                except PlaywrightError:
                    await page.screenshot(
                        path=str(image_path),
                        full_page=True,
                        animations="disabled",
                        timeout=60_000,
                    )
            else:
                await page.screenshot(
                    path=str(image_path),
                    full_page=True,
                    animations="disabled",
                    timeout=60_000,
                )

        if not is_usable_article_screenshot(image_path):
            rss_result = build_saechsische_rss_article_result(url, image_path, source_logo, logo_warning, accent_hex)
            if rss_result:
                return rss_result

            if render_article_text_fallback(
                image_path,
                title,
                site_name,
                article_date,
                article_source_url,
                article_text_blocks,
                hero_image_path,
                accent_hex,
            ):
                return ArticleResult(
                    url=url,
                    source_url=article_source_url,
                    title=title,
                    site_name=site_name,
                    article_date=article_date,
                    image_path=image_path,
                    logo_path=source_logo,
                    capture_note=(
                        "Paywall erkannt: frei strukturierter Artikeltext wurde als Text-Fallback eingefügt."
                        if is_paywalled
                        else "Leerer Screenshot: Artikeltext wurde als Text-Fallback eingefügt."
                    ),
                )

            if is_paywalled:
                teaser = extract_article_teaser(html_content)
                if render_paywall_fallback(
                    image_path,
                    title,
                    site_name,
                    article_date,
                    article_source_url,
                    teaser,
                    hero_image_path,
                    accent_hex,
                ):
                    return ArticleResult(
                        url=url,
                        source_url=article_source_url,
                        title=title,
                        site_name=site_name,
                        article_date=article_date,
                        image_path=image_path,
                        logo_path=source_logo,
                        capture_note="Paywall erkannt: Im PDF wurde eine Hinweisseite mit frei sichtbaren Metadaten eingefügt.",
                    )

            image_path.unlink(missing_ok=True)
            raise RuntimeError(
                "Der Artikel-Screenshot ist leer und es konnte kein ausreichender Artikeltext extrahiert werden. "
                "Bitte prüfe die URL oder erfasse den Artikel manuell."
            )

        if hero_image_path and article_text_blocks:
            if render_article_text_fallback(
                image_path,
                title,
                site_name,
                article_date,
                article_source_url,
                article_text_blocks,
                hero_image_path,
                accent_hex,
            ):
                return ArticleResult(
                    url=url,
                    source_url=article_source_url,
                    title=title,
                    site_name=site_name,
                    article_date=article_date,
                    image_path=image_path,
                    logo_path=source_logo,
                    capture_note="Strukturierte Artikeldaten mit Titelbild wurden für die PDF-Darstellung verwendet.",
                )

        return ArticleResult(
            url=url,
            source_url=article_source_url,
            title=title,
            site_name=site_name,
            article_date=article_date,
            image_path=image_path,
            logo_path=source_logo,
        )
    finally:
        if not page.is_closed():
            await page.close()


# =====================================================================
# PDF-ERSTELLUNG
# =====================================================================


def pdf_safe_text(value: str) -> str:
    """Ersetzt Zeichen, die von den eingebauten ReportLab-Schriften nicht unterstützt werden."""
    return value.encode("cp1252", errors="replace").decode("cp1252")


def normalize_hex_color(value: str, fallback: str = "#FFFFFF") -> str:
    """Normalisiert einfache Hex-Farben für PDF-Hintergründe und Akzente."""
    candidate = value.strip()
    if not candidate:
        return fallback
    if not candidate.startswith("#"):
        candidate = f"#{candidate}"
    if re.fullmatch(r"#[0-9A-Fa-f]{6}", candidate):
        return candidate.upper()
    raise ValueError(f"Ungültige Hex-Farbe: {value}")


def get_pdf_font_family(font_family: str) -> PdfFontFamily:
    return PDF_FONT_FAMILIES.get(font_family, PDF_FONT_FAMILIES["Helvetica"])


def validate_background_image(image_path: Path) -> tuple[int, int, str]:
    if not image_path.exists() or not image_path.is_file():
        raise ValueError("Die Bilddatei wurde nicht gefunden.")

    try:
        with Image.open(image_path) as image:
            image.verify()
        with Image.open(image_path) as image:
            width, height = image.size
            image_format = (image.format or "").upper()
    except OSError as exc:
        raise ValueError(f"Das Hintergrundbild konnte nicht gelesen werden: {exc}") from exc

    if image_format not in SUPPORTED_BACKGROUND_FORMATS:
        raise ValueError("Bitte nutze ein Hintergrundbild im PNG- oder JPG-Format.")

    if width < MIN_BACKGROUND_WIDTH or height < MIN_BACKGROUND_HEIGHT:
        raise ValueError(
            "Das Hintergrundbild ist zu klein. Erforderlich sind mindestens "
            f"{MIN_BACKGROUND_WIDTH}x{MIN_BACKGROUND_HEIGHT} px."
        )

    aspect_ratio = width / max(height, 1)
    min_ratio, max_ratio = BACKGROUND_ASPECT_RATIO_RANGE
    if not min_ratio <= aspect_ratio <= max_ratio:
        raise ValueError("Das Hintergrundbild muss ungefähr dem A4-Hochformat entsprechen.")

    return width, height, image_format


def validate_cover_image(image_path: Path) -> tuple[int, int, str]:
    try:
        return validate_background_image(image_path)
    except ValueError as exc:
        message = str(exc)
        message = message.replace("Hintergrundbild", "Titelseitenbild")
        message = message.replace("Hintergrundbildes", "Titelseitenbildes")
        raise ValueError(message) from exc


def validate_main_logo(logo_path: Path) -> tuple[int, int, str]:
    if not logo_path.exists() or not logo_path.is_file():
        raise ValueError("Die Logodatei wurde nicht gefunden.")

    try:
        with Image.open(logo_path) as image:
            width, height = image.size
            image_format = (image.format or "").upper()
    except OSError as exc:
        raise ValueError(f"Das Hauptlogo konnte nicht gelesen werden: {exc}") from exc

    if image_format not in SUPPORTED_LOGO_FORMATS:
        raise ValueError("Bitte nutze ein Hauptlogo im PNG-, JPG- oder ICO-Format.")
    if width < 128 or height < 128:
        raise ValueError("Das Hauptlogo ist zu klein. Erforderlich sind mindestens 128x128 px.")
    return width, height, image_format


def register_custom_pdf_font(font_path: Path, label: str | None = None) -> PdfFontFamily:
    if not font_path.exists() or not font_path.is_file():
        raise ValueError("Die Schriftdatei wurde nicht gefunden.")
    if font_path.suffix.lower() not in SUPPORTED_FONT_SUFFIXES:
        raise ValueError("Bitte nutze eine Schriftdatei im TTF- oder OTF-Format.")

    display_label = re.sub(r"\s+", " ", (label or font_path.stem)).strip() or font_path.stem
    safe_stem = re.sub(r"[^A-Za-z0-9_]+", "_", display_label).strip("_") or "CustomFont"
    digest = hashlib.sha1(str(font_path.resolve()).encode("utf-8")).hexdigest()[:8]
    registered_name = f"Custom_{safe_stem}_{digest}"

    try:
        pdfmetrics.registerFont(TTFont(registered_name, str(font_path)))
    except Exception as exc:
        raise ValueError(f"Die Schriftart konnte nicht geladen werden: {exc}") from exc

    return PdfFontFamily(display_label, registered_name, registered_name, str(font_path.resolve()))


def layout_to_dict(layout: PdfLayout) -> dict[str, object]:
    return {
        "layout_id": layout.layout_id,
        "name": layout.name,
        "font_family": layout.font_family,
        "background_hex": layout.background_hex,
        "background_kind": layout.background_kind,
        "background_image_path": layout.background_image_path,
        "cover_style": layout.cover_style,
        "cover_image_path": layout.cover_image_path,
        "main_logo_path": layout.main_logo_path,
        "accent_hex": layout.accent_hex,
        "title_text": layout.title_text,
    }


def layout_from_dict(raw_layout: dict[str, object]) -> PdfLayout | None:
    try:
        name = str(raw_layout["name"]).strip()
        layout_id = str(raw_layout.get("layout_id") or name).strip()
        font_family = str(raw_layout.get("font_family") or "Helvetica").strip()
        background_hex = normalize_hex_color(str(raw_layout.get("background_hex") or "#FFFFFF"))
        background_kind = str(raw_layout.get("background_kind") or "color").strip()
        background_image_path = raw_layout.get("background_image_path")
        cover_style = str(raw_layout.get("cover_style") or "classic").strip()
        cover_image_path = raw_layout.get("cover_image_path")
        main_logo_path = raw_layout.get("main_logo_path")
        accent_hex = normalize_hex_color(str(raw_layout.get("accent_hex") or "#303030"), "#303030")
        title_text = str(raw_layout.get("title_text") or "PRESSESPIEGEL").strip()
    except (KeyError, TypeError, ValueError):
        return None

    if not name or background_kind not in {"color", "image"}:
        return None
    if background_kind == "image" and background_image_path:
        try:
            validate_background_image(Path(str(background_image_path)))
        except ValueError:
            background_kind = "color"
            background_image_path = None
    if cover_style == "image":
        if cover_image_path:
            try:
                validate_cover_image(Path(str(cover_image_path)))
            except ValueError:
                cover_style = "classic"
                cover_image_path = None
        else:
            cover_style = "classic"

    return PdfLayout(
        layout_id=layout_id,
        name=name,
        font_family=font_family,
        background_hex=background_hex,
        background_kind=background_kind,
        background_image_path=str(background_image_path) if background_image_path else None,
        cover_style=cover_style,
        cover_image_path=str(cover_image_path) if cover_image_path else None,
        main_logo_path=str(main_logo_path) if main_logo_path else None,
        accent_hex=accent_hex,
        title_text=title_text,
        is_custom=True,
    )


def load_custom_layout_config() -> tuple[dict[str, PdfFontFamily], list[PdfLayout]]:
    if not CUSTOM_LAYOUTS_PATH.exists():
        return {}, []

    try:
        raw_config = json.loads(CUSTOM_LAYOUTS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}, []

    custom_fonts: dict[str, PdfFontFamily] = {}
    for raw_font in raw_config.get("fonts", []):
        if not isinstance(raw_font, dict):
            continue
        path_value = raw_font.get("path")
        if not path_value:
            continue
        try:
            font = register_custom_pdf_font(Path(str(path_value)), str(raw_font.get("label") or ""))
        except ValueError:
            continue
        custom_fonts[font.label] = font

    custom_layouts: list[PdfLayout] = []
    built_in_layout_names = {layout.name for layout in PDF_LAYOUTS}
    for raw_layout in raw_config.get("layouts", []):
        if not isinstance(raw_layout, dict):
            continue
        layout = layout_from_dict(raw_layout)
        if layout is not None and layout.layout_id not in PDF_LAYOUT_BY_ID and layout.name not in built_in_layout_names:
            custom_layouts.append(layout)

    return custom_fonts, custom_layouts


def save_custom_layout_config(custom_fonts: dict[str, PdfFontFamily], custom_layouts: list[PdfLayout]) -> None:
    CUSTOM_LAYOUTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    CUSTOM_LAYOUTS_PATH.write_text(
        json.dumps(
            {
                "fonts": [
                    {"label": font.label, "path": font.source_path}
                    for font in custom_fonts.values()
                    if font.source_path
                ],
                "layouts": [layout_to_dict(layout) for layout in custom_layouts],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def draw_background_image(pdf: canvas.Canvas, image_path: Path) -> None:
    page_w, page_h = A4
    page_ratio = page_w / page_h

    with Image.open(image_path) as source:
        image = source.convert("RGB")
        image_ratio = image.width / max(image.height, 1)
        if image_ratio > page_ratio:
            target_width = int(image.height * page_ratio)
            left = (image.width - target_width) // 2
            image = image.crop((left, 0, left + target_width, image.height))
        else:
            target_height = int(image.width / page_ratio)
            top = (image.height - target_height) // 2
            image = image.crop((0, top, image.width, top + target_height))

        image_buffer = io.BytesIO()
        image.save(image_buffer, format="JPEG", quality=92, optimize=True)
        image_buffer.seek(0)

    pdf.drawImage(ImageReader(image_buffer), 0, 0, width=page_w, height=page_h, mask="auto")


def draw_cover_image(pdf: canvas.Canvas, image_path: Path) -> bool:
    if not image_path.exists():
        return False
    try:
        draw_background_image(pdf, image_path)
        return True
    except (OSError, ValueError):
        return False


def apply_pdf_background(pdf: canvas.Canvas, layout: PdfLayout) -> None:
    page_w, page_h = A4
    pdf.setFillColor(white)
    pdf.rect(0, 0, page_w, page_h, fill=True, stroke=False)


def draw_main_logo(
    pdf: canvas.Canvas,
    layout: PdfLayout,
    center_x: float,
    center_y: float,
    max_width: float,
    max_height: float,
) -> bool:
    if not layout.main_logo_path:
        return False

    logo_path = Path(layout.main_logo_path).expanduser()
    if not logo_path.is_absolute():
        logo_path = get_resource_path(layout.main_logo_path)
    if not logo_path.exists():
        return False

    try:
        with Image.open(logo_path) as logo_image:
            logo_width, logo_height = logo_image.size
        scale = min(max_width / max(logo_width, 1), max_height / max(logo_height, 1))
        final_width = logo_width * scale
        final_height = logo_height * scale
        pdf.drawImage(
            ImageReader(str(logo_path)),
            center_x - final_width / 2,
            center_y - final_height / 2,
            width=final_width,
            height=final_height,
            preserveAspectRatio=True,
            mask="auto",
        )
        return True
    except (OSError, ValueError):
        return False


def draw_wrapped_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str,
    font_size: float,
    line_height: float,
    max_lines: int | None = None,
) -> float:
    text = pdf_safe_text(text)
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        test_line = f"{current} {word}".strip()
        if stringWidth(test_line, font_name, font_size) <= max_width:
            current = test_line
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    if max_lines is not None and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and stringWidth(f"{last} …", font_name, font_size) > max_width:
            last = last[:-1]
        lines[-1] = f"{last.rstrip()} …"

    pdf.setFont(font_name, font_size)
    for line in lines:
        pdf.drawString(x, y, line)
        y -= line_height
    return y


def _wrap_pdf_lines(
    text: str,
    font_name: str,
    font_size: float,
    max_width: float,
    max_lines: int,
) -> list[str]:
    def fit_line(line: str) -> str:
        if stringWidth(line, font_name, font_size) <= max_width:
            return line
        trimmed = line
        while trimmed and stringWidth(f"{trimmed}...", font_name, font_size) > max_width:
            trimmed = trimmed[:-1]
        return f"{trimmed.rstrip()}..." if trimmed else "..."

    words = pdf_safe_text(re.sub(r"\s+", " ", text).strip()).split()
    if not words:
        return []

    lines: list[str] = []
    current = ""
    for word in words:
        test_line = f"{current} {word}".strip()
        if stringWidth(test_line, font_name, font_size) <= max_width:
            current = test_line
            continue

        if current:
            lines.append(current)
        current = word

    if current:
        lines.append(current)

    if len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and stringWidth(f"{last} ...", font_name, font_size) > max_width:
            last = last[:-1]
        lines[-1] = f"{last.rstrip()} ..."

    return [fit_line(line) for line in lines]


def _draw_centered_letter_spaced_text(
    pdf: canvas.Canvas,
    text: str,
    y: float,
    font_name: str,
    font_size: float,
    character_spacing: float,
) -> None:
    """Zeichnet eine mittig gesetzte Zeile mit kontrolliertem Zeichenabstand."""
    page_w, _ = A4
    safe_text = pdf_safe_text(text)
    text_width = stringWidth(safe_text, font_name, font_size)
    if len(safe_text) > 1:
        text_width += character_spacing * (len(safe_text) - 1)

    text_object = pdf.beginText((page_w - text_width) / 2, y)
    text_object.setFont(font_name, font_size)
    text_object.setCharSpace(character_spacing)
    text_object.textOut(safe_text)
    pdf.drawText(text_object)


def format_date_long_de(value: str) -> str:
    """Formatiert 10.04.2026 als 10. April 2026."""
    months = {
        1: "Januar",
        2: "Februar",
        3: "März",
        4: "April",
        5: "Mai",
        6: "Juni",
        7: "Juli",
        8: "August",
        9: "September",
        10: "Oktober",
        11: "November",
        12: "Dezember",
    }

    normalized = value.strip()
    for date_format in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            parsed = datetime.strptime(normalized[:10], date_format)
            return f"{parsed.day}. {months[parsed.month]} {parsed.year}"
        except ValueError:
            continue
    return normalized or "Unbekanntes Datum"


def article_domain(article: ArticleResult) -> str:
    domain = source_host_from_url(article.source_url or article.url)
    return domain or article.site_name


def normalize_logo_key(value: str) -> str:
    normalized = value.lower()
    replacements = {
        "ä": "ae",
        "ö": "oe",
        "ü": "ue",
        "ß": "ss",
    }
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)
    normalized = normalized.removeprefix("www.")
    normalized = re.sub(r"\.(de|com|net|org|info|eu|io)$", "", normalized)
    tokens = [
        token
        for token in re.findall(r"[a-z0-9]+", normalized)
        if token and token not in LOGO_STOP_WORDS
    ]
    return "".join(tokens)


def logo_match_keys(url: str, site_name: str) -> set[str]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    host_parts = [part for part in host.split(".") if part and part not in {"de", "com", "net", "org", "eu"}]
    candidates = {host, ".".join(host_parts), "".join(host_parts), site_name}
    candidates.update(host_parts)
    return {key for candidate in candidates if (key := normalize_logo_key(candidate))}


def is_valid_svg_logo(logo_path: Path) -> bool:
    try:
        root = ET.parse(logo_path).getroot()
    except (ET.ParseError, OSError, ValueError):
        return False
    return root.tag.lower().endswith("svg")


def _rasterize_svg_logo_with_playwright(logo_path: Path, target_path: Path) -> None:
    from playwright.sync_api import sync_playwright

    svg_data = base64.b64encode(logo_path.read_bytes()).decode("ascii")
    html = (
        "<!doctype html><html><body style=\"margin:0;background:transparent\">"
        f"<img id=\"logo\" src=\"data:image/svg+xml;base64,{svg_data}\" "
        "style=\"display:block;max-width:1600px;max-height:800px\">"
        "</body></html>"
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": 1600, "height": 800}, device_scale_factor=2)
            page.set_content(html, wait_until="load")
            page.wait_for_selector("#logo", state="visible", timeout=5_000)
            page.locator("#logo").screenshot(path=str(target_path), omit_background=True)
        finally:
            browser.close()


def rasterize_svg_logo(logo_path: Path) -> Path | None:
    target_path = logo_path.with_name(f"{logo_path.stem}__svg.png")
    try:
        if target_path.exists() and target_path.stat().st_mtime >= logo_path.stat().st_mtime:
            return target_path

        error: list[BaseException] = []

        def worker() -> None:
            try:
                _rasterize_svg_logo_with_playwright(logo_path, target_path)
            except BaseException as exc:
                error.append(exc)

        thread = threading.Thread(target=worker, name="PressespiegelSvgLogoRasterizer")
        thread.start()
        thread.join()
        if error:
            raise error[0]

        with Image.open(target_path) as image:
            image.verify()
        return target_path
    except Exception:
        target_path.unlink(missing_ok=True)
        return None


def readable_source_logo_path(logo_path: Path) -> Path | None:
    if logo_path.suffix.lower() == ".svg":
        return rasterize_svg_logo(logo_path)
    return logo_path


def build_source_logo_index(source_logo_dir: Path | None) -> dict[str, Path]:
    if source_logo_dir is None or not source_logo_dir.exists() or not source_logo_dir.is_dir():
        return {}

    index: dict[str, Path] = {}
    for logo_path in sorted(source_logo_dir.rglob("*")):
        if logo_path.suffix.lower() not in SOURCE_LOGO_SUFFIXES or not logo_path.is_file():
            continue
        if logo_path.suffix.lower() == ".svg":
            if not is_valid_svg_logo(logo_path):
                continue
        else:
            try:
                with Image.open(logo_path) as image:
                    image.verify()
            except (OSError, ValueError):
                continue

        stem_key = normalize_logo_key(logo_path.stem)
        if stem_key:
            index.setdefault(stem_key, logo_path)

        for token in re.findall(r"[a-zA-Z0-9]+", logo_path.stem):
            token_key = normalize_logo_key(token)
            if token_key:
                index.setdefault(token_key, logo_path)
    return index


def find_source_logo(source_logo_index: dict[str, Path], url: str, site_name: str) -> Path | None:
    for key in logo_match_keys(url, site_name):
        logo_path = source_logo_index.get(key)
        if logo_path is not None:
            return logo_path
    return None


def draw_cover_page(
    pdf: canvas.Canvas,
    articles: list[ArticleResult],
    created_at: datetime,
    layout: PdfLayout,
) -> None:
    """Rendert ein rein typografisches Deckblatt ohne dekorative Elemente."""
    page_w, page_h = A4
    fonts = get_pdf_font_family(layout.font_family)

    apply_pdf_background(pdf, layout)

    pdf.setFillColor(HexColor("#303030"))
    _draw_centered_letter_spaced_text(
        pdf,
        layout.title_text,
        page_h * 0.52,
        fonts.bold,
        24,
        2.2,
    )

    pdf.setFillColor(HexColor("#6F6F6F"))
    _draw_centered_letter_spaced_text(
        pdf,
        str(created_at.year),
        page_h * 0.485,
        fonts.regular,
        14,
        6.0,
    )

    pdf.showPage()


def _draw_soft_card_shadow(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    """Erzeugt einen dezenten Schatten wie im Referenz-PDF."""
    pdf.setFillColor(HexColor("#F3F3F3"))
    pdf.roundRect(x + 5, y - 6, width, height, 2.5, fill=True, stroke=False)
    pdf.setFillColor(HexColor("#EAEAEA"))
    pdf.roundRect(x + 2.5, y - 3.5, width, height, 2.5, fill=True, stroke=False)


def _draw_column_site_mark(
    pdf: canvas.Canvas,
    article: ArticleResult,
    align_x: float,
    available_width: float,
    top_y: float,
    layout: PdfLayout,
) -> None:
    """Zeichnet Medienlogo oder Quellenname passend zur jeweiligen Spalte."""
    logo_box_width = min(PDF_LOGO_BOX_WIDTH, available_width)
    logo_box_height = PDF_LOGO_BOX_HEIGHT
    logo_box_x = align_x
    logo_box_y = top_y - logo_box_height

    logo_drawn = False
    if article.logo_path and article.logo_path.exists():
        try:
            drawable_logo_path = readable_source_logo_path(article.logo_path)
            if drawable_logo_path is None:
                raise ValueError("Quellenlogo konnte nicht gelesen werden.")

            with Image.open(drawable_logo_path) as logo_image:
                logo_width, logo_height = logo_image.size

            scale = min(
                logo_box_width / max(logo_width, 1),
                logo_box_height / max(logo_height, 1),
            )
            final_width = logo_width * scale
            final_height = logo_height * scale
            x = logo_box_x
            y = logo_box_y + (logo_box_height - final_height) / 2
            pdf.drawImage(
                ImageReader(str(drawable_logo_path)),
                x,
                y,
                width=final_width,
                height=final_height,
                preserveAspectRatio=True,
                mask="auto",
            )
            logo_drawn = True
        except (OSError, ValueError):
            logo_drawn = False

    if not logo_drawn:
        display_name = re.sub(r"\s+", " ", article.site_name.strip() or article_domain(article))
        font_size = 13 if len(display_name) <= 22 else 10.5
        fonts = get_pdf_font_family(layout.font_family)
        pdf.setFillColor(HexColor("#353535"))
        pdf.setFont(fonts.bold, font_size)
        pdf.drawString(
            align_x,
            logo_box_y + logo_box_height / 2 - font_size / 3,
            pdf_safe_text(display_name[:42]),
        )


def _draw_section_heading(
    pdf: canvas.Canvas,
    heading: str,
    layout: PdfLayout,
) -> None:
    page_w, page_h = A4
    outer_margin = 42
    max_width = page_w - 2 * outer_margin
    fonts = get_pdf_font_family(layout.font_family)
    lines = _wrap_pdf_lines(
        re.sub(r"\s+", " ", heading.strip()),
        fonts.bold,
        PDF_SECTION_TITLE_FONT_SIZE,
        max_width,
        PDF_SECTION_TITLE_MAX_LINES,
    )
    if not lines:
        return

    used_height = len(lines) * PDF_SECTION_TITLE_LINE_HEIGHT
    first_baseline = page_h / 2 + used_height / 2 - PDF_SECTION_TITLE_FONT_SIZE

    pdf.setFillColor(HexColor("#242424"))
    pdf.setFont(fonts.bold, PDF_SECTION_TITLE_FONT_SIZE)
    for line_index, line in enumerate(lines):
        pdf.drawCentredString(
            page_w / 2,
            first_baseline - line_index * PDF_SECTION_TITLE_LINE_HEIGHT,
            line,
        )


def _draw_page_footer(
    pdf: canvas.Canvas,
    article: ArticleResult,
    page_part_indexes: list[int],
    part_total: int,
    y: float,
    align_x: float,
    available_width: float,
    layout: PdfLayout,
) -> None:
    """Zeichnet Quellen-/Datumszeile einmal pro PDF-Seite."""
    footer_text = f"{article_domain(article)}, {format_date_long_de(article.article_date)}"
    if part_total > 1 and page_part_indexes:
        first_part = min(page_part_indexes)
        last_part = max(page_part_indexes)
        if first_part == last_part:
            footer_text = f"{footer_text} - Teil {first_part} von {part_total}"
        else:
            footer_text = f"{footer_text} - Teile {first_part}-{last_part} von {part_total}"

    fonts = get_pdf_font_family(layout.font_family)
    pdf.setFillColor(HexColor("#343434"))
    draw_wrapped_text(
        pdf,
        footer_text,
        align_x,
        y,
        available_width,
        fonts.regular,
        8.5,
        10,
        max_lines=2,
    )


def _column_image_top(content_top: float) -> float:
    return (
        content_top
        - PDF_LOGO_BOX_HEIGHT
        - 12
    )


def _draw_column_footer(
    pdf: canvas.Canvas,
    article: ArticleResult,
    column_x: float,
    column_width: float,
    y: float,
    part_index: int,
    part_total: int,
    layout: PdfLayout,
) -> None:
    """Zeichnet Quellen-/Datumszeile unter einer Spalte."""
    footer_text = f"{article_domain(article)}, {format_date_long_de(article.article_date)}"
    if part_total > 1:
        footer_text = f"{footer_text} - Teil {part_index} von {part_total}"

    pdf.setFillColor(HexColor("#343434"))
    fonts = get_pdf_font_family(layout.font_family)
    draw_wrapped_text(
        pdf,
        footer_text,
        column_x,
        y,
        column_width,
        fonts.regular,
        8.5,
        10,
        max_lines=2,
    )


def _draw_image_column(
    pdf: canvas.Canvas,
    article: ArticleResult,
    image_part: Image.Image,
    column_x: float,
    column_width: float,
    content_top: float,
    content_bottom: float,
    part_index: int,
    part_total: int,
    card_padding: float,
    layout: PdfLayout,
) -> None:
    image_x, image_y, final_width, final_height = _calculate_image_column_geometry(
        image_part,
        column_x,
        column_width,
        content_top,
        content_bottom,
    )

    image_buffer = io.BytesIO()
    image_part.save(image_buffer, format="JPEG", quality=91, optimize=True)
    image_buffer.seek(0)
    _draw_screenshot_shadow(pdf, image_x, image_y, final_width, final_height)
    pdf.drawImage(
        ImageReader(image_buffer),
        image_x,
        image_y,
        width=final_width,
        height=final_height,
        preserveAspectRatio=True,
        mask="auto",
    )


def _calculate_image_column_geometry(
    image_part: Image.Image,
    column_x: float,
    column_width: float,
    content_top: float,
    content_bottom: float,
) -> tuple[float, float, float, float]:
    image_top = _column_image_top(content_top)
    footer_space = 32
    max_content_width = column_width
    max_content_height = image_top - content_bottom - footer_space

    scale = min(
        max_content_width / image_part.width,
        max_content_height / image_part.height,
    )
    final_width = image_part.width * scale
    final_height = image_part.height * scale

    image_x = column_x + (column_width - final_width) / 2
    image_y = image_top - final_height

    return image_x, image_y, final_width, final_height


def _draw_screenshot_shadow(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    pdf.setFillColor(HexColor("#E7E7E7"))
    pdf.roundRect(x + 4, y - 4, width, height, 2, fill=True, stroke=False)
    pdf.setFillColor(HexColor("#F2F2F2"))
    pdf.roundRect(x + 2, y - 2, width, height, 2, fill=True, stroke=False)


def _row_whiteness_score(image: Image.Image, y: int) -> float:
    """Bewertet eine Bildzeile; hohe Werte sprechen für einen guten weißen Schnitt."""
    sample_width = min(image.width, 320)
    gray = image.convert("L").resize((sample_width, image.height))
    row = list(gray.crop((0, y, sample_width, y + 1)).getdata())
    if not row:
        return 0.0
    average = sum(row) / len(row)
    dark_share = sum(1 for value in row if value < 220) / len(row)
    return average - dark_share * 180


def _find_smart_split(image: Image.Image, desired_bottom: int, search_radius: int = 110) -> int:
    """Verschiebt einen Seitenumbruch möglichst auf eine helle Leerzeile."""
    lower = max(250, desired_bottom - search_radius)
    upper = min(image.height - 1, desired_bottom + search_radius)
    if lower >= upper:
        return min(desired_bottom, image.height)

    # Nur jede vierte Zeile bewerten; das hält auch sehr lange Screenshots schnell.
    candidates = range(lower, upper + 1, 4)
    best_y = desired_bottom
    best_score = float("-inf")
    gray = image.convert("L").resize((min(image.width, 320), image.height))
    sample_width = gray.width

    for y in candidates:
        row = list(gray.crop((0, y, sample_width, y + 1)).getdata())
        if not row:
            continue
        average = sum(row) / len(row)
        dark_share = sum(1 for value in row if value < 220) / len(row)
        distance_penalty = abs(y - desired_bottom) * 0.05
        score = average - dark_share * 180 - distance_penalty
        if score > best_score:
            best_score = score
            best_y = y

    return max(250, best_y)


def split_image_for_pdf(image: Image.Image, pixel_height: int) -> list[Image.Image]:
    """Teilt lange Artikel ausgeglichen und möglichst an hellen Stellen auf."""
    if image.height <= pixel_height:
        return [image.copy()]

    number_of_parts = max(2, (image.height + pixel_height - 1) // pixel_height)
    parts: list[Image.Image] = []
    top = 0

    for part_number in range(number_of_parts, 0, -1):
        remaining_height = image.height - top
        if part_number == 1:
            bottom = image.height
        else:
            balanced_height = round(remaining_height / part_number)
            desired_bottom = top + min(pixel_height, balanced_height)
            local_image = image.crop((0, top, image.width, image.height))
            relative_split = _find_smart_split(
                local_image,
                desired_bottom - top,
                search_radius=min(120, max(50, balanced_height // 4)),
            )
            bottom = min(top + relative_split, image.height)

            minimum_height = max(220, int(balanced_height * 0.65))
            if bottom - top < minimum_height:
                bottom = min(top + balanced_height, image.height)

        parts.append(image.crop((0, top, image.width, bottom)))
        top = bottom

    return [part for part in parts if part.height > 0]


def build_pdf(
    output_path: Path,
    articles: list[ArticleResult],
    progress_callback: ProgressCallback,
    cancel_event: threading.Event,
    layout: PdfLayout | None = None,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    layout = layout or PDF_LAYOUT_BY_ID["default"]

    pdf = canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    pdf.setTitle(f"Pressespiegel {datetime.now().strftime('%d.%m.%Y')}")
    pdf.setAuthor("Famous Designs")
    pdf.setSubject("Automatisch erstellter Pressespiegel")

    created_at = datetime.now()
    draw_cover_page(pdf, articles, created_at, layout)

    page_w, page_h = A4
    outer_margin = 42
    column_gap = 26
    column_width = (page_w - 2 * outer_margin - column_gap) / 2
    content_top = page_h - 46
    content_bottom = 48
    column_image_top = _column_image_top(content_top)
    column_footer_space = 32
    column_image_height = column_image_top - content_bottom - column_footer_space
    card_padding = 0

    for article_index, article in enumerate(articles, start=1):
        if cancel_event.is_set():
            raise UserCancelled
        if article.image_path is None or not is_usable_article_screenshot(article.image_path):
            continue

        with Image.open(article.image_path) as source_image:
            image = source_image.convert("RGB")
            pixels_per_pdf_page = max(
                500,
                int(image.width * (column_image_height - 2 * card_padding) / (column_width - 2 * card_padding)),
            )
            image_parts = split_image_for_pdf(image, pixels_per_pdf_page)

        part_index = 0
        while part_index < len(image_parts):
            if cancel_event.is_set():
                raise UserCancelled

            apply_pdf_background(pdf, layout)
            if part_index == 0 and article.section_heading:
                _draw_section_heading(pdf, article.section_heading, layout)
                pdf.showPage()
                apply_pdf_background(pdf, layout)

            page_parts = image_parts[part_index:part_index + 2]
            page_part_indexes = [part_index + column_index + 1 for column_index, _part in enumerate(page_parts)]
            first_image_x, _first_image_y, first_image_width, _first_image_height = _calculate_image_column_geometry(
                page_parts[0],
                outer_margin,
                column_width,
                content_top,
                content_bottom,
            )
            _draw_column_site_mark(
                pdf,
                article,
                first_image_x,
                first_image_width,
                content_top,
                layout,
            )
            for column_index, part in enumerate(page_parts):
                if cancel_event.is_set():
                    raise UserCancelled
                column_x = outer_margin + column_index * (column_width + column_gap)
                _draw_image_column(
                    pdf,
                    article,
                    part,
                    column_x,
                    column_width,
                    content_top,
                    content_bottom,
                    part_index + column_index + 1,
                    len(image_parts),
                    card_padding,
                    layout,
                )

            _draw_page_footer(
                pdf,
                article,
                page_part_indexes,
                len(image_parts),
                content_bottom + 8,
                first_image_x,
                first_image_width,
                layout,
            )
            pdf.showPage()
            part_index += 2

        progress_callback(82 + (article_index / len(articles)) * 18)

    pdf.save()


# =====================================================================
# GESAMTABLAUF
# =====================================================================


async def core_build_pressespiegel(
    urls: list[str],
    sections: list[SectionPlanEntry],
    output_pdf_path: Path,
    layout: PdfLayout,
    source_logo_dir: Path | None,
    status_callback: StatusCallback,
    progress_callback: ProgressCallback,
    log_callback: LogCallback,
    cancel_event: threading.Event,
) -> BuildSummary:
    results: list[ArticleResult] = []
    article_jobs = flatten_section_urls(sections) if sections else [(url, None) for url in urls]
    pending_section_heading: str | None = None
    total_urls = len(article_jobs)
    source_logo_index = build_source_logo_index(source_logo_dir)

    try:
        with tempfile.TemporaryDirectory(prefix="pressespiegel_") as temp_dir_name:
            temp_dir = Path(temp_dir_name)

            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(headless=True)
                context = await create_pressespiegel_context(browser)
                freie_presse_context = None
                saechsische_context = None
                lvz_context = None
                radio_dresden_context = None

                try:
                    for index, (url, section_heading) in enumerate(article_jobs, start=1):
                        if cancel_event.is_set():
                            raise UserCancelled

                        status_callback(f"Artikel {index} von {total_urls} wird verarbeitet …")
                        log_callback(f"Lade: {url}")

                        if section_heading:
                            pending_section_heading = section_heading

                        image_path = temp_dir / f"article_{index:03d}.png"
                        try:
                            article_context = context
                            if is_freie_presse_url(url):
                                if has_freie_presse_auth_state():
                                    if freie_presse_context is None:
                                        freie_presse_context = await create_source_pressespiegel_context(
                                            playwright,
                                            browser,
                                            FREIE_PRESSE_PROFILE_DIR,
                                            freie_presse_storage_state_path(),
                                        )
                                    article_context = freie_presse_context
                                    log_callback("Freie Presse: gespeicherter Login wird verwendet.")
                                else:
                                    log_callback(
                                        "Freie Presse: kein gespeicherter Login vorhanden. "
                                        "Bitte den Zugang im Pressespiegel autorisieren."
                                    )
                            elif is_saechsische_url(url):
                                if has_saechsische_auth_state():
                                    if saechsische_context is None:
                                        saechsische_context = await create_source_pressespiegel_context(
                                            playwright,
                                            browser,
                                            SAECHSISCHE_PROFILE_DIR,
                                            saechsische_storage_state_path(),
                                        )
                                    article_context = saechsische_context
                                    log_callback("Sächsische Zeitung: gespeicherter Login wird verwendet.")
                                else:
                                    log_callback(
                                        "Sächsische Zeitung: kein gespeicherter Login vorhanden. "
                                        "Bitte den Zugang im Pressespiegel autorisieren."
                                    )
                            elif is_lvz_url(url):
                                if has_lvz_auth_state():
                                    if lvz_context is None:
                                        lvz_context = await create_source_pressespiegel_context(
                                            playwright,
                                            browser,
                                            LVZ_PROFILE_DIR,
                                            lvz_storage_state_path(),
                                        )
                                    article_context = lvz_context
                                    log_callback("Leipziger Volkszeitung: gespeicherter Login wird verwendet.")
                                else:
                                    log_callback(
                                        "Leipziger Volkszeitung: kein gespeicherter Login vorhanden. "
                                        "Bitte den Zugang im Pressespiegel autorisieren."
                                    )
                            elif is_radio_dresden_url(url):
                                if has_radio_dresden_auth_state():
                                    if radio_dresden_context is None:
                                        radio_dresden_context = await create_source_pressespiegel_context(
                                            playwright,
                                            browser,
                                            RADIO_DRESDEN_PROFILE_DIR,
                                            radio_dresden_storage_state_path(),
                                        )
                                    article_context = radio_dresden_context
                                    log_callback("Radio Dresden: gespeicherter Login wird verwendet.")
                                else:
                                    log_callback(
                                        "Radio Dresden: kein gespeicherter Login vorhanden. "
                                        "Bitte den Zugang im Pressespiegel autorisieren."
                                    )
                            article = await capture_article(
                                article_context,
                                url,
                                image_path,
                                source_logo_index,
                                cancel_event,
                                layout.accent_hex,
                            )
                            if article.logo_path is None:
                                article.logo_warning = (
                                    f"Logo fehlt fuer {article.site_name} "
                                    f"({urlparse(article.url).netloc.removeprefix('www.')}). "
                                    "Bitte fuege eine passende PNG- oder SVG-Datei in den Logo-Ordner ein."
                                )
                            if pending_section_heading:
                                article.section_heading = pending_section_heading
                                pending_section_heading = None
                            results.append(article)
                            if article.logo_warning:
                                log_callback(f"Logo fehlt: {article.logo_warning}")
                            if article.capture_note:
                                log_callback(f"Hinweis: {article.capture_note}")
                            log_callback(f"Erfolgreich: {article.site_name} – {article.title}")
                        except UserCancelled:
                            raise
                        except Exception as exc:
                            error_message = str(exc).strip() or exc.__class__.__name__
                            results.append(ArticleResult(url=url, error=error_message))
                            log_callback(f"Fehler: {url} – {error_message}")

                        progress_callback((index / total_urls) * 80)
                finally:
                    if freie_presse_context is not None:
                        await freie_presse_context.close()
                    if saechsische_context is not None:
                        await saechsische_context.close()
                    if lvz_context is not None:
                        await lvz_context.close()
                    if radio_dresden_context is not None:
                        await radio_dresden_context.close()
                    await context.close()
                    await browser.close()

            successful = [article for article in results if article.successful]
            if not successful:
                return BuildSummary(output_path=output_pdf_path, articles=results)

            if cancel_event.is_set():
                raise UserCancelled

            status_callback("PDF wird erstellt …")
            log_callback(f"Erstelle PDF mit {len(successful)} Artikel(n).")
            build_pdf(output_pdf_path, successful, progress_callback, cancel_event, layout)
            progress_callback(100)
            return BuildSummary(output_path=output_pdf_path, articles=results)

    except UserCancelled:
        if output_pdf_path.exists():
            try:
                output_pdf_path.unlink()
            except OSError:
                pass
        return BuildSummary(output_path=output_pdf_path, articles=results, cancelled=True)


# =====================================================================
# MODERNE TKINTER-OBERFLÄCHE
# =====================================================================


class PressespiegelGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(f"{APP_NAME} – Famous Designs")
        self.root.geometry("920x730")
        self.root.minsize(760, 620)
        self.root.configure(bg="#F4F5F7")

        self.cancel_event = threading.Event()
        self.is_running = False
        self.last_output_path: Path | None = None
        default_layout = PDF_LAYOUT_BY_ID["default"]
        self.custom_fonts, self.custom_layouts = load_custom_layout_config()
        PDF_FONT_FAMILIES.update(self.custom_fonts)
        self.layouts = list(PDF_LAYOUTS) + self.custom_layouts
        self.layout_by_name = {layout.name: layout for layout in self.layouts}
        self.layout_var = tk.StringVar(value=default_layout.name)
        self.font_family_var = tk.StringVar(value=default_layout.font_family)
        self.cover_style_var = tk.StringVar(value=default_layout.cover_style)
        self.cover_image_var = tk.StringVar(value=default_layout.cover_image_path or "")
        self.title_text_var = tk.StringVar(value=default_layout.title_text)
        self.main_logo_var = tk.StringVar(value=default_layout.main_logo_path or "")
        self.background_kind_var = tk.StringVar(value="color")
        self.background_var = tk.StringVar(value=default_layout.background_hex)
        self.background_image_var = tk.StringVar(value="")
        self.section_groups: list[dict[str, object]] = []

        self._configure_styles()
        self._build_ui()
        self._set_default_output_path()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _configure_styles(self) -> None:
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure("App.TFrame", background="#F4F5F7")
        style.configure("Card.TFrame", background="#FFFFFF")
        style.configure("Card.TLabel", background="#FFFFFF", foreground="#2C2C2C")
        style.configure("Muted.TLabel", background="#FFFFFF", foreground="#6B7280")
        style.configure("Status.TLabel", background="#F4F5F7", foreground="#4B5563")
        style.configure("TNotebook", background="#FFFFFF", borderwidth=0)
        style.configure("TNotebook.Tab", padding=(16, 8), font=("Segoe UI", 9, "bold"))
        style.map("TNotebook.Tab", background=[("selected", "#FFFFFF")], foreground=[("selected", "#171717")])

        style.configure(
            "Primary.TButton",
            background="#303030",
            foreground="#FFFFFF",
            font=("Segoe UI", 10, "bold"),
            padding=(16, 10),
            borderwidth=0,
        )
        style.map(
            "Primary.TButton",
            background=[("active", "#4B5563"), ("disabled", "#D7D9DD")],
            foreground=[("disabled", "#8A8F98")],
        )

        style.configure(
            "Secondary.TButton",
            background="#FFFFFF",
            foreground="#2C2C2C",
            font=("Segoe UI", 9),
            padding=(12, 8),
            borderwidth=1,
            relief="solid",
        )
        style.map("Secondary.TButton", background=[("active", "#F2F3F5")])

        style.configure(
            "Danger.TButton",
            background="#FFFFFF",
            foreground="#B42318",
            font=("Segoe UI", 9, "bold"),
            padding=(12, 8),
            borderwidth=1,
        )
        style.map("Danger.TButton", background=[("active", "#FEF3F2")])

        style.configure(
            "Neutral.Horizontal.TProgressbar",
            troughcolor="#E4E7EC",
            background="#303030",
            bordercolor="#E4E7EC",
            lightcolor="#303030",
            darkcolor="#303030",
            thickness=12,
        )

    def _build_ui(self) -> None:
        header = tk.Frame(self.root, bg="#171717", height=112)
        header.pack(fill=tk.X)
        header.pack_propagate(False)

        accent_bar = tk.Frame(header, bg="#303030", width=9)
        accent_bar.pack(side=tk.LEFT, fill=tk.Y)

        header_text = tk.Frame(header, bg="#171717")
        header_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=28, pady=20)

        tk.Label(
            header_text,
            text="PRESSESPIEGEL GENERATOR",
            bg="#171717",
            fg="#FFFFFF",
            font=("Segoe UI", 20, "bold"),
        ).pack(anchor=tk.W)
        tk.Label(
            header_text,
            text="Artikel erfassen, bereinigen und als einheitliches PDF ausgeben",
            bg="#171717",
            fg="#B9BEC7",
            font=("Segoe UI", 10),
        ).pack(anchor=tk.W, pady=(4, 0))

        content = ttk.Frame(self.root, style="App.TFrame", padding=(24, 20, 24, 18))
        content.pack(fill=tk.BOTH, expand=True)

        card = ttk.Frame(content, style="Card.TFrame", padding=18)
        card.pack(fill=tk.BOTH, expand=True)

        notebook = ttk.Notebook(card)
        notebook.pack(fill=tk.BOTH, expand=True)

        url_tab = ttk.Frame(notebook, style="Card.TFrame", padding=(4, 12, 4, 4))
        section_tab = ttk.Frame(notebook, style="Card.TFrame", padding=(4, 12, 4, 4))
        layout_tab = ttk.Frame(notebook, style="Card.TFrame", padding=(4, 12, 4, 4))
        log_tab = ttk.Frame(notebook, style="Card.TFrame", padding=(4, 12, 4, 4))
        notebook.add(section_tab, text="Artikelgruppen")
        notebook.add(url_tab, text="URLs ohne Abschnitte")
        notebook.add(layout_tab, text="Layout")
        notebook.add(log_tab, text="Protokoll")

        url_header = ttk.Frame(url_tab, style="Card.TFrame")
        url_header.pack(fill=tk.X, pady=(0, 8))

        ttk.Label(
            url_header,
            text="Eine URL pro Zeile",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).pack(side=tk.LEFT)

        self.url_count_label = ttk.Label(url_header, text="0 URLs", style="Muted.TLabel")
        self.url_count_label.pack(side=tk.RIGHT)

        self.url_text_area = scrolledtext.ScrolledText(
            url_tab,
            wrap=tk.WORD,
            height=14,
            font=("Consolas", 10),
            background="#FAFAFB",
            foreground="#202124",
            insertbackground="#202124",
            relief=tk.FLAT,
            borderwidth=1,
            padx=10,
            pady=10,
        )
        self.url_text_area.pack(fill=tk.BOTH, expand=True)
        self.url_text_area.bind("<KeyRelease>", lambda _event: self.update_url_count())

        url_actions = ttk.Frame(url_tab, style="Card.TFrame")
        url_actions.pack(fill=tk.X, pady=(10, 0))
        ttk.Button(
            url_actions,
            text="Aus Zwischenablage",
            style="Secondary.TButton",
            command=self.paste_from_clipboard,
        ).pack(side=tk.LEFT)
        ttk.Button(
            url_actions,
            text="URLs bereinigen",
            style="Secondary.TButton",
            command=self.clean_url_input,
        ).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(
            url_actions,
            text="Leeren",
            style="Secondary.TButton",
            command=self.clear_urls,
        ).pack(side=tk.LEFT, padx=(8, 0))

        section_header = ttk.Frame(section_tab, style="Card.TFrame")
        section_header.pack(fill=tk.X, pady=(0, 8))

        ttk.Label(
            section_header,
            text="Überschrift mit zugehörigen URLs",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).pack(side=tk.LEFT)

        self.section_count_label = ttk.Label(section_header, text="0 Abschnitte", style="Muted.TLabel")
        self.section_count_label.pack(side=tk.RIGHT)

        section_body = ttk.Frame(section_tab, style="Card.TFrame")
        section_body.pack(fill=tk.BOTH, expand=True)

        self.section_canvas = tk.Canvas(
            section_body,
            bg="#FFFFFF",
            highlightthickness=0,
            borderwidth=0,
        )
        self.section_scrollbar = ttk.Scrollbar(section_body, orient=tk.VERTICAL, command=self.section_canvas.yview)
        self.section_group_container = ttk.Frame(self.section_canvas, style="Card.TFrame")
        self.section_group_window = self.section_canvas.create_window(
            (0, 0),
            window=self.section_group_container,
            anchor=tk.NW,
        )
        self.section_canvas.configure(yscrollcommand=self.section_scrollbar.set)
        self.section_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.section_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.section_group_container.bind("<Configure>", self._sync_section_scroll_region)
        self.section_canvas.bind("<Configure>", self._sync_section_canvas_width)

        section_actions = ttk.Frame(section_tab, style="Card.TFrame")
        section_actions.pack(fill=tk.X, pady=(10, 0))
        ttk.Button(
            section_actions,
            text="Neue Überschrift hinzufügen",
            style="Primary.TButton",
            command=self.add_section_group,
        ).pack(side=tk.LEFT)
        ttk.Button(
            section_actions,
            text="Abschnitte bereinigen",
            style="Secondary.TButton",
            command=self.clean_section_input,
        ).pack(side=tk.LEFT, padx=(8, 0))
        ttk.Button(
            section_actions,
            text="Leeren",
            style="Secondary.TButton",
            command=self.clear_sections,
        ).pack(side=tk.LEFT, padx=(8, 0))
        self.add_section_group()

        layout_grid = ttk.Frame(layout_tab, style="Card.TFrame")
        layout_grid.pack(fill=tk.X)
        layout_grid.columnconfigure(1, weight=1)

        ttk.Label(
            layout_grid,
            text="Layout",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).grid(row=0, column=0, sticky=tk.W, padx=(0, 12), pady=(0, 10))
        self.layout_combo = ttk.Combobox(
            layout_grid,
            textvariable=self.layout_var,
            values=[layout.name for layout in self.layouts],
            state="readonly",
            font=("Segoe UI", 9),
        )
        self.layout_combo.grid(row=0, column=1, sticky=tk.EW, pady=(0, 10))
        self.layout_combo.bind("<<ComboboxSelected>>", self.on_layout_selected)

        ttk.Label(
            layout_grid,
            text="Titelseite",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).grid(row=1, column=0, sticky=tk.W, padx=(0, 12), pady=(0, 10))
        self.cover_style_combo = ttk.Combobox(
            layout_grid,
            textvariable=self.cover_style_var,
            values=["classic", "brand_band", "editorial", "image"],
            state="readonly",
            font=("Segoe UI", 9),
        )
        self.cover_style_combo.grid(row=1, column=1, sticky=tk.EW, pady=(0, 10))
        self.cover_style_combo.bind("<<ComboboxSelected>>", lambda _event: self.update_cover_controls())

        ttk.Label(
            layout_grid,
            text="Titeltext",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).grid(row=2, column=0, sticky=tk.W, padx=(0, 12), pady=(0, 10))
        self.title_text_entry = ttk.Entry(
            layout_grid,
            textvariable=self.title_text_var,
            font=("Segoe UI", 9),
        )
        self.title_text_entry.grid(row=2, column=1, sticky=tk.EW, pady=(0, 10))

        self.cover_image_entry = ttk.Entry(
            layout_grid,
            textvariable=self.cover_image_var,
            font=("Segoe UI", 9),
        )
        self.cover_image_entry.grid(row=2, column=2, sticky=tk.EW, padx=(8, 0), pady=(0, 10))
        ttk.Button(
            layout_grid,
            text="Titelseitenbild auswählen",
            style="Secondary.TButton",
            command=self.choose_cover_image,
        ).grid(row=2, column=3, sticky=tk.E, padx=(8, 0), pady=(0, 10))

        ttk.Label(
            layout_grid,
            text="Hauptlogo",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).grid(row=3, column=0, sticky=tk.W, padx=(0, 12), pady=(0, 10))
        self.main_logo_entry = ttk.Entry(
            layout_grid,
            textvariable=self.main_logo_var,
            font=("Segoe UI", 9),
        )
        self.main_logo_entry.grid(row=3, column=1, sticky=tk.EW, pady=(0, 10))
        ttk.Button(
            layout_grid,
            text="Logo auswählen",
            style="Secondary.TButton",
            command=self.choose_main_logo,
        ).grid(row=3, column=2, sticky=tk.E, padx=(8, 0), pady=(0, 10))

        ttk.Label(
            layout_grid,
            text="Schriftart",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).grid(row=4, column=0, sticky=tk.W, padx=(0, 12), pady=(0, 10))
        self.font_combo = ttk.Combobox(
            layout_grid,
            textvariable=self.font_family_var,
            values=list(PDF_FONT_FAMILIES),
            state="readonly",
            font=("Segoe UI", 9),
        )
        self.font_combo.grid(row=4, column=1, sticky=tk.EW, pady=(0, 10))
        ttk.Button(
            layout_grid,
            text="Schrift hinzufügen",
            style="Secondary.TButton",
            command=self.choose_custom_font,
        ).grid(row=4, column=2, sticky=tk.E, padx=(8, 0), pady=(0, 10))

        ttk.Label(
            layout_grid,
            text="Hintergrundtyp",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).grid(row=5, column=0, sticky=tk.W, padx=(0, 12), pady=(0, 10))
        self.background_kind_combo = ttk.Combobox(
            layout_grid,
            textvariable=self.background_kind_var,
            values=["color", "image"],
            state="readonly",
            font=("Segoe UI", 9),
        )
        self.background_kind_combo.grid(row=5, column=1, sticky=tk.EW, pady=(0, 10))
        self.background_kind_combo.bind("<<ComboboxSelected>>", lambda _event: self.update_background_controls())

        ttk.Label(
            layout_grid,
            text="Hintergrund",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).grid(row=6, column=0, sticky=tk.W, padx=(0, 12), pady=(0, 10))
        self.background_entry = ttk.Entry(
            layout_grid,
            textvariable=self.background_var,
            font=("Segoe UI", 9),
        )
        self.background_entry.grid(row=6, column=1, sticky=tk.EW, pady=(0, 10))

        self.background_image_entry = ttk.Entry(
            layout_grid,
            textvariable=self.background_image_var,
            font=("Segoe UI", 9),
        )
        self.background_image_entry.grid(row=7, column=1, sticky=tk.EW, pady=(0, 10))
        ttk.Button(
            layout_grid,
            text="Bild auswählen",
            style="Secondary.TButton",
            command=self.choose_background_image,
        ).grid(row=7, column=2, sticky=tk.E, padx=(8, 0), pady=(0, 10))

        layout_actions = ttk.Frame(layout_tab, style="Card.TFrame")
        layout_actions.pack(fill=tk.X, pady=(8, 0))
        ttk.Button(
            layout_actions,
            text="Layoutwerte laden",
            style="Secondary.TButton",
            command=self.on_layout_selected,
        ).pack(side=tk.LEFT)
        ttk.Button(
            layout_actions,
            text="Als neues Layout speichern",
            style="Secondary.TButton",
            command=self.save_current_as_custom_layout,
        ).pack(side=tk.LEFT, padx=(8, 0))
        self.update_background_controls()
        self.update_cover_controls()

        self.log_text = scrolledtext.ScrolledText(
            log_tab,
            wrap=tk.WORD,
            height=18,
            font=("Consolas", 9),
            background="#111318",
            foreground="#D7DAE0",
            insertbackground="#FFFFFF",
            relief=tk.FLAT,
            padx=10,
            pady=10,
            state=tk.DISABLED,
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)

        output_frame = ttk.Frame(card, style="Card.TFrame")
        output_frame.pack(fill=tk.X, pady=(18, 0))

        ttk.Label(
            output_frame,
            text="PDF-Ausgabe",
            style="Card.TLabel",
            font=("Segoe UI", 10, "bold"),
        ).pack(anchor=tk.W, pady=(0, 6))

        output_row = ttk.Frame(output_frame, style="Card.TFrame")
        output_row.pack(fill=tk.X)
        self.output_entry = ttk.Entry(output_row, font=("Segoe UI", 9))
        self.output_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(
            output_row,
            text="Datei auswählen",
            style="Secondary.TButton",
            command=self.choose_output_file,
        ).pack(side=tk.LEFT, padx=(8, 0))

        footer = ttk.Frame(content, style="App.TFrame")
        footer.pack(fill=tk.X, pady=(14, 0))

        self.status_label = ttk.Label(footer, text="Bereit", style="Status.TLabel", font=("Segoe UI", 9))
        self.status_label.pack(anchor=tk.W, pady=(0, 6))

        self.progress_bar = ttk.Progressbar(
            footer,
            orient=tk.HORIZONTAL,
            mode="determinate",
            style="Neutral.Horizontal.TProgressbar",
            maximum=100,
        )
        self.progress_bar.pack(fill=tk.X)

        button_row = ttk.Frame(footer, style="App.TFrame")
        button_row.pack(fill=tk.X, pady=(12, 0))

        self.start_button = ttk.Button(
            button_row,
            text="Pressespiegel erstellen",
            style="Primary.TButton",
            command=self.start_processing_thread,
        )
        self.start_button.pack(side=tk.RIGHT)

        self.cancel_button = ttk.Button(
            button_row,
            text="Abbrechen",
            style="Danger.TButton",
            command=self.cancel_processing,
            state=tk.DISABLED,
        )
        self.cancel_button.pack(side=tk.RIGHT, padx=(0, 8))

        self.open_button = ttk.Button(
            button_row,
            text="PDF öffnen",
            style="Secondary.TButton",
            command=self.open_last_pdf,
            state=tk.DISABLED,
        )
        self.open_button.pack(side=tk.LEFT)

        self.open_folder_button = ttk.Button(
            button_row,
            text="Ordner öffnen",
            style="Secondary.TButton",
            command=self.open_output_folder,
            state=tk.DISABLED,
        )
        self.open_folder_button.pack(side=tk.LEFT, padx=(8, 0))

    def _set_default_output_path(self) -> None:
        downloads = Path.home() / "Downloads"
        target_dir = downloads if downloads.exists() else Path.home()
        filename = f"Pressespiegel_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.pdf"
        self.output_entry.delete(0, tk.END)
        self.output_entry.insert(0, str(target_dir / filename))

    def on_layout_selected(self, _event: object | None = None) -> None:
        layout = self.layout_by_name.get(self.layout_var.get(), PDF_LAYOUT_BY_ID["default"])
        self.font_family_var.set(layout.font_family)
        self.cover_style_var.set(layout.cover_style)
        self.cover_image_var.set(layout.cover_image_path or "")
        self.title_text_var.set(layout.title_text)
        self.main_logo_var.set(layout.main_logo_path or "")
        self.background_kind_var.set(layout.background_kind)
        self.background_var.set(layout.background_hex)
        self.background_image_var.set(layout.background_image_path or "")
        self.update_background_controls()
        self.update_cover_controls()

    def update_layout_options(self) -> None:
        self.layouts = list(PDF_LAYOUTS) + self.custom_layouts
        self.layout_by_name = {layout.name: layout for layout in self.layouts}
        self.layout_combo.config(values=[layout.name for layout in self.layouts])

    def update_font_options(self) -> None:
        self.font_combo.config(values=list(PDF_FONT_FAMILIES))

    def update_background_controls(self) -> None:
        is_image = self.background_kind_var.get() == "image"
        if hasattr(self, "background_entry"):
            self.background_entry.config(state=tk.NORMAL)
        if hasattr(self, "background_image_entry"):
            self.background_image_entry.config(state=tk.NORMAL if is_image else tk.DISABLED)

    def update_cover_controls(self) -> None:
        is_image = self.cover_style_var.get() == "image"
        if hasattr(self, "cover_image_entry"):
            self.cover_image_entry.config(state=tk.NORMAL if is_image else tk.DISABLED)

    def choose_cover_image(self) -> None:
        chosen = filedialog.askopenfilename(
            title="Titelseitenbild auswählen",
            filetypes=[
                ("Bilddateien", "*.png *.jpg *.jpeg"),
                ("PNG", "*.png"),
                ("JPEG", "*.jpg *.jpeg"),
            ],
        )
        if not chosen:
            return

        image_path = Path(chosen)
        try:
            width, height, image_format = validate_cover_image(image_path)
        except ValueError as exc:
            messagebox.showwarning("Ungültiges Titelseitenbild", str(exc))
            return

        self.cover_style_var.set("image")
        self.cover_image_var.set(str(image_path))
        self.update_cover_controls()
        messagebox.showinfo(
            "Titelseitenbild übernommen",
            f"{image_format} mit {width}x{height} px wurde übernommen.",
        )

    def choose_background_image(self) -> None:
        chosen = filedialog.askopenfilename(
            title="Hintergrundbild auswählen",
            filetypes=[
                ("Bilddateien", "*.png *.jpg *.jpeg"),
                ("PNG", "*.png"),
                ("JPEG", "*.jpg *.jpeg"),
            ],
        )
        if not chosen:
            return

        image_path = Path(chosen)
        try:
            width, height, image_format = validate_background_image(image_path)
        except ValueError as exc:
            messagebox.showwarning("Ungültiges Hintergrundbild", str(exc))
            return

        self.background_kind_var.set("image")
        self.background_image_var.set(str(image_path))
        self.update_background_controls()
        messagebox.showinfo(
            "Hintergrundbild übernommen",
            f"{image_format} mit {width}x{height} px wurde übernommen.",
        )

    def choose_custom_font(self) -> None:
        chosen = filedialog.askopenfilename(
            title="Schriftart hinzufügen",
            filetypes=[
                ("Schriftdateien", "*.ttf *.otf"),
                ("TrueType", "*.ttf"),
                ("OpenType", "*.otf"),
            ],
        )
        if not chosen:
            return

        font_path = Path(chosen)
        try:
            font = register_custom_pdf_font(font_path)
        except ValueError as exc:
            messagebox.showwarning("Ungültige Schriftart", str(exc))
            return

        self.custom_fonts[font.label] = font
        PDF_FONT_FAMILIES[font.label] = font
        save_custom_layout_config(self.custom_fonts, self.custom_layouts)
        self.update_font_options()
        self.font_family_var.set(font.label)
        messagebox.showinfo("Schriftart hinzugefügt", f"{font.label} wurde hinzugefügt.")

    def choose_main_logo(self) -> None:
        chosen = filedialog.askopenfilename(
            title="Hauptlogo auswählen",
            filetypes=[
                ("Logodateien", "*.png *.jpg *.jpeg *.ico"),
                ("PNG", "*.png"),
                ("JPEG", "*.jpg *.jpeg"),
                ("Icon", "*.ico"),
            ],
        )
        if not chosen:
            return

        logo_path = Path(chosen)
        try:
            width, height, logo_format = validate_main_logo(logo_path)
        except ValueError as exc:
            messagebox.showwarning("Ungültiges Hauptlogo", str(exc))
            return

        self.main_logo_var.set(str(logo_path))
        messagebox.showinfo("Hauptlogo übernommen", f"{logo_format} mit {width}x{height} px wurde übernommen.")

    def save_current_as_custom_layout(self) -> None:
        layout_name = simpledialog.askstring("Neues Layout", "Name für das neue Layout:")
        if layout_name is None:
            return
        layout_name = re.sub(r"\s+", " ", layout_name).strip()
        if not layout_name:
            messagebox.showwarning("Neues Layout", "Bitte gib einen Layoutnamen ein.")
            return
        if layout_name in {layout.name for layout in PDF_LAYOUTS}:
            messagebox.showwarning("Neues Layout", "Dieser Name ist für ein Standardlayout reserviert.")
            return

        try:
            current_layout = self.get_selected_pdf_layout()
        except ValueError as exc:
            messagebox.showwarning("Ungültiges Layout", str(exc))
            return

        layout_id = re.sub(r"[^a-z0-9_]+", "_", layout_name.lower()).strip("_") or "custom_layout"
        custom_layout = PdfLayout(
            layout_id=f"custom_{layout_id}",
            name=layout_name,
            font_family=current_layout.font_family,
            background_hex=current_layout.background_hex,
            background_kind=current_layout.background_kind,
            background_image_path=current_layout.background_image_path,
            cover_style=current_layout.cover_style,
            cover_image_path=current_layout.cover_image_path,
            main_logo_path=current_layout.main_logo_path,
            accent_hex=current_layout.accent_hex,
            title_text=current_layout.title_text,
            is_custom=True,
        )

        self.custom_layouts = [layout for layout in self.custom_layouts if layout.name != layout_name]
        self.custom_layouts.append(custom_layout)
        save_custom_layout_config(self.custom_fonts, self.custom_layouts)
        self.update_layout_options()
        self.layout_var.set(layout_name)
        messagebox.showinfo("Layout gespeichert", f"{layout_name} wurde gespeichert.")

    def get_selected_pdf_layout(self) -> PdfLayout:
        base_layout = self.layout_by_name.get(self.layout_var.get(), PDF_LAYOUT_BY_ID["default"])
        font_family = self.font_family_var.get()
        if font_family not in PDF_FONT_FAMILIES:
            raise ValueError("Bitte wähle eine gültige Schriftart aus.")
        background_hex = normalize_hex_color(self.background_var.get(), base_layout.background_hex)
        cover_style = self.cover_style_var.get()
        cover_image_path = self.cover_image_var.get().strip()
        title_text = re.sub(r"\s+", " ", self.title_text_var.get()).strip() or "PRESSESPIEGEL"
        main_logo_path = self.main_logo_var.get().strip() or None
        if cover_style not in {"classic", "brand_band", "editorial", "image"}:
            raise ValueError("Bitte wähle eine gültige Titelseite aus.")
        if cover_style == "image":
            if not cover_image_path:
                raise ValueError("Bitte wähle ein Titelseitenbild aus.")
            validate_cover_image(Path(cover_image_path))
        if main_logo_path:
            logo_path = Path(main_logo_path).expanduser()
            if logo_path.is_absolute():
                validate_main_logo(logo_path)
        background_kind = self.background_kind_var.get()
        background_image_path = self.background_image_var.get().strip()
        if background_kind not in {"color", "image"}:
            raise ValueError("Bitte wähle einen gültigen Hintergrundtyp aus.")
        if background_kind == "image":
            if not background_image_path:
                raise ValueError("Bitte wähle ein Hintergrundbild aus.")
            validate_background_image(Path(background_image_path))
        return PdfLayout(
            layout_id=base_layout.layout_id,
            name=base_layout.name,
            font_family=font_family,
            background_hex=background_hex,
            background_kind=background_kind,
            background_image_path=background_image_path if background_kind == "image" else None,
            cover_style=cover_style,
            cover_image_path=cover_image_path if cover_style == "image" else None,
            main_logo_path=main_logo_path,
            accent_hex=base_layout.accent_hex,
            title_text=title_text,
            is_custom=base_layout.is_custom,
        )

    def update_url_count(self) -> None:
        lines = self.url_text_area.get("1.0", tk.END).splitlines()
        urls, invalid = prepare_urls(lines)
        suffix = f" · {len(invalid)} ungültig" if invalid else ""
        self.url_count_label.config(text=f"{len(urls)} URLs{suffix}")

    def _sync_section_scroll_region(self, _event: tk.Event | None = None) -> None:
        self.section_canvas.configure(scrollregion=self.section_canvas.bbox("all"))

    def _sync_section_canvas_width(self, event: tk.Event) -> None:
        self.section_canvas.itemconfigure(self.section_group_window, width=event.width)

    def add_section_group(self, heading: str = "", urls: list[str] | None = None) -> None:
        if self.is_running:
            return

        group_frame = ttk.Frame(self.section_group_container, style="Card.TFrame", padding=(0, 0, 0, 14))
        group_frame.pack(fill=tk.X, pady=(0, 12))
        group_frame.columnconfigure(1, weight=1)

        ttk.Label(
            group_frame,
            text="Überschrift",
            style="Card.TLabel",
            font=("Segoe UI", 9, "bold"),
        ).grid(row=0, column=0, sticky=tk.W, padx=(0, 10), pady=(0, 6))

        heading_var = tk.StringVar(value=heading)
        heading_entry = ttk.Entry(group_frame, textvariable=heading_var, font=("Segoe UI", 10))
        heading_entry.grid(row=0, column=1, sticky=tk.EW, pady=(0, 6))
        heading_entry.bind("<KeyRelease>", lambda _event: self.update_section_count())

        remove_button = ttk.Button(
            group_frame,
            text="Entfernen",
            style="Secondary.TButton",
            command=lambda frame=group_frame: self.remove_section_group(frame),
        )
        remove_button.grid(row=0, column=2, sticky=tk.E, padx=(8, 0), pady=(0, 6))

        ttk.Label(
            group_frame,
            text="URLs",
            style="Muted.TLabel",
        ).grid(row=1, column=0, sticky=tk.NW, padx=(0, 10))

        url_area = scrolledtext.ScrolledText(
            group_frame,
            wrap=tk.WORD,
            height=5,
            font=("Consolas", 10),
            background="#FAFAFB",
            foreground="#202124",
            insertbackground="#202124",
            relief=tk.FLAT,
            borderwidth=1,
            padx=10,
            pady=10,
        )
        url_area.grid(row=1, column=1, columnspan=2, sticky=tk.EW)
        if urls:
            url_area.insert("1.0", "\n".join(urls))
        url_area.bind("<KeyRelease>", lambda _event: self.update_section_count())

        self.section_groups.append(
            {
                "frame": group_frame,
                "heading_var": heading_var,
                "heading_entry": heading_entry,
                "url_area": url_area,
                "remove_button": remove_button,
            }
        )
        self.update_section_count()
        self._sync_section_scroll_region()

    def remove_section_group(self, frame: ttk.Frame) -> None:
        if self.is_running:
            return
        self.section_groups = [group for group in self.section_groups if group["frame"] is not frame]
        frame.destroy()
        if not self.section_groups:
            self.add_section_group()
        self.update_section_count()

    def collect_section_groups(self) -> list[tuple[str, list[str]]]:
        raw_groups: list[tuple[str, list[str]]] = []
        for group in self.section_groups:
            heading_var = group["heading_var"]
            url_area = group["url_area"]
            if not isinstance(heading_var, tk.StringVar) or not isinstance(url_area, scrolledtext.ScrolledText):
                continue
            raw_groups.append((heading_var.get(), url_area.get("1.0", tk.END).splitlines()))
        return raw_groups

    def update_section_count(self) -> None:
        sections, invalid = prepare_section_groups(self.collect_section_groups())
        planned_urls = sum(len(section.urls) for section in sections)
        suffix = f" - {len(invalid)} ungültig" if invalid else ""
        if sections:
            self.section_count_label.config(text=f"{len(sections)} Abschnitte / {planned_urls} URLs{suffix}")
        else:
            self.section_count_label.config(text=f"0 Abschnitte{suffix}")

    def paste_from_clipboard(self) -> None:
        try:
            clipboard = self.root.clipboard_get()
        except tk.TclError:
            messagebox.showwarning("Zwischenablage", "Die Zwischenablage enthält keinen Text.")
            return

        current = self.url_text_area.get("1.0", tk.END).strip()
        new_text = f"{current}\n{clipboard}".strip() if current else clipboard.strip()
        self.url_text_area.delete("1.0", tk.END)
        self.url_text_area.insert("1.0", new_text)
        self.update_url_count()

    def clean_url_input(self) -> None:
        lines = self.url_text_area.get("1.0", tk.END).splitlines()
        urls, invalid = prepare_urls(lines)
        self.url_text_area.delete("1.0", tk.END)
        self.url_text_area.insert("1.0", "\n".join(urls))
        self.update_url_count()

        if invalid:
            messagebox.showwarning(
                "Ungültige Eingaben entfernt",
                "Folgende Zeilen wurden nicht als gültige URL erkannt:\n\n" + "\n".join(invalid[:8]),
            )

    def clear_urls(self) -> None:
        if self.is_running:
            return
        self.url_text_area.delete("1.0", tk.END)
        self.update_url_count()

    def clean_section_input(self) -> None:
        sections, invalid = prepare_section_groups(self.collect_section_groups())
        for group in list(self.section_groups):
            frame = group["frame"]
            if isinstance(frame, ttk.Frame):
                frame.destroy()
        self.section_groups = []
        for section in sections:
            self.add_section_group(section.heading, section.urls)
        if not self.section_groups:
            self.add_section_group()
        self.update_section_count()

        if invalid:
            messagebox.showwarning(
                "Ungültige Abschnitte entfernt",
                "Folgende Zeilen wurden nicht als Abschnitt erkannt:\n\n" + "\n".join(invalid[:8]),
            )

    def clear_sections(self) -> None:
        if self.is_running:
            return
        for group in list(self.section_groups):
            frame = group["frame"]
            if isinstance(frame, ttk.Frame):
                frame.destroy()
        self.section_groups = []
        self.add_section_group()
        self.update_section_count()

    def choose_output_file(self) -> None:
        current_path = Path(self.output_entry.get().strip() or Path.home())
        chosen = filedialog.asksaveasfilename(
            title="Pressespiegel speichern",
            initialdir=str(current_path.parent if current_path.parent.exists() else Path.home()),
            initialfile=current_path.name if current_path.suffix else "Pressespiegel.pdf",
            defaultextension=".pdf",
            filetypes=[("PDF-Datei", "*.pdf")],
        )
        if chosen:
            self.output_entry.delete(0, tk.END)
            self.output_entry.insert(0, chosen)

    def set_status(self, text: str) -> None:
        self.root.after(0, lambda value=text: self.status_label.config(text=value))

    def set_progress(self, value: float) -> None:
        safe_value = max(0.0, min(100.0, value))
        self.root.after(0, lambda number=safe_value: self.progress_bar.config(value=number))

    def append_log(self, text: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")

        def write_log(message: str = text, time_value: str = timestamp) -> None:
            self.log_text.config(state=tk.NORMAL)
            self.log_text.insert(tk.END, f"[{time_value}] {message}\n")
            self.log_text.see(tk.END)
            self.log_text.config(state=tk.DISABLED)

        self.root.after(0, write_log)

    def _set_running_state(self, running: bool) -> None:
        self.is_running = running
        input_state = tk.DISABLED if running else tk.NORMAL
        self.url_text_area.config(state=input_state)
        for group in self.section_groups:
            heading_entry = group["heading_entry"]
            url_area = group["url_area"]
            remove_button = group["remove_button"]
            if isinstance(heading_entry, ttk.Entry):
                heading_entry.config(state=input_state)
            if isinstance(url_area, scrolledtext.ScrolledText):
                url_area.config(state=input_state)
            if isinstance(remove_button, ttk.Button):
                remove_button.config(state=tk.DISABLED if running else tk.NORMAL)
        self.output_entry.config(state=input_state)
        self.layout_combo.config(state=tk.DISABLED if running else "readonly")
        self.font_combo.config(state=tk.DISABLED if running else "readonly")
        self.cover_style_combo.config(state=tk.DISABLED if running else "readonly")
        self.cover_image_entry.config(state=input_state)
        self.title_text_entry.config(state=input_state)
        self.main_logo_entry.config(state=input_state)
        self.background_kind_combo.config(state=tk.DISABLED if running else "readonly")
        self.background_entry.config(state=input_state)
        self.background_image_entry.config(state=tk.DISABLED if running else tk.NORMAL)
        if not running:
            self.update_background_controls()
            self.update_cover_controls()
        self.start_button.config(state=tk.DISABLED if running else tk.NORMAL)
        self.cancel_button.config(state=tk.NORMAL if running else tk.DISABLED)

    def start_processing_thread(self) -> None:
        lines = self.url_text_area.get("1.0", tk.END).splitlines()
        urls, invalid = prepare_urls(lines)
        sections, invalid_sections = prepare_section_groups(self.collect_section_groups())
        grouped_url_count = sum(len(section.urls) for section in sections)
        processing_urls = [url for section in sections for url in section.urls] if sections else urls
        try:
            pdf_layout = self.get_selected_pdf_layout()
        except ValueError as exc:
            messagebox.showwarning("Ungültiges Layout", str(exc))
            return

        if not processing_urls:
            messagebox.showwarning("Fehlende URLs", "Bitte füge mindestens eine gültige Artikel-URL ein.")
            return

        output_value = self.output_entry.get().strip()
        if not output_value:
            messagebox.showwarning("Fehlender Speicherort", "Bitte wähle einen Speicherort für die PDF-Datei.")
            return

        output_path = Path(output_value).expanduser()
        if output_path.suffix.lower() != ".pdf":
            output_path = output_path.with_suffix(".pdf")
            self.output_entry.delete(0, tk.END)
            self.output_entry.insert(0, str(output_path))

        if invalid and not sections:
            proceed = messagebox.askyesno(
                "Ungültige Eingaben",
                f"{len(invalid)} Zeile(n) sind keine gültigen URLs und werden übersprungen. Trotzdem fortfahren?",
            )
            if not proceed:
                return

        if invalid_sections:
            messagebox.showwarning(
                "Ungültige Abschnitte",
                "Bitte korrigiere oder bereinige folgende Abschnittszeilen:\n\n"
                + "\n".join(invalid_sections[:8]),
            )
            return

        if output_path.exists():
            overwrite = messagebox.askyesno(
                "Datei überschreiben",
                f"Die Datei existiert bereits:\n\n{output_path}\n\nSoll sie überschrieben werden?",
            )
            if not overwrite:
                return

        self.url_text_area.config(state=tk.NORMAL)
        self.url_text_area.delete("1.0", tk.END)
        self.url_text_area.insert("1.0", "\n".join(urls))
        if sections:
            for group in list(self.section_groups):
                frame = group["frame"]
                if isinstance(frame, ttk.Frame):
                    frame.destroy()
            self.section_groups = []
            for section in sections:
                self.add_section_group(section.heading, section.urls)
        self.update_section_count()

        self.cancel_event.clear()
        self.last_output_path = None
        self.progress_bar.config(value=0)
        self.open_button.config(state=tk.DISABLED)
        self.open_folder_button.config(state=tk.DISABLED)
        self._set_running_state(True)
        self.set_status("Browser wird gestartet …")
        self.append_log(f"Starte Verarbeitung von {len(processing_urls)} URL(s).")

        if sections:
            self.append_log(f"Abschnitte: {len(sections)} für {grouped_url_count} URL(s).")
        background_log = (
            pdf_layout.background_image_path
            if pdf_layout.background_kind == "image"
            else pdf_layout.background_hex
        )
        self.append_log(
            f"Layout: {pdf_layout.name}, Schrift: {pdf_layout.font_family}, Hintergrund: {background_log}"
        )

        worker = threading.Thread(
            target=self.worker_thread,
            args=(processing_urls, sections, output_path, pdf_layout),
            daemon=True,
            name="PressespiegelWorker",
        )
        worker.start()

    def cancel_processing(self) -> None:
        if not self.is_running:
            return
        self.cancel_event.set()
        self.cancel_button.config(state=tk.DISABLED)
        self.set_status("Abbruch wird vorbereitet …")
        self.append_log("Abbruch durch Benutzer angefordert.")

    def worker_thread(
        self,
        urls: list[str],
        sections: list[SectionPlanEntry],
        output_path: Path,
        pdf_layout: PdfLayout,
    ) -> None:
        try:
            summary = asyncio.run(
                core_build_pressespiegel(
                    urls,
                    sections,
                    output_path,
                    pdf_layout,
                    None,
                    self.set_status,
                    self.set_progress,
                    self.append_log,
                    self.cancel_event,
                )
            )

            if summary.cancelled:
                self.set_status("Verarbeitung abgebrochen")
                self.append_log("Verarbeitung wurde abgebrochen.")
                return

            successful_count = len(summary.successful_articles)
            failed_count = len(summary.failed_articles)

            if successful_count == 0:
                self.set_status("Keine Artikel konnten verarbeitet werden")
                self.root.after(
                    0,
                    lambda: messagebox.showerror(
                        "Keine Artikel erstellt",
                        "Es konnten keine Artikel extrahiert werden. Details findest du im Protokoll.",
                    ),
                )
                return

            self.last_output_path = summary.output_path
            self.set_status(
                f"Fertig: {successful_count} Artikel erstellt"
                + (f", {failed_count} übersprungen" if failed_count else "")
            )
            self.append_log(f"PDF gespeichert: {summary.output_path}")

            def show_success() -> None:
                self.open_button.config(state=tk.NORMAL)
                self.open_folder_button.config(state=tk.NORMAL)
                message = (
                    f"Der Pressespiegel wurde erfolgreich erstellt.\n\n"
                    f"Erfolgreich: {successful_count}\n"
                    f"Übersprungen: {failed_count}\n\n"
                    f"Speicherort:\n{summary.output_path}"
                )
                messagebox.showinfo("Pressespiegel erstellt", message)

            self.root.after(0, show_success)

        except PermissionError:
            self.set_status("PDF konnte nicht geschrieben werden")
            path_text = str(output_path)
            self.root.after(
                0,
                lambda value=path_text: messagebox.showerror(
                    "Schreibfehler",
                    f"Die Datei ist möglicherweise noch geöffnet oder der Ordner ist nicht beschreibbar:\n\n{value}",
                ),
            )
        except PlaywrightError as exc:
            error_text = str(exc)
            self.set_status("Playwright konnte Chromium nicht starten")
            self.append_log(f"Playwright-Fehler: {error_text}")
            self.root.after(
                0,
                lambda message=error_text: messagebox.showerror(
                    "Playwright-Fehler",
                    "Chromium ist möglicherweise noch nicht installiert. Führe im Terminal aus:\n\n"
                    "python -m playwright install chromium\n\n"
                    f"Technische Meldung:\n{message}",
                ),
            )
        except Exception as exc:
            error_text = str(exc).strip() or exc.__class__.__name__
            self.set_status("Unerwarteter Fehler")
            self.append_log(f"Unerwarteter Fehler: {error_text}")
            self.root.after(
                0,
                lambda message=error_text: messagebox.showerror(
                    "Unerwarteter Fehler",
                    f"Ein Fehler ist aufgetreten:\n\n{message}",
                ),
            )
        finally:
            self.root.after(0, lambda: self._set_running_state(False))

    def open_last_pdf(self) -> None:
        if self.last_output_path and self.last_output_path.exists():
            open_with_system(self.last_output_path)
        else:
            messagebox.showwarning("PDF nicht gefunden", "Die zuletzt erstellte PDF-Datei wurde nicht gefunden.")

    def open_output_folder(self) -> None:
        if self.last_output_path:
            open_with_system(self.last_output_path.parent)

    def on_close(self) -> None:
        if self.is_running:
            close_anyway = messagebox.askyesno(
                "Verarbeitung läuft",
                "Die Verarbeitung läuft noch. Soll sie abgebrochen und das Programm geschlossen werden?",
            )
            if not close_anyway:
                return
            self.cancel_event.set()
        self.root.destroy()


def open_with_system(path: Path) -> None:
    try:
        if sys.platform.startswith("win"):
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except OSError as exc:
        messagebox.showerror("Öffnen fehlgeschlagen", f"Der Pfad konnte nicht geöffnet werden:\n\n{exc}")


def get_resource_path(relative_path: str) -> Path:
    """Löst Ressourcenpfade in Entwicklung und in einer PyInstaller-App auf."""
    base_path = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base_path / relative_path


def set_application_icon(root: tk.Tk) -> None:
    candidates = (
        ["FD_Icon_white-black.ico"]
        if sys.platform == "darwin"
        else ["FD_Icon_white-black.ico"]
    )

    for icon_name in candidates:
        icon_path = get_resource_path(icon_name)
        if not icon_path.exists():
            continue
        try:
            if icon_path.suffix.lower() == ".ico" and not sys.platform == "darwin":
                root.iconbitmap(str(icon_path))
            else:
                icon_image = tk.PhotoImage(file=str(icon_path))
                root.iconphoto(False, icon_image)
                root._pressespiegel_icon = icon_image  # Referenz gegen Garbage Collection
            return
        except tk.TclError:
            continue


if __name__ == "__main__":
    app_root = tk.Tk()
    set_application_icon(app_root)
    PressespiegelGUI(app_root)
    app_root.mainloop()
