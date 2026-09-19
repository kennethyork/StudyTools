#!/usr/bin/env python3
"""Build cross-reference data for the Cross-Reference Explorer.

Source: the openbible.info cross-reference dataset, redistributed by
scrollmapper/bible_databases (https://www.openbible.info/labs/cross-references/).
The verse pairs are CC BY 4.0; attribution is shown in the app footer.

The raw file lists 344,799 pairs. This script groups them by "from" chapter so
the browser fetches only what it needs, and drops anything pointing outside the
66-book canon (the dataset includes a handful of apocryphal links).

Output: data/crossref/<book-slug>/<chapter>.json
        data/crossref/index.json  (which chapters exist)
"""
import json
import os
import re
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "crossref")
CACHE = os.path.join(ROOT, "scripts", ".cache")

URL = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/sources/extras/cross_references.txt"
UA = {"User-Agent": "StudyTools-build/1.0"}

# OSIS-style abbreviations used by the dataset -> this repo's book slugs.
BOOK_MAP = {
    "Gen": "genesis", "Exod": "exodus", "Lev": "leviticus", "Num": "numbers",
    "Deut": "deuteronomy", "Josh": "joshua", "Judg": "judges", "Ruth": "ruth",
    "1Sam": "i-samuel", "2Sam": "ii-samuel", "1Kgs": "i-kings", "2Kgs": "ii-kings",
    "1Chr": "i-chronicles", "2Chr": "ii-chronicles", "Ezra": "ezra", "Neh": "nehemiah",
    "Esth": "esther", "Job": "job", "Ps": "psalms", "Prov": "proverbs",
    "Eccl": "ecclesiastes", "Song": "song-of-solomon", "Isa": "isaiah",
    "Jer": "jeremiah", "Lam": "lamentations", "Ezek": "ezekiel", "Dan": "daniel",
    "Hos": "hosea", "Joel": "joel", "Amos": "amos", "Obad": "obadiah",
    "Jonah": "jonah", "Mic": "micah", "Nah": "nahum", "Hab": "habakkuk",
    "Zeph": "zephaniah", "Hag": "haggai", "Zech": "zechariah", "Mal": "malachi",
    "Matt": "matthew", "Mark": "mark", "Luke": "luke", "John": "john",
    "Acts": "acts", "Rom": "romans", "1Cor": "i-corinthians", "2Cor": "ii-corinthians",
    "Gal": "galatians", "Eph": "ephesians", "Phil": "philippians", "Col": "colossians",
    "1Thess": "i-thessalonians", "2Thess": "ii-thessalonians", "1Tim": "i-timothy",
    "2Tim": "ii-timothy", "Titus": "titus", "Phlm": "philemon", "Heb": "hebrews",
    "Jas": "james", "1Pet": "i-peter", "2Pet": "ii-peter", "1John": "i-john",
    "2John": "ii-john", "3John": "iii-john", "Jude": "jude", "Rev": "revelation-of-john",
}

REF_RE = re.compile(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$")
RANGE_RE = re.compile(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)-([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$")


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000000:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print("  downloading cross-references ...", flush=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return dest


def parse_endpoint(text):
    m = RANGE_RE.match(text)
    if m:
        book, ch, start, _b2, _c2, end = m.groups()
        slug = BOOK_MAP.get(book)
        if not slug:
            return None
        return {"book": slug, "chapter": int(ch), "verseStart": int(start), "verseEnd": int(end)}
    m = REF_RE.match(text)
    if m:
        book, ch, verse = m.groups()
        slug = BOOK_MAP.get(book)
        if not slug:
            return None
        return {"book": slug, "chapter": int(ch), "verseStart": int(verse), "verseEnd": int(verse)}
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    path = download(URL, os.path.join(CACHE, "cross_references.txt"))

    chapters = defaultdict(list)
    total = skipped = 0
    with open(path, encoding="utf-8", errors="replace") as f:
        next(f, None)
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            src, dst, votes = parts[0], parts[1], parts[2]
            frm = parse_endpoint(src)
            to = parse_endpoint(dst)
            if not frm or not to:
                skipped += 1
                continue
            try:
                weight = int(votes)
            except ValueError:
                weight = 0
            chapters[(frm["book"], frm["chapter"])].append({
                "from": frm["verseStart"],
                "to": to,
                "votes": weight,
            })
            total += 1

    index = {}
    for (slug, chapter), refs in chapters.items():
        refs.sort(key=lambda r: (-r["votes"], r["from"]))
        dest_dir = os.path.join(OUT, slug)
        os.makedirs(dest_dir, exist_ok=True)
        with open(os.path.join(dest_dir, "{}.json".format(chapter)), "w", encoding="utf-8") as f:
            json.dump({"book": slug, "chapter": chapter, "refs": refs}, f, ensure_ascii=False, separators=(",", ":"))
        index.setdefault(slug, []).append(chapter)

    for slug in index:
        index[slug].sort()
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"source": "openbible.info cross-references (CC BY 4.0)",
                   "books": index, "total": total}, f, separators=(",", ":"))

    size = sum(os.path.getsize(os.path.join(dp, fn))
               for dp, _dn, fns in os.walk(OUT) for fn in fns)
    print("pairs: {} | chapters: {} | skipped: {} | {:.1f} MB".format(
        total, len(chapters), skipped, size / 1e6))


if __name__ == "__main__":
    main()
