from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app as sportwerk_entrypoint  # noqa: E402
import web_app  # noqa: E402


class LocalAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_get_env_value = web_app.get_env_value
        self.client = sportwerk_entrypoint.app.test_client()

    def tearDown(self) -> None:
        web_app.get_env_value = self.original_get_env_value

    def configure_env(self, values: dict[str, str]) -> None:
        def fake_get_env_value(name: str, default: str = "") -> str:
            if name in values:
                return values[name]
            return self.original_get_env_value(name, default)

        web_app.get_env_value = fake_get_env_value

    def test_local_auth_allows_loopback_dashboard_without_google(self) -> None:
        self.configure_env(
            {
                "SPORTWERK_LOCAL_AUTH": "1",
                "SPORTWERK_LOCAL_AUTH_EMAIL": "dev@sportwerk.test",
                "SPORTWERK_LOCAL_AUTH_NAME": "Dev User",
            }
        )

        response = self.client.get("/", base_url="http://127.0.0.1:5000")

        self.assertEqual(response.status_code, 200)
        with self.client.session_transaction(base_url="http://127.0.0.1:5000") as session:
            self.assertEqual(session["user"]["email"], "dev@sportwerk.test")
            self.assertEqual(session["auth_method"], "local")

    def test_local_auth_flag_does_not_bypass_public_host(self) -> None:
        self.configure_env({"SPORTWERK_LOCAL_AUTH": "1"})

        response = self.client.get("/", base_url="https://sportwerk.example")

        self.assertEqual(response.status_code, 302)
        self.assertIn("/login", response.headers["Location"])


if __name__ == "__main__":
    unittest.main()
