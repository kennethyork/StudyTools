#!/usr/bin/env python3
"""Build per-book Bible JSON from public-domain translation sources.

Sources (all public domain texts, redistributed by scrollmapper/bible_databases):
  KJV  - King James Version (1769)
  ASV  - American Standard Version (1901)
  WEB  - World English Bible (via scrollmapper's 'WEB' entry if available, else TehShrike)
  YLT  - Young's Literal Translation (1862/1898)

Output: data/bible/<slug>.json  -> { "book": "Genesis", "translation": "KJV", "chapters": { "1": { "1": "text" } } }
Also writes data/bible/books.json (index) and data/bible/translations.json.
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bible")
CACHE = os.path.join(ROOT, "scripts", ".cache")

BASE = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/{}.json"

TRANSLATIONS = ["KJV", "ASV", "YLT", "Webster"]

SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name):
    s = name.lower().replace("'", "")
    return SLUG_RE.sub("-", s).strip("-")


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  downloading {os.path.basename(dest)} ...", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "StudyTools-build/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return dest


def clean(text):
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)

    books_index = []
    for tr in TRANSLATIONS:
        path = download(BASE.format(tr), os.path.join(CACHE, f"{tr}.json"))
        print(f"processing {tr} ...", flush=True)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for book in data["books"]:
            name = book["name"]
            slug = slugify(name)
            out = {
                "book": name,
                "slug": slug,
                "translation": tr,
                "chapters": {},
            }
            for chapter in book["chapters"]:
                verses = {}
                for v in chapter["verses"]:
                    verses[str(v["verse"])] = clean(v["text"])
                out["chapters"][str(chapter["chapter"])] = verses
            dest = os.path.join(OUT, f"{slug}.{tr}.json")
            with open(dest, "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

        if tr == "KJV":
            for book in data["books"]:
                books_index.append(
                    {
                        "name": book["name"],
                        "slug": slugify(book["name"]),
                        "chapters": len(book["chapters"]),
                        "testament": "OT" if len(books_index) < 39 else "NT",
                    }
                )

    with open(os.path.join(OUT, "books.json"), "w", encoding="utf-8") as f:
        json.dump(books_index, f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(OUT, "translations.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "translations": [
                    {"id": "KJV", "name": "King James Version", "year": 1769},
                    {"id": "ASV", "name": "American Standard Version", "year": 1901},
                    {"id": "WEB", "name": "World English Bible", "year": 2000},
                    {"id": "YLT", "name": "Young's Literal Translation", "year": 1862},
                    {"id": "Webster", "name": "Webster Bible", "year": 1833},
                ]
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    print(f"done: {len(books_index)} books x {len(TRANSLATIONS)} translations")


if __name__ == "__main__":
    main()
