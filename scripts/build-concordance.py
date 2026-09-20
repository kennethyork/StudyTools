#!/usr/bin/env python3
"""Build a Strong's concordance from the interlinear already on disk.

    python3 scripts/build-concordance.py

Every word in data/interlinear/ carries a Strong's number, so the site can
already say what a word means; this is what lets it say where else the word
appears. There is no second source and no download: the index is a re-reading of
the interlinear, and check-concordance.js re-reads it the same way.

Output:
  data/concordance/h.json     the Hebrew words, with the verses each appears in
  data/concordance/g.json     the Greek
  data/concordance/index.json  the book table, the counts, and where to look

Verse ids are the same integers the word index uses (book * 1000000 +
chapter * 1000 + verse) and the verse lists are delta-encoded, so a word used in
twenty verses costs twenty small numbers rather than twenty references.
"""
import json
import glob
import os
import re
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTERLINEAR = os.path.join(ROOT, "data", "interlinear")
OUT = os.path.join(ROOT, "data", "concordance")

STRONG = re.compile(r"^([HG])(\d+)$")


def verse_id(book_index, chapter, verse):
    return book_index * 1000000 + chapter * 1000 + verse


def encode(ids):
    """Ascending ids as gaps: "1,3,120" for 1, 4, 124."""
    out = []
    previous = 0
    for vid in ids:
        out.append(str(vid - previous))
        previous = vid
    return ",".join(out)


def main():
    books = json.load(open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))
    order = [b for b in books if os.path.isdir(os.path.join(INTERLINEAR, b["slug"]))]
    index_of = {b["slug"]: i for i, b in enumerate(order)}

    numbers = defaultdict(lambda: {"ids": [], "l": Counter(), "t": Counter(), "e": Counter()})
    words = 0
    skipped = 0

    for book in order:
        for path in sorted(glob.glob(os.path.join(INTERLINEAR, book["slug"], "*.json")),
                           key=lambda p: int(os.path.basename(p)[:-5])):
            data = json.load(open(path, encoding="utf-8"))
            chapter = int(os.path.basename(path)[:-5])
            for verse, entries in data.get("verses", {}).items():
                seen_here = set()
                for entry in entries:
                    match = STRONG.match(str(entry.get("s") or ""))
                    if not match:
                        skipped += 1
                        continue
                    number = entry["s"]
                    words += 1
                    if number in seen_here:
                        continue              # counted once per verse, like a concordance
                    seen_here.add(number)
                    item = numbers[number]
                    item["ids"].append(verse_id(index_of[book["slug"]], chapter, int(verse)))
                    for key, field in (("l", "l"), ("t", "t"), ("e", "e")):
                        value = (entry.get(field) or "").strip()
                        if value:
                            item[key][value] += 1

    shards = {"H": {}, "G": {}}
    occurrences = 0
    for number, item in numbers.items():
        ids = sorted(set(item["ids"]))
        occurrences += len(ids)
        top = lambda c: (c.most_common(1)[0][0] if c else "")
        shards[number[0]][number] = {
            "l": top(item["l"]), "t": top(item["t"]), "e": top(item["e"]),
            "n": len(ids), "ids": encode(ids),
        }

    os.makedirs(OUT, exist_ok=True)
    table = [{"slug": b["slug"], "name": b["name"], "chapters": b["chapters"]} for b in order]
    sizes = {}
    for letter, words_in in shards.items():
        path = os.path.join(OUT, letter.lower() + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"books": table, "words": words_in}, f, ensure_ascii=False,
                      separators=(",", ":"))
        sizes[letter] = {"file": letter.lower() + ".json", "words": len(words_in),
                         "bytes": os.path.getsize(path)}

    index = {
        "books": table,
        "files": {letter: data["file"] for letter, data in sizes.items()},
        "sources": [{"id": "interlinear", "name": "OpenGNT (Greek) and the Open Scriptures "
                                                 "Hebrew Bible with STEPBible glosses",
                     "licence": "CC BY-SA 4.0 / CC BY 4.0"}],
        "words": sum(len(w) for w in shards.values()),
        "withStrongs": words,
        "withoutStrongs": skipped,
        "occurrences": occurrences,
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write("\n")

    for letter, data in sorted(sizes.items()):
        print("  {}: {:>5,} words  {} ({:.1f} MB)".format(
            letter, data["words"], data["file"], data["bytes"] / 1e6))
    print("  {:,} words in the interlinear, {:,} of them with a Strong's number, "
          "{:,} word-in-verse entries indexed".format(words + skipped, words, occurrences))
    if skipped:
        print("  {} word(s) carry no Strong's number and are not indexed".format(skipped))


if __name__ == "__main__":
    main()
