from decimal import ROUND_HALF_EVEN, Decimal


def to_cents(amount):
    return int((Decimal(str(amount)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_EVEN))


def format_cents(cents, currency):
    return f"{cents / 100:,.2f} {currency}"
