#!/usr/bin/env python3
"""Hydrate and verify the verse text in data/devotional/topics.json against the
canonical KJV data in data/bible/. Any hand-authored verse text is replaced by
the canonical text so the app can never ship a misquoted verse.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPICS = os.path.join(ROOT, "data", "devotional", "topics.json")
BIBLE = os.path.join(ROOT, "data", "bible")

BOOK_ALIASES = {
    "psalm": "psalms",
    "psalms": "psalms",
    "song of solomon": "song-of-solomon",
    "1 corinthians": "i-corinthians",
    "2 corinthians": "ii-corinthians",
    "1 thessalonians": "i-thessalonians",
    "2 thessalonians": "ii-thessalonians",
    "1 timothy": "i-timothy",
    "2 timothy": "ii-timothy",
    "1 peter": "i-peter",
    "2 peter": "ii-peter",
    "1 john": "i-john",
    "2 john": "ii-john",
    "3 john": "iii-john",
}

REF_RE = re.compile(r"^\s*(\d?\s*[A-Za-z][A-Za-z ]*?)\s+(\d+):(\d+)(?:-(\d+))?\s*$")


def book_slug(name):
    key = name.strip().lower()
    if key in BOOK_ALIASES:
        return BOOK_ALIASES[key]
    return re.sub(r"[^a-z0-9]+", "-", key).strip("-")


def load_book(slug, translation="KJV"):
    path = os.path.join(BIBLE, f"{slug}.{translation}.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def resolve(ref):
    m = REF_RE.match(ref)
    if not m:
        raise ValueError(f"cannot parse ref {ref!r}")
    book, chapter, start, end = m.group(1), m.group(2), int(m.group(3)), m.group(4)
    data = load_book(book_slug(book))
    verses = data["chapters"][chapter]
    last = int(end) if end else start
    parts = [verses[str(v)] for v in range(start, last + 1)]
    return " ".join(parts)


def main():
    with open(TOPICS, encoding="utf-8") as f:
        payload = json.load(f)
    fixed = 0
    for topic in payload["topics"]:
        for sc in topic["scriptures"]:
            canonical = resolve(sc["ref"])
            if sc.get("verse") != canonical:
                sc["verse"] = canonical
                fixed += 1
    with open(TOPICS, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"verified {sum(len(t['scriptures']) for t in payload['topics'])} verses; corrected {fixed}")


if __name__ == "__main__":
    main()
