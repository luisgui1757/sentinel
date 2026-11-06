from ledger_jobs.common.money import format_cents
from ledger_jobs.reconcile.matching import unmatched

from . import layout


def render(account, entries, bank_lines):
    lines = [f"Statement for {account['id']}"]
    for entry in entries:
        lines.append(layout.row(entry["memo"], format_cents(entry["cents"], account["currency"])))
    open_items = unmatched(entries, bank_lines)
    if open_items:
        lines.append(layout.row("Open items", str(len(open_items))))
    return "\n".join(lines)
