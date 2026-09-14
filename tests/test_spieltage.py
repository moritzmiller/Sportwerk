from __future__ import annotations

import unittest

from Spieltage import spieltage


class SpieltageTests(unittest.TestCase):
    def test_normalize_row_text_repairs_common_mojibake(self) -> None:
        text = (
            "BSG Chemie Leipzig "
            "\u00c3\u00a2\u00c2\u20ac\u00c2\u201d "
            "Ausw\u00c3\u00a4rts\u00a0 2:1"
        )

        self.assertEqual(
            spieltage.normalize_row_text(text),
            "BSG Chemie Leipzig \u2014 Ausw\u00e4rts 2:1",
        )

    def test_import_does_not_fetch_schedule(self) -> None:
        self.assertTrue(callable(spieltage.fetch_schedule_rows))


if __name__ == "__main__":
    unittest.main()
