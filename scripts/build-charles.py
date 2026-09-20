#!/usr/bin/env python3
"""Book introductions for the deuterocanon, from R. H. Charles (1913).

    python3 scripts/build-charles.py            # every book in the table
    python3 scripts/build-charles.py i-esdras   # just these

Charles, *The Apocrypha and Pseudepigrapha of the Old Testament in English*
(Oxford, 1913) introduces every book the site ships in the deuterocanon,
including the six that Haydock does not reach. It is public domain, but it exists
as no clean text anywhere: CCEL holds page images, Wikisource holds scan
transclusions, and the Internet Archive scan used here is OCR.

So this is a reading job with a script around it, and the script is deliberately
narrow. Each introduction is bounded by what the printed page says: on the
introduction's pages the running head is the word INTRODUCTION, and where the
translation begins the running head becomes the book's name followed by a verse
range ("THE PRAYER OF MANASSES 6-7"). The span between those two is the
introduction. Everything inside it is then cleaned of what a page carries and
prose does not — running heads, page numbers, hyphenated line breaks, footnote
runs and OCR letterforms that have nothing to do with the words.

The result is quoted, not reconstructed: it is Charles's prose with OCR noise
taken out. Anything the cleaning cannot be sure about is dropped rather than
guessed at, and check-charles.js reads the output back for the shapes that give
noise away.

Output: data/about/<book-slug>.json, the same file the panel already reads for
Haydock's introductions.
"""
import html as htmllib
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ABOUT = os.path.join(ROOT, "data", "about")
CACHE = os.path.join(ROOT, "scripts", ".cache", "charles")
UA = {"User-Agent": "StudyTools-build/1.0 (public-domain commentary)"}

SOURCE = {"id": "charles", "short": "Charles", "name": "R. H. Charles", "year": "1913"}

# The two volumes of the 1913 edition, as scans with usable OCR text.
VOLUMES = {
    "1": ("apocryphapseudep0001rhch_x8p1", "apot-vol1.txt"),
    "2": ("apocryphapseudep0002rhch_e2s5", "apot-vol2.txt"),
}

# One entry per introduction: the book, the volume it is in, and the two places
# in the OCR that bracket it — a sentence the introduction opens with, and the
# first line of the translation that follows it. The running heads cannot be used
# for this: they are themselves OCR ("OF OVEE THREE CHILDREN"), and they repeat on
# every page. So the anchors are read off the page by hand, one book at a time,
# and every one of them is a sentence a reader can check in the printed edition.
#
# The first line of the translation is matched as a pattern rather than a sentence:
# it is a running head with a verse range on it, the one page furniture that says
# "the commentary has stopped".
BOOKS = [
    # ("slug", "volume", start-anchor, end-pattern)
    ("prayer-of-manasses", "1", "THE PRAYER OF MANASSES",
     "§ 1. DESCRIPTION OF THE BOOK.",
     r"^\s*THE PRAYER OF MANASSES\s+\d+\s*[-–—]"),
    # Psalm 151 has no entry, and that is not an oversight: Charles's edition does
    # not treat it as a book. His only mention of it is in passing — "3 and 4
    # Maccabees and Psalm 151 are found in most manuscripts of the LXX" — while his
    # vol. ii treats the Psalms of Solomon, which is a different work.
]

# Charles's introductions end with sections that are bibliography and collation —
# § 9. VERSIONS, TEXT, MANUSCRIPTS, BIBLIOGRAPHY, TITLE. Their contents are notes,
# not prose, and dropping them by heading is exact where dropping them paragraph by
# paragraph is guesswork.
APPARATUS_SECTION = re.compile(
    r"^\s*[§$]?\s*\d*\.?\s*(VERSIONS?|TEXT|MANUSCRIPTS?|MSS|BIBLIOGRAPHY|TITLE|EDITIONS?|"
    r"COMMENTARIES|ABBREVIATIONS|LITERATURE)\b", re.I)

# A paragraph that is apparatus rather than prose: the versional and textual notes
# at the foot of Charles's pages, which arrive here as fragments full of sigla
# (LXX, Cod., Vulg.) and of Greek read as Latin letters. Prose does not look like
# that, so the shapes are dropped and counted rather than guessed at.
SIGLA = re.compile(r"\b(LXX|MT|Cod\w*|Vulg\w*|Syr\w*|Targ\w*|Aquila|Symmachus|Theodotion|"
                   r"Versions?|MSS?|om|ins|edd|cf|vid|scil|Const|Apost|transl|Lat|Heb|Gr)\b\.?",
                   re.I)
