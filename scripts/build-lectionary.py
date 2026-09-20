#!/usr/bin/env python3
"""Build the 1928 Prayer Book lectionary data.

  data/liturgical/bcp1928.json        the 57 Sundays: label, psalms and lessons
  data/liturgical/bcp1928-daily.json  the same tables as a daily office: every
                                      week Sunday to Saturday, morning and
                                      evening, plus the fixed holy days and the
                                      movable feasts

Source: the tables of psalms and lessons in the Book of Common Prayer (1928) of
the Episcopal Church, which entered the public domain in the United States on
1 January 2024. Transcribed by github.com/vovchykbratyk/BCP_1928.

The Revised Common Lectionary is deliberately NOT used: the Consultation on
Common Texts permits congregations to reproduce its table of citations, but
web-based reproduction by an organisation requires written permission.

How the transcription is read
-----------------------------
* ``base_weeks`` holds the year's 57 possible Sundays in order. Within a week
  the days are keyed by weekday ("Monday"), by an Ember day, which is that
  weekday ("Ember Wednesday" is the Wednesday of that week), or by a date or
  saint ("Christmas Day", "January 7"), which belongs to that calendar date.
* ``overrides.fixed_holy_days`` holds the 38 fixed holy days, keyed MM-DD. An
  Eve carries only the evening office: it is the first evensong of the feast.
* The Prayer Book names the days of 24 December to 12 January by date, so those
  become fixed days too and a date lookup covers Christmas and its octave.
* The Prayer Book's table of precedence ("When two Holy-days fall upon the same
  day, then shall be said the whole Service Proper to the Day named in the
  left-hand column") ranks the Feasts of our Lord, every holy day from
  St. Barnabas to All Saints, and their Eves as ``greater``: the app keeps those
  when they fall on a Sunday, and lets the Sunday give way. The rest are
  ``lesser`` and are transferred off the Sunday, which the app does not model.

The output is served straight to the browser, so it is written readable.
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "liturgical")
CACHE = os.path.join(ROOT, "scripts", ".cache", "lectionary")
SRC = "https://raw.githubusercontent.com/vovchykbratyk/BCP_1928/master/bcp1928_readings_by_sunday.json"

SOURCE_NOTE = ("The Book of Common Prayer (1928), Episcopal Church - public domain in the United States "
               "since 1 January 2024. Tables transcribed by github.com/vovchykbratyk/BCP_1928. "
               "Readings are given as the Prayer Book prints them.")

# Days of a week keyed by something other than the weekday they fall on.
EMBER_DAYS = {"Ember Wednesday": "Wednesday", "Ember Friday": "Friday", "Ember Saturday": "Saturday"}
WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

# The days the Prayer Book names by date, not by weekday: (date, name or None).
NAMED_DAYS = {
    "Christmas Eve": ("12-24", "Christmas Eve"),
    "CHRISTMAS DAY": ("12-25", "Christmas Day"),
    "ST. STEPHEN": ("12-26", "St. Stephen"),
    "ST. JOHN EVANGELIST": ("12-27", "St. John the Evangelist"),
    "HOLY INNOCENTS": ("12-28", "The Holy Innocents"),
    "December 29": ("12-29", None),
    "December 30": ("12-30", None),
    "December 31": ("12-31", None),
    "CIRCUMCISION": ("01-01", "The Circumcision of Christ"),
    "January 2": ("01-02", None),
    "January 3": ("01-03", None),
    "January 4": ("01-04", None),
    "January 5": ("01-05", None),
    "Epiphany Eve": ("01-05", "Epiphany Eve"),
    "EPIPHANY": ("01-06", "The Epiphany"),
    "January 7": ("01-07", None),
    "January 8": ("01-08", None),
    "January 9": ("01-09", None),
    "January 10": ("01-10", None),
    "January 11": ("01-11", None),
    "January 12\u2020": ("01-12", None),
    "January 12": ("01-12", None),
}

# The movable days, by their distance from Easter Day, with the office they
# carry where the Prayer Book gives the day only one of the two.
MOVABLE_DAYS = [
    ("ASH WEDNESDAY", -46, "Ash Wednesday", None),
    ("Mon. before Easter", -6, "Monday before Easter", None),
    ("Tues. before Easter", -5, "Tuesday before Easter", None),
    ("Wed. before Easter", -4, "Wednesday before Easter", None),
    ("Maundy Thursday", -3, "Maundy Thursday", None),
    ("GOOD FRIDAY", -2, "Good Friday", None),
    ("Easter Even", -1, "Easter Even", None),
    ("Easter Monday", 1, "Easter Monday", None),
    ("Easter Tuesday", 2, "Easter Tuesday", None),
    ("Rogation Monday", 36, "Rogation Monday", None),
    ("Rogation Tuesday", 37, "Rogation Tuesday", None),
    ("Rogation Wednesday", 38, "Rogation Wednesday", "morning"),
    ("Ascension Eve", 38, "Ascension Eve", "evening"),
    ("ASCENSION DAY", 39, "Ascension Day", None),
    ("Whitsun Eve", 48, "Whitsun Eve", "evening"),
    ("Whit Monday", 50, "Whit Monday", None),
    ("Whit Tuesday", 51, "Whit Tuesday", None),
    ("Trinity Eve", 55, "Trinity Eve", "evening"),
]

# Days whose office the weeks already carry under their Sunday heading, marked
# so the calendar can show them.
MOVABLE_MARKS = [(0, "Easter Day"), (49, "Whitsunday"), (56, "Trinity Sunday")]

# The holy days the Prayer Book keeps when they fall on a Sunday: the Feasts of
# our Lord, and every holy day from St. Barnabas to All Saints.
GREATER_FEASTS = {
    "01-01",                                                        # Circumcision
    "01-06",                                                        # Epiphany
    "02-02",                                                        # Purification
    "04-25",                                                        # St. Mark
    "05-01",                                                        # St. Philip and St. James
    "06-11", "06-24", "06-29", "07-25", "08-06", "08-24",           # St. Barnabas to St. Bartholomew
    "09-21", "09-29", "10-18", "10-28", "11-01",                    # St. Matthew to All Saints
    "12-25", "12-26", "12-27", "12-28",                             # Christmas and its octave
}

SMALL_WORDS = {"of", "the", "and", "in", "to", "our"}

# Books of a single chapter: a whole-book reference carries no number.
SINGLE_CHAPTER_BOOKS = {"jude", "philemon", "obadiah", "2 john", "3 john"}


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
    """One day's office, in the shape the apps render."""
    if not isinstance(day, dict):
        return None
    out = {}
    for key, name in (("psalms", "psalms"), ("first_lessons", "first"), ("second_lessons", "second")):
        vals = [v.strip() for v in (day.get(key) or []) if v and v.strip()]
        if vals:
            out[name] = [{"ref": v, "link": link_ref(v)} for v in vals]
    return out if out else None


