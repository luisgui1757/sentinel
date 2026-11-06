from . import billing
from .settings import CURRENCY
from ...shared.money import cents


def usage(meter_id, kwh, price):
    amount = cents(kwh * price)
    return {"meter": meter_id, "currency": CURRENCY, "line": billing.invoice_line(amount)}
