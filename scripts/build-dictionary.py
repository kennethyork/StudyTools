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
]

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


def fetch(source, letter):
    dest = os.path.join(CACHE, "{}-{}.json".format(source, letter))
    if os.path.exists(dest) and os.path.getsize(dest) > 100:
        with open(dest, encoding="utf-8") as f:
            return json.load(f)
    os.makedirs(CACHE, exist_ok=True)
    if source == "webster1828":
        data = webster_by_letter(letter)
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
    import io
    import zipfile
    body = download(KJV[0], KJV[1], least=100000)
    words = set()
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        for name in z.namelist():
            if not name.lower().endswith(".usfm"):
                continue
            text = z.read(name).decode("utf-8", "replace")
            text = re.sub(r"\\f\s.*?\\f\*", " ", text, flags=re.S)     # footnotes
            text = re.sub(r"\\x\s.*?\\x\*", " ", text, flags=re.S)     # cross-references
            text = re.sub(r"\\[a-z0-9]+\*?", " ", text)                  # the markers
            for word in re.findall(r"[A-Za-z][A-Za-z']+", text):
                word = word.lower().strip("'")
                if len(word) >= 3:
                    words.add(word)
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
        if not ("a" <= letter <= "z") or word.lower() not in words:
            continue
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
    print("  Webster's 1828: {} of {:,} entries are words the King James uses".format(kept, considered))
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
