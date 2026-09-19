#!/usr/bin/env python3
"""Fetch the World English Bible (WEB) from TehShrike/world-english-bible and
normalize into data/bible/<slug>.WEB.json matching the other translations.

WEB is public domain (Michael Paul Johnson / eBible.org).
Only 'paragraph text' and 'line text' items carry verse content; poetry books
(Psalms, Proverbs, etc.) use 'line text'. Verses are merged in order.
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bible")
CACHE = os.path.join(ROOT, "scripts", ".cache", "web")

BASE = "https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/{}.json"

FILE_MAP = {
    "Song of Solomon": "songofsolomon",
    "Revelation of John": "revelation",
}


def fetch(name):
    dest = os.path.join(CACHE, f"{name}.json")
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    os.makedirs(CACHE, exist_ok=True)
    print(f"  downloading {name} ...", flush=True)
    req = urllib.request.Request(BASE.format(name), headers={"User-Agent": "StudyTools-build/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def remote_name(name):
    if name in FILE_MAP:
        return FILE_MAP[name]
    return name.lower().replace("iii ", "3").replace("ii ", "2").replace("i ", "1").replace(" ", "").replace("'", "")


def main():
    books_index = json.load(open(os.path.join(OUT, "books.json"), encoding="utf-8"))
    for book in books_index:
        name = book["name"]
        with open(fetch(remote_name(name)), encoding="utf-8") as f:
            raw = json.load(f)

        chapters = {}
        for item in raw:
            if item.get("type") not in ("paragraph text", "line text"):
                continue
            ch = item.get("chapterNumber")
            vs = item.get("verseNumber")
            val = item.get("value")
            if ch is None or vs is None or not val:
                continue
            ch, vs = str(ch), str(vs)
            text = re.sub(r"\s+", " ", val.replace("\u00a0", " ")).strip()
            bucket = chapters.setdefault(ch, {})
            bucket[vs] = (bucket.get(vs, "") + " " + text).strip() if vs in bucket else text

        out = {"book": name, "slug": slugify(name), "translation": "WEB", "chapters": chapters}
        with open(os.path.join(OUT, f"{slugify(name)}.WEB.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        print(f"  {name}: {len(chapters)} chapters")


SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(name):
    return SLUG_RE.sub("-", name.lower().replace("'", "")).strip("-")


if __name__ == "__main__":
    main()
