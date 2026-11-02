# tally

Sums the hours of time entries for each project.

Run `python3 -m tally entries.csv --format text`. The formats are `text`,
`json` and `markdown`. The report goes to stdout. A line with the number of
projects and the total hours goes to stderr.

The CSV needs the columns `project` and `hours`. Exports from the old tracker
name the hours column `duration`. tally reads both.

The public API is in `tally/__init__.py`:

- `summarize(rows)` gives the hours for each project, sorted by project name.
- `week_of(day)` gives the Monday of the week of a date.

Run the tests with `python3 -m unittest`.
