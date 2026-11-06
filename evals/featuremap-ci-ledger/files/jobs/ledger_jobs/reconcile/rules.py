TOLERANCE_CENTS = 1


def same_amount(a, b):
    return abs(a - b) <= TOLERANCE_CENTS
