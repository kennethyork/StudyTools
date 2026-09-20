#!/usr/bin/env python3
"""Build the commentary data: what the church's commentators said, verse by verse.

Sources, all public domain and verse-indexed:

  jamieson-fausset-brown  Jamieson, Fausset and Brown, Commentary Critical and
                          Explanatory on the Whole Bible (1871), all 66 books,
                          served per chapter by HelloAO's Free Use Bible API.
  calvin                  John Calvin's Commentaries, 47 books, and
  fbmeyer                 F. B. Meyer, Through the Bible Day by Day — both from
                          thefrenchpressed/pillar-commentary-data, converted from
                          the CrossWire project's public-domain CCEL texts.

A verse with no comment in a source is absent rather than empty, and the sources
say where they are incomplete — Calvin never wrote on Samuel, Kings, Chronicles,
Job, Proverbs, Acts or Revelation, and the Pillar conversion drops a handful of
verses where a book's front matter had been attached to a verse slot instead of a
comment. Those are shown as missing, not filled in.

JFB also writes front matter before the verses of most chapters — the argument of
the passage, in its own paragraphs, and sometimes the only place it comments on a
verse at all (Genesis 1:1 is in the introduction, not on the verse; the Song of
Solomon has nothing else). That is carried too, as introduction paragraphs.

Output:
  data/commentary/<book-slug>/<chapter>.json   the comments on each verse, and
                                               the chapter's introduction
  data/commentary/index.json                   which sources cover what
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "commentary")
CACHE = os.path.join(ROOT, "scripts", ".cache", "commentary")
UA = {"User-Agent": "StudyTools-build/1.0", "Accept-Encoding": "identity"}

HELLOAO = "https://bible.helloao.org/api/c/{source}/{usfm}/{chapter}.json"
PILLAR = ("https://raw.githubusercontent.com/thefrenchpressed/pillar-commentary-data/"
          "main/c/{source}/{usfm}/{chapter}.json")

SOURCES = [
    {"id": "jamieson-fausset-brown", "short": "JFB", "name": "Jamieson, Fausset & Brown",
     "year": "1871", "url": HELLOAO},
    {"id": "calvin", "short": "Calvin", "name": "John Calvin",
     "year": "1550s", "url": PILLAR},
    {"id": "fbmeyer", "short": "Meyer", "name": "F. B. Meyer",
     "year": "1900s", "url": PILLAR}
]

# USFM codes, for asking these sources for the right chapter.
USFM = {
    "genesis": "GEN", "exodus": "EXO", "leviticus": "LEV", "numbers": "NUM",
    "deuteronomy": "DEU", "joshua": "JOS", "judges": "JDG", "ruth": "RUT",
    "i-samuel": "1SA", "ii-samuel": "2SA", "i-kings": "1KI", "ii-kings": "2KI",
    "i-chronicles": "1CH", "ii-chronicles": "2CH", "ezra": "EZR", "nehemiah": "NEH",
    "esther": "EST", "job": "JOB", "psalms": "PSA", "proverbs": "PRO",
    "ecclesiastes": "ECC", "song-of-solomon": "SNG", "isaiah": "ISA", "jeremiah": "JER",
    "lamentations": "LAM", "ezekiel": "EZK", "daniel": "DAN", "hosea": "HOS",
    "joel": "JOL", "amos": "AMO", "obadiah": "OBA", "jonah": "JON", "micah": "MIC",
    "nahum": "NAM", "habakkuk": "HAB", "zephaniah": "ZEP", "haggai": "HAG",
    "zechariah": "ZEC", "malachi": "MAL",
    "matthew": "MAT", "mark": "MRK", "luke": "LUK", "john": "JHN", "acts": "ACT",
    "romans": "ROM", "i-corinthians": "1CO", "ii-corinthians": "2CO", "galatians": "GAL",
    "ephesians": "EPH", "philippians": "PHP", "colossians": "COL",
    "i-thessalonians": "1TH", "ii-thessalonians": "2TH", "i-timothy": "1TI",
    "ii-timothy": "2TI", "titus": "TIT", "philemon": "PHM", "hebrews": "HEB",
    "james": "JAS", "i-peter": "1PE", "ii-peter": "2PE", "i-john": "1JN",
    "ii-john": "2JN", "iii-john": "3JN", "jude": "JUD", "revelation-of-john": "REV"
}


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 40:
        return open(dest, encoding="utf-8").read()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read().decode("utf-8")
    except Exception:
        body = ""
    with open(dest, "w", encoding="utf-8") as f:
        f.write(body)
    return body


TAG = re.compile(r"<[^>]+>")
LEADING_NUMBER = re.compile(r"^\s*\**\s*\d+\s*[.:]\s*")


def clean(text):
    """The sources carry a little markup and a leading verse number."""
    t = TAG.sub(" ", str(text or ""))
    t = t.replace("\u00a0", " ").replace("\u2019", "'")
    t = LEADING_NUMBER.sub("", t.strip())
    return re.sub(r"\s+", " ", t).strip()


def introduction_paragraphs(payload):
    """The front matter these sources print before a chapter's verses.

    Kept as paragraphs: it is written as prose with a heading, and running it
    together the way a verse comment can be run together would lose its shape.
    """
    chapter = (payload or {}).get("chapter") or {}
    intro = chapter.get("introduction")
    if not intro:
        return []
    if isinstance(intro, list):
        intro = " ".join(str(part) for part in intro)
    return [p for p in (clean(p) for p in re.split(r"\n\s*\n", str(intro))) if p]


def verse_texts(payload):
    """{verse: text} from the HelloAO shape, which both sources use."""
    out = {}
    chapter = (payload or {}).get("chapter") or {}
    for block in chapter.get("content") or []:
        if block.get("type") != "verse":
            continue
        number = block.get("number")
        if number is None:
            continue
        pieces = []
        for part in block.get("content") or []:
            if isinstance(part, dict) and part.get("text"):
                pieces.append(part["text"])
            elif isinstance(part, str):
                pieces.append(part)
        text = clean(" ".join(pieces))
        if text:
            out[int(number)] = text
    return out


def main():
    books = json.load(open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    coverage = {s["id"]: {"books": set(), "chapters": 0, "verses": 0, "introductions": 0}
                for s in SOURCES}
    written = 0
    total_bytes = 0

    for book in books:
        slug = book["slug"]
        usfm = USFM.get(slug)
        if not usfm:
            continue                                 # the deuterocanon: no commentary source

        for chapter in range(1, book["chapters"] + 1):
            per_verse = {}
            introductions = []
            for source in SOURCES:
                url = source["url"].format(source=source["id"], usfm=usfm, chapter=chapter)
                dest = os.path.join(CACHE, source["id"], usfm, "{}.json".format(chapter))
                body = fetch(url, dest)
                if not body:
                    continue
                try:
                    payload = json.loads(body)
                except ValueError:
                    continue
                paragraphs = introduction_paragraphs(payload)
                if paragraphs:
                    introductions.append({"source": source["id"], "short": source["short"],
                                          "year": source["year"], "paragraphs": paragraphs})
                    coverage[source["id"]]["introductions"] += 1
                    coverage[source["id"]]["books"].add(slug)
                texts = verse_texts(payload)
                if not texts:
                    continue
                coverage[source["id"]]["books"].add(slug)
                coverage[source["id"]]["chapters"] += 1
                coverage[source["id"]]["verses"] += len(texts)
                for verse, text in texts.items():
                    per_verse.setdefault(verse, []).append(
                        {"source": source["id"], "short": source["short"], "text": text})

            if not per_verse and not introductions:
                continue
            dest_dir = os.path.join(OUT, slug)
            os.makedirs(dest_dir, exist_ok=True)
            path = os.path.join(dest_dir, "{}.json".format(chapter))
            payload = {
                "book": book["name"], "slug": slug, "chapter": chapter,
                "sources": [{"id": s["id"], "short": s["short"], "name": s["name"],
                             "year": s["year"]} for s in SOURCES],
                "verses": {str(v): per_verse[v] for v in sorted(per_verse)}
            }
            if introductions:
                payload["introductions"] = introductions
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            written += 1
            total_bytes += os.path.getsize(path)

    index = {
        "sources": [{"id": s["id"], "short": s["short"], "name": s["name"], "year": s["year"],
                     "books": len(coverage[s["id"]]["books"]),
                     "chapters": coverage[s["id"]]["chapters"],
                     "verses": coverage[s["id"]]["verses"],
                     "introductions": coverage[s["id"]]["introductions"]} for s in SOURCES],
        "books": sorted({b for s in coverage.values() for b in s["books"]})
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write("\n")

    for s in index["sources"]:
        print("  {:<26} {:>3} books  {:>5} chapters  {:>7,} verses  {:>5,} introductions".format(
            s["name"], s["books"], s["chapters"], s["verses"], s["introductions"]))
    print("  {} chapter files, {:.1f} MB".format(written, total_bytes / 1e6))


if __name__ == "__main__":
    main()
