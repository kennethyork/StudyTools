#!/usr/bin/env python3
"""Build the Sunday lectionary: data/liturgical/rcl.json.

Readings for Years A, B and C of the Revised Common Lectionary, from the CSV
that Vanderbilt Divinity Library publishes for download:

    https://lectionary.library.vanderbilt.edu/calendar/<year>/?season=all&download=csv

Columns: Liturgical Date, Calendar Date, First reading, Psalm, Second reading,
Gospel. Each reading keeps its printed form for display and a cleaned form that
the site's reference parser can read, so a reading can open in Study a Passage.
"""
import csv
import io
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "liturgical")
CACHE = os.path.join(ROOT, "scripts", ".cache", "lectionary")
UA = {"User-Agent": "StudyTools-build/1.0"}

YEARS = [
    ("A", "2025-26", "https://lectionary.library.vanderbilt.edu/calendar/2025-26/?season=all&download=csv"),
    ("B", "2026-27", "https://lectionary.library.vanderbilt.edu/calendar/2026-27/?season=all&download=csv"),
    ("C", "2027-28", "https://lectionary.library.vanderbilt.edu/calendar/2027-28/?season=all&download=csv"),
]
COLUMNS = [("first", "First reading"), ("psalm", "Psalm"),
           ("second", "Second reading"), ("gospel", "Gospel")]


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        return dest
    print(f"  downloading {name} ...", flush=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def link_ref(text):
    """A form the site's reference parser can read: first option, no parentheses."""
    t = text.split(" or ")[0]
    t = re.sub(r"\([^)]*\)", "", t)
    t = t.split(",")[0]
    t = re.sub(r"[:\-–\s]+$", "", t).strip()
    t = re.sub(r":\s*$", "", t)
    return t.strip()


def main():
    years = {}
    total = 0
    for letter, span, url in YEARS:
        path = fetch(url, f"rcl-{span}.csv")
        rows = []
        with open(path, encoding="utf-8-sig", newline="") as f:
            text = f.read()
        # the file carries a short preamble before the real header row
        start = text.index("Liturgical Date")
        reader = csv.DictReader(io.StringIO(text[start:]))
        for row in reader:
            if not row.get("Liturgical Date"):
                continue
            readings = []
            for kind, col in COLUMNS:
                raw = (row.get(col) or "").strip()
                if not raw:
                    continue
                readings.append({"type": kind, "ref": raw, "link": link_ref(raw)})
            rows.append({
                "liturgical": row["Liturgical Date"].strip(),
                "date": (row.get("Calendar Date") or "").strip(),
                "readings": readings,
            })
        years[letter] = {"label": "Year %s (%s)" % (letter, span), "sundays": rows}
        total += len(rows)
        print(f"  Year {letter} ({span}): {len(rows)} days")

    os.makedirs(OUT, exist_ok=True)
    doc = {
        "source": ("Revised Common Lectionary readings, from the CSV published for download by "
                   "Vanderbilt Divinity Library (lectionary.library.vanderbilt.edu). "
                   "The Revised Common Lectionary is copyright \u00a9 1992 Consultation on Common Texts."),
        "years": years,
    }
    with open(os.path.join(OUT, "rcl.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {total} days written to data/liturgical/rcl.json")


if __name__ == "__main__":
    main()
