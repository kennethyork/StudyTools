#!/usr/bin/env python3
"""Build the top-500 Biblical Greek and Hebrew vocabulary datasets.

Greek frequency: OpenGNT (eliranwong/OpenGNT, CC BY-SA 4.0) word-level
  Strong's tags counted across the Greek New Testament.
Greek glosses: STEPBible TBESG (CC BY 4.0).
Hebrew frequency: Open Scriptures Hebrew Bible (morphhb, CC BY 4.0) lemma
  attributes counted across the Westminster Leningrad Codex.
Hebrew glosses: STEPBible TBESH (CC BY 4.0).

Output: data/vocab/greek.json, data/vocab/hebrew.json
"""
import csv
import json
import os
import re
import urllib.request
import collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "vocab")
CACHE = os.path.join(ROOT, "scripts", ".cache")

TBESG_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
    "TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt"
)
TBESH_URL = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons/"
    "TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt"
)
MORPHHB_OT_BOOKS = [
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam",
    "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job", "Ps", "Prov",
    "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos",
    "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
]
MORPHHB_FILE = {
    "Gen": "Gen", "Exod": "Exod", "Lev": "Lev", "Num": "Num", "Deut": "Deut",
    "Josh": "Josh", "Judg": "Judg", "Ruth": "Ruth", "1Sam": "1Sam", "2Sam": "2Sam",
    "1Kgs": "1Kgs", "2Kgs": "2Kgs", "1Chr": "1Chr", "2Chr": "2Chr", "Ezra": "Ezra",
    "Neh": "Neh", "Esth": "Esth", "Job": "Job", "Ps": "Ps", "Prov": "Prov",
    "Eccl": "Eccl", "Song": "Song", "Isa": "Isa", "Jer": "Jer", "Lam": "Lam",
    "Ezek": "Ezek", "Dan": "Dan", "Hos": "Hos", "Joel": "Joel", "Amos": "Amos",
    "Obad": "Obad", "Jonah": "Jonah", "Mic": "Mic", "Nah": "Nah", "Hab": "Hab",
    "Zeph": "Zeph", "Hag": "Hag", "Zech": "Zech", "Mal": "Mal",
}


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  downloading {os.path.basename(dest)} ...", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "StudyTools-build/1.0"})
    with urllib.request.urlopen(req, timeout=240) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    return dest


def split_cols(line):
    return line.rstrip("\n").split("\t")


def clean_gloss(raw):
    raw = re.sub(r"<BR\s*/?>", "\n", raw, flags=re.I)
    raw = re.sub(r"<[^>]+>", "", raw)
    raw = raw.replace("&nbsp;", " ")
    raw = re.sub(r"<ref=['\"][^'\"]+['\"]>", "", raw)
    raw = raw.replace("</ref>", "")
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw


def parse_lexicon(path, prefix_re):
    entries = {}
    header_line = None
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    for i, line in enumerate(lines):
        cols = split_cols(line)
        if "Transliteration" in cols and "Gloss" in cols and "Morph" in cols:
            header_line = i
            break
    if header_line is None:
        raise RuntimeError(f"header not found in {path}")
    idx = {c: i for i, c in enumerate(split_cols(lines[header_line]))}
    strong_key = "eStrong" if "eStrong" in idx else "eStrong#"
    for line in lines[header_line + 1:]:
        cols = split_cols(line)
        if len(cols) < 7:
            continue
        strong = cols[idx[strong_key]].strip()
        if not prefix_re.match(strong):
            continue
        lemma = cols[idx.get("Greek" if prefix_re.pattern.startswith("G") else "Hebrew", idx.get("Hebrew", 1))].strip() if False else None
        # column names differ (Greek vs Hebrew)
        lemma_col = "Greek" if "Greek" in idx else "Hebrew"
        lemma = cols[idx[lemma_col]].strip()
        translit = cols[idx["Transliteration"]].strip()
        morph = cols[idx["Morph"]].strip()
        gloss = cols[idx["Gloss"]].strip()
        meaning = clean_gloss(cols[idx["Meaning"]] if "Meaning" in idx and idx["Meaning"] < len(cols) else "")
        base = strong[1:].lstrip("0")
        key = ("G" + base.zfill(4)) if strong[0] == "G" else ("H" + base.zfill(4))
        if key in entries:
            continue
        entries[key] = {
            "strongs": strong,
            "lemma": lemma,
            "translit": translit,
            "morph": morph,
            "gloss": gloss or (meaning.split(";")[0].split(".")[0].strip()),
            "meaning": meaning[:400],
        }

    # A number may be split into lettered senses (H7225A/H7225B, G25G/G25H).
    # Register the bare number as well, because the tagged texts carry the bare
    # number and would otherwise find no gloss at all.
    #
    # Which sense to use: the first whose lemma is a single word. Some numbers
    # lead with a phrase — H7462A is the place "Beth-eked of the shepherds"
    # before H7462B "to pasture" — and a phrase is never the right reading for
    # a word standing in a sentence. Where every sense is a phrase, the first
    # is taken and the app shows the number's gloss or nothing at all.
    for key in list(entries):
        bare = re.sub(r"[A-Za-z]$", "", key)
        if bare == key or bare in entries:
            continue
        senses = [entries[k] for k in entries if re.sub(r"[A-Za-z]$", "", k) == bare]
        single = [s for s in senses if " " not in s["lemma"] and "\u05be" not in s["lemma"]]
        entries[bare] = (single or senses)[0]
    return entries


