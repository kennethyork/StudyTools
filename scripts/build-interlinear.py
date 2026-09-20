#!/usr/bin/env python3
"""Build the interlinear data for the Interlinear Reader app and the reader's
verse panel: every word behind the text, in the language it was written in.

New Testament — OpenGNT (eliranwong/OpenGNT, CC BY-SA 4.0). Its base text file
carries one row per Greek word with the surface form, the lexical form,
morphology, Strong's number, transliteration and a short English gloss.

Old Testament — the Open Scriptures Hebrew Bible (morphhb, CC BY 4.0) for the
text, lemma, parsing and Strong's number of every word, with the transliteration
and short gloss from STEPBible's TBESH (CC BY 4.0). Both are the sources
scripts/build-vocab.py already uses for the Hebrew vocabulary cards, and the
lexicon parser is imported from there rather than written twice.

Output: data/interlinear/<book-slug>/<chapter>.json   {book, slug, chapter, verses}
        data/interlinear/index.json                   {books, bookNames, sources}
Books are keyed by the same slugs the rest of the site uses, so a reference in
the interlinear can link to the Verse Matrix and the reader's verse panel finds
the words for the verse it is showing.

The Apocrypha is not covered: no public-domain tagged text of those books is
wired up here, so the panel simply omits the section for them.
"""
import csv
import io
import json
import os
import re
import urllib.request
import zipfile
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "interlinear")
CACHE = os.path.join(ROOT, "scripts", ".cache")
ZIP = os.path.join(CACHE, "OpenGNT_BASE_TEXT.zip")
URL = "https://raw.githubusercontent.com/eliranwong/OpenGNT/master/OpenGNT_BASE_TEXT.zip"
UA = {"User-Agent": "StudyTools-build/1.0", "Accept-Encoding": "identity"}

# OpenGNT book numbers (the 40s are Matthew onwards) -> this repo's slugs.
BOOK_NUMBERS = {
    40: "matthew", 41: "mark", 42: "luke", 43: "john", 44: "acts",
    45: "romans", 46: "i-corinthians", 47: "ii-corinthians", 48: "galatians",
    49: "ephesians", 50: "philippians", 51: "colossians", 52: "i-thessalonians",
    53: "ii-thessalonians", 54: "i-timothy", 55: "ii-timothy", 56: "titus",
    57: "philemon", 58: "hebrews", 59: "james", 60: "i-peter", 61: "ii-peter",
    62: "i-john", 63: "ii-john", 64: "iii-john", 65: "jude", 66: "revelation-of-john",
}

# The Hebrew Bible's books, as morphhb names its files -> this repo's slugs.
OT_SLUGS = {
    "Gen": "genesis", "Exod": "exodus", "Lev": "leviticus", "Num": "numbers",
    "Deut": "deuteronomy", "Josh": "joshua", "Judg": "judges", "Ruth": "ruth",
    "1Sam": "i-samuel", "2Sam": "ii-samuel", "1Kgs": "i-kings", "2Kgs": "ii-kings",
    "1Chr": "i-chronicles", "2Chr": "ii-chronicles", "Ezra": "ezra", "Neh": "nehemiah",
    "Esth": "esther", "Job": "job", "Ps": "psalms", "Prov": "proverbs",
    "Eccl": "ecclesiastes", "Song": "song-of-solomon", "Isa": "isaiah", "Jer": "jeremiah",
    "Lam": "lamentations", "Ezek": "ezekiel", "Dan": "daniel", "Hos": "hosea",
    "Joel": "joel", "Amos": "amos", "Obad": "obadiah", "Jonah": "jonah", "Mic": "micah",
    "Nah": "nahum", "Hab": "habakkuk", "Zeph": "zephaniah", "Hag": "haggai",
    "Zech": "zechariah", "Mal": "malachi",
}

MORPHHB_URL = "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/{}.xml"
TBESH_URL = ("https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
             "TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew"
             "%20-%20STEPBible.org%20CC%20BY.txt")

