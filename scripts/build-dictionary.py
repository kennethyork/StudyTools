#!/usr/bin/env python3
"""Build the Bible dictionary data for the Dictionary app.

Source: the NEUU bible-dictionary-dataset, which parses CCEL's ThML XML for
public-domain dictionaries (CC BY 4.0). This script pulls three of them:

  Easton's Bible Dictionary (1897)
  Smith's Bible Dictionary (1863)
  Hastings' Dictionary of the Bible (1909)

Entries are merged by term, one file per letter, with a compact search index so
the browser can look up a word without downloading the whole dictionary.

Output: data/dictionary/<letter>.json
        data/dictionary/index.json
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "dictionary")
CACHE = os.path.join(ROOT, "scripts", ".cache", "dict")

RAW = "https://raw.githubusercontent.com/neuu-org/bible-dictionary-dataset/main/data/02_sources/{}/"

SOURCES = [
    {"id": "easton", "label": "Easton's Bible Dictionary", "year": 1897},
    {"id": "smith", "label": "Smith's Bible Dictionary", "year": 1863},
    {"id": "hastings", "label": "Hastings' Dictionary of the Bible", "year": 1909},
]

UA = {"User-Agent": "StudyTools-build/1.0"}


def fetch(source, letter):
    dest = os.path.join(CACHE, "{}-{}.json".format(source, letter))
    if os.path.exists(dest) and os.path.getsize(dest) > 100:
        with open(dest, encoding="utf-8") as f:
            return json.load(f)
    os.makedirs(CACHE, exist_ok=True)
    url = RAW.format(source) + letter + ".json"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=240) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as exc:
        print("    {} {}: {}".format(source, letter, exc))
        data = {}
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return data


def clean(text):
    text = re.sub(r"<BR\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    index = {}
    letters = [chr(c) for c in range(ord("a"), ord("z") + 1)]

    for letter in letters:
        merged = {}
        for src in SOURCES:
            data = fetch(src["id"], letter)
            for _key, entry in data.items():
                name = entry.get("name") or _key
                slug = entry.get("slug") or re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
                item = merged.setdefault(slug, {"name": name, "slug": slug, "definitions": []})
                for definition in entry.get("definitions", []):
                    text = clean(definition.get("text", ""))
                    if not text:
                        continue
                    item["definitions"].append({
                        "source": definition.get("source", src["id"].upper()),
                        "sourceLabel": src["label"],
                        "year": src["year"],
                        "text": text,
                    })

        entries = sorted(merged.values(), key=lambda e: e["name"].lower())
        for entry in entries:
            entry["definitions"].sort(key=lambda d: d["year"])
        with open(os.path.join(OUT, "{}.json".format(letter)), "w", encoding="utf-8") as f:
            json.dump({"letter": letter, "entries": entries}, f, ensure_ascii=False, separators=(",", ":"))

        index[letter] = [{"name": e["name"], "slug": e["slug"], "count": len(e["definitions"])} for e in entries]
        print("  {}: {} terms".format(letter, len(entries)), flush=True)

    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({
            "sources": [{"id": s["id"], "label": s["label"], "year": s["year"]} for s in SOURCES],
            "letters": index,
            "total": sum(len(v) for v in index.values()),
        }, f, ensure_ascii=False, separators=(",", ":"))
    print("total terms: {}".format(sum(len(v) for v in index.values())))


if __name__ == "__main__":
    main()
