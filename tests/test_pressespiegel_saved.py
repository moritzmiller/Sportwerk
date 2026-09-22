from __future__ import annotations

import sys
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app as sportwerk_entrypoint  # noqa: E402
import web_app  # noqa: E402


class SavedPressespiegelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_saved_path = web_app.SAVED_PRESSESPIEGEL_PATH
        self.original_job_state_dir = web_app.JOB_STATE_DIR
        web_app.SAVED_PRESSESPIEGEL_PATH = Path(self.temp_dir.name) / "saved.json"
        web_app.JOB_STATE_DIR = Path(self.temp_dir.name) / "job-state"
        self.client = sportwerk_entrypoint.app.test_client()
        with self.client.session_transaction() as session:
            session["user"] = {"name": "Test", "email": "test@sportwerk.local"}

    def tearDown(self) -> None:
        web_app.SAVED_PRESSESPIEGEL_PATH = self.original_saved_path
        web_app.JOB_STATE_DIR = self.original_job_state_dir
        self.temp_dir.cleanup()

    def test_saved_pressespiegel_can_be_loaded_updated_and_deleted(self) -> None:
        payload = {
            "name": "Wochenrueckblick KW 36",
            "sections": [
                {
                    "heading": "Regionale Presse",
                    "urls": ["example.com/artikel-1", "https://example.com/artikel-2"],
                }
            ],
            "fallback_urls": [],
            "layout": {
                "layout_id": "sportwerk",
                "title_text": "PRESSESPIEGEL KW 36",
                "accent_hex": "#e97821",
            },
        }

        create_response = self.client.post("/pressespiegel/saved", json=payload)
        self.assertEqual(create_response.status_code, 200)
        created = create_response.get_json()["item"]
        saved_id = created["id"]
        self.assertEqual(created["sections"][0]["urls"][0], "https://example.com/artikel-1")

        list_response = self.client.get("/pressespiegel/saved")
        self.assertEqual(list_response.status_code, 200)
        summaries = list_response.get_json()["items"]
        self.assertEqual(summaries[0]["id"], saved_id)
        self.assertEqual(summaries[0]["url_count"], 2)

        payload["id"] = saved_id
        payload["sections"][0]["urls"].append("https://example.com/artikel-3")
        update_response = self.client.post("/pressespiegel/saved", json=payload)
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.get_json()["summary"]["url_count"], 3)

        get_response = self.client.get(f"/pressespiegel/saved/{saved_id}")
        self.assertEqual(get_response.status_code, 200)
        loaded = get_response.get_json()["item"]
        self.assertEqual(loaded["name"], "Wochenrueckblick KW 36")
        self.assertEqual(len(loaded["sections"][0]["urls"]), 3)

        delete_response = self.client.delete(f"/pressespiegel/saved/{saved_id}")
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(self.client.get("/pressespiegel/saved").get_json()["items"], [])

    def test_saved_pressespiegel_rejects_empty_payload(self) -> None:
        response = self.client.post(
            "/pressespiegel/saved",
            json={"name": "Leer", "sections": [], "fallback_urls": []},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Artikel-URL", response.get_json()["error"])

    def test_saved_pressespiegel_load_migrates_google_redirect_urls(self) -> None:
        google_url = (
            "https://www.google.com/url?"
            "q=https://www.vfb.de/de/vfb/aktuell/neues/verein/2026/cannstatt-singt/"
            "&source=gmail&ust=1790149233261000&usg=example"
        )
        direct_url = "https://www.vfb.de/de/vfb/aktuell/neues/verein/2026/cannstatt-singt/"
        web_app.SAVED_PRESSESPIEGEL_PATH.write_text(
            json.dumps(
                {
                    "items": [
                        {
                            "id": "saved-id",
                            "name": "Cannstatt singt",
                            "sections": [{"heading": "Regionale Presse", "urls": [google_url, direct_url]}],
                            "fallback_urls": [],
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )

        items = web_app.load_saved_pressespiegel_items()

        expected_url = "https://www.vfb.de/de/vfb/aktuell/neues/verein/2026/cannstatt-singt/"
        self.assertEqual(items[0]["sections"][0]["urls"], [expected_url, expected_url])
        self.assertEqual(web_app.saved_pressespiegel_url_count(items[0]), 2)
        saved_payload = json.loads(web_app.SAVED_PRESSESPIEGEL_PATH.read_text(encoding="utf-8"))
        self.assertEqual(saved_payload["items"][0]["sections"][0]["urls"], [expected_url, expected_url])

    def test_pressespiegel_job_state_load_migrates_summary_urls(self) -> None:
        google_url = (
            "https://www.google.de/url?"
            "q=https%3A%2F%2Fwww.vfb.de%2Fde%2Fartikel%2F&sa=U&ved=example"
        )
        web_app.save_job_state(
            "pressespiegel",
            "job-id",
            {
                "id": "job-id",
                "summary": {
                    "articles": [
                        {
                            "url": google_url,
                            "title": "Cannstatt singt",
                            "successful": True,
                        }
                    ]
                },
            },
        )

        job = web_app.load_job_state("pressespiegel", "job-id")

        self.assertIsNotNone(job)
        expected_url = "https://www.vfb.de/de/artikel/"
        self.assertEqual(job["summary"]["articles"][0]["url"], expected_url)
        saved_job = json.loads(web_app.job_state_path("pressespiegel", "job-id").read_text(encoding="utf-8"))
        self.assertEqual(saved_job["summary"]["articles"][0]["url"], expected_url)


if __name__ == "__main__":
    unittest.main()
