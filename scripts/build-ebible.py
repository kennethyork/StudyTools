#!/usr/bin/env python3
"""Build per-book JSON from an eBible.org USFM module.

Usage: python3 scripts/build-ebible.py WEBU   # or WEB

Both are editions of the World English Bible, which is in the public domain
("World English Bible" is a trademark of eBible.org) and is the only modern
American-English translation that carries the Deuterocanon/Apocrypha:

  WEBU  engwebu  World English Bible, Updated — "LORD"/"GOD" in the OT
  WEB   eng-web  World English Bible, classic — "Yahweh"/"Yah" in the OT
  RV    eng-rv   Revised Version (1895) with the Apocrypha — archaic English,
                 modernized by scripts/modernize.py
  JPS   engjps   Jewish Publication Society Tanakh (1917), 39 books, archaic
                 English, likewise modernized by scripts/modernize.py

Output: data/bible/<slug>.<ID>.json  (81 books: 66 canon + 15 deuterocanon)
"""
import json
import os
import re
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bible")
CACHE = os.path.join(ROOT, "scripts", ".cache", "ebible")
URL = "https://ebible.org/Scriptures/{}_usfm.zip"

MODULES = {
    "WEBU": "engwebu",     # World English Bible, Updated
    "WEB": "eng-web",      # World English Bible, classic
    "RV": "eng-rv",        # Revised Version (1895), with Apocrypha
    "JPS": "engjps",       # JPS Tanakh (1917), Hebrew Bible only
}

# USFM book code -> repository slug.
CODE_SLUG = {
    "GEN": "genesis", "EXO": "exodus", "LEV": "leviticus", "NUM": "numbers",
    "DEU": "deuteronomy", "JOS": "joshua", "JDG": "judges", "RUT": "ruth",
    "1SA": "i-samuel", "2SA": "ii-samuel", "1KI": "i-kings", "2KI": "ii-kings",
    "1CH": "i-chronicles", "2CH": "ii-chronicles", "EZR": "ezra", "NEH": "nehemiah",
    "EST": "esther", "JOB": "job", "PSA": "psalms", "PRO": "proverbs",
    "ECC": "ecclesiastes", "SNG": "song-of-solomon", "ISA": "isaiah", "JER": "jeremiah",
    "LAM": "lamentations", "EZK": "ezekiel", "DAN": "daniel", "HOS": "hosea",
    "JOL": "joel", "AMO": "amos", "OBA": "obadiah", "JON": "jonah", "MIC": "micah",
    "NAM": "nahum", "HAB": "habakkuk", "ZEP": "zephaniah", "HAG": "haggai",
    "ZEC": "zechariah", "MAL": "malachi", "MAT": "matthew", "MRK": "mark",
    "LUK": "luke", "JHN": "john", "ACT": "acts", "ROM": "romans",
    "1CO": "i-corinthians", "2CO": "ii-corinthians", "GAL": "galatians",
    "EPH": "ephesians", "PHP": "philippians", "COL": "colossians",
    "1TH": "i-thessalonians", "2TH": "ii-thessalonians", "1TI": "i-timothy",
    "2TI": "ii-timothy", "TIT": "titus", "PHM": "philemon", "HEB": "hebrews",
    "JAS": "james", "1PE": "i-peter", "2PE": "ii-peter", "1JN": "i-john",
    "2JN": "ii-john", "3JN": "iii-john", "JUD": "jude", "REV": "revelation-of-john",
    # Deuterocanon / Apocrypha
    "TOB": "tobit", "JDT": "judith", "ESG": "esther-greek", "DAG": "daniel-greek",
    "WIS": "wisdom", "SIR": "sirach", "BAR": "baruch", "1MA": "i-maccabees",
    "2MA": "ii-maccabees", "1ES": "i-esdras", "MAN": "prayer-of-manasses",
    "PS2": "psalm-151", "3MA": "iii-maccabees", "2ES": "ii-esdras", "4MA": "iv-maccabees",
    # The Revised Version keeps the Daniel additions and Susanna as separate
    # books, the way the King James Apocrypha does.
    "S3Y": "prayer-of-azariah", "SUS": "susanna", "BEL": "bel-and-the-dragon",
}


