from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRESS_DIR = ROOT / "Pressespiegel"
STATIC_DIR = ROOT / "static"
COMPILED_DIR = STATIC_DIR / "compiled"
ROUTES = ["/", "/pressespiegel", "/trello", "/teilnahmebedingungen", "/aufgabenverwaltung"]
JSX_ENTRIES = ["dashboard", "trello", "teilnahmebedingungen", "aufgabenverwaltung"]


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
        PRESS_DIR / "web_app.py",
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


def check_flask_routes() -> bool:
    sys.path.insert(0, str(PRESS_DIR))
    try:
        from web_app import app
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
