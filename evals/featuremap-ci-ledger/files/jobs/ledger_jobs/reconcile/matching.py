from ledger_jobs.common.money import to_cents
from ledger_jobs.common.reconcile_window import window

from .rules import same_amount


def match(entries, bank_lines):
    pairs, left = [], list(bank_lines)
    for entry in entries:
        start, end = window(entry["posted_on"])
        for line in left:
            if start <= line["date"] <= end and same_amount(entry["cents"], to_cents(line["amount"])):
                pairs.append((entry, line))
                left.remove(line)
                break
    return pairs


def unmatched(entries, bank_lines):
    paired = {id(entry) for entry, _ in match(entries, bank_lines)}
    return [entry for entry in entries if id(entry) not in paired]