def download(module_id):
    dest = os.path.join(CACHE, f"{module_id}.zip")
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    os.makedirs(CACHE, exist_ok=True)
    print(f"  downloading {module_id}_usfm.zip ...", flush=True)
    req = urllib.request.Request(URL.format(module_id), headers={"User-Agent": "StudyTools-build/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def strip_inline(text):
    """Remove USFM inline markup, keeping the readable words."""
    text = re.sub(r"\\f\b.*?\\f\*", " ", text, flags=re.S)   # footnotes
    text = re.sub(r"\\x\b.*?\\x\*", " ", text, flags=re.S)   # cross-references
    # \w word|attrs\w*  ->  word   (also the \+w form carrying Strong's data)
    text = re.sub(
        r"\\\+?w\s+(.*?)\\\+?w\*",
        lambda m: m.group(1).split("|")[0],
        text,
        flags=re.S,
    )
    # Strip leftover closing markers (\wj*, \add*, ...) BEFORE opening ones,
    # otherwise the opening pattern eats "\wj" and leaves a stray "*".
    text = re.sub(r"\\\+?[a-z]+\d?\*", " ", text)
    text = re.sub(r"\\\+?[a-z]+\d?", " ", text)
    text = text.replace("|", " ").replace("~", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse(text):
    chapters = {}
    chapter = None
    verse = None
    buf = []

    def flush():
        if chapter is not None and verse is not None:
            body = strip_inline(" ".join(buf))
            if body:
                bucket = chapters.setdefault(chapter, {})
                if verse in bucket:
                    bucket[verse] = (bucket[verse] + " " + body).strip()
                else:
                    bucket[verse] = body

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line:
            continue
        m = re.match(r"^\\c\s+(\d+)", line)
        if m:
            flush()
            buf = []
            verse = None
            chapter = str(int(m.group(1)))
            continue
        m = re.match(r"^\\v\s+(\d+)(?:[-\u2013]\d+)?\s*(.*)$", line)
        if m:
            flush()
            verse = m.group(1)
            buf = [m.group(2)]
            continue
        if verse is None:
            continue  # headings, introductions, \p before the first verse
        if re.match(r"^\\[a-z0-9+]+", line):
            rest = re.sub(r"^\\[a-z0-9+]+\*?\s?", "", line)
            if rest:
                buf.append(rest)
            continue
        buf.append(line)
    flush()
    return chapters


def build(translation):
    module_id = MODULES[translation]
    z = zipfile.ZipFile(download(module_id))
    written = 0
    for name in sorted(z.namelist()):
        if not name.endswith(".usfm"):
            continue
        m = re.match(r"^\d+-?([A-Z0-9]{3})", os.path.basename(name))
        code = m.group(1) if m else None
        if not code or code not in CODE_SLUG:
            continue
        data = z.read(name)
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = data.decode("latin-1")
        h = re.search(r"^\\h\s+(.*)$", text, re.M)
        title = h.group(1).strip() if h else CODE_SLUG[code]
        slug = CODE_SLUG[code]
        out = {"book": title, "slug": slug, "translation": translation, "chapters": parse(text)}
        with open(os.path.join(OUT, f"{slug}.{translation}.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        written += 1
    print(f"  {written} books written to data/bible/*.{translation}.json")


def main():
    targets = sys.argv[1:] or list(MODULES)
    for t in targets:
        if t not in MODULES:
            print(f"unknown module {t!r}; choose from {', '.join(MODULES)}")
            sys.exit(1)
        print(f"building {t} ({MODULES[t]}) from eBible.org")
        build(t)


if __name__ == "__main__":
    main()
