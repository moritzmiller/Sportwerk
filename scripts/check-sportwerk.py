from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "static"
COMPILED_DIR = STATIC_DIR / "compiled"
ROUTES = ["/", "/pressespiegel", "/trello", "/teilnahmebedingungen", "/aufgabenverwaltung"]
JSX_ENTRIES = ["dashboard", "trello", "teilnahmebedingungen", "aufgabenverwaltung"]


def load_env_file(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def ok(message: str) -> None:
    print(f"[OK] {message}")


def warn(message: str) -> None:
    print(f"[WARN] {message}")


def fail(message: str) -> None:
    print(f"[ERROR] {message}")


def get_env_value(name: str) -> str:
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

    return ""


def check_required_paths() -> bool:
    required_paths = [
        ROOT / "templates",
        STATIC_DIR,
        ROOT / "app.py",
        ROOT / "requirements.txt",
        STATIC_DIR / "vendor" / "react.production.min.js",
        STATIC_DIR / "vendor" / "react-dom.production.min.js",
    ]
    success = True
    for path in required_paths:
        if path.exists():
            ok(f"Found {path.relative_to(ROOT)}")
        else:
            fail(f"Missing {path.relative_to(ROOT)}")
            success = False
    return success


def check_compiled_assets() -> bool:
    success = True
    for entry in JSX_ENTRIES:
        source = STATIC_DIR / f"{entry}.jsx"
        compiled = COMPILED_DIR / f"{entry}.js"
        if not source.exists():
            fail(f"Missing {source.relative_to(ROOT)}")
            success = False
            continue
        if not compiled.exists():
            fail(f"Missing {compiled.relative_to(ROOT)}; run node scripts/build-jsx.js")
            success = False
            continue
        if compiled.stat().st_mtime + 0.5 < source.stat().st_mtime:
            fail(f"{compiled.relative_to(ROOT)} is older than {source.relative_to(ROOT)}")
            success = False
        else:
            ok(f"{compiled.relative_to(ROOT)} is current")
    return success


def check_auth_env() -> None:
    if get_env_value("SPORTWERK_SECRET_KEY"):
        ok("SPORTWERK_SECRET_KEY is set")
    else:
        warn("SPORTWERK_SECRET_KEY is not set; Flask will create an ephemeral local secret")

    google_vars = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]
    missing_google_vars = [name for name in google_vars if not get_env_value(name)]
    if missing_google_vars:
        warn("Google OAuth is incomplete: " + ", ".join(missing_google_vars))
    else:
        ok("Google OAuth client variables are set")

    redirect_uri = get_env_value("GOOGLE_OAUTH_REDIRECT_URI")
    if redirect_uri:
        ok(f"Google OAuth redirect URI: {redirect_uri}")
        parsed_redirect_uri = urlparse(redirect_uri)
        if not parsed_redirect_uri.scheme or not parsed_redirect_uri.netloc:
            warn("GOOGLE_OAUTH_REDIRECT_URI is not an absolute URL.")
        if parsed_redirect_uri.path != "/auth/google/callback":
            warn(
                "GOOGLE_OAUTH_REDIRECT_URI should end exactly with /auth/google/callback. "
                f"Current path is {parsed_redirect_uri.path!r}."
            )
        if parsed_redirect_uri.hostname in {"127.0.0.1", "localhost", "::1"}:
            warn(
                "Google OAuth redirect URI points to localhost. "
                "This only works if the app is opened on the same localhost URL "
                "and Google Cloud has this exact URI in Authorized redirect URIs."
            )
            warn(
                "Sportwerk ignores this loopback URI for public request hosts and derives "
                "the callback from the incoming host/proto headers. Make sure the reverse "
                "proxy forwards Host and X-Forwarded-Proto correctly."
            )
    else:
        warn(
            "GOOGLE_OAUTH_REDIRECT_URI is not set; Flask will derive it from the request. "
            "Behind a proxy this must preserve the public host and HTTPS scheme."
        )


def check_flask_routes() -> bool:
    sys.path.insert(0, str(ROOT))
    try:
        from app import app
    except Exception as exc:
        fail(f"Flask app import failed: {exc}")
        return False

    with app.test_client() as client:
        with client.session_transaction() as session:
            session["user"] = {"name": "Readiness Check", "email": "check@sportwerk.local"}

        for route in ROUTES:
            response = client.get(route)
            if response.status_code != 200:
                fail(f"GET {route} returned {response.status_code}")
                return False
            ok(f"GET {route} returned 200")
    return True


def main() -> int:
    load_env_file()
    print("Sportwerk readiness check")
    checks = [
        check_required_paths(),
        check_compiled_assets(),
    ]
    check_auth_env()
    checks.append(check_flask_routes())

    if all(checks):
        ok("Sportwerk local readiness checks passed")
        return 0
    fail("Sportwerk readiness checks failed")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
