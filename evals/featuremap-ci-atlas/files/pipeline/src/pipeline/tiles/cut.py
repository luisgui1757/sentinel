from pipeline.common.log import log
from pipeline.export.formats import EXTENSION

TILE_SIZE = 256


def cut(width, height):
    tiles = [(x, y) for x in range(0, width, TILE_SIZE) for y in range(0, height, TILE_SIZE)]
    log.debug("cut %d tiles", len(tiles))
    return [f"{x}_{y}{EXTENSION}" for x, y in tiles]
