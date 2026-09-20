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
import importlib.util
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


def index_writer():
    """The one place that writes data/commentary/index.json."""
    spec = importlib.util.spec_from_file_location(
        "build_haydock", os.path.join(ROOT, "scripts", "build-haydock.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    books = json.load(open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
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
                texts = verse_texts(payload)
                if not texts:
                    continue
                for verse, text in texts.items():
                    per_verse.setdefault(verse, []).append(
                        {"source": source["id"], "short": source["short"], "text": text})

            if not per_verse and not introductions:
                continue
            dest_dir = os.path.join(OUT, slug)
            os.makedirs(dest_dir, exist_ok=True)
            path = os.path.join(dest_dir, "{}.json".format(chapter))
            verses = {str(v): list(per_verse[v]) for v in sorted(per_verse)}
            intros = list(introductions)
            # Daniel is commented on by these three and by Haydock, and his remarks
            # have to survive a rebuild of the canon: keep whatever a source this
            # script does not handle already put in the file.
            mine = {s["id"] for s in SOURCES}
            if os.path.exists(path):
                old = json.load(open(path, encoding="utf-8"))
                for verse, entries in (old.get("verses") or {}).items():
                    keep = [e for e in entries if e.get("source") not in mine]
                    if keep:
                        verses[verse] = sorted(keep + verses.get(verse, []),
                                               key=lambda e: e.get("source", ""))
                for intro in old.get("introductions") or []:
                    if intro.get("source") not in mine:
                        intros.append(intro)
            sources = [{"id": s["id"], "short": s["short"], "name": s["name"],
                        "year": s["year"]} for s in SOURCES]
            if os.path.exists(path):
                for source in json.load(open(path, encoding="utf-8")).get("sources") or []:
                    if source.get("id") not in mine:
                        sources.append(source)
            payload = {
                "book": book["name"], "slug": slug, "chapter": chapter,
                "sources": sources,
                "verses": verses
            }
            if intros:
                payload["introductions"] = intros
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
            written += 1
            total_bytes += os.path.getsize(path)

    # The index is not this script's to keep. build-haydock.py's write_index()
    # reads the files on disk and counts what is there, whichever script wrote
    # them, so a build can never publish an index that disagrees with the data —
    # and Haydock's deuterocanonical books are counted here without this script
    # knowing anything about them.
    index = index_writer().write_index()

    for s in index["sources"]:
        print("  {:<10} {:>3} books  {:>5} chapters  {:>7,} verses  {:>5,} introductions".format(
            s["short"], s["books"], s["chapters"], s["verses"], s["introductions"]))
    print("  {} chapter files, {:.1f} MB".format(written, total_bytes / 1e6))


if __name__ == "__main__":
    main()
