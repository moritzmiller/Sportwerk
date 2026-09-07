from __future__ import annotations

import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = ROOT / "scripts" / "run-trello-meeting.py"


def load_runner_module():
    spec = importlib.util.spec_from_file_location(
        "run_trello_meeting",
        RUNNER_PATH,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class TrelloMeetingRunnerTests(unittest.TestCase):
    def setUp(self):
        self.runner = load_runner_module()

    def test_check_config_requires_trello_credentials(self):
        env = {
            key: value
            for key, value in os.environ.items()
            if key not in {"TRELLO_API_KEY", "TRELLO_TOKEN"}
        }

        with patch.dict(os.environ, env, clear=True):
            result = self.runner.main(
                ["--check-config", "--env-file", str(ROOT / ".env.missing")]
            )

        self.assertEqual(result, 2)

    def test_check_config_does_not_run_trello_tool(self):
        with patch.dict(
            os.environ,
            {
                "TRELLO_API_KEY": "test-key",
                "TRELLO_TOKEN": "test-token",
            },
            clear=True,
        ):
            with patch.object(self.runner, "run_trello_meeting") as run_tool:
                result = self.runner.main(
                    ["--check-config", "--env-file", str(ROOT / ".env.missing")]
                )

        self.assertEqual(result, 0)
        run_tool.assert_not_called()


if __name__ == "__main__":
    unittest.main()
