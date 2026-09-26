#!/usr/bin/env python3
"""Build the Bible dictionary data for the Dictionary app.

Five sources, all public domain, merged into one alphabetical dictionary:

  Easton's Bible Dictionary (1897)
  Smith's Bible Dictionary (1863)
  Hastings' Dictionary of the Bible (1909)
  Hitchcock's Bible Names (1869)
  Webster's 1828 Dictionary, abridged to the words of the King James Version

The first four are the NEUU bible-dictionary-dataset, which parses CCEL's ThML
XML for public-domain works (dataset CC BY 4.0); the fourth arrived later than
the first three and is a dictionary of names rather than of things.

The fifth is the one a reader of the King James Version notices missing:
Easton, Smith and Hastings define people, places and topics, so a word like
"lasciviousness" has nowhere to live in them, and neither do the senses of
"conversation", "charity" or "let" that the King James uses. Noah Webster's
American Dictionary of the English Language (1828) is a general English
dictionary that quotes Scripture in its definitions and was written while the
King James was the Bible most Americans read. Its complete text is 63,000
entries, most of them about things no Bible reader will look up, so it is cut
down here to the words the King James Version actually uses — the vocabulary is
taken from the KJV itself (eBible.org's USFM, public domain), and an entry is
kept when its headword is one of those words.

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
    {"id": "hitchcock", "label": "Hitchcock's Bible Names", "year": 1869},
    {"id": "webster1828", "label": "Webster's 1828 Dictionary", "year": 1828},
    # Written by hand, in scripts/dictionary-notes.json, for the words a reader
    # meets often and none of the others reach: the transcription of the 1828 this
    # project uses has a scrape's failure where some of their entries should be, and
    # the rest are King James forms, compounds and spellings no dictionary here
    # headwords. The gloss is this site's own and the citation says where it is read.
    {"id": "notes", "label": "This site's own note", "year": 2026},
]

NOTES = os.path.join(ROOT, "scripts", "dictionary-notes.json")

# The whole of Webster's 1828 as a MySQL dump (62,977 entries), from a repository
# that says the text came from Project Gutenberg and was cleaned up (MIT for the
# repository, public domain for the dictionary itself: Webster died in 1843).
WEBSTER = ("https://raw.githubusercontent.com/DataWar/1828-dictionary/main/"
           "v2015/SQL/02-database-insert/dictionary_webster1828.sql", "webster1828.sql")
# What the dump stores in the place of a definition it never found.
SCRAPE_FAILURE = re.compile(
    r"please check your spelling|no results? found|for further assistance|did you mean", re.I)
# The King James Version, for its vocabulary only — the text itself is not shipped.
KJV = ("https://ebible.org/Scriptures/eng-kjv_usfm.zip", "eng-kjv_usfm.zip")

UA = {"User-Agent": "StudyTools-build/1.0"}


def download(url, name, least=1000):
    """A file from the network, kept in the cache. Returns its bytes."""
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, name)
    if os.path.exists(dest) and os.path.getsize(dest) > least:
        with open(dest, "rb") as f:
            return f.read()
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=600) as r:
        body = r.read()
    with open(dest, "wb") as f:
        f.write(body)
    return body


def notes_by_letter():
    """The notes written by hand, grouped by first letter, in the shape of a source."""
    with open(NOTES, encoding="utf-8") as f:
        notes = json.load(f)
    grouped = {}
    for entry in notes.get("entries", []):
        letter = entry["slug"][0].lower()
        grouped.setdefault(letter, {})[entry["slug"].upper()] = {
            "name": entry["name"], "slug": entry["slug"],
            "definitions": [{"text": entry["text"]}],
        }
    return grouped


def fetch(source, letter):
    dest = os.path.join(CACHE, "{}-{}.json".format(source, letter))
    if os.path.exists(dest) and os.path.getsize(dest) > 100:
        with open(dest, encoding="utf-8") as f:
            return json.load(f)
    os.makedirs(CACHE, exist_ok=True)
    if source == "webster1828":
        data = webster_by_letter(letter)
    elif source == "notes":
        data = notes_by_letter().get(letter, {})
    else:
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


def forms_of(word):
    """The forms a headword is written in, for matching it against the text.

    A dictionary's headword is a lemma; the King James is not. "Acclamation" occurs
    in it only as "acclamations", and "abhor" only as "abhorrest" and "abhorreth",
    so a filter that asks whether the headword itself appears in the text threw
    those entries away — and then the reader who looked the word up found nothing.
    This gives the regular forms; app.js gives them back the other way round, when a
    reader types an older form and the entry is under the headword.
    """
    out, spellings = {word}, [word]
    # Webster spells American and the King James British: the entry a reader wants is
    # the one under "honor" when the text says "honour", and under "savior" when it
    # says "saviour". Before this the abridgment dropped every such entry — honour
    # (214 times in the text), labour, favour, savour, valour, neighbour — because the
    # headword itself never appears in the King James.
    #
    # The King James' own older spellings, which a headword has to be matched against
    # too or its entry is thrown away: the text says shew, musick, fulf il, spue.
    for modern, older in (("show", "shew"), ("music", "musick"), ("fulfill", "fulfil"),
                          ("skillful", "skilful"), ("jubilee", "jubile"), ("entreat", "intreat"),
                          ("spew", "spue"), ("plaster", "plaister"), ("sycamore", "sycomore"),
                          ("ceiled", "cieled"), ("public", "publick"), ("basin", "bason"),
                          ("caterpillar", "caterpiller"), ("grizzled", "grisled"),
                          ("marvelous", "marvellous"), ("wonderous", "wondrous")):
        if word == modern or word.startswith(modern + "-"):
            spellings.append(word.replace(modern, older, 1))
    if "or" in word:
        spellings.append(word.replace("or", "our"))
    if "our" in word:
        spellings.append(word.replace("our", "or"))
    if word.endswith("ize"):
        spellings.append(word[:-3] + "ise")
    if word.endswith("ise"):
        spellings.append(word[:-3] + "ize")
    if word.endswith("er"):
        spellings.append(word[:-2] + "re")
    if word.endswith("re"):
        spellings.append(word[:-2] + "er")
    if word.endswith("se"):
        spellings.append(word[:-2] + "ce")
    if word.endswith("ce"):
        spellings.append(word[:-2] + "se")
    # the doubled letters the older spelling keeps, which are the last ones:
    # marvellous, woollen, travelled, jewell
    for ending, other in (("l", "ll"), ("ll", "l"), ("led", "lled"), ("lled", "led"),
                          ("ling", "lling"), ("lling", "ling"), ("ler", "ller"), ("ller", "ler")):
        if word.endswith(ending):
            spellings.append(word[: -len(ending)] + other)
    # the plurals and preterites that are their own words, which no suffix rule
    # reaches: the text says horsemen and the dictionary has horseman
    odd = {"man": "men", "woman": "women", "child": "children", "foot": "feet",
           "tooth": "teeth", "goose": "geese", "mouse": "mice", "ox": "oxen"}
    for spelling in spellings:
        for singular, plural in odd.items():
            if spelling == singular:
                out.add(plural)
            elif spelling.endswith("-" + singular):
                out.add(spelling[: -len(singular)] + plural)
            elif spelling.endswith(singular) and len(spelling) > len(singular):
                out.add(spelling[: -len(singular)] + plural)      # horseman -> horsemen
        for suffix in ("s", "es", "ed", "ing", "eth", "est", "edst"):
            out.add(spelling + suffix)
        if spelling.endswith("y"):
            out.add(spelling[:-1] + "ies")
            out.add(spelling[:-1] + "ieth")
            out.add(spelling[:-1] + "ied")
        if spelling.endswith("e"):
            out.add(spelling + "d")
            out.add(spelling[:-1] + "ing")
            out.add(spelling[:-1] + "eth")
        if len(spelling) > 2 and spelling[-1] not in "aeiouwxy":
            out.add(spelling + spelling[-1] + "ed")      # abhor -> abhorred
            out.add(spelling + spelling[-1] + "ing")
            out.add(spelling + spelling[-1] + "eth")     # abhor -> abhorreth
            out.add(spelling + spelling[-1] + "est")     # abhor -> abhorrest
    # the King James writes compounds solid where Webster keeps them apart:
    # threshingfloor, armourbearer, selfsame, lovingkindness. The headword is tried
    # with a hyphen at every point, and a hyphenated headword is tried solid, because
    # where the dictionary puts the hyphen is its own business and not the reader's.
    for spelling in spellings:
        if len(spelling) >= 7:
            for split in range(3, len(spelling) - 3):
                out.add(spelling[:split] + "-" + spelling[split:])
        if "-" in spelling:
            out.add(spelling.replace("-", ""))
    return out


def kjv_words():
    """Every word the King James Version uses, lowercased — from the text itself.

    The USFM markup has to go first, and footnotes and cross-reference notes with
    it: they are the translator's apparatus and not the Bible's words, and a
    footnote's vocabulary would let an entry into the dictionary that no reader
    will ever meet in the text. Words of one or two letters are dropped: the
    dictionary has nothing to say about "of" that a reader wants.
    """
    dest = os.path.join(CACHE, "kjv-words.json")
    if os.path.exists(dest):
        with open(dest, encoding="utf-8") as f:
            return set(json.load(f))
    # (delete the cache to rebuild it after a change to the rules above)
    import io
    import zipfile
    body = download(KJV[0], KJV[1], least=100000)
    words = set()
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        for name in z.namelist():
            if not name.lower().endswith(".usfm"):
                continue
            # 00-FRT is the King James' front matter: the dedication, the letter to
            # the reader, the tables. Its vocabulary is not the Bible's, and taking
            # it for the Bible's put words like "afternoon" and "alex" in the word
            # list and so in the dictionary.
            if "-FRT" in name or name.startswith("00-"):
                continue
            text = z.read(name).decode("utf-8", "replace")
            # only the verses: a word list taken from the whole file also takes the
            # book headings, the apparatus and the file names ("utf", "sfm")
            text = "\n".join(line for line in text.splitlines() if line.startswith("\\v "))
            text = re.sub(r"\\f\s.*?\\f\*", " ", text, flags=re.S)     # footnotes
            text = re.sub(r"\\x\s.*?\\x\*", " ", text, flags=re.S)     # cross-references
            text = re.sub(r"\\[a-z0-9]+\*?", " ", text)                  # the markers
            # hyphens are kept, because the King James writes Beth-lehem and Ash-dod:
            # splitting on them put "lehem" and "dod" in the word list as if they were
            # words, and lost the name the reader would look up
            for word in re.findall(r"[A-Za-z][A-Za-z'\-]*[A-Za-z]", text):
                word = word.lower().strip("'").strip("-")
                if len(word) >= 3:
                    words.add(word)
                    if "-" in word:
                        words.add(word.replace("-", ""))
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(sorted(words), f)
    print("  the King James Version uses {:,} words".format(len(words)))
    return words


def sql_rows(text):
    """The rows of a MySQL dump, read rather than matched.

    A regular expression over the rows would cut definitions short at the first
    comma or quote inside them, and a dictionary that quietly loses half of every
    entry is worse than none: the strings here are single-quoted with backslash
    escapes, so they are parsed as such.
    """
    escapes = {"n": "\n", "r": "\r", "t": "\t", "0": "", "\\": "\\", "'": "'", '"': '"'}
    i, n = 0, len(text)
    while True:
        i = text.find("(", i)
        if i < 0:
            return
        if not re.match(r"\(\d+, ", text[i:i + 8]):
            i += 1
            continue
        fields, j = [], i + 1
        while j < n:
            if text[j] == "'":
                j += 1
                buf = []
                while j < n:
                    c = text[j]
                    if c == "\\" and j + 1 < n:
                        buf.append(escapes.get(text[j + 1], text[j + 1]))
                        j += 2
                        continue
                    if c == "'":
                        j += 1
                        break
                    buf.append(c)
                    j += 1
                fields.append("".join(buf))
                continue
            if text[j] == ")":
                j += 1
                break
            if text[j] == ",":
                j += 1
                continue
            if text[j] == " ":
                j += 1
                continue
            # a bare value: the row's id, or its length. Counted, or every field
            # after it is read as the wrong one.
            buf = []
            while j < n and text[j] not in ",)":
                buf.append(text[j])
                j += 1
            fields.append("".join(buf).strip())
        i = j
        yield fields


_WEBSTER = None


def webster_all():
    """Webster's 1828, abridged to the words of the King James, by letter.

    Parsed once for the whole run: the dump is thirty-five megabytes and the
    builder asks for it twenty-six times, once per letter.
    """
    global _WEBSTER
    if _WEBSTER is not None:
        return _WEBSTER
    words = kjv_words()
    body = download(WEBSTER[0], WEBSTER[1], least=1000000)
    text = body.decode("utf-8", "replace")
    grouped, kept, considered, dropped = {}, 0, 0, 0
    for fields in sql_rows(text):
        if len(fields) < 7:
            continue
        word = fields[1].strip()
        content = fields[6]
        if not word or not content:
            continue
        considered += 1
        letter = word[0].lower()
        if not ("a" <= letter <= "z"):
            continue
        # Every entry the transcription has is kept — the whole dictionary, not only
        # the words the King James uses. Which of them are words of the King James is
        # decided after the merge, so that a word the King James uses is marked
        # whichever dictionary defines it.
        text = webster_text(content)
        heading = fields[5] or ""
        # Rows with no definition at all, of which the dump has about 1,500: the scrape
        # that made it stored its own failure in the definition's place — an error
        # notice ("Please check your spelling...", heading "&nbsp; No results found.")
        # or a list of words it thought the reader might have meant ("Did you mean one
        # of these words?"). Both read like entries, and the second one's heading even
        # arrived in the page as a term, so they are dropped rather than shown: a
        # definition that is the website's own error message is not a definition.
        if not text or SCRAPE_FAILURE.search(text) or SCRAPE_FAILURE.search(heading):
            dropped += 1
            continue
        # The dump's `heading` column is usually the word in title case, and is what
        # the entry is called; where the scrape left a placeholder instead, the word
        # itself is the only real name there is.
        name = clean(heading)
        if not name or name.startswith("&"):
            name = word[0].upper() + word[1:]
        # 188 of the headings are set in capitals ("LACE"); the list is alphabetical
        # beside names like "Laban", and the capitals are the printer's, not the word's
        if name.isupper():
            name = name[0] + name[1:].lower()
        entry = {"name": name,
                 "slug": re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-"),
                 "definitions": [{"text": text}]}
        if not entry["definitions"][0]["text"]:
            continue
        grouped.setdefault(letter, {})[word.upper()] = entry
        kept += 1
    print("  Webster's 1828: {:,} entries kept".format(kept))
    if dropped:
        print("    {} of them dropped: the dump has the scrape's own failure where the\n"
              "    definition should be".format(dropped))
    _WEBSTER = grouped
    return _WEBSTER


def webster_by_letter(letter):
    return webster_all().get(letter, {})


def webster_text(html):
    """A definition as prose: the markup off, the Scripture left in place.

    The dump links every verse it quotes to an id; the link's own text is the
    reference a reader wants ("Ephesians 4:19"), and the app turns references in
    the text into links, so the anchor goes and its text stays. The `Â` in the
    dump is a non-breaking space that was decoded as two characters.
    """
    text = re.sub(r"<a\b[^>]*>(.*?)</a>", r"\1", html, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(?:p|div|li)>\s*", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("\u00c2 ", " ").replace("\u00c2", "")
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:2000].strip()


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
                if entry.get("kjv"):
                    item["kjv"] = True
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

        # A term whose every definition came out empty is not an entry: the sources
        # carry a few dozen of those (cross-references whose text the dataset has
        # lost), and a reader who opened one was shown a word with nothing under it.
        king_james = kjv_words()
        for e in merged.values():
            word = e["slug"].replace("-", "")
            if word in king_james or (forms_of(word) & king_james):
                e["kjv"] = True
        entries = [e for e in merged.values() if e["definitions"]]
        without = len(merged) - len(entries)
        if without:
            print("    {} term(s) dropped as empty for {}".format(without, letter))
        entries = sorted(entries, key=lambda e: e["name"].lower())
        for entry in entries:
            entry["definitions"].sort(key=lambda d: d["year"])
        with open(os.path.join(OUT, "{}.json".format(letter)), "w", encoding="utf-8") as f:
            json.dump({"letter": letter, "entries": entries}, f, ensure_ascii=False, separators=(",", ":"))

        index[letter] = [dict({"name": e["name"], "slug": e["slug"],
                               "count": len(e["definitions"])},
                              **({"kjv": 1} if e.get("kjv") else {})) for e in entries]
        print("  {}: {} terms".format(letter, len(entries)), flush=True)

    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({
            "sources": [{"id": s["id"], "label": s["label"], "year": s["year"]} for s in SOURCES],
            "letters": index,
            "total": sum(len(v) for v in index.values()),
        }, f, ensure_ascii=False, separators=(",", ":"))
    marked_words = sum(1 for v in index.values() for e in v if e.get("kjv"))
    print("total terms: {} ({} of them words the King James uses)".format(
        sum(len(v) for v in index.values()), marked_words))


if __name__ == "__main__":
    main()
