from db.models import Order


def orders():
    return [Order(1, 1250).__dict__]