def greek_frequency():
    freq = collections.Counter()
    src = download(
        "https://raw.githubusercontent.com/eliranwong/OpenGNT/master/OpenGNT_BASE_TEXT.zip",
        os.path.join(CACHE, "OpenGNT_BASE_TEXT.zip"),
    )
    import zipfile

    with zipfile.ZipFile(src) as z:
        name = [n for n in z.namelist() if n.endswith(".csv")][0]
        with z.open(name) as f:
            text = f.read().decode("utf-8")
    reader = csv.reader(text.splitlines(), delimiter="\t")
    for row in reader:
        if len(row) < 8:
            continue
        m = re.match(r"〔([^｜]+)｜([^｜]+)｜([^｜]+)｜([^｜]+)｜([^｜]+)｜([^〕]+)〕", row[7])
        if not m:
            continue
        sn = m.group(6).strip()
        if sn.startswith("G") and not m.group(5).startswith("G5"):
            freq[sn] += 1
    return freq


def hebrew_frequency():
    freq = collections.Counter()
    for book in MORPHHB_OT_BOOKS:
        src = download(
            f"https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/{MORPHHB_FILE[book]}.xml",
            os.path.join(CACHE, f"morphhb-{book}.xml"),
        )
        data = open(src, encoding="utf-8").read()
        for m in re.finditer(r'<w\s+[^>]*?lemma="([^"]+)"', data):
            lemma = m.group(1)
            for part in lemma.split("/"):
                part = part.strip()
                if not part:
                    continue
                num = re.match(r"(\d+)\s*([a-z]?)", part)
                if not num:
                    continue
                key = "H" + num.group(1).lstrip("0").zfill(4)
                freq[key] += 1
    return freq


def build(lang):
    if lang == "greek":
        lex = parse_lexicon(download(TBESG_URL, os.path.join(CACHE, "tbesg.txt")), re.compile(r"^G\d"))
        freq = greek_frequency()
        label = "Biblical Greek"
    else:
        lex = parse_lexicon(download(TBESH_URL, os.path.join(CACHE, "tbesh.txt")), re.compile(r"^H\d"))
        freq = hebrew_frequency()
        label = "Biblical Hebrew"

    items = []
    for strong, count in freq.most_common():
        entry = lex.get(strong)
        if not entry:
            base = strong.rstrip("GHIJKLMNOPQRSTUVWXYZ")
            entry = lex.get(base)
        if not entry:
            continue
        items.append(
            {
                "strongs": strong,
                "lemma": entry["lemma"],
                "translit": entry["translit"],
                "morph": entry["morph"],
                "gloss": entry["gloss"],
                "meaning": entry["meaning"],
                "count": count,
            }
        )
        if len(items) >= 500:
            break

    payload = {
        "language": label,
        "count": len(items),
        "source": "OpenGNT (CC BY-SA 4.0)" if lang == "greek" else "Open Scriptures Hebrew Bible (CC BY 4.0)",
        "lexicon": "STEPBible TBESG/TBESH (CC BY 4.0)",
        "words": items,
    }
    dest = os.path.join(OUT, f"{lang}.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{lang}: {len(items)} words -> {dest}")
    print("  e.g.", items[0]["lemma"], items[0]["translit"], "-", items[0]["gloss"], f"({items[0]['count']}x)")


def main():
    os.makedirs(OUT, exist_ok=True)
    build("greek")
    build("hebrew")


if __name__ == "__main__":
    main()