def looks_sound(reading):
    """The transcription has a few damaged readings; keep them out of the app.

    A reference names a place in Scripture: a psalm number, a book with chapter
    and verse, or one of the books that has a single chapter. (The one broken day
    in the source is headed "On January", with a first lesson of "read" and a
    psalm of "13,".)
    """
    for slot in reading.values():
        for lesson in slot:
            ref = lesson["ref"].strip()
            if ref.endswith(","):
                return False
            if not re.search(r"\d", ref) and ref.lower().rstrip(".") not in SINGLE_CHAPTER_BOOKS:
                return False
    return True


def proper(text):
    """Print a heading the way the app shows it: St. Paul, not ST. PAUL."""
    words = text.split()
    out = []
    for i, w in enumerate(words):
        low = w.lower()
        if i and low in SMALL_WORDS:
            out.append(low)
        elif low == "bvm":
            out.append("Blessed Virgin Mary")
        else:
            out.append(w[:1].upper() + w[1:].lower())
    name = " ".join(out)
    return re.sub(r"^(.*)\bEve$", lambda m: "The Eve of " + m.group(1).strip(), name)


def main():
    data = json.load(open(fetch(), encoding="utf-8"))
    weeks = data.get("base_weeks", [])
    holy = (data.get("overrides") or {}).get("fixed_holy_days", {})

    # ---- the Sundays, as the lectionary app reads them --------------------
    sundays = []
    for w in weeks:
        entry = {"label": (w.get("sunday_label") or "").strip()}
        for key, name in (("morning_prayer", "morning"), ("evening_prayer", "evening")):
            o = office((w.get(key) or {}).get("Sunday"))
            if o:
                entry[name] = o
        if entry.get("morning") or entry.get("evening"):
            sundays.append(entry)

    # ---- the weeks, day by day -------------------------------------------
    daily_weeks, dropped = [], []
    for w in weeks:
        label = (w.get("sunday_label") or "").strip()
        days = {}
        for key, week_key in (("morning_prayer", "morning"), ("evening_prayer", "evening")):
            for day, readings in (w.get(key) or {}).items():
                weekday = EMBER_DAYS.get(day, day)
                if weekday not in WEEKDAYS:
                    continue                        # a date-named day: handled below
                o = office(readings)
                if not o:
                    continue
                if not looks_sound(o):
                    dropped.append((label, week_key, day, "damaged reading"))
                    continue
                slot = days.setdefault(weekday, {})
                if week_key in slot:
                    dropped.append((label, week_key, day, "already set"))
                    continue
                slot[week_key] = o
        daily_weeks.append({"label": label, "days": days})

    # ---- the fixed days ---------------------------------------------------
    fixed = {}

    def put(date, name, kind):
        entry = fixed.setdefault(date, {"date": date, "name": None, "kind": kind,
                                        "rank": "greater" if date in GREATER_FEASTS else "lesser"})
        if name and not entry["name"]:
            entry["name"] = name

    for date in sorted(holy):
        h = holy[date]
        put(date, proper(h.get("feast") or ""), "holy day")
        for key, slot in (("morning_prayer", "morning"), ("evening_prayer", "evening")):
            o = office(h.get(key))
            if not o:
                continue
            if looks_sound(o):
                fixed[date][slot] = o
            else:
                dropped.append(("fixed holy day", slot, date, "damaged reading"))

    for w in weeks:
        for key, slot in (("morning_prayer", "morning"), ("evening_prayer", "evening")):
            for day, readings in (w.get(key) or {}).items():
                named = NAMED_DAYS.get(day)
                if not named:
                    continue
                date, name = named
                o = office(readings)
                if not o:
                    continue
                put(date, name, "Christmas and Epiphany")
                if looks_sound(o):
                    fixed[date][slot] = o
                else:
                    dropped.append(("week named day", slot, date, "damaged reading"))

    # an Eve takes the rank of the feast it opens, whether it is named for the
    # feast ("The Eve of St. Paul") or for the day itself ("Christmas Eve")
    for date, entry in fixed.items():
        name = entry["name"] or ""
        if name.startswith("The Eve of") or name.endswith("Eve"):
            month, day = (int(x) for x in date.split("-"))
            following = "%02d-%02d" % (month, day + 1)
            if fixed.get(following, {}).get("rank") == "greater":
                entry["rank"] = "greater"

    # ---- the movable days -------------------------------------------------
    movable = {}
    for key, offset, name, only in MOVABLE_DAYS:
        entry = movable.setdefault(offset, {"offset": offset, "name": name, "rank": "greater"})
        if entry["name"] != name and only:
            entry.setdefault("eveningName", name)      # Rogation Wednesday / Ascension Eve
        entry.setdefault("name", name)
        for slot_key, slot in (("morning_prayer", "morning"), ("evening_prayer", "evening")):
            if only and only != slot:
                continue
            for w in weeks:
                readings = (w.get(slot_key) or {}).get(key)
                if readings is None:
                    continue
                o = office(readings)
                if o and looks_sound(o):
                    entry[slot] = o
                elif o:
                    dropped.append((name, slot, key, "damaged reading"))
                break
    for offset, name in MOVABLE_MARKS:
        movable.setdefault(offset, {"offset": offset, "name": name, "rank": "greater"})

    # ---- write ------------------------------------------------------------
    os.makedirs(OUT, exist_ok=True)
    docs = {
        "bcp1928.json": {"source": SOURCE_NOTE, "weeks": sundays},
        "bcp1928-daily.json": {
            "source": SOURCE_NOTE,
            "weeks": daily_weeks,
            "fixed": [fixed[d] for d in sorted(fixed)],
            "movable": [movable[o] for o in sorted(movable)]
        }
    }
    for name, doc in docs.items():
        path = os.path.join(OUT, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("  %-20s %6.1f KB" % (name, os.path.getsize(path) / 1024))

    print("  %d Sundays, %d weeks, %d fixed days, %d movable" %
          (len(sundays), len(daily_weeks), len(fixed), len(movable)))
    for label, slot, day, why in dropped:
        print("     dropped %s %s %r (%s)" % (label, slot, day, why))

    # references that look cut short in the transcription: worth knowing about,
    # not worth guessing at
    odd = []
    def scan(date, slot, o):
        for kind, lessons in o.items():
            for lesson in lessons:
                if re.search(r"[-:,]$", lesson["ref"]) or re.search(r"\d-\D", lesson["ref"]):
                    odd.append((date, slot, kind, lesson["ref"]))
    for date, entry in fixed.items():
        for slot in ("morning", "evening"):
            if entry.get(slot):
                scan(date, slot, entry[slot])
    if odd:
        print("  %d reference(s) look truncated in the source:" % len(odd))
        for date, slot, kind, ref in odd:
            print("     %s %s %s: %s" % (date, slot, kind, ref))

    labels = [w["label"] for w in daily_weeks]
    assert len(labels) == 57 and len(set(labels)) == 57, "expected 57 distinct Sunday headings"
    assert all(w["days"] for w in daily_weeks), "a week came out with no days at all"
    for entry in fixed.values():
        assert entry.get("morning") or entry.get("evening"), entry["date"] + " has no office"


if __name__ == "__main__":
    main()
