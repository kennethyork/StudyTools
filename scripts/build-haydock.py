#!/usr/bin/env python3
"""Add Haydock's Catholic Bible Commentary to the deuterocanonical books.

    python3 scripts/build-haydock.py

The three works this site bundles — Jamieson, Fausset & Brown, Calvin, Meyer —
are Protestant in range and stop at the sixty-six books, so Tobit, Judith,
Wisdom, Sirach, Baruch and the Maccabees had no commentary at all. Haydock's
Catholic Bible Commentary (1859) covers them verse by verse, following the
Douay-Rheims text and numbering, and it is public domain.

Source: the 1859 edition as transcribed at ecatholic2000.com, whose pages carry
each verse's remark in a paragraph anchored to its own reference
(<a id="3:24">Ver. 24.</a>), so the verse a comment belongs to is stated by the
page rather than guessed from the order of the paragraphs. The transcription, not
the printed edition, is what is fetched, and the cache keeps every page so a
rebuild costs nothing.

Output, in the shape the reader already reads:
  data/commentary/<book>/<chapter>.json   Haydock's remarks, merged with any
                                          commentary already there
  data/about/<book>.json                  his introduction to the book
  data/commentary/index.json              with Haydock added to the sources
"""
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMMENTARY = os.path.join(ROOT, "data", "commentary")
ABOUT = os.path.join(ROOT, "data", "about")
CACHE = os.path.join(ROOT, "scripts", ".cache", "haydock")
BASE = "https://www.ecatholic2000.com/haydock/"
INDEX_URL = BASE + "title.shtml"
UA = {"User-Agent": "StudyTools-build/1.0 (public-domain commentary)"}

SOURCE = {"id": "haydock", "short": "Haydock", "name": "George Leo Haydock",
          "year": "1859"}

# data/bible/books.json, read once in main() so the helpers below can ask which
# translations carry a book and therefore which verses exist to comment on.
BOOKS_OF_RECORD = []

# What the transcription calls a book, and where its chapters go here. A tuple
# means the source's chapter N is filed under another book of ours, which is how
# the Vulgate's Daniel 13 and 14 are Susanna and Bel in this reader, and how its
# Baruch 6 is the Epistle of Jeremiah.
BOOKS = [
    ("The Book of Tobias.", "tobit", None),
    ("The Book of Judith.", "judith", None),
    ("The Book of Esther.", "esther-greek", None),
    ("The Book of Wisdom.", "wisdom", None),
    ("The Book of Ecclesiasticus.", "sirach", None),
    ("The Prophecy of Baruch.", "baruch", None),
    ("The Prophecy of Daniel.", "daniel", None),
    ("The First Book of Machabees.", "i-maccabees", None),
    ("The Second Book of Machabees.", "ii-maccabees", None),
]

# Chapters of the source that belong to a book of ours other than the one the
# source files them under, and where their verses go.
REDIRECT = {
    ("daniel", 13): ("susanna", 1),
    ("daniel", 14): ("bel-and-the-dragon", 1),
    ("baruch", 6): ("epistle-of-jeremiah", 1),
}

TAG = re.compile(r"<[^>]+>")
ANCHOR = re.compile(r'<a\s+id="(\d+):(\d+)"[^>]*>\s*Ver\.\s*(\d+)\.\s*</a>', re.I)
PARA = re.compile(r"<p\b[^>]*>(.*?)</p>", re.I | re.S)


