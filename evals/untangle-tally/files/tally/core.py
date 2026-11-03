from datetime import timedelta


def _hours(row):
    value = row.get("hours")
    if value in (None, ""):
        value = row.get("duration")
    return float(value)


def summarize(rows):
    totals = {}
    for row in rows:
        project = row["project"]
        totals[project] = round(totals.get(project, 0.0) + _hours(row), 2)
    return dict(sorted(totals.items()))


def summarize_v1(rows):
    totals = {}
    for row in rows:
        totals.setdefault(row["project"], 0)
        totals[row["project"]] += int(float(row["hours"]) * 60)
    return {project: minutes / 60 for project, minutes in totals.items()}


def week_of(day):
    return day - timedelta(days=day.weekday())
