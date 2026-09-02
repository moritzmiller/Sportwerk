from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import secrets
import subprocess
import sys
import threading
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlparse

import requests
from flask import Flask, jsonify, redirect, render_template, request, send_file, session, url_for
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

from main import (
    PDF_FONT_FAMILIES,
    PDF_LAYOUTS,
    PdfLayout,
    SectionPlanEntry,
    core_build_pressespiegel,
    layout_to_dict,
    load_custom_layout_config,
    normalize_hex_color,
    prepare_section_groups,
    prepare_urls,
    register_custom_pdf_font,
    save_custom_layout_config,
    validate_background_image,
    validate_cover_image,
    validate_main_logo,
)


BASE_DIR = Path(__file__).resolve().parent
SPORTWERK_DIR = BASE_DIR.parent
TRELLO_DIR = SPORTWERK_DIR / "Trello"
PARTICIPATION_DIR = SPORTWERK_DIR / "Teilnahmebedingungen"
TEMPLATE_DIR = SPORTWERK_DIR / "templates"
STATIC_DIR = SPORTWERK_DIR / "static"
INSTANCE_DIR = BASE_DIR / "instance"
UPLOAD_DIR = INSTANCE_DIR / "uploads"
OUTPUT_DIR = INSTANCE_DIR / "outputs"
PARTICIPATION_OUTPUT_DIR = INSTANCE_DIR / "teilnahmebedingungen"
JOB_STATE_DIR = INSTANCE_DIR / "job-state"
ALLOWED_UPLOAD_KINDS = {"background", "cover", "logo", "font"}


def load_env_file(path: Path = SPORTWERK_DIR / ".env") -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value and not os.environ.get(key):
            os.environ[key] = value


load_env_file()

app = Flask(
    __name__,
    template_folder=str(TEMPLATE_DIR),
    static_folder=str(STATIC_DIR),
    static_url_path="/assets",
)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PREFERRED_URL_SCHEME"] = (
    "https" if os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "").startswith("https://") else "http"
)

JOBS: dict[str, dict[str, Any]] = {}
JOBS_LOCK = threading.Lock()
TRELLO_JOBS: dict[str, dict[str, Any]] = {}
TRELLO_JOBS_LOCK = threading.Lock()
PARTICIPATION_JOBS: dict[str, dict[str, Any]] = {}
PARTICIPATION_JOBS_LOCK = threading.Lock()
TRELLO_ACTIONS = {
    "mirror": {
        "script": "main.py",
        "label": "Boards spiegeln",
        "status": "Spiegelung wird ausgeführt",
    },
    "summary": {
        "script": "summary.py",
        "label": "KI-Zusammenfassung",
        "status": "Zusammenfassung wird erstellt",
    },
    "assigned": {
        "script": "assigned.py",
        "label": "Meine Karten kopieren",
        "status": "Zugewiesene Karten werden kopiert",
    },
}

