#!/usr/bin/env python3
"""Build the word index for the Search app.

There is no server, so the index is built here and shipped as a file the browser
reads whole: one entry per word, holding the verses it appears in, delta-encoded
so the numbers stay small. Verse ids are arithmetic — book index (from
data/bible/books.json, so they line up across translations), then chapter, then
verse — which keeps the index to a word list and nothing else.

Tokenising happens twice, once here and once in js/search.js at query time, so
the rules have to agree exactly. The build writes data/search/tokens-sample.json
from real verses, and scripts/check-search.js re-tokenises those with the
JavaScript and fails if the two drift.

Output:
  data/search/index.json        the book table, the translations, the statistics
  data/search/<translation>.json  the word list for one translation
  data/search/tokens-sample.json  fixture pinning the tokeniser
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "search")
BIBLE = os.path.join(ROOT, "data", "bible")

# Words carry letters: "144" and "000" are verse noise, not search terms.
TOKEN_RE = re.compile(r"[a-z0-9']+")
SAMPLE_WORDS = ["god", "shepherd", "justification", "the", "light", "wilderness"]


def tokenize(text):
    """Lower-case, split on everything but letters, digits and apostrophes, drop
    one-character tokens and anything without a letter. js/search.js does this
    identically."""
    out = []
    for raw in TOKEN_RE.findall(str(text or "").lower().replace("\u2019", "'")):
        token = raw.strip("'")
        if len(token) < 2 or not any(c.isalpha() for c in token):
            continue
        out.append(token)
    return out


def verse_id(book_index, chapter, verse):
    return book_index * 1000000 + chapter * 1000 + verse


def main():
    books = json.load(open(os.path.join(BIBLE, "books.json"), encoding="utf-8"))
    translations = json.load(open(os.path.join(BIBLE, "translations.json"), encoding="utf-8"))["translations"]
    os.makedirs(OUT, exist_ok=True)

    book_table = [{"slug": b["slug"], "name": b["name"], "chapters": b["chapters"]}
                  for b in books]
    index_of = {b["slug"]: i for i, b in enumerate(books)}

    reports = []
    sample = {}
    for t in translations:
        postings = {}
        verses = 0
        for b in books:
            path = os.path.join(BIBLE, "{}.{}.json".format(b["slug"], t["id"]))
            if not os.path.exists(path):
                continue
            data = json.load(open(path, encoding="utf-8"))
            for chapter, verse_map in (data.get("chapters") or {}).items():
                try:
                    chapter_num = int(chapter)
                except ValueError:
                    continue
                for verse, text in verse_map.items():
                    try:
                        verse_num = int(verse)
                    except ValueError:
                        continue
                    words = set(tokenize(text))
                    if not words:
                        continue
                    verses += 1
                    vid = verse_id(index_of[b["slug"]], chapter_num, verse_num)
                    for word in words:
                        postings.setdefault(word, []).append(vid)
                    if len(sample) < 40 and any(w in words for w in SAMPLE_WORDS):
                        # The whole verse, and this tokeniser's output for it:
                        # order and repeats included, so the JavaScript check can
                        # only pass by tokenising identically. Truncating here
                        # once made the fixture disagree with itself.
                        sample.setdefault(text, tokenize(text))

        # delta-encode: the ids are ascending, so store the gaps
        encoded = {}
        for word, ids in postings.items():
            ids.sort()
            previous = 0
            gaps = []
            for vid in ids:
                gaps.append(vid - previous)
                previous = vid
            encoded[word] = ",".join(str(g) for g in gaps)

        payload = {
            "translation": t["id"],
            "name": t["name"],
            "versification": t.get("versification", "masoretic"),
            "verses": verses,
            "words": len(encoded),
            "postings": encoded,
        }
        path = os.path.join(OUT, "{}.json".format(t["id"]))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        reports.append((t["id"], verses, len(encoded), os.path.getsize(path) / 1e6))

    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({
            "source": "The site's own translations of the public-domain texts it carries.",
            "books": book_table,
            # the versification travels with the translation, so the app can tell
            # that a numbering is its own and label the results accordingly
            "translations": [{"id": t["id"], "name": t["name"],
                              "versification": t.get("versification", "masoretic")}
                             for t in translations],
        }, f, ensure_ascii=False, indent=1)
        f.write("\n")

    with open(os.path.join(OUT, "tokens-sample.json"), "w", encoding="utf-8") as f:
        json.dump({"tokenize": sample}, f, ensure_ascii=False, indent=1)
        f.write("\n")

    for tid, verses, words, size in reports:
        print("  {:<6} {:>7,} verses  {:>7,} words  {:>6.1f} MB".format(tid, verses, words, size))
    print("  {} sampled verses pinned for the tokeniser check".format(len(sample)))


if __name__ == "__main__":
    main()
