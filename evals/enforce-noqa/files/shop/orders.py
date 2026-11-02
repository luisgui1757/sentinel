def total(items):
    return sum(item["qty"] * item["price"] for item in items)
