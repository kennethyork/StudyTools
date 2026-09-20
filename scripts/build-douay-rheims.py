#!/usr/bin/env python3
"""Build the Douay-Rheims (Challoner) per-book files.

Source: the Douay-Rheims Bible, Challoner revision — public domain — as
redistributed by scrollmapper/bible_databases (the same collection the
American Standard Version and Young's Literal come from).

Why this needs its own script rather than a line in build-bible.py: the
Douay-Rheims keeps the Vulgate's versification, which is not the numbering the
rest of the site uses. Its Psalm 22 is the Hebrew Psalm 23; Psalms 9 and 10 are
one psalm to it, as are 114 and 115, and 146 and 147; Daniel and Esther carry
their additions as chapters; Vulgate chapters divide into different numbers of
verses in places all through the Bible, and it has verses the critical text
dropped (Acts 8:37, the Comma Johanneum in 1 John 5:7).

So the text ships as the Douay-Rheims numbers it, marked `vulgate` in
data/bible/translations.json, and the apps keep it out of the places that would
place it beside another translation verse for verse. js/versification.js maps a
reference between the two numberings for the psalms, and labels the rest.

Output: data/bible/<slug>.DRC.json for every book the source carries, including
the deuterocanonical books built (with KJVA) by scripts/build-deuterocanon.py.
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bible")
CACHE = os.path.join(ROOT, "scripts", ".cache")
URL = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/DRC.json"
UA = {"User-Agent": "StudyTools-build/1.0"}

# The names the source uses -> this site's slugs, where they differ.
NAME_SLUGS = {
    "Prayer of Manasses": "prayer-of-manasses",
    "I Esdras": "i-esdras",
    "II Esdras": "ii-esdras",
    "Additional Psalm": "additional-psalm",
    "Laodiceans": "laodiceans",
    "1 Samuel": "i-samuel", "2 Samuel": "ii-samuel",
    "1 Kings": "i-kings", "2 Kings": "ii-kings",
    "1 Chronicles": "i-chronicles", "2 Chronicles": "ii-chronicles",
    "Song of Solomon": "song-of-solomon", "Revelation of John": "revelation-of-john",
}


def slugify(name):
    if name in NAME_SLUGS:
        return NAME_SLUGS[name]
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, "DRC.json")
    if os.path.exists(dest) and os.path.getsize(dest) > 1000000:
        return json.load(open(dest, encoding="utf-8"))
    print("  downloading the Douay-Rheims ...", flush=True)
    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return json.load(open(dest, encoding="utf-8"))


def main():
    source = fetch()
    books = json.load(open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))
    names = {b["slug"]: b["name"] for b in books}
    # The deuterocanonical books are build-deuterocanon.py's to write: it pairs
    # them with KJVA and marks them, and this script only fills in the canon.
    theirs = {b["slug"] for b in books if b["testament"] == "DC"}
    written = 0
    skipped, unwritten = [], []

    for book in source.get("books", []):
        slug = slugify(book.get("name") or "")
        if slug not in names or slug in theirs:
            skipped.append(book.get("name"))
            continue
        chapters = {}
        for chapter in book.get("chapters", []):
            number = str(chapter.get("chapter"))
            verses = {}
            for verse in chapter.get("verses", []):
                text = (verse.get("text") or "").strip()
                if text:
                    verses[str(verse.get("verse"))] = text
            if verses:
                chapters[number] = verses
        if not chapters:
            unwritten.append(book.get("name"))
            continue
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, "{}.DRC.json".format(slug)), "w", encoding="utf-8") as f:
            json.dump({
                "book": names[slug],
                "slug": slug,
                "translation": "DRC",
                "chapters": chapters,
            }, f, ensure_ascii=False, separators=(",", ":"))
        written += 1

    print("  {} books written to data/bible/*.DRC.json".format(written))
    if skipped:
        print("  left to build-deuterocanon.py (deuterocanonical or not a site book): {}"
              .format(", ".join(skipped)))
    if unwritten:
        print("  no text in the source for: {}".format(", ".join(unwritten)))


if __name__ == "__main__":
    main()
