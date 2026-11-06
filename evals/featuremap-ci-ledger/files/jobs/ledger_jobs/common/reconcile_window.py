from datetime import timedelta

SETTLEMENT_DAYS = 3


def window(posted_on):
    return posted_on - timedelta(days=SETTLEMENT_DAYS), posted_on + timedelta(days=SETTLEMENT_DAYS)
