from pipeline.common.log import log
from pipeline.tiles.cut import cut

from .formats import FORMAT


def bundle(width, height):
    names = cut(width, height)
    log.info("bundle %d tiles as %s", len(names), FORMAT)
    return {"format": FORMAT, "tiles": names}
