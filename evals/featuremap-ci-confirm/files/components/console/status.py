from ..planner.run import run
from ..kernel.values import UNIT


def status():
    return run(UNIT)
