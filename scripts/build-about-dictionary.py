#!/usr/bin/env python3
"""About this book, for the deuterocanonical books no commentary reaches.

    python3 scripts/build-about-dictionary.py

Haydock covers twelve of the twenty deuterocanonical books verse by verse. Six
are left, and no public-domain commentary on them exists in a form that can be
quoted beside Scripture — Charles is the only substantial treatment and it is
still OCR. Four of those six, though, are the subject of articles in the
dictionaries this site already bundles and already licences: Hastings (1909) on
the books of Esdras and on the books of the Maccabees.

So a reader opening 1 Esdras, 2 Esdras, 3 Maccabees or 4 Maccabees gets that
article, under a heading that names it, with a line saying what it is: an article
on the book, not a commentary on its verses. Naming the shelf the text came from
is the whole point — a dictionary entry presented as commentary would be exactly
the kind of quiet substitution this site's checks exist to prevent.

The two that no dictionary article reaches — the Prayer of Manasses and Psalm 151
— are left alone, and the panel keeps saying so.

Output: data/about/<book-slug>.json, the file the panels already read.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ABOUT = os.path.join(ROOT, "data", "about")
DICTIONARY = os.path.join(ROOT, "data", "dictionary")

SOURCE = {"id": "has", "short": "Hastings", "name": "Hastings' Dictionary of the Bible",
          "year": 1909}

# slug: the article, and what to say about it above it. The articles cover the
# books together rather than one by one, and say so rather than being cut up.
BOOKS = [
    ("i-esdras", "ESDRAS, THE BOOKS OF.",
     "Hastings treats the two books of Esdras in one article, and it is that "
     "article, not a commentary on the verses of this book — the site has none "
     "for it."),
    ("ii-esdras", "ESDRAS, THE BOOKS OF.",
     "Hastings treats the two books of Esdras in one article, and it is that "
     "article, not a commentary on the verses of this book — the site has none "
     "for it."),
    ("iii-maccabees", "MACCABEES, THE BOOKS OF THE",
     "Hastings treats the five books of the Maccabees in one article, and it is "
     "that article, not a commentary on the verses of this book — the site has "
     "none for it."),
    ("iv-maccabees", "MACCABEES, THE BOOKS OF THE",
     "Hastings treats the five books of the Maccabees in one article, and it is "
     "that article, not a commentary on the verses of this book — the site has "
     "none for it."),
]


def entries():
    out = {}
    for name in sorted(os.listdir(DICTIONARY)):
        if not name.endswith(".json"):
            continue
        data = json.load(open(os.path.join(DICTIONARY, name), encoding="utf-8"))
        got = data.get("entries") or data.get("words") or []
        if not isinstance(got, list):
            got = list(got.values())
        for entry in got:
            if isinstance(entry, dict) and entry.get("name"):
                out.setdefault(str(entry["name"]), entry)
    return out


def main():
    books = {b["slug"]: b for b in json.load(
        open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))}
    by_name = entries()
    os.makedirs(ABOUT, exist_ok=True)
    written = 0
    for slug, article, note in BOOKS:
        if slug not in books:
            print("  {}: the reader has no such book".format(slug))
            continue
        entry = by_name.get(article)
        if not entry:
            print("  {}: no article {!r} in the dictionaries".format(slug, article))
            continue
        definitions = [d for d in (entry.get("definitions") or [])
                       if str(d.get("source")) == SOURCE["id"]]
        if not definitions:
            definitions = entry.get("definitions") or []
        paragraphs = []
        for definition in definitions:
            text = re.sub(r"\s+", " ", str(definition.get("text") or "")).strip()
            if text:
                paragraphs.append(text)
        paragraphs = [p for p in paragraphs if len(p) > 60]
        if not paragraphs:
            print("  {}: the article is empty as stored".format(slug))
            continue
        path = os.path.join(ABOUT, slug + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"book": books[slug]["name"], "slug": slug,
                       "source": dict(SOURCE),
                       "article": article,
                       "title": "About {}".format(books[slug]["name"]),
                       "note": note,
                       "paragraphs": paragraphs},
                      f, ensure_ascii=False, separators=(",", ":"))
        written += 1
        print("  {:<16} {:>6,} characters from {!r}".format(
            slug, sum(len(p) for p in paragraphs), article))
    print("  {} about file(s) written to data/about/".format(written))


if __name__ == "__main__":
    main()
