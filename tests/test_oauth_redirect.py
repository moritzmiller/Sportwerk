from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app as sportwerk_entrypoint  # noqa: E402
import web_app  # noqa: E402


class GoogleRedirectUriTests(unittest.TestCase):
    def setUp(self) -> None:
        self.original_get_env_value = web_app.get_env_value

    def tearDown(self) -> None:
        web_app.get_env_value = self.original_get_env_value

    def configure_redirect_uri(self, redirect_uri: str) -> None:
        def fake_get_env_value(name: str, default: str = "") -> str:
            if name == "GOOGLE_OAUTH_REDIRECT_URI":
                return redirect_uri
            return self.original_get_env_value(name, default)

        web_app.get_env_value = fake_get_env_value

    def test_mismatched_loopback_redirect_uses_current_request_url(self) -> None:
        self.configure_redirect_uri("http://127.0.0.1:5000//auth/google/callback")

        with sportwerk_entrypoint.app.test_request_context(
            "/auth/google",
            base_url="http://127.0.0.1:8000",
        ):
            self.assertEqual(
                web_app.get_google_redirect_uri(),
                "http://127.0.0.1:8000/auth/google/callback",
            )

    def test_matching_loopback_redirect_is_kept(self) -> None:
        self.configure_redirect_uri("http://127.0.0.1:8000/auth/google/callback")

        with sportwerk_entrypoint.app.test_request_context(
            "/auth/google",
            base_url="http://127.0.0.1:8000",
        ):
            self.assertEqual(
                web_app.get_google_redirect_uri(),
                "http://127.0.0.1:8000/auth/google/callback",
            )

    def test_public_request_ignores_configured_loopback_redirect(self) -> None:
        self.configure_redirect_uri("http://127.0.0.1:8000/auth/google/callback")

        with sportwerk_entrypoint.app.test_request_context(
            "/auth/google",
            base_url="https://sportwerk.example",
        ):
            self.assertEqual(
                web_app.get_google_redirect_uri(),
                "https://sportwerk.example/auth/google/callback",
            )

    def test_public_redirect_uri_is_kept(self) -> None:
        self.configure_redirect_uri("https://sportwerk.example/auth/google/callback")

        with sportwerk_entrypoint.app.test_request_context(
            "/auth/google",
            base_url="http://127.0.0.1:8000",
        ):
            self.assertEqual(
                web_app.get_google_redirect_uri(),
                "https://sportwerk.example/auth/google/callback",
            )


if __name__ == "__main__":
    unittest.main()
