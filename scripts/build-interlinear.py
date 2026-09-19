#!/usr/bin/env python3
"""Build the Greek interlinear data for the Interlinear Reader app.

Source: OpenGNT (eliranwong/OpenGNT, CC BY-SA 4.0). Its base text file carries
one row per Greek word with the surface form, the lexical form, morphology,
Strong's number, transliteration, and a short English gloss.

Output: data/interlinear/<book-slug>/<chapter>.json
        data/interlinear/index.json
Books are keyed by the same slugs the rest of the site uses, so a reference in
the interlinear can link to the Verse Matrix.
"""
import csv
import io
import json
import os
import re
import urllib.request
import zipfile
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "interlinear")
CACHE = os.path.join(ROOT, "scripts", ".cache")
ZIP = os.path.join(CACHE, "OpenGNT_BASE_TEXT.zip")
URL = "https://raw.githubusercontent.com/eliranwong/OpenGNT/master/OpenGNT_BASE_TEXT.zip"
UA = {"User-Agent": "StudyTools-build/1.0", "Accept-Encoding": "identity"}

# OpenGNT book numbers (the 40s are Matthew onwards) -> this repo's slugs.
BOOK_NUMBERS = {
    40: "matthew", 41: "mark", 42: "luke", 43: "john", 44: "acts",
    45: "romans", 46: "i-corinthians", 47: "ii-corinthians", 48: "galatians",
    49: "ephesians", 50: "philippians", 51: "colossians", 52: "i-thessalonians",
    53: "ii-thessalonians", 54: "i-timothy", 55: "ii-timothy", 56: "titus",
    57: "philemon", 58: "hebrews", 59: "james", 60: "i-peter", 61: "ii-peter",
    62: "i-john", 63: "ii-john", 64: "iii-john", 65: "jude", 66: "revelation-of-john",
}

BOOK_NAMES = {
    "matthew": "Matthew", "mark": "Mark", "luke": "Luke", "john": "John",
    "acts": "Acts", "romans": "Romans", "i-corinthians": "I Corinthians",
    "ii-corinthians": "II Corinthians", "galatians": "Galatians",
    "ephesians": "Ephesians", "philippians": "Philippians", "colossians": "Colossians",
    "i-thessalonians": "I Thessalonians", "ii-thessalonians": "II Thessalonians",
    "i-timothy": "I Timothy", "ii-timothy": "II Timothy", "titus": "Titus",
    "philemon": "Philemon", "hebrews": "Hebrews", "james": "James",
    "i-peter": "I Peter", "ii-peter": "II Peter", "i-john": "I John",
    "ii-john": "II John", "iii-john": "III John", "jude": "Jude",
    "revelation-of-john": "Revelation of John",
}

BRACKET = re.compile(r"〔([^｜]*)｜([^｜]*)｜([^｜]*)｜([^｜]*)｜([^｜]*)｜([^〕]*)〕")
REF_BRACKET = re.compile(r"〔([^｜]+)｜([^｜]+)｜([^〕]+)〕")
ANY_BRACKET = re.compile(r"〔([^〕]*)〕")


def fields(text):
    """Split any 〔a｜b｜c〕 bracket into its fields, whatever the count."""
    m = ANY_BRACKET.search(text or "")
    if not m:
        return []
    return [f.strip() for f in m.group(1).split("｜")]


def ensure_zip():
    if os.path.exists(ZIP) and os.path.getsize(ZIP) > 1000000:
        return ZIP
    os.makedirs(CACHE, exist_ok=True)
    print("  downloading OpenGNT ...", flush=True)
    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=900) as r, open(ZIP, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return ZIP


def strip_punct(text):
    return text.strip().strip(",.;·—" ) or text.strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    path = ensure_zip()
    with zipfile.ZipFile(path) as z:
        name = [n for n in z.namelist() if n.endswith(".csv") and "__MACOSX" not in n][0]
        with z.open(name) as f:
            text = f.read().decode("utf-8")

    chapters = OrderedDict()
    index = {}
    reader = csv.reader(io.StringIO(text), delimiter="\t")
    next(reader, None)
    for row in reader:
        if len(row) < 11:
            continue
        ref = REF_BRACKET.search(row[6])
        word = BRACKET.search(row[7])
        if not ref or not word:
            continue
        book_num, chapter, verse = ref.group(1), ref.group(2), ref.group(3)
        try:
            book_num = int(book_num)
            verse = verse.strip()
        except ValueError:
            continue
        slug = BOOK_NUMBERS.get(book_num)
        if not slug:
            continue

        # The source carries four Greek forms per word: the surface text (often
        # with lunate sigmas and abbreviations), an unaccented normalisation,
        # the properly accented text, and the lexical form. Ship the accented
        # text for display and keep the lexical form for the tooltip.
        surface, normalized, accented, lexical, morph, strongs = (word.group(i) for i in range(1, 7))
        display = accented or normalized or surface
        translit_fields = fields(row[9]) if len(row) > 9 else []
        gloss_fields = fields(row[10]) if len(row) > 10 else []
        translit = translit_fields[1] if len(translit_fields) > 1 else (translit_fields[0] if translit_fields else "")
        gloss = ""
        for candidate in gloss_fields:
            if candidate and candidate != "-":
                gloss = candidate
                break
        if gloss.lower() in ("the/this/who",):
            gloss = "the"

        key = (slug, chapter)
        bucket = chapters.setdefault(key, {})
        bucket.setdefault(verse, []).append({
            "g": display,
            "l": lexical,
            "t": translit,
            "m": morph,
            "s": strongs,
            "e": gloss,
        })

    for (slug, chapter), verses in chapters.items():
        dest_dir = os.path.join(OUT, slug)
        os.makedirs(dest_dir, exist_ok=True)
        payload = {
            "book": BOOK_NAMES.get(slug, slug),
            "slug": slug,
            "chapter": int(chapter),
            "verses": {v: words for v, words in sorted(verses.items(), key=lambda kv: int(kv[0]))},
        }
        with open(os.path.join(dest_dir, "{}.json".format(chapter)), "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        index.setdefault(slug, []).append(int(chapter))

    for slug in index:
        index[slug].sort()
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({
            "source": "OpenGNT (CC BY-SA 4.0)",
            "books": index,
            "bookNames": BOOK_NAMES,
        }, f, ensure_ascii=False, separators=(",", ":"))

    size = sum(os.path.getsize(os.path.join(dp, fn))
               for dp, _dn, fns in os.walk(OUT) for fn in fns)
    print("books: {} | chapters: {} | {:.1f} MB".format(
        len(index), sum(len(v) for v in index.values()), size / 1e6))


if __name__ == "__main__":
    main()
