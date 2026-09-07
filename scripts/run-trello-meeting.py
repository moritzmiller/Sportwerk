from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_ENV_VARS = ("TRELLO_API_KEY", "TRELLO_TOKEN")


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


def missing_required_env_vars() -> list[str]:
    return [name for name in REQUIRED_ENV_VARS if not os.environ.get(name)]


def run_trello_meeting() -> object:
    sys.path.insert(0, str(ROOT))
    from Trello.main import trello_meeting

    return trello_meeting()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the Sportwerk Trello meeting tool for scheduled jobs.",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=ROOT / ".env",
        help="Path to the environment file. Defaults to .env in the project root.",
    )
    parser.add_argument(
        "--check-config",
        action="store_true",
        help="Only verify required Trello configuration and exit.",
    )
    args = parser.parse_args(argv)

    load_env_file(args.env_file)
    missing = missing_required_env_vars()
    if missing:
        print(
            "Missing required environment variables: " + ", ".join(missing),
            file=sys.stderr,
        )
        return 2

    if args.check_config:
        print("Trello meeting configuration is present.")
        return 0

    try:
        result = run_trello_meeting()
    except Exception as error:
        print(
            f"Trello meeting run failed: {type(error).__name__}: {error}",
            file=sys.stderr,
        )
        return 1

    if result is not None:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("Trello meeting run completed successfully.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
