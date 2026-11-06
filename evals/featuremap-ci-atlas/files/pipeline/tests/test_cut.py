import unittest

from pipeline.export.bundle import bundle
from pipeline.tiles.cut import cut


class CutTest(unittest.TestCase):
    def test_cut(self):
        self.assertEqual(cut(512, 256), ["0_0.pbf", "256_0.pbf"])

    def test_bundle(self):
        self.assertEqual(bundle(256, 256)["tiles"], ["0_0.pbf"])


if __name__ == "__main__":
    unittest.main()
