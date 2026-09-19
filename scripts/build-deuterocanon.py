#!/usr/bin/env python3
"""Build deuterocanonical ("Apocrypha") per-book JSON.

Sources (public domain):
  KJVA - King James Version with Apocrypha (1769) from scrollmapper/bible_databases
  DRC  - Douay-Rheims Bible, Challoner Revision, from scrollmapper/bible_databases

Books shared by both traditions are written as <slug>.KJVA.json and <slug>.DRC.json.
Books found in only one tradition are written for that translation only.
Protocanonical books are skipped: KJVA matches the existing KJV text exactly, and
the DRC uses Vulgate versification that would not line up verse-for-verse.

Output: data/bible/<slug>.KJVA.json, data/bible/<slug>.DRC.json,
        and appends deuterocanon entries to data/bible/books.json
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bible")

BASE = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/{}.json"
CACHE = os.path.join(ROOT, "scripts", ".cache")

SLUG_RE = re.compile(r"[^a-z0-9]+")

# Canonical (protocanonical) book names, from the existing KJV index.
CANONICAL = None


def slugify(name):
    return SLUG_RE.sub("-", name.lower().replace("'", "")).strip("-")


def clean(text):
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def fetch(url):
    name = url.rsplit("/", 1)[-1]
    cached = os.path.join(CACHE, name)
    if os.path.exists(cached):
        with open(cached, encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(url, headers={"User-Agent": "StudyTools-build/1.0"})
    with urllib.request.urlopen(req, timeout=240) as r:
        data = json.loads(r.read().decode("utf-8"))
    with open(cached, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return data


def extract(translation, data, seen_translations):
    """Return list of book payloads not already covered by other translations."""
    out = []
    for book in data["books"]:
        name = book["name"]
        if name in CANONICAL:
            continue
        payload = {
            "book": name,
            "slug": slugify(name),
            "translation": translation,
            "deuterocanon": True,
            "chapters": {},
        }
        for chapter in book["chapters"]:
            verses = {}
            for v in chapter["verses"]:
                verses[str(v["verse"])] = clean(v["text"])
            payload["chapters"][str(chapter["chapter"])] = verses
        out.append(payload)
    return out


def main():
    global CANONICAL
    with open(os.path.join(OUT, "books.json"), encoding="utf-8") as f:
        existing = json.load(f)
    CANONICAL = {b["name"] for b in existing if not b.get("deuterocanon")}

    kjva = fetch(BASE.format("KJVA"))
    drc = fetch(BASE.format("DRC"))

    # Rename DRC book names to match KJVA / common English usage where useful.
    drc_renames = {"Prayer of Manasses": "Prayer of Manasses"}
    for book in drc["books"]:
        if book["name"] in drc_renames:
            book["name"] = drc_renames[book["name"]]

    written = {}
    for translation, data in (("KJVA", kjva), ("DRC", drc)):
        for payload in extract(translation, data, written):
            written.setdefault(payload["slug"], set()).add(translation)
            dest = os.path.join(OUT, f"{payload['slug']}.{translation}.json")
            with open(dest, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            print(f"  {translation:5} {payload['book']} ({len(payload['chapters'])} chapters)")

    # Index entries: one per book, listing which translations provide it.
    order = []
    chapter_counts = {}
    for translation, data in (("KJVA", kjva), ("DRC", drc)):
        for book in data["books"]:
            name = book["name"]
            if name in CANONICAL or name in order:
                continue
            order.append(name)
            chapter_counts[name] = len(book["chapters"])

    index = [b for b in existing if not b.get("deuterocanon")]
    for name in order:
        slug = slugify(name)
        index.append({
            "name": name,
            "slug": slug,
            "chapters": chapter_counts[name],
            "testament": "DC",
            "deuterocanon": True,
            "translations": sorted(written.get(slug, [])),
        })

    with open(os.path.join(OUT, "books.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    print(f"books.json: {len(index)} books ({len(index) - len(existing)} deuterocanon)")


if __name__ == "__main__":
    main()
