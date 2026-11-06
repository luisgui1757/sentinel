PAGE_WIDTH = 72


def row(label, value):
    return f"{label}{value:>{PAGE_WIDTH - len(label)}}"
