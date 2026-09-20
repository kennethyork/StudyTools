#!/usr/bin/env python3
"""Fetch the Berean Standard Bible (BSB) and normalize it into
data/bible/<slug>.BSB.json, matching the layout of the other translations.

The Berean Bible and Majority Bible texts were dedicated to the public domain
on 30 April 2023 (CC0). See https://berean.bible/terms.htm
The BSB covers the 66-book Protestant canon and uses the same book, chapter and
verse numbering as the rest of this site, so references line up exactly.

Source: scrollmapper/bible_databases (the same source build-bible.py uses).

Output: data/bible/<slug>.BSB.json
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bible")
CACHE = os.path.join(ROOT, "scripts", ".cache", "modern")

TRANSLATION = "BSB"
URL = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/{}.json"

SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name):
    return SLUG_RE.sub("-", name.lower().replace("'", "")).strip("-")


def download():
    dest = os.path.join(CACHE, f"{TRANSLATION}.json")
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    os.makedirs(CACHE, exist_ok=True)
    print(f"  downloading {TRANSLATION} ...", flush=True)
    req = urllib.request.Request(URL.format(TRANSLATION), headers={"User-Agent": "StudyTools-build/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def clean(text):
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def main():
    with open(download(), encoding="utf-8") as f:
        data = json.load(f)

    written = 0
    for book in data["books"]:
        name = book["name"]
        slug = slugify(name)
        chapters = {}
        for chapter in book["chapters"]:
            verses = {}
            for v in chapter["verses"]:
                text = clean(v["text"])
                if text:
                    verses[str(v["verse"])] = text
            chapters[str(chapter["chapter"])] = verses
        out = {"book": name, "slug": slug, "translation": TRANSLATION, "chapters": chapters}
        with open(os.path.join(OUT, f"{slug}.{TRANSLATION}.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        written += 1
    print(f"  {written} books written to data/bible/*.{TRANSLATION}.json")


if __name__ == "__main__":
    main()
