import argparse
import csv
import sys

from . import formats
from .core import summarize
from .text import fmt_hours


def main(argv=None):
    parser = argparse.ArgumentParser(prog="tally")
    parser.add_argument("file")
    parser.add_argument("--format", default="text")
    args = parser.parse_args(argv)
    render = getattr(formats, f"to_{args.format}", None)
    if render is None:
        parser.error(f"unknown format: {args.format}")
    with open(args.file, newline="") as handle:
        totals = summarize(csv.DictReader(handle))
    print(render(totals))
    print(f"{len(totals)} projects, {fmt_hours(sum(totals.values()))}", file=sys.stderr)
