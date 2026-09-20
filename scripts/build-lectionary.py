#!/usr/bin/env python3
"""Build the Sunday lectionary: data/liturgical/bcp1928.json.

Source: the tables of psalms and lessons in the Book of Common Prayer (1928) of
the Episcopal Church, which entered the public domain in the United States on
1 January 2024. Transcribed by github.com/vovchykbratyk/BCP_1928.

The Revised Common Lectionary is deliberately NOT used: the Consultation on
Common Texts permits congregations to reproduce its table of citations, but
web-based reproduction by an organisation requires written permission.

Output: data/liturgical/bcp1928.json  - one entry per week of the Christian
year, with the psalms and lessons appointed for its Sunday, morning and evening.
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "liturgical")
CACHE = os.path.join(ROOT, "scripts", ".cache", "lectionary")
SRC = "https://raw.githubusercontent.com/vovchykbratyk/BCP_1928/master/bcp1928_readings_by_sunday.json"


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, "bcp1928-readings.json")
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    print("  downloading the 1928 tables ...", flush=True)
    req = urllib.request.Request(SRC, headers={"User-Agent": "StudyTools-build/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def link_ref(ref):
    """A form the site's reference parser reads: one range, no marks."""
    t = ref.replace("*", "").replace("\u2013", "-").replace("\u2014", "-")
    t = re.sub(r"\.", "", t)
    t = t.split(",")[0].strip()
    return re.sub(r"\s+", " ", t)


def office(day):
    if not isinstance(day, dict):
        return None
    out = {}
    for key, name in (("psalms", "psalms"), ("first_lessons", "first"), ("second_lessons", "second")):
        vals = [v.strip() for v in (day.get(key) or []) if v and v.strip()]
        if vals:
            out[name] = [{"ref": v, "link": link_ref(v)} for v in vals]
    return out if out else None


def main():
    data = json.load(open(fetch(), encoding="utf-8"))
    weeks = []
    for w in data.get("base_weeks", []):
        entry = {"label": (w.get("sunday_label") or "").strip()}
        for key, name in (("morning_prayer", "morning"), ("evening_prayer", "evening")):
            day = (w.get(key) or {}).get("Sunday")
            o = office(day)
            if o:
                entry[name] = o
        if entry.get("morning") or entry.get("evening"):
            weeks.append(entry)

    os.makedirs(OUT, exist_ok=True)
    doc = {
        "source": ("The Book of Common Prayer (1928), Episcopal Church - public domain in the United States "
                   "since 1 January 2024. Tables transcribed by github.com/vovchykbratyk/BCP_1928. "
                   "Readings are given as the Prayer Book prints them."),
        "weeks": weeks,
    }
    with open(os.path.join(OUT, "bcp1928.json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {len(weeks)} Sundays written to data/liturgical/bcp1928.json")
    for w in weeks[:3]:
        m = w.get("morning", {})
        print("   ", w["label"], "| psalms:", ",".join(p["ref"] for p in m.get("psalms", [])),
              "| lessons:", "; ".join(l["ref"] for l in m.get("first", []) + m.get("second", []))[:70])


if __name__ == "__main__":
    main()
