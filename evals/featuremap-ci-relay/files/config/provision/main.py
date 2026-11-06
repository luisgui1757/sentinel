from config.plans.batch import batch_size
from config.catalog.defaults import default_region


def manifest():
    return {"region": default_region(), "batch": batch_size()}


if __name__ == "__main__":
    assert manifest() == {"region": "eu", "batch": 64}
