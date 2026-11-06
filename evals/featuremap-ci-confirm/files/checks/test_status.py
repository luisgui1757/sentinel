import unittest

from components.console.status import status


class StatusTest(unittest.TestCase):
    def test_status(self):
        self.assertEqual(status(), 11)
