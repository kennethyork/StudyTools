#!/usr/bin/env python3
"""Add the Catena Aurea to the Gospels: the fathers, verse by verse.

    python3 scripts/build-catena.py

The Catena Aurea is Thomas Aquinas' chain of the church fathers on the four
Gospels: for each verse he sets out what the Fathers said about it, in their own
words, one after another. The Oxford translation by John Henry Newman and others
(London, 1842) is public domain, and CCEL holds Matthew and Mark as text.

This is the same job as Haydock — fetch, parse, merge, and let the checks hold the
result to the verses the reader has — with one difference: here each remark is
attributed. The printed volume opens every remark with the Father's name
("Chrys.:", "Aug., de Cons. Evan., 2, 15:", "Gloss. ord.:"), and a remark that
opens with anything else is a continuation of the one before it, so the names are
what divide one Father's words from the next and the citation, where there is one,
is kept in brackets beside them.

The names are a curated list, one per printed abbreviation, and a name not on it
does not start a remark: that is what keeps "Christ.", "God.", "It follows." and
the dozens of other sentence-openings that look like an attribution from being
read as one.

Output: data/commentary/<gospel>/<chapter>.json, merged with what is already
there, and the index picks the new source up from the files.
"""
import importlib.util
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMMENTARY = os.path.join(ROOT, "data", "commentary")
CACHE = os.path.join(ROOT, "scripts", ".cache", "catena")
UA = {"User-Agent": "StudyTools-build/1.0 (public-domain commentary)"}

SOURCE = {"id": "catena", "short": "Catena", "name": "Catena Aurea (Aquinas)",
          "year": "1842"}

# CCEL's id for each volume it holds as text, and the book it is.
VOLUMES = [("catena1", "matthew", "Matthew"), ("catena2", "mark", "Mark")]
# 404 at the time of writing, for the record rather than for a retry
MISSING = {"luke": "catena3", "john": "catena4"}

# The printed abbreviation to the Father it stands for. Only names here begin a
# remark; the list was read off the volumes, most frequent first.
AUTHORS = {
    "Jerome": "Jerome", "Hier.": "Jerome", "Pseudo-Jerome": "Pseudo-Jerome",
    "Chrys.": "Chrysostom", "Chrysostom": "Chrysostom",
    "Pseudo-Chrys.": "Pseudo-Chrysostom",
    "Aug.": "Augustine", "Augustine": "Augustine", "Pseudo-Aug.": "Pseudo-Augustine",
    "Remig.": "Remigius", "Hilary": "Hilary", "Hil.": "Hilary", "Origen": "Origen",
    "Raban.": "Rabanus Maurus", "Rabanus": "Rabanus Maurus",
    "Greg.": "Gregory", "Gregory": "Gregory", "Nyss.": "Gregory of Nyssa",
    "Naz.": "Gregory Nazianzen",
    "Gloss. ord.": "Glossa Ordinaria", "Gloss.": "Glossa Ordinaria",
    "Gloss": "Glossa Ordinaria",
    "Ambrose": "Ambrose", "Amb.": "Ambrose", "Leo": "Leo", "Bede": "Bede",
    "Theophylact": "Theophylact", "Severianus": "Severianus",
    "Basil": "Basil", "Cyril": "Cyril", "Athanasius": "Athanasius",
    "Isidore": "Isidore", "Anselm": "Anselm", "Paschasius": "Paschasius",
    "Euthymius": "Euthymius", "Damascene": "John Damascene", "Dionysius": "Dionysius",
    "Victor": "Victor", "Faustus": "Faustus", "Chromatius": "Chromatius",
    "Juvencus": "Juvencus", "Sedulius": "Sedulius", "Fortunatianus": "Fortunatianus",
    "Methodius": "Methodius", "Irenaeus": "Irenaeus", "Tertullian": "Tertullian",
    "Cyprian": "Cyprian", "Cassian": "Cassian", "Nilus": "Nilus",
    "Maximus": "Maximus", "Nicephorus": "Nicephorus", "Asterius": "Asterius",
    "Titus Bostrensis": "Titus of Bostra", "Titus": "Titus of Bostra",
}
# Longest abbreviations first, so "Gloss. ord." is not read as "Gloss."
AUTHOR_PAT = re.compile(
    r"(?m)^\s{0,6}(" + "|".join(re.escape(k) for k in
                                sorted(AUTHORS, key=len, reverse=True)) + r")((?:,[^:\n]{0,70})?):\s+")

