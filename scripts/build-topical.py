#!/usr/bin/env python3
"""Build the topical Bible data for the Topical Bible app.

Source: j86schroeder/topical-bible-search (MIT), which turns Nave's Topical
Bible (1897) and Torrey's New Topical Textbook (1897) into structured JSONL.
Both source works are public domain. Reference assertions are already
normalized and audited by that project.

Output: data/topical/<source>/<letter>.json  (one file per initial)
        data/topical/index.json
Each topic carries its entries with normalised reference groups so the app can
resolve verse text from the bundled translations.
"""
import json
import os
import re
import urllib.request
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "topical")
CACHE = os.path.join(ROOT, "scripts", ".cache", "topical")

RAW = "https://raw.githubusercontent.com/j86schroeder/topical-bible-search/main/dist/{}/"
SOURCES = [
    {"id": "nave", "label": "Nave's Topical Bible", "year": 1897},
    {"id": "torrey", "label": "Torrey's New Topical Textbook", "year": 1897},
]
UA = {"User-Agent": "StudyTools-build/1.0"}


def download(source, filename):
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, "{}-{}.jsonl".format(source, filename))
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    url = RAW.format(source) + filename
    print("  downloading {}/{} ...".format(source, filename), flush=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return dest


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def initial(name):
    for ch in name:
        if ch.isalpha():
            return ch.lower()
    return "0"


def main():
    os.makedirs(OUT, exist_ok=True)
    summary = {}

    for src in SOURCES:
        topics_path = download(src["id"], "topics.jsonl")
        entries_path = download(src["id"], "entries.jsonl")

        entries_by_topic = {}
        for entry in read_jsonl(entries_path):
            entries_by_topic.setdefault(entry["topicId"], []).append({
                "index": entry.get("entryIndex", 0),
                "text": entry.get("rawText", "").strip(),
                "refs": entry.get("refGroups", []),
            })

        buckets = OrderedDict()
        count = 0
        for topic in read_jsonl(topics_path):
            letter = initial(topic["sourceTopic"])
            item = {
                "slug": topic["sourceTopicSlug"],
                "name": topic["sourceTopic"],
                "source": src["id"],
                "seeAlso": topic.get("seeAlso", []),
                "entries": sorted(entries_by_topic.get(topic["id"], []), key=lambda e: e["index"]),
            }
            item["entries"] = [e for e in item["entries"] if e["text"] or e["refs"]]
            buckets.setdefault(letter, []).append(item)
            count += 1

        src_dir = os.path.join(OUT, src["id"])
        os.makedirs(src_dir, exist_ok=True)
        for letter, topics in buckets.items():
            topics.sort(key=lambda t: t["name"].lower())
            with open(os.path.join(src_dir, "{}.json".format(letter)), "w", encoding="utf-8") as f:
                json.dump({"source": src["id"], "letter": letter, "topics": topics},
                          f, ensure_ascii=False, separators=(",", ":"))

        summary[src["id"]] = {
            "label": src["label"],
            "year": src["year"],
            "topics": count,
            "letters": sorted(buckets.keys()),
        }
        print("  {}: {} topics across {} letters".format(src["id"], count, len(buckets)))

    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"sources": summary,
                   "total": sum(v["topics"] for v in summary.values())},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("total topics: {}".format(sum(v["topics"] for v in summary.values())))


if __name__ == "__main__":
    main()