# Two full stops on a token is the scanner failing on Greek; the versional notes
# are full of it and prose is not.
GARBLED = re.compile(r"\b\w+\.\.|\b\w*\.\.[A-Za-z]?")
# Greek coming back as Latin letters, and the marks of a critical note: prose in
# this edition has no pipe, no euro sign and no capital letters inside a word.
NOT_PROSE = re.compile(r"[€|†]|\b\w*[A-Z][a-z]{1,3}[A-Z]\w*\b")
VOWELLESS = re.compile(r"\b[bcdfghjklmnpqrstvwxz]{5,}\b", re.I)
LISTED_NOTE = re.compile(r"^[A-Z]\.\s|^\d\.\s|\bsee\s+(?:the\s+)?note\b", re.I)

# OCR letterforms that are not words. Each was seen in the pages and each is
# wrong in every context it appears in.
FIXES = [
    (r"\bTHE\s+(?=[a-z])", "The "),        # small caps read as capitals
    (r"\bTins\b", "This"), (r"\btlie\b", "the"), (r"\baiul\b", "and"),
    (r"\baiid\b", "and"), (r"\band\b", "and"), (r"\bl>y\b", "by"),
    (r"\bvhich\b", "which"), (r"\bAvhich\b", "which"), (r"\bIiave\b", "have"),
    (r"\bhav(\w)?\b(?= been)", "have"), (r"\bof\s+the\s+the\b", "of the"),
    (r"\b(\w+)-\s*\n\s*(\w)", r"\1\2"),    # a word broken across a line
    (r"\bvy\b", "vv"), (r"\bvv\.\s*,", "vv."), (r"\bviz\b", "viz."),
    # One Greek word the scanner could not read at all, printed by Charles in
    # Greek and given here as what it says, in brackets, as an editor would.
    (r"\borixo\.\.", "[stichoi]"), (r"\bthirty-seven orixo\.\.", "thirty-seven [stichoi]"),
]

# A list read by the scanner as numbers: Charles writes (a), (b), (c)... and the
# letters b and c can come back as 4 and 6. Only fixed where the sequence proves
# what they were, so (4) in a year stays (4).
def fix_list_letters(text):
    """(a), (4), (c) is (a), (b), (c): a scanner reads b as 4 in a list and nowhere
    else, so the change is made only where an (a) proves a list is in progress."""
    if "(a)" in text and "(4)" in text:
        text = text.replace("(4)", "(b)")
    return text

PAGE_NUMBER = re.compile(r"^\s*\d{1,3}\s*$")
RUNNING_HEAD = re.compile(r"^\s*(INTRODUCTION|CONTENTS|APPENDIX)\s*$")
FOOTNOTE = re.compile(r"^\s*\(?\d{1,2}\)?\s*[A-Z(]")


def volume(number):
    """The OCR text of one volume, fetched once and kept."""
    item, name = VOLUMES[number]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not (os.path.exists(path) and os.path.getsize(path) > 100000):
        url = "https://archive.org/download/{}/{}_djvu.txt".format(item, item)
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=600) as r:
            body = r.read().decode("utf-8", "replace")
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    return open(path, encoding="utf-8", errors="replace").read()


