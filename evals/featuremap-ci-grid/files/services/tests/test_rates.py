import unittest

from services.api.app.routes import usage
from services.billing.tariff.rates import price, tax


class RatesTest(unittest.TestCase):
    def test_price(self):
        self.assertEqual(price(10, True), 3.1)

    def test_tax(self):
        self.assertEqual(tax(10), 2.0)

    def test_usage(self):
        self.assertEqual(usage("m1", 2, 0.5)["line"]["tax"], 0.2)


if __name__ == "__main__":
    unittest.main()
