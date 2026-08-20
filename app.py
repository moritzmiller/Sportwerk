from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PRESS_DIR = ROOT / "Pressespiegel"


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
        if key and value and not os.environ.get(key):
            os.environ[key] = value


load_env_file()

if str(PRESS_DIR) not in sys.path:
    sys.path.insert(0, str(PRESS_DIR))

from web_app import app, ensure_instance_dirs  # noqa: E402


def main() -> int:
    ensure_instance_dirs()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=os.environ.get("FLASK_DEBUG") == "1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
