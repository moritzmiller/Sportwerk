from __future__ import annotations

import unittest

from Trello import assigned


class TrelloAssignedTests(unittest.TestCase):
    def test_extract_source_card_id_finds_marker(self) -> None:
        description = "Vorheriger Text\nSportwerk-Source-Card-ID: abc123\nWeitere Zeile"

        self.assertEqual(assigned.extract_source_card_id(description), "abc123")

    def test_existing_source_index_uses_marker(self) -> None:
        cards = [
            {"id": "copy-1", "desc": "Sportwerk-Source-Card-ID: source-1"},
            {"id": "copy-2", "desc": "Ohne Marker"},
        ]

        self.assertEqual(assigned.build_existing_source_index(cards), {"source-1": cards[0]})

    def test_overdue_card_due_goes_to_overdue(self) -> None:
        list_name = assigned.build_list_name(
            {"name": "Board A"},
            {"name": "Doing"},
            {"due": "2026-09-01T08:00:00.000Z", "dueComplete": False},
            now=assigned.parse_trello_datetime("2026-09-02T08:00:00.000Z"),
        )

        self.assertEqual(list_name, "over due")

    def test_current_week_card_due_goes_to_this_week(self) -> None:
        list_name = assigned.build_list_name(
            {"name": "Board A"},
            {"name": "Doing"},
            {"due": "2026-09-04T08:00:00.000Z", "dueComplete": False},
            now=assigned.parse_trello_datetime("2026-09-02T08:00:00.000Z"),
        )

        self.assertEqual(list_name, "Diese Woche")

    def test_current_week_checklist_due_goes_to_this_week(self) -> None:
        list_name = assigned.build_list_name(
            {"name": "Board A"},
            {"name": "Doing"},
            {
                "checklists": [
                    {
                        "checkItems": [
                            {"name": "Freigabe", "state": "incomplete", "due": "2026-09-06T08:00:00.000Z"}
                        ]
                    }
                ]
            },
            now=assigned.parse_trello_datetime("2026-09-02T08:00:00.000Z"),
        )

        self.assertEqual(list_name, "Diese Woche")

    def test_completed_due_dates_are_ignored(self) -> None:
        list_name = assigned.build_list_name(
            {"name": "Kundenprojekte"},
            {"name": "Doing"},
            {
                "due": "2026-09-01T08:00:00.000Z",
                "dueComplete": True,
                "checklists": [
                    {
                        "checkItems": [
                            {"name": "Freigabe", "state": "complete", "due": "2026-09-01T08:00:00.000Z"}
                        ]
                    }
                ],
            },
            now=assigned.parse_trello_datetime("2026-09-02T08:00:00.000Z"),
        )

        self.assertEqual(list_name, "Kundenprojekte")

    def test_cards_without_relevant_due_date_use_board_name(self) -> None:
        list_name = assigned.build_list_name(
            {"name": "Kundenprojekte"},
            {"name": "Doing"},
            {"labels": []},
            now=assigned.parse_trello_datetime("2026-09-02T08:00:00.000Z"),
        )

        self.assertEqual(list_name, "Kundenprojekte")

    def test_due_bucket_handles_missing_due_date(self) -> None:
        self.assertEqual(assigned.build_due_bucket(None), "Ohne Faelligkeit")


if __name__ == "__main__":
    unittest.main()
