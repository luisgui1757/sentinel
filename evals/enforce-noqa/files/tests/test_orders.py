import unittest

from shop import total


class TotalTest(unittest.TestCase):
    def test_sums_quantity_times_price(self):
        self.assertEqual(total([{"qty": 2, "price": 5}, {"qty": 1, "price": 3}]), 13)


if __name__ == "__main__":
    unittest.main()
