import unittest

from tally import summarize


class SummarizeTest(unittest.TestCase):
    def test_adds_hours_per_project(self):
        rows = [{"project": "web", "hours": "1.5"}, {"project": "web", "hours": "2"}]
        self.assertEqual(summarize(rows), {"web": 3.5})


if __name__ == "__main__":
    unittest.main()
