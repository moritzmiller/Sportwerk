from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRESS_DIR = ROOT / "Pressespiegel"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Sportwerk Flask app locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    sys.path.insert(0, str(PRESS_DIR))
    from web_app import app, ensure_instance_dirs

    ensure_instance_dirs()
    app.run(host=args.host, port=args.port, debug=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