# The heading, with anything the transcription welded to it: one arrives as
# "Chapter 15&lt;.h2&gt;".
CHAPTER = re.compile(r"(?m)^\s*Chapter\s+(\d{1,3})\b")
# The styles the volumes use: "1." in the body, "Ver. 1." at the start of Matthew,
# "Ver. 1:" at the start of Mark.
VERSE = re.compile(r"(?m)^\s{0,6}(?:Ver\.\s*)?(\d{1,3})[.:]\s+(?=\S)")
RULE = re.compile(r"(?m)^\s*_{10,}\s*$")


def volume(ident):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, ident + ".txt")
    if not (os.path.exists(path) and os.path.getsize(path) > 200000):
        url = "https://ccel.org/ccel/aquinas/{0}/cache/{0}.txt".format(ident)
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read().decode("utf-8", "replace")
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    return open(path, encoding="utf-8", errors="replace").read()


def tidy(text):
    t = text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    t = re.sub(r"<\.[a-z0-9]+>|<[a-z0-9/]{1,6}>", " ", t)      # escaped markup
    t = re.sub(r"\[\s*ed\.\s*note:[^\]]*\]", "", t)      # the edition's notes
    t = re.sub(r"\[([A-Za-z]{2,4}\s?\d+[:.]\d+[^\]]*)\]", r"(\1)", t)
    t = re.sub(r"\s*\n\s*", " ", t)
    t = t.replace("\u2019", "'").replace("\u00a0", " ")
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def chapters_of(text, book="?", limits=None):
    """{chapter number: [(verse number, verse text, remarks)]}.

    This transcription is not tidy: the first chapter has no heading at all (the
    volume opens on verse 1), one heading arrived with escaped markup welded to it
    ("Chapter 15&lt;.h2&gt;"), and a heading the transcribers dropped would
    otherwise leave one chapter's verses numbered inside the chapter before it —
    remarks landing on the wrong passage, which is the one failure nobody would
    see. So: a heading starts a chapter, text before the first heading is chapter
    one, and if the verse numbers start again inside a chapter, that is a missing
    heading and the chapter is cut there and numbered after its predecessor.
    """
    marks = [(m.start(), int(m.group(1))) for m in CHAPTER.finditer(text)]
    if not marks:
        return {1: verses_of(text)}
    spans = []
    if marks[0][1] != 1:
        spans.append((0, marks[0][0], 1))
    for i, (start, number) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        spans.append((start, end, number))
    out = {}
    for start, end, number in spans:
        piece = text[start:end]
        limit = (limits or {}).get(str(number))
        found, leftover = verses_of(piece, limit, can_cut=bool(limit))
        out[number] = found
        # a chapter whose heading the transcription lost: its verses follow the
        # chapter before, starting again at 1
        guard = 0
        while leftover and guard < 4:
            guard += 1
            # the next chapter, not the next *unused* number: this walked up past
            # every chapter already read and filed Matthew 11 as chapter 29
            nxt = number + 1
            while nxt in out:
                nxt += 1
            limit = (limits or {}).get(str(nxt))
            found, leftover = verses_of(leftover, limit, can_cut=bool(limit))
            if found:
                print("    {}: chapter {} has no heading in the transcription; "
                      "{} verses read from where the numbering started again".format(
                          book, nxt, len(found)))
                out[nxt] = found
            else:
                break
    return out


def verses_of(chapter_text, limit=None, can_cut=False):
    """([(verse, text, remarks)], leftover) for one chapter.

    The printed page runs like this: one or more numbered verses, then a rule, then
    the Fathers on that passage. A remark belongs to every verse printed above the
    rule it follows, which is why verses are grouped here rather than taken one at
    a time — and why the rule is required: it is what tells a verse of Scripture
    from a numbered line inside somebody's citation, which is the mistake that
    moved verses between chapters in the first attempt at this.
    """
    marks = []
    last = 0
    cut_at = None
    for m in VERSE.finditer(chapter_text):
        number = int(m.group(1))
        # A number larger than the chapter has verses is a citation, not a verse:
        # "[12:96]" in somebody's remark was being read as Matthew 12:96.
        if limit and number > limit:
            continue
        if number <= last:
            # The numbers have stopped climbing. When the chapter's verses are all
            # but done, this is the next chapter's verse 1 and its heading is one
            # the transcription lost — Matthew 11 has none.
            if can_cut and limit and last >= limit - 3:
                cut_at = m.start()
                break
            continue
        marks.append((m.start(), number))
        last = number

    rules = [r.start() for r in RULE.finditer(chapter_text)]
    out = []
    i = 0
    while i < len(marks):
        j = i
        while j + 1 < len(marks) and not any(
                marks[j][0] < r < marks[j + 1][0] for r in rules):
            j += 1
        stop = marks[j + 1][0] if j + 1 < len(marks) else len(chapter_text)
        rule = next((r for r in rules if marks[j][0] < r < stop), None)
        if rule is not None:
            after = chapter_text.find("\n", rule)
            after = stop if after == -1 else after
            remarks = remarks_of(chapter_text[after:stop])
            text = tidy(chapter_text[marks[i][0]:rule])
            for _, number in marks[i:j + 1]:
                out.append((number, text, remarks))
        i = j + 1
    return out, (chapter_text[cut_at:] if cut_at is not None else "")


