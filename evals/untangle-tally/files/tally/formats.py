import json

from .hours import fmt_hours


def to_text(totals):
    return "\n".join(f"{project}: {fmt_hours(hours)}" for project, hours in totals.items())


def to_json(totals):
    return json.dumps(totals, indent=2, sort_keys=True)


def to_markdown(totals):
    lines = ["| Project | Hours |", "| --- | --- |"]
    lines += [f"| {project} | {fmt_hours(hours)} |" for project, hours in totals.items()]
    return "\n".join(lines)
