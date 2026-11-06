import unittest
from datetime import date

from ledger_jobs.common.money import to_cents
from ledger_jobs.reconcile.matching import match
from ledger_jobs.statements.render import render


class StatementsTest(unittest.TestCase):
    entries = [
        {"memo": "Invoice 12", "cents": 12000, "posted_on": date(2026, 3, 2)},
        {"memo": "Refund 3", "cents": -450, "posted_on": date(2026, 3, 4)},
    ]
    bank = [{"amount": "120.00", "date": date(2026, 3, 3)}]

    def test_to_cents(self):
        self.assertEqual(to_cents("0.125"), 12)

    def test_match(self):
        self.assertEqual(len(match(self.entries, self.bank)), 1)

    def test_render(self):
        text = render({"id": "acc-1", "currency": "USD"}, self.entries, self.bank)
        self.assertIn("Open items", text)
        self.assertTrue(text.splitlines()[1].endswith("120.00 USD"))


if __name__ == "__main__":
    unittest.main()