def fetch(path):
    """A page, from the cache when it is there."""
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, path.replace("/", "_"))
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        return open(dest, encoding="utf-8", errors="replace").read()
    req = urllib.request.Request(BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        body = r.read().decode("utf-8", "replace")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(body)
    time.sleep(0.25)                     # a public-domain transcription, read politely
    return body


def clean(text):
    t = TAG.sub(" ", text)
    t = htmllib.unescape(t)
    t = t.replace("\u00a0", " ").replace("\u2019", "'")
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def contents():
    """{book heading: [(label, page), ...]} from the transcription's index."""
    page = fetch("title.shtml")
    out = {}
    blocks = re.split(r"<h[12][^>]*>", page)
    for block in blocks:
        name = clean(block.split("</h", 1)[0])
        links = re.findall(r'href="([^"]+\.shtml)"[^>]*>([^<]{1,60})<', block)
        if name and links:
            out[name] = [(clean(label), href) for href, label in links]
    return out


def verses_of(page, chapter):
    """{verse: text} for one chapter page, keyed by the anchor the page carries."""
    out = {}
    for para in PARA.findall(page):
        match = ANCHOR.search(para)
        if not match:
            continue
        if int(match.group(1)) != chapter:
            continue
        number = int(match.group(2))
        body = clean(para[match.end():])
        if body:
            out[number] = body
    return out


def introduction_of(page):
    """The book's introduction: the paragraphs before the first anchored verse."""
    out = []
    for para in PARA.findall(page):
        if ANCHOR.search(para):
            break
        text = clean(para)
        if text and text.lower() != "chapter i.":
            out.append(text)
    return out


def merge(path, book, chapter, entries):
    """Put this source's remarks in, and take out the ones no longer wanted.

    Adding without pruning would leave a remark behind after the parse stops
    producing it — a verse dropped for not existing any more would keep its
    comment, and the check would fail on a file the build had just written.
    """
    data = {}
    if os.path.exists(path):
        data = json.load(open(path, encoding="utf-8"))
    verses = data.get("verses") or {}
    for number in list(verses):
        if int(number) not in entries:
            kept = [e for e in verses[number] if e.get("source") != SOURCE["id"]]
            if kept:
                verses[number] = kept
            else:
                del verses[number]
    for number, text in entries.items():
        verse = verses.setdefault(str(number), [])
        verse = [e for e in verse if e.get("source") != SOURCE["id"]]
        verse.append({"source": SOURCE["id"], "short": SOURCE["short"], "text": text})
        verses[str(number)] = verse
    data.update({"book": book["name"], "slug": book["slug"], "chapter": chapter,
                 "verses": verses})
    data.setdefault("sources", [])
    known = {s["id"] for s in data["sources"]}
    if SOURCE["id"] not in known:
        data["sources"] = data["sources"] + [dict(SOURCE)]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return len(entries)


def main():
    global BOOKS_OF_RECORD
    BOOKS_OF_RECORD = json.load(
        open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))
    books = {b["slug"]: b for b in BOOKS_OF_RECORD}
    pages = contents()
    wanted = set(b["slug"] for b in books.values())

    written = 0
    chapters = 0
    notes = 0
    intros = 0
    os.makedirs(ABOUT, exist_ok=True)

    for heading, slug, _ in BOOKS:
        if slug not in books:
            continue
        links = pages.get(heading)
        if not links:
            print("  no contents entry for {}".format(heading), file=sys.stderr)
            continue
        intro_page = None
        for label, page in links:
            if label.lower().startswith("introduction"):
                intro_page = page
                continue
        for label, page in links:
            match = re.match(r"^.*?\s+(\d+)$", label)
            if not match:
                continue                      # the introduction, handled below
            source_chapter = int(match.group(1))
            target_slug, target_chapter = REDIRECT.get(
                (slug, source_chapter), (slug, source_chapter))
            if target_slug not in wanted:
                continue
            body = fetch(page)
            entries = verses_of(body, source_chapter)
            target = books.get(target_slug) or {}
            # only verses this reader actually has can carry a comment
            have = verse_numbers(target_slug, target_chapter)
            dropped = [v for v in entries if have and v not in have]
            if have:
                entries = {v: t for v, t in entries.items() if v in have}
            if not entries and not dropped:
                continue
            path = os.path.join(COMMENTARY, target_slug, "{}.json".format(target_chapter))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            notes += merge(path, {"name": target.get("name", target_slug),
                                  "slug": target_slug}, target_chapter, entries)
            written += 1
            chapters += 1 if entries else 0
            if dropped:
                print("  {} {}: {} remark(s) on verses this reader does not have"
                      .format(target_slug, target_chapter, len(dropped)))
        if intro_page:
            paragraphs = introduction_of(fetch(intro_page))
            if paragraphs:
                with open(os.path.join(ABOUT, slug + ".json"), "w", encoding="utf-8") as f:
                    json.dump({"book": books[slug]["name"], "slug": slug,
                               "source": {"id": SOURCE["id"], "short": SOURCE["short"],
                                          "name": SOURCE["name"], "year": SOURCE["year"]},
                               "title": "Introduction to {}".format(books[slug]["name"]),
                               "paragraphs": paragraphs},
                              f, ensure_ascii=False, separators=(",", ":"))
                intros += 1

    index = write_index()
    for source in index["sources"]:
        print("  {:<10} {:>3} books  {:>5} chapters  {:>7,} verses  {:>5,} introductions"
              .format(source["short"], source["books"], source["chapters"],
                      source["verses"], source["introductions"]))
    print("  {} chapter files written, {} remarks, {} book introductions"
          .format(written, notes, intros))