def remarks_of(block):
    """[{short, text}] — one per printed attribution, continuations folded in."""
    marks = list(AUTHOR_PAT.finditer(block))
    out = []
    for i, m in enumerate(marks):
        stop = marks[i + 1].start() if i + 1 < len(marks) else len(block)
        citation = (m.group(2) or "").lstrip(", ").strip()
        body = tidy(block[m.end():stop])
        if not body:
            continue
        who = AUTHORS[m.group(1)]
        if citation:
            body = "(" + citation + ") " + body
        out.append({"source": SOURCE["id"], "short": who, "text": body})
    return out


def merge(path, book, chapter, entries):
    data = {}
    if os.path.exists(path):
        data = json.load(open(path, encoding="utf-8"))
    verses = data.get("verses") or {}
    for number in list(verses):
        kept = [e for e in verses[number] if e.get("source") != SOURCE["id"]]
        if kept:
            verses[number] = kept
        else:
            del verses[number]
    added = 0
    for number, remark in entries:
        for entry in remark:
            verses.setdefault(str(number), [])
            verses[str(number)].append(dict(entry))
            added += 1
    data.update({"book": book["name"], "slug": book["slug"], "chapter": chapter,
                 "verses": verses})
    sources = [s for s in (data.get("sources") or [])
               if s.get("id") != SOURCE["id"] and s.get("id") != "haydock"]
    sources.append(dict(SOURCE))
    data["sources"] = sources
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return added


def main():
    only = set(a.lower() for a in sys.argv[1:])
    books = {b["slug"]: b for b in json.load(
        open(os.path.join(ROOT, "data", "bible", "books.json"), encoding="utf-8"))}
    total = 0
    for ident, slug, name in VOLUMES:
        if only and slug not in only:
            continue
        if slug not in books:
            print("  {}: not a book in the reader".format(slug)); continue
        try:
            mine = json.load(open(os.path.join(ROOT, "data", "bible",
                                               slug + ".KJVM.json"), encoding="utf-8"))
            limits = {k: len(v) for k, v in (mine.get("chapters") or {}).items()}
        except Exception:
            limits = {}
        chapters = chapters_of(volume(ident), name, limits)
        remarks = 0
        for number, verses in sorted(chapters.items()):
            entries = []
            for verse, text, remarks_of_verse in verses:
                if remarks_of_verse:
                    entries.append((verse, remarks_of_verse))
            if not entries:
                continue
            path = os.path.join(COMMENTARY, slug, "{}.json".format(number))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            remarks += merge(path, books[slug], number, entries)
        parsed_verses = sum(len(v) for v in chapters.values())
        print("  {:<9} verses read {:,} of {:,} the reader has".format(
            name, parsed_verses, sum(limits.values())))

        # the index is derived from the files, so it has to be written again
        spec = importlib.util.spec_from_file_location(
            "build_haydock", os.path.join(ROOT, "scripts", "build-haydock.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.write_index()
        fathers = set()
        for verses in chapters.values():
            for _, _, rs in verses:
                for r in rs:
                    fathers.add(r["short"])
        print("  {:<9} {:>3} chapters, {:>6,} remarks, {} Fathers named".format(
            name, len(chapters), remarks, len(fathers)))
        total += remarks
    for slug, ident in MISSING.items():
        print("  {}: CCEL has no text volume at {} (404), so it is not here".format(slug, ident))
    print("  {} remark(s) written; the index reads them back".format(total))


if __name__ == "__main__":
    main()