_participation_module = None
PUBLIC_ENDPOINTS = {"login", "start_google_login", "google_callback", "logout", "static"}
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def get_env_value(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    if value:
        return value.strip()

    if sys.platform == "win32":
        try:
            import winreg

            registry_scopes = (
                (winreg.HKEY_CURRENT_USER, "Environment"),
                (
                    winreg.HKEY_LOCAL_MACHINE,
                    r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
                ),
            )
            for root_key, key_path in registry_scopes:
                try:
                    with winreg.OpenKey(root_key, key_path) as key:
                        registry_value, _value_type = winreg.QueryValueEx(key, name)
                except OSError:
                    continue
                if registry_value:
                    return str(registry_value).strip()
        except OSError:
            pass

    return default.strip()


def job_state_path(kind: str, job_id: str) -> Path:
    safe_job_id = secure_filename(job_id)
    return JOB_STATE_DIR / kind / f"{safe_job_id}.json"


def save_job_state(kind: str, job_id: str, job: dict[str, Any]) -> None:
    target_path = job_state_path(kind, job_id)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = target_path.with_suffix(".tmp")
    temp_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
    temp_path.replace(target_path)


def load_job_state(kind: str, job_id: str) -> dict[str, Any] | None:
    target_path = job_state_path(kind, job_id)
    if not target_path.exists():
        return None
    try:
        data = json.loads(target_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def get_secret_key() -> str:
    secret_key = get_env_value("SPORTWERK_SECRET_KEY")
    if secret_key:
        return secret_key
    if os.environ.get("FLASK_ENV") == "production" or "gunicorn" in Path(sys.argv[0]).name:
        raise RuntimeError(
            "SPORTWERK_SECRET_KEY is required for server/Gunicorn operation. "
            "Set it in the service environment or Sportwerk/.env so OAuth sessions stay stable."
        )
    app.logger.warning("SPORTWERK_SECRET_KEY is not set; using a temporary local development key.")
    return secrets.token_hex(32)


app.config["SECRET_KEY"] = get_secret_key()


def is_loopback_host(hostname: str | None) -> bool:
    if not hostname:
        return False
    normalized = hostname.strip().lower()
    return normalized in {"localhost", "127.0.0.1", "::1"} or normalized.startswith("127.")


def request_host_name() -> str:
    return urlparse(f"//{request.host}").hostname or request.host.split(":", 1)[0]


def is_same_redirect_target(first_url: str, second_url: str) -> bool:
    first = urlparse(first_url)
    second = urlparse(second_url)
    return (
        first.scheme == second.scheme
        and first.hostname == second.hostname
        and first.port == second.port
        and first.path == second.path
    )


def derive_google_redirect_uri() -> str:
    return url_for("google_callback", _external=True)


def get_google_redirect_uri() -> str:
    configured_redirect_uri = get_env_value("GOOGLE_OAUTH_REDIRECT_URI")
    if not configured_redirect_uri:
        return derive_google_redirect_uri()

    configured_host = urlparse(configured_redirect_uri).hostname
    request_host = request_host_name()
    request_is_public = not is_loopback_host(request_host)
    derived_redirect_uri = derive_google_redirect_uri()
    if is_loopback_host(configured_host) and request_is_public:
        app.logger.warning(
            "Ignoring loopback GOOGLE_OAUTH_REDIRECT_URI=%s for public request host=%s. "
            "Using derived redirect URI=%s.",
            configured_redirect_uri,
            request.host,
            derived_redirect_uri,
        )
        return derived_redirect_uri

    if (
        is_loopback_host(configured_host)
        and is_loopback_host(request_host)
        and not is_same_redirect_target(configured_redirect_uri, derived_redirect_uri)
    ):
        app.logger.warning(
            "Ignoring mismatched loopback GOOGLE_OAUTH_REDIRECT_URI=%s for local request host=%s. "
            "Using derived redirect URI=%s.",
            configured_redirect_uri,
            request.host,
            derived_redirect_uri,
        )
        return derived_redirect_uri

    return configured_redirect_uri


def get_google_oauth_config() -> dict[str, str]:
    return {
        "client_id": get_env_value("GOOGLE_OAUTH_CLIENT_ID"),
        "client_secret": get_env_value("GOOGLE_OAUTH_CLIENT_SECRET"),
        "redirect_uri": get_google_redirect_uri(),
    }


def is_auth_configured() -> bool:
    config = get_google_oauth_config()
    return bool(config["client_id"] and config["client_secret"])


def wants_json_response() -> bool:
    return request.path.startswith(("/jobs", "/trello/jobs", "/teilnahmebedingungen/jobs")) or (
        request.accept_mimetypes.best == "application/json"
        and request.accept_mimetypes["application/json"] >= request.accept_mimetypes["text/html"]
    )


def safe_next_url(target: str | None) -> str:
    if not target or not target.startswith("/") or target.startswith("//"):
        return url_for("dashboard")
    return target


def is_allowed_google_user(email: str) -> bool:
    normalized_email = email.strip().lower()
    allowed_emails = {
        item.strip().lower()
        for item in get_env_value("SPORTWERK_ALLOWED_EMAILS").split(",")
        if item.strip()
    }
    allowed_domains = {
        item.strip().lower().lstrip("@")
        for item in get_env_value("SPORTWERK_ALLOWED_DOMAINS").split(",")
        if item.strip()
    }

    if allowed_domains:
        domain = normalized_email.rsplit("@", 1)[-1] if "@" in normalized_email else ""
    else:
        domain = ""

    if allowed_emails or allowed_domains:
        return normalized_email in allowed_emails or domain in allowed_domains
    return True


@app.before_request
def require_google_login():
    if request.method == "OPTIONS" or request.endpoint in PUBLIC_ENDPOINTS:
        return None
    if session.get("user"):
        return None
    if wants_json_response():
        return jsonify({"error": "Bitte melde dich mit Google an."}), 401
    return redirect(url_for("login", next=request.full_path if request.query_string else request.path))


@app.errorhandler(404)
def not_found(_error):
    if wants_json_response():
        return jsonify({"error": "Nicht gefunden."}), 404
    return render_template("error.html", title="Nicht gefunden", message="Diese Seite existiert nicht."), 404


@app.errorhandler(413)
def file_too_large(_error):
    if wants_json_response():
        return jsonify({"error": "Die hochgeladene Datei ist zu gross."}), 413
    return (
        render_template(
            "error.html",
            title="Datei zu gross",
            message="Die hochgeladene Datei ueberschreitet die erlaubte Groesse.",
        ),
        413,
    )


@app.errorhandler(500)
def internal_error(error):
    app.logger.exception("Unhandled Sportwerk server error")
    if wants_json_response():
        return jsonify({"error": "Interner Serverfehler. Bitte versuche es spaeter erneut."}), 500
    return (
        render_template(
            "error.html",
            title="Serverfehler",
            message="Die Anfrage konnte gerade nicht verarbeitet werden.",
        ),
        500,
    )


@app.get("/login")
def login():
    if session.get("user"):
        return redirect(safe_next_url(request.args.get("next")))
    return render_template(
        "login.html",
        next_url=safe_next_url(request.args.get("next")),
    )


@app.get("/auth/google")
def start_google_login():
    if not is_auth_configured():
        app.logger.warning(
            "Google OAuth is missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET."
        )
        return redirect(url_for("login", next=request.args.get("next"), error="unavailable"))

    oauth_state = secrets.token_urlsafe(32)
    next_url = safe_next_url(request.args.get("next"))
    session["oauth_state"] = oauth_state
    session["oauth_next"] = next_url

    config = get_google_oauth_config()
    query = urlencode(
        {
            "client_id": config["client_id"],
            "redirect_uri": config["redirect_uri"],
            "response_type": "code",
            "scope": "openid email profile",
            "state": oauth_state,
            "access_type": "online",
            "prompt": "select_account",
        }
    )
    return redirect(f"{GOOGLE_AUTH_URL}?{query}")


@app.get("/auth/google/callback")
def google_callback():
    expected_state = session.pop("oauth_state", None)
    next_url = session.pop("oauth_next", url_for("dashboard"))
    received_state = request.args.get("state")
    if not expected_state or received_state != expected_state:
        return redirect(url_for("login", next=next_url, error="state"))

    error = request.args.get("error")
    if error:
        return redirect(url_for("login", next=next_url, error=error))

    code = request.args.get("code")
    if not code:
        return redirect(url_for("login", next=next_url, error="missing_code"))

    config = get_google_oauth_config()
    token_response = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": config["redirect_uri"],
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if token_response.status_code != 200:
        return redirect(url_for("login", next=next_url, error="token"))

    token_payload = token_response.json()
    raw_id_token = token_payload.get("id_token")
    if not raw_id_token:
        return redirect(url_for("login", next=next_url, error="identity"))

    try:
        identity = id_token.verify_oauth2_token(
            raw_id_token,
            google_requests.Request(),
            config["client_id"],
        )
    except ValueError:
        return redirect(url_for("login", next=next_url, error="identity"))

    email = identity.get("email", "")
    if not email or not identity.get("email_verified") or not is_allowed_google_user(email):
        return redirect(url_for("login", next=next_url, error="not_allowed"))

    session["user"] = {
        "email": email,
        "name": identity.get("name") or email,
        "picture": identity.get("picture"),
        "sub": identity.get("sub"),
    }
    return redirect(safe_next_url(next_url))


@app.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


def ensure_instance_dirs() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PARTICIPATION_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    JOB_STATE_DIR.mkdir(parents=True, exist_ok=True)


def load_participation_module():
    global _participation_module
    if _participation_module is not None:
        return _participation_module

    module_path = PARTICIPATION_DIR / "main.py"
    spec = importlib.util.spec_from_file_location("sportwerk_participation", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Teilnahmebedingungen-Modul konnte nicht geladen werden.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    _participation_module = module
    return module


def load_layout_state() -> tuple[dict[str, Any], list[PdfLayout]]:
    custom_fonts, custom_layouts = load_custom_layout_config()
    PDF_FONT_FAMILIES.update(custom_fonts)
    layouts = list(PDF_LAYOUTS) + custom_layouts
    return custom_fonts, layouts


def layout_payload(layouts: list[PdfLayout]) -> list[dict[str, Any]]:
    return [layout_to_dict(layout) | {"is_custom": layout.is_custom} for layout in layouts]


def find_layout(layouts: list[PdfLayout], layout_id: str | None) -> PdfLayout:
    for layout in layouts:
        if layout.layout_id == layout_id:
            return layout
    return layouts[0]


def save_upload(field_name: str, upload_kind: str) -> Path | None:
    if upload_kind not in ALLOWED_UPLOAD_KINDS:
        raise ValueError("Unbekannter Upload-Typ.")

    uploaded_file = request.files.get(field_name)
    if uploaded_file is None or not uploaded_file.filename:
        return None

    safe_name = secure_filename(uploaded_file.filename)
    if not safe_name:
        raise ValueError("Der Dateiname ist ungültig.")

    target_dir = UPLOAD_DIR / upload_kind
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{uuid.uuid4().hex}_{safe_name}"
    uploaded_file.save(target_path)
    return target_path


def parse_sections_from_form() -> tuple[list[SectionPlanEntry], list[str]]:
    headings = request.form.getlist("section_heading")
    url_blocks = request.form.getlist("section_urls")
    raw_groups = [(heading, urls.splitlines()) for heading, urls in zip(headings, url_blocks)]
    return prepare_section_groups(raw_groups)


def parse_fallback_urls() -> tuple[list[str], list[str]]:
    return prepare_urls(request.form.get("fallback_urls", "").splitlines())


def save_source_logo_uploads(job_id: str) -> tuple[Path | None, list[str]]:
    uploads = request.files.getlist("source_logos")
    if not uploads:
        return None, []

    target_dir = UPLOAD_DIR / "source-logos" / job_id
    saved: list[str] = []
    invalid: list[str] = []

    for upload in uploads:
        if upload is None or not upload.filename:
            continue
        safe_name = secure_filename(Path(upload.filename).name)
        if not safe_name:
            continue
        if Path(safe_name).suffix.lower() != ".png":
            invalid.append(f"{upload.filename}: nur PNG-Dateien werden als Quellenlogo akzeptiert")
            continue
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / safe_name
        counter = 2
        while target_path.exists():
            target_path = target_dir / f"{Path(safe_name).stem}_{counter}{Path(safe_name).suffix}"
            counter += 1
        upload.save(target_path)
        saved.append(safe_name)

    if not saved:
        return None, invalid
    return target_dir, invalid


def build_layout_from_form(layouts: list[PdfLayout]) -> tuple[PdfLayout, dict[str, Any]]:
    base_layout = find_layout(layouts, request.form.get("layout_id"))
    background_upload = save_upload("background_image", "background")
    cover_upload = save_upload("cover_image", "cover")
    logo_upload = save_upload("main_logo", "logo")
    font_upload = save_upload("font_file", "font")

    custom_fonts, custom_layouts = load_layout_state()
    font_family = request.form.get("font_family") or base_layout.font_family
    uploaded_font_label: str | None = None
    if font_upload is not None:
        font = register_custom_pdf_font(font_upload, request.form.get("font_label"))
        PDF_FONT_FAMILIES[font.label] = font
        custom_fonts[font.label] = font
        uploaded_font_label = font.label
        font_family = font.label

    if font_family not in PDF_FONT_FAMILIES:
        raise ValueError("Die ausgewählte Schriftart ist nicht verfügbar.")

    background_kind = request.form.get("background_kind") or base_layout.background_kind
    background_hex = normalize_hex_color(request.form.get("background_hex") or base_layout.background_hex)
    background_image_path = request.form.get("background_image_path") or base_layout.background_image_path
    if background_upload is not None:
        validate_background_image(background_upload)
        background_kind = "image"
        background_image_path = str(background_upload)
    elif background_kind == "image":
        if not background_image_path:
            raise ValueError("Bitte lade ein Hintergrundbild hoch oder wähle Farbe als Hintergrund.")
        validate_background_image(Path(background_image_path))

    main_logo_path = request.form.get("main_logo_path") or base_layout.main_logo_path
    if logo_upload is not None:
        validate_main_logo(logo_upload)
        main_logo_path = str(logo_upload)
    elif main_logo_path and Path(main_logo_path).is_absolute():
        validate_main_logo(Path(main_logo_path))

    cover_style = request.form.get("cover_style") or base_layout.cover_style
    cover_image_path = request.form.get("cover_image_path") or base_layout.cover_image_path
    if cover_upload is not None:
        validate_cover_image(cover_upload)
        cover_style = "image"
        cover_image_path = str(cover_upload)
    elif cover_style == "image":
        if not cover_image_path:
            raise ValueError("Bitte lade ein Titelseitenbild hoch oder wähle einen anderen Titelseitenstil.")
        validate_cover_image(Path(cover_image_path))

    if cover_style not in {"classic", "brand_band", "editorial", "image"}:
        raise ValueError("Der Titelseitenstil ist ungültig.")

    layout = PdfLayout(
        layout_id=base_layout.layout_id,
        name=base_layout.name,
        font_family=font_family,
        background_hex=background_hex,
        background_kind=background_kind,
        background_image_path=background_image_path,
        cover_style=cover_style,
        cover_image_path=cover_image_path if cover_style == "image" else None,
        main_logo_path=main_logo_path,
        accent_hex=normalize_hex_color(request.form.get("accent_hex") or base_layout.accent_hex, "#F28C28"),
        title_text=(request.form.get("title_text") or base_layout.title_text).strip() or "PRESSESPIEGEL",
        is_custom=base_layout.is_custom,
    )

    save_name = (request.form.get("save_layout_name") or "").strip()
    if save_name:
        custom_layout = PdfLayout(
            layout_id=f"custom_{uuid.uuid4().hex[:10]}",
            name=save_name,
            font_family=layout.font_family,
            background_hex=layout.background_hex,
            background_kind=layout.background_kind,
            background_image_path=layout.background_image_path,
            cover_style=layout.cover_style,
            cover_image_path=layout.cover_image_path,
            main_logo_path=layout.main_logo_path,
            accent_hex=layout.accent_hex,
            title_text=layout.title_text,
            is_custom=True,
        )
        custom_layouts = [existing for existing in custom_layouts if existing.name != save_name]
        custom_layouts.append(custom_layout)
        save_custom_layout_config(custom_fonts, custom_layouts)
    elif font_upload is not None:
        save_custom_layout_config(custom_fonts, custom_layouts)

    return layout, {"uploaded_font_label": uploaded_font_label}


def update_job(job_id: str, **changes: Any) -> None:
    with JOBS_LOCK:
        if "progress" in changes:
            current_progress = float(JOBS[job_id].get("progress") or 0)
            next_progress = max(0, min(100, round(float(changes["progress"]), 1)))
            changes["progress"] = max(current_progress, next_progress)
        JOBS[job_id].update(changes)
        save_job_state("pressespiegel", job_id, JOBS[job_id])


def append_job_log(job_id: str, message: str) -> None:
    with JOBS_LOCK:
        JOBS[job_id]["logs"].append(message)
        save_job_state("pressespiegel", job_id, JOBS[job_id])


def update_trello_job(job_id: str, **changes: Any) -> None:
    with TRELLO_JOBS_LOCK:
        TRELLO_JOBS[job_id].update(changes)
        save_job_state("trello", job_id, TRELLO_JOBS[job_id])


def append_trello_job_log(job_id: str, message: str) -> None:
    with TRELLO_JOBS_LOCK:
        TRELLO_JOBS[job_id]["logs"].append(message)
        save_job_state("trello", job_id, TRELLO_JOBS[job_id])


def update_participation_job(job_id: str, **changes: Any) -> None:
    with PARTICIPATION_JOBS_LOCK:
        PARTICIPATION_JOBS[job_id].update(changes)
        save_job_state("teilnahmebedingungen", job_id, PARTICIPATION_JOBS[job_id])


def append_participation_job_log(job_id: str, message: str) -> None:
    with PARTICIPATION_JOBS_LOCK:
        PARTICIPATION_JOBS[job_id]["logs"].append(message)
        save_job_state("teilnahmebedingungen", job_id, PARTICIPATION_JOBS[job_id])


def article_to_dict(article) -> dict[str, Any]:
    return {
        "url": article.url,
        "title": article.title,
        "site_name": article.site_name,
        "article_date": article.article_date,
        "section_heading": article.section_heading,
        "capture_note": article.capture_note,
        "logo_warning": article.logo_warning,
        "error": article.error,
        "successful": article.successful,
    }


def run_job(
    job_id: str,
    urls: list[str],
    sections: list[SectionPlanEntry],
    layout: PdfLayout,
    source_logo_dir: Path | None,
) -> None:
    output_path = OUTPUT_DIR / f"pressespiegel_{job_id}.pdf"
    cancel_event = threading.Event()

    def status_callback(message: str) -> None:
        update_job(job_id, status_text=message)

    def progress_callback(value: float) -> None:
        update_job(job_id, progress=max(0, min(100, round(value, 1))))

    def log_callback(message: str) -> None:
        append_job_log(job_id, message)

    try:
        update_job(job_id, state="running", status_text="Verarbeitung gestartet")
        summary = asyncio.run(
            core_build_pressespiegel(
                urls,
                sections,
                output_path,
                layout,
                source_logo_dir,
                status_callback,
                progress_callback,
                log_callback,
                cancel_event,
            )
        )
        successful = len(summary.successful_articles)
        failed = len(summary.failed_articles)
        if summary.cancelled:
            update_job(job_id, state="cancelled", status_text="Abgebrochen", progress=0)
        elif successful == 0:
            update_job(job_id, state="failed", status_text="Keine Artikel konnten verarbeitet werden", progress=100)
        else:
            update_job(
                job_id,
                state="finished",
                status_text=f"Fertig: {successful} Artikel, {failed} Fehler",
                progress=100,
                download_url=f"/jobs/{job_id}/download",
                summary={
                    "successful": successful,
                    "failed": failed,
                    "articles": [article_to_dict(article) for article in summary.articles],
                },
            )
    except Exception as exc:
        update_job(job_id, state="failed", status_text=str(exc), progress=100)
        append_job_log(job_id, f"Fehler: {exc}")


@app.get("/")
def dashboard():
    return render_template("dashboard.html")


@app.get("/trello")
def trello_tool():
    return render_template("trello.html")


@app.get("/teilnahmebedingungen")
def participation_tool():
    return render_template("teilnahmebedingungen.html")


@app.get("/aufgabenverwaltung")
def task_management_tool():
    return render_template("aufgabenverwaltung.html")


@app.get("/pressespiegel")
def index():
    ensure_instance_dirs()
    _custom_fonts, layouts = load_layout_state()
    return render_template(
        "index.html",
        layouts=layouts,
        layouts_json=layout_payload(layouts),
        fonts=sorted(PDF_FONT_FAMILIES),
        default_layout=layouts[0],
    )


@app.post("/jobs")
def create_job():
    ensure_instance_dirs()
    _custom_fonts, layouts = load_layout_state()
    try:
        sections, section_errors = parse_sections_from_form()
        fallback_urls, fallback_errors = parse_fallback_urls()
        urls = [] if sections else fallback_urls
        if not sections and not urls:
            return jsonify({"error": "Bitte füge mindestens eine gültige Artikel-URL ein."}), 400

        layout, extra = build_layout_from_form(layouts)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    job_id = uuid.uuid4().hex
    source_logo_dir, source_logo_errors = save_source_logo_uploads(job_id)
    with JOBS_LOCK:
        JOBS[job_id] = {
            "id": job_id,
            "state": "queued",
            "progress": 0,
            "status_text": "Wartet auf Verarbeitung",
            "logs": [],
            "download_url": None,
            "summary": None,
            "input_errors": section_errors + fallback_errors + source_logo_errors,
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "layout": layout.name,
            "source_logo_dir": str(source_logo_dir) if source_logo_dir else None,
            **extra,
        }
        save_job_state("pressespiegel", job_id, JOBS[job_id])

    thread = threading.Thread(target=run_job, args=(job_id, urls, sections, layout, source_logo_dir), daemon=True)
    thread.start()
    return jsonify({"job_id": job_id, "status_url": url_for("job_status", job_id=job_id)})


def run_trello_job(job_id: str, action: str) -> None:
    action_config = TRELLO_ACTIONS[action]
    script_path = TRELLO_DIR / action_config["script"]
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"
    creationflags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0

    try:
        update_trello_job(job_id, state="running", status_text=action_config["status"])
        append_trello_job_log(job_id, f"Starte {action_config['label']} ...")
        process = subprocess.Popen(
            [sys.executable, "-u", str(script_path)],
            cwd=TRELLO_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            creationflags=creationflags,
        )

        assert process.stdout is not None
        for line in process.stdout:
            append_trello_job_log(job_id, line.rstrip())

        return_code = process.wait()
        if return_code == 0:
            update_trello_job(job_id, state="finished", status_text="Fertig", progress=100)
        else:
            update_trello_job(
                job_id,
                state="failed",
                status_text=f"Fehlgeschlagen mit Exit-Code {return_code}",
                progress=100,
            )
    except Exception as exc:
        update_trello_job(job_id, state="failed", status_text=str(exc), progress=100)
        append_trello_job_log(job_id, f"Fehler: {exc}")


@app.post("/trello/jobs")
def create_trello_job():
    action = request.form.get("action")
    if not action and request.is_json:
        payload = request.get_json(silent=True) or {}
        action = payload.get("action")
    if action not in TRELLO_ACTIONS:
        return jsonify({"error": "Unbekannte Trello-Aktion."}), 400

    job_id = uuid.uuid4().hex
    action_config = TRELLO_ACTIONS[action]
    with TRELLO_JOBS_LOCK:
        TRELLO_JOBS[job_id] = {
            "id": job_id,
            "action": action,
            "label": action_config["label"],
            "state": "queued",
            "progress": 0,
            "status_text": "Wartet auf Ausführung",
            "logs": [],
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        save_job_state("trello", job_id, TRELLO_JOBS[job_id])

    thread = threading.Thread(target=run_trello_job, args=(job_id, action), daemon=True)
    thread.start()
    return jsonify({"job_id": job_id, "status_url": url_for("trello_job_status", job_id=job_id)})


@app.get("/trello/jobs/<job_id>")
def trello_job_status(job_id: str):
    with TRELLO_JOBS_LOCK:
        job = TRELLO_JOBS.get(job_id)
        if job is None:
            job = load_job_state("trello", job_id)
            if job is None:
                return jsonify({"error": "Job nicht gefunden."}), 404
            TRELLO_JOBS[job_id] = job
        return jsonify(job)


def run_participation_job(job_id: str, payload: dict[str, str]) -> None:
    job_dir = PARTICIPATION_OUTPUT_DIR / job_id
    zip_path = job_dir / "Teilnahmebedingungen.zip"

    try:
        update_participation_job(job_id, state="running", status_text="Dokumente werden erstellt", progress=20)
        append_participation_job_log(job_id, "Starte Dokumentenerstellung ...")
        module = load_participation_module()
        result = module.generate_participation_documents(
            club_name=payload["club_name"],
            opponent=payload["opponent"],
            game_day=payload["game_day"],
            output_dir=job_dir,
            question=payload.get("question") or None,
            caption=payload.get("caption") or None,
        )

        update_participation_job(job_id, status_text="ZIP wird vorbereitet", progress=82)
        append_participation_job_log(job_id, f"Erstellt: {result.terms_path.name}")
        append_participation_job_log(job_id, f"Erstellt: {result.caption_path.name}")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(result.terms_path, result.terms_path.name)
            archive.write(result.caption_path, result.caption_path.name)

        update_participation_job(
            job_id,
            state="finished",
            status_text="Fertig",
            progress=100,
            download_url=f"/teilnahmebedingungen/jobs/{job_id}/download",
            summary={
                "question": result.question,
                "caption": result.caption,
                "files": [result.terms_path.name, result.caption_path.name],
            },
        )
        append_participation_job_log(job_id, "Download ist bereit.")
    except Exception as exc:
        update_participation_job(job_id, state="failed", status_text=str(exc), progress=100)
        append_participation_job_log(job_id, f"Fehler: {exc}")


@app.post("/teilnahmebedingungen/jobs")
def create_participation_job():
    ensure_instance_dirs()
    payload = request.form.to_dict()
    if request.is_json:
        payload.update(request.get_json(silent=True) or {})

    club_name = (payload.get("club_name") or "").strip()
    opponent = (payload.get("opponent") or "").strip()
    game_day = (payload.get("game_day") or "").strip()
    question = (payload.get("question") or "").strip()
    caption = (payload.get("caption") or "").strip()

    if not club_name:
        return jsonify({"error": "Bitte gib einen Verein an."}), 400
    if not opponent:
        return jsonify({"error": "Bitte gib einen Gegner an."}), 400
    if not game_day:
        return jsonify({"error": "Bitte gib ein Spieldatum an."}), 400

    job_id = uuid.uuid4().hex
    with PARTICIPATION_JOBS_LOCK:
        PARTICIPATION_JOBS[job_id] = {
            "id": job_id,
            "state": "queued",
            "progress": 0,
            "status_text": "Wartet auf Ausführung",
            "logs": [],
            "download_url": None,
            "summary": None,
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
        save_job_state("teilnahmebedingungen", job_id, PARTICIPATION_JOBS[job_id])

    thread_payload = {
        "club_name": club_name,
        "opponent": opponent,
        "game_day": game_day,
        "question": question,
        "caption": caption,
    }
    thread = threading.Thread(target=run_participation_job, args=(job_id, thread_payload), daemon=True)
    thread.start()
    return jsonify({"job_id": job_id, "status_url": url_for("participation_job_status", job_id=job_id)})


@app.get("/teilnahmebedingungen/jobs/<job_id>")
def participation_job_status(job_id: str):
    with PARTICIPATION_JOBS_LOCK:
        job = PARTICIPATION_JOBS.get(job_id)
        if job is None:
            job = load_job_state("teilnahmebedingungen", job_id)
            if job is None:
                return jsonify({"error": "Job nicht gefunden."}), 404
            PARTICIPATION_JOBS[job_id] = job
        return jsonify(job)


@app.get("/teilnahmebedingungen/jobs/<job_id>/download")
def download_participation_documents(job_id: str):
    zip_path = PARTICIPATION_OUTPUT_DIR / job_id / "Teilnahmebedingungen.zip"
    if not zip_path.exists():
        return redirect(url_for("participation_tool"))
    return send_file(zip_path, as_attachment=True, download_name="Teilnahmebedingungen.zip", mimetype="application/zip")


@app.get("/jobs/<job_id>")
def job_status(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is None:
            job = load_job_state("pressespiegel", job_id)
            if job is None:
                return jsonify({"error": "Job nicht gefunden."}), 404
            JOBS[job_id] = job
        return jsonify(job)


@app.get("/jobs/<job_id>/download")
def download_pdf(job_id: str):
    output_path = OUTPUT_DIR / f"pressespiegel_{job_id}.pdf"
    if not output_path.exists():
        return redirect(url_for("index"))
    return send_file(output_path, as_attachment=True, download_name="pressespiegel.pdf", mimetype="application/pdf")


if __name__ == "__main__":
    ensure_instance_dirs()
    app.run(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