BRACKET = re.compile(r"〔([^｜]*)｜([^｜]*)｜([^｜]*)｜([^｜]*)｜([^｜]*)｜([^〕]*)〕")
REF_BRACKET = re.compile(r"〔([^｜]+)｜([^｜]+)｜([^〕]+)〕")
ANY_BRACKET = re.compile(r"〔([^〕]*)〕")

# morphhb: <w lemma="b/7225" n="1.0" morph="HR/Ncfsa" id="01xeN">בְּ/רֵאשִׁ֖ית</w>
HEBREW_WORD = re.compile(r"<w\s+([^>]*?)>(.*?)</w>", re.S)
HEBREW_VERSE = re.compile(r'<verse osisID="[^"]*?(\d+)\.(\d+)"[^>]*>(.*?)</verse>', re.S)
ATTRIBUTE = re.compile(r'([a-zA-Z]+)="([^"]*)"')


def fields(text):
    """Split any 〔a｜b｜c〕 bracket into its fields, whatever the count."""
    m = ANY_BRACKET.search(text or "")
    if not m:
        return []
    return [f.strip() for f in m.group(1).split("｜")]


def ensure_zip():
    if os.path.exists(ZIP) and os.path.getsize(ZIP) > 1000000:
        return ZIP
    os.makedirs(CACHE, exist_ok=True)
    print("  downloading OpenGNT ...", flush=True)
    req = urllib.request.Request(URL, headers=UA)
    with urllib.request.urlopen(req, timeout=900) as r, open(ZIP, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return ZIP


def strip_punct(text):
    return text.strip().strip(",.;·—" ) or text.strip()


def book_names():
    """The site's own names for its books, so one list names them everywhere."""
    with open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8") as f:
        return {b["slug"]: b["name"] for b in json.load(f)}


def write_chapter(slug, chapter, verses, name, books_done):
    dest_dir = os.path.join(OUT, slug)
    os.makedirs(dest_dir, exist_ok=True)
    payload = {
        "book": name,
        "slug": slug,
        "chapter": int(chapter),
        "verses": {v: words for v, words in sorted(verses.items(), key=lambda kv: int(kv[0]))},
    }
    with open(os.path.join(dest_dir, "{}.json".format(chapter)), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    books_done.setdefault(slug, []).append(int(chapter))


def greek_chapters(text):
    """The New Testament, from an OpenGNT base-text TSV."""
    chapters = OrderedDict()
    reader = csv.reader(io.StringIO(text), delimiter="\t")
    next(reader, None)
    for row in reader:
        if len(row) < 11:
            continue
        ref = REF_BRACKET.search(row[6])
        word = BRACKET.search(row[7])
        if not ref or not word:
            continue
        book_num, chapter, verse = ref.group(1), ref.group(2), ref.group(3)
        try:
            book_num = int(book_num)
            verse = verse.strip()
        except ValueError:
            continue
        slug = BOOK_NUMBERS.get(book_num)
        if not slug:
            continue

        # The source carries four Greek forms per word: the surface text (often
        # with lunate sigmas and abbreviations), an unaccented normalisation,
        # the properly accented text, and the lexical form. Ship the accented
        # text for display and keep the lexical form for the tooltip.
        surface, normalized, accented, lexical, morph, strongs = (word.group(i) for i in range(1, 7))
        display = accented or normalized or surface
        translit_fields = fields(row[9]) if len(row) > 9 else []
        gloss_fields = fields(row[10]) if len(row) > 10 else []
        translit = translit_fields[1] if len(translit_fields) > 1 else (translit_fields[0] if translit_fields else "")
        gloss = ""
        for candidate in gloss_fields:
            if candidate and candidate != "-":
                gloss = candidate
                break
        if gloss.lower() in ("the/this/who",):
            gloss = "the"

        bucket = chapters.setdefault((slug, chapter), {})
        bucket.setdefault(verse, []).append({
            "g": display,
            "l": lexical,
            "t": translit,
            "m": morph,
            "s": strongs,
            "e": gloss,
        })
    return chapters


def hebrew_lexicon():
    """TBESH, parsed by the vocabulary build's own reader, keyed by Strong's.

    scripts/build-vocab.py has a hyphen in its name, so it is loaded by path
    rather than imported: one parser for the lexicon instead of two.
    """
    import importlib.util
    module_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build-vocab.py")
    spec = importlib.util.spec_from_file_location("build_vocab", module_path)
    vocab = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vocab)
    path = vocab.download(TBESH_URL, os.path.join(CACHE, "tbesh.txt"))
    return vocab.parse_lexicon(path, re.compile(r"^H\d")), vocab


def hebrew_words(verse_xml, lexicon):
    """One verse's words: the text as morphhb tags it, with TBESH's reading."""
    out = []
    for m in HEBREW_WORD.finditer(verse_xml):
        attrs = dict(ATTRIBUTE.findall(m.group(1)))
        text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if not text:
            continue
        # lemma is "b/7225" where a prefix is attached: the root is the last part
        root = (attrs.get("lemma") or "").split("/")[-1].strip()
        number = re.match(r"(\d+)", root)
        strongs = ("H" + number.group(1).lstrip("0").zfill(4)) if number else ""
        lex = lexicon.get(strongs) or {}
        out.append({
            "g": text,
            "l": lex.get("lemma") or root,
            "t": lex.get("translit", ""),
            "m": attrs.get("morph", ""),
            "s": strongs,
            "e": lex.get("gloss", ""),
        })
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    names = book_names()
    books_done = {}

    # ---- the New Testament ----
    path = ensure_zip()
    with zipfile.ZipFile(path) as z:
        name = [n for n in z.namelist() if n.endswith(".csv") and "__MACOSX" not in n][0]
        with z.open(name) as f:
            text = f.read().decode("utf-8")
    for (slug, chapter), verses in greek_chapters(text).items():
        write_chapter(slug, chapter, verses, names.get(slug, slug), books_done)

    # ---- the Old Testament ----
    lexicon, vocab = hebrew_lexicon()
    for abbrev in vocab.MORPHHB_OT_BOOKS:
        slug = OT_SLUGS[abbrev]
        src = vocab.download(MORPHHB_URL.format(vocab.MORPHHB_FILE[abbrev]),
                             os.path.join(CACHE, "morphhb-{}.xml".format(abbrev)))
        with open(src, encoding="utf-8") as f:
            xml = f.read()
        chapters = OrderedDict()
        for m in HEBREW_VERSE.finditer(xml):
            chapter, verse = int(m.group(1)), m.group(2)
            words = hebrew_words(m.group(3), lexicon)
            if words:
                chapters.setdefault(chapter, {})[verse] = words
        for chapter, verses in chapters.items():
            write_chapter(slug, chapter, verses, names.get(slug, slug), books_done)

    # ---- the index, in the site's canonical book order ----
    with open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8") as f:
        canonical = [b["slug"] for b in json.load(f)]
    index = OrderedDict((slug, sorted(books_done[slug])) for slug in canonical if slug in books_done)
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({
            "source": "Greek: OpenGNT (CC BY-SA 4.0). Hebrew: Open Scriptures Hebrew Bible "
                      "(CC BY 4.0) with STEPBible TBESH (CC BY 4.0).",
            "sources": {
                "NT": "OpenGNT (eliranwong/OpenGNT, CC BY-SA 4.0)",
                "OT": "Open Scriptures Hebrew Bible (morphhb, CC BY 4.0) "
                      "with STEPBible TBESH (CC BY 4.0)",
            },
            "books": index,
            "bookNames": {slug: names.get(slug, slug) for slug in index},
        }, f, ensure_ascii=False, separators=(",", ":"))

    size = sum(os.path.getsize(os.path.join(dp, fn))
               for dp, _dn, fns in os.walk(OUT) for fn in fns)
    testament = lambda slug: "OT" if slug in OT_SLUGS.values() else "NT"
    counts = {"OT": 0, "NT": 0}
    for slug, chapters in index.items():
        counts[testament(slug)] += len(chapters)
    print("books: {} (NT {}, OT {}) | chapters: {} (NT {}, OT {}) | {:.1f} MB".format(
        len(index), sum(1 for s in index if testament(s) == "NT"), sum(1 for s in index if testament(s) == "OT"),
        sum(len(v) for v in index.values()), counts["NT"], counts["OT"], size / 1e6))


if __name__ == "__main__":
    main()