def introduction(text, head, anchor, pattern):
    """Charles's introduction to one book, as paragraphs.

    From the first page of it — the word INTRODUCTION standing alone as a running
    head, after the book's own head — to the page where the translation starts and
    the running head turns into the book's name with a verse range.
    """
    lines = text.split("\n")
    start = None
    for i, line in enumerate(lines):
        if line.strip().startswith(anchor):
            start = i
            break
    if start is None:
        return []

    ends = re.compile(pattern)
    stop = None
    for i in range(start + 1, len(lines)):
        if ends.match(lines[i]):
            stop = i
            break
        if i > start + 4000:              # a book cannot run past this much
            stop = i
            break
    # The translation of the book begins before the first page that carries a
    # verse range: it opens on a page whose running head is the book's name with
    # nothing after it. Everything from that page on is Charles's translation,
    # which the reader already has in translations of its own — an introduction
    # that quietly becomes Scripture would be worse than none.
    title_page = None
    for i in range(start + 1, stop):
        if lines[i].strip() == head.strip():
            title_page = i
    if title_page is not None:
        stop = title_page
    # and it stops where the notes begin
    for i in range(start + 1, stop):
        if APPARATUS_SECTION.match(lines[i]):
            stop = i
            break
    body = lines[start:stop]

    # Every printed page ends with its notes. In this scan a page's notes begin at
    # the first line that opens with a footnote number and a capital, and the
    # pages themselves are separated by the bare page number. Cutting each page at
    # its first note keeps Charles's prose and drops his apparatus, which is what
    # would otherwise arrive as hundreds of two-word fragments.
    NOTE_START = re.compile(r"^\s*\d{1,2}\s+[A-Z(]")
    pages = [[]]
    for line in body:
        if PAGE_NUMBER.match(line.strip()):
            pages.append([])
            continue
        pages[-1].append(line)
    body = []
    for page in pages:
        cut = len(page)
        for i, line in enumerate(page):
            if NOTE_START.match(line) and i > 0:
                cut = i
                break
        body.extend(page[:cut])

    # Paragraph breaks are the blank lines; a footnote block is the shape to
    # drop — short lines, no sentence ending, often bracketed by numbers.
    kept = []
    for line in body:
        stripped = line.strip()
        if not stripped:
            kept.append("")               # the break, kept
            continue
        if PAGE_NUMBER.match(stripped) or RUNNING_HEAD.match(stripped):
            continue
        if FOOTNOTE.match(stripped):
            continue
        if len(stripped) < 30 and not re.search(r"[.!?;:]\s*$", stripped):
            continue
        kept.append(stripped)
    return paragraphs("\n".join(kept))


def paragraphs(joined):
    text = joined
    for pattern, replacement in FIXES:
        text = re.sub(pattern, replacement, text)
    text = htmllib.unescape(text).replace("\u00a0", " ")
    text = fix_list_letters(text)
    out = []
    dropped = 0
    for chunk in re.split(r"\n\s*\n", text):       # a printed paragraph break
        chunk = re.sub(r"\s+", " ", chunk).strip()
        if len(chunk) <= 40:
            continue
        if (len(SIGLA.findall(chunk)) >= 4 or len(VOWELLESS.findall(chunk)) >= 2
                or len(GARBLED.findall(chunk)) >= 2 or LISTED_NOTE.search(chunk)
                or NOT_PROSE.search(chunk)):
            dropped += 1
            continue
        out.append(chunk)
    if dropped:
        print("      ({} apparatus paragraph(s) dropped)".format(dropped))
    return out


def main():
    only = set(a.lower() for a in sys.argv[1:])
    books = {b["slug"]: b for b in json.load(
        open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))}
    os.makedirs(ABOUT, exist_ok=True)
    written = 0
    for slug, number, head, anchor, pattern in BOOKS:
        if only and slug not in only:
            continue
        if slug not in books:
            print("  {}: the reader has no such book".format(slug))
            continue
        try:
            text = volume(number)
        except Exception as exc:
            print("  {}: volume {} unavailable ({})".format(slug, number, exc))
            continue
        parts = introduction(text, head, anchor, pattern)
        if not parts:
            print("  {}: no introduction found at {!r}".format(slug, anchor))
            continue
        path = os.path.join(ABOUT, slug + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"book": books[slug]["name"], "slug": slug,
                       "source": dict(SOURCE),
                       "title": "Introduction to {}".format(books[slug]["name"]),
                       "note": "R. H. Charles, The Apocrypha and Pseudepigrapha of the "
                               "Old Testament (Oxford, 1913), his introduction to the "
                               "book, transcribed from a scan of that edition. The prose "
                               "is his; the reading of a few letters, and one Greek word "
                               "given in brackets, are the transcription's. It is an "
                               "introduction to the book, not a commentary on its verses, "
                               "and no verse-by-verse commentary on this book exists in "
                               "the public domain.",
                       "paragraphs": parts}, f, ensure_ascii=False, separators=(",", ":"))
        written += 1
        chars = sum(len(p) for p in parts)
        print("  {:<22} {:>3} paragraphs  {:>6,} characters".format(slug, len(parts), chars))
    print("  {} introduction(s) written to data/about/".format(written))


if __name__ == "__main__":
    main()