def write_index():
    """Recompute data/commentary/index.json by reading the files on disk.

    The index is what the apps and the checks ask "which sources cover what", so
    it is derived from the data rather than accumulated by each build: whichever
    script wrote a chapter, the count is the same afterwards. build-commentary.py
    calls this too.
    """
    sources = {}
    books = {}
    for slug in sorted(os.listdir(COMMENTARY)):
        directory = os.path.join(COMMENTARY, slug)
        if not os.path.isdir(directory):
            continue
        for name in sorted(os.listdir(directory)):
            if not name.endswith(".json"):
                continue
            data = json.load(open(os.path.join(directory, name), encoding="utf-8"))
            books.setdefault(slug, False)
            for entries in (data.get("verses") or {}).values():
                for entry in entries:
                    item = sources.setdefault(entry["source"], {
                        "id": entry["source"], "short": entry.get("short", entry["source"]),
                        "year": None, "books": set(), "chapters": set(), "verses": 0,
                        "introductions": 0})
                    item["books"].add(slug)
                    item["chapters"].add((slug, name))
                    item["verses"] += 1
            for intro in data.get("introductions") or []:
                item = sources.setdefault(intro["source"], {
                    "id": intro["source"], "short": intro.get("short", intro["source"]),
                    "year": intro.get("year"), "books": set(), "chapters": set(),
                    "verses": 0, "introductions": 0})
                item["introductions"] += 1
                item["books"].add(slug)

    # a book introduction is a source's work on that book too, even though it
    # sits outside the chapter files
    if os.path.isdir(ABOUT):
        for name in sorted(os.listdir(ABOUT)):
            if not name.endswith(".json"):
                continue
            data = json.load(open(os.path.join(ABOUT, name), encoding="utf-8"))
            source = data.get("source") or {}
            sid = source.get("id")
            if not sid:
                continue
            item = sources.setdefault(sid, {
                "id": sid, "short": source.get("short", sid), "year": source.get("year"),
                "books": set(), "chapters": set(), "verses": 0, "introductions": 0})
            item["introductions"] += 1
            item["books"].add(data.get("slug", ""))

    # the names and years the sources carry in the data itself
    names = {}
    for slug in books:
        directory = os.path.join(COMMENTARY, slug)
        for name in os.listdir(directory):
            if not name.endswith(".json"):
                continue
            data = json.load(open(os.path.join(directory, name), encoding="utf-8"))
            for source in data.get("sources") or []:
                names.setdefault(source["id"], source)

    for source in (SOURCE,):
        names.setdefault(source["id"], source)

    index = {
        "sources": [],
        "books": sorted(books),
    }
    for sid, item in sorted(sources.items()):
        meta = names.get(sid) or {}
        index["sources"].append({
            "id": sid,
            "short": item["short"],
            "name": meta.get("name", sid),
            "year": item["year"] or meta.get("year"),
            "books": len(item["books"]),
            "chapters": len(item["chapters"]),
            "verses": item["verses"],
            "introductions": item["introductions"],
        })
    with open(os.path.join(COMMENTARY, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return index


def verse_numbers(slug, chapter):
    """Every verse number this reader can show for that chapter of that book.

    Haydock follows the Vulgate, and the translations here do not all divide
    these books his way — the Greek Esther is the clearest case — so a remark is
    kept only if some translation of that book has the verse it belongs to. A
    remark on a verse nothing can show is a comment about a verse that is not
    there, which the checks would fail and a reader would never see.
    """
    numbers = set()
    book = next((b for b in BOOKS_OF_RECORD if b["slug"] == slug), None)
    if book is None:
        return numbers
    for translation in book.get("translations") or []:
        path = os.path.join(ROOT, "data", "bible", "{}.{}.json".format(slug, translation))
        if not os.path.exists(path):
            continue
        data = json.load(open(path, encoding="utf-8"))
        chapter_data = (data.get("chapters") or {}).get(str(chapter)) or {}
        numbers.update(int(v) for v in chapter_data if str(v).isdigit())
    return numbers


if __name__ == "__main__":
    main()
