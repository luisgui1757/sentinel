from ...shared.money import cents
from ... import api

PEAK = 0.31
OFF_PEAK = 0.18


def price(kwh, peak):
    return cents(kwh * (PEAK if peak else OFF_PEAK))


def tax(amount):
    return cents(amount * api.TAX_RATE)
