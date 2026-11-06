from services.billing.tariff.rates import tax


def invoice_line(amount):
    return {"amount": amount, "tax": tax(amount)}
