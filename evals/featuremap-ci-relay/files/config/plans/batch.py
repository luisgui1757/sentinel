from config.catalog.limits import MAX_BATCH


def batch_size():
    return MAX_BATCH // 2
