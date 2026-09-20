#!/usr/bin/env python3
"""Build data/compare/parallels.json - the Qur'an / Tanakh / Book of Mormon
passages that appear in the Parallel Passages tool.

Only the passages named in scripts/compare-entries.json are written out, so the
site never ships the full Qur'an, Tanakh or Book of Mormon: those texts are
readable only as the comparisons the reader chooses to open.

Sources (all public domain):
  Qur'an        Arabic from risan/quran-json (unmodified); English from
                M. M. Pickthall, 1930, served by tanzil.net
  Tanakh        Jewish Publication Society, 1917, from eBible.org (engjps)
  Book of Mormon  the 1830/1920 text, via johngthecreator/Book_of_Mormon_Scriptures

English is modernized with scripts/modernize.py, so all four traditions are
quoted in the same present-day English.
"""
import importlib.util
import json
import os
import re
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "compare")
CACHE = os.path.join(ROOT, "scripts", ".cache", "compare")
ENTRIES = os.path.join(ROOT, "scripts", "compare-entries.json")
UA = {"User-Agent": "StudyTools-build/1.0"}

QURAN_AR = "https://raw.githubusercontent.com/risan/quran-json/main/dist/quran.json"
QURAN_EN = "https://tanzil.net/trans/en.pickthall"
BOM = "https://raw.githubusercontent.com/johngthecreator/Book_of_Mormon_Scriptures/main/book-of-mormon.json"

BOOK_ALIAS = {
    "psalm": "psalms", "psalms": "psalms", "song of solomon": "song-of-solomon",
    "1 samuel": "i-samuel", "2 samuel": "ii-samuel", "1 kings": "i-kings",
    "2 kings": "ii-kings", "1 chronicles": "i-chronicles", "2 chronicles": "ii-chronicles",
    "1 corinthians": "i-corinthians", "2 corinthians": "ii-corinthians",
    "1 thessalonians": "i-thessalonians", "2 thessalonians": "ii-thessalonians",
    "1 timothy": "i-timothy", "2 timothy": "ii-timothy",
    "1 peter": "i-peter", "2 peter": "ii-peter",
    "1 john": "i-john", "2 john": "ii-john", "3 john": "iii-john",
}


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "scripts", name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    print(f"  downloading {name} ...", flush=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def clean(t):
    return re.sub(r"\s+", " ", t.replace("\u00a0", " ")).strip()


# ---------------------------------------------------------------- sources
def quran_source():
    arabic = json.load(open(fetch(QURAN_AR, "quran.json"), encoding="utf-8"))
    ar = {s["id"]: {str(v["id"]): clean(v["text"]) for v in s["verses"]} for s in arabic}
    names = {s["id"]: (s.get("transliteration") or s.get("name")) for s in arabic}
    en = {}
    with open(fetch(QURAN_EN, "en.pickthall.txt"), encoding="utf-8") as f:
        last = None
        for line in f:
            m = re.match(r"^(\d+)\|(\d+)\|(.*)$", line.rstrip("\n"))
            if m:
                s, a, text = int(m.group(1)), int(m.group(2)), m.group(3)
                en.setdefault(s, {})[str(a)] = clean(text)
                last = (s, str(a))
            elif last and line.strip():
                s, a = last
                en[s][a] = clean(en[s][a] + " " + line)
    return ar, en, names


def tanakh_source(ebible):
    z = zipfile.ZipFile(ebible.download("engjps"))
    out = {}
    for name in sorted(z.namelist()):
        if not name.endswith(".usfm"):
            continue
        code = re.match(r"^\d+-?([A-Z0-9]{3})", os.path.basename(name))
        if not code or code.group(1) not in ebible.CODE_SLUG:
            continue
        slug = ebible.CODE_SLUG[code.group(1)]
        text = z.read(name).decode("utf-8-sig", errors="replace")
        out[slug] = ebible.parse(text)
    return out


def bom_source():
    data = json.load(open(fetch(BOM, "book-of-mormon.json"), encoding="utf-8"))
    out = {}
    for v in data:
        out.setdefault(v["book_title"], {}).setdefault(v["chapter_number"], {})[v["verse_number"]] = clean(v["scripture_text"])
    return out


# ---------------------------------------------------------------- refs
def parse_quran_ref(ref):
    m = re.match(r"^(\d+):(\d+)(?:-(\d+))?$", ref)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3) or m.group(2))


def parse_verse_ref(ref):
    m = re.match(r"^(.*?)\s+(\d+):(\d+)(?:-(\d+))?$", ref)
    if not m:
        return None
    return m.group(1).strip(), int(m.group(2)), int(m.group(3)), int(m.group(4) or m.group(3))


def slugify(name):
    key = name.lower().strip()
    key = BOOK_ALIAS.get(key, key)
    return re.sub(r"[^a-z0-9]+", "-", key.replace("'", "")).strip("-")


def main():
    ebible = load_script("build-ebible")
    modern = load_script("modernize")
    modern.load_corpus()

    doc = json.load(open(ENTRIES, encoding="utf-8"))
    entries = doc["entries"]
    labels = doc.get("traditions", {})

    ar, qen, qnames = quran_source()
    tanakh = tanakh_source(ebible)
    bom = bom_source()

    out_entries = []
    problems = []
    for e in entries:
        sides = []
        for side in e["sides"]:
            tradition = side["tradition"]
            ref = side["ref"]
            item = {"tradition": tradition, "ref": ref,
                    "label": (labels.get(tradition) or {}).get("label", tradition),
                    "source": (labels.get(tradition) or {}).get("source", "")}
            if tradition == "bible":
                pass                                   # read live in the app
            elif tradition == "islam":
                p = parse_quran_ref(ref)
                if not p:
                    problems.append((e["id"], tradition, ref, "bad Qur'an ref")); continue
                s, a1, a2 = p
                ays = [str(n) for n in range(a1, a2 + 1)]
                if s not in ar or any(a not in ar[s] for a in ays):
                    problems.append((e["id"], tradition, ref, "ayah missing")); continue
                item["arabic"] = " ".join(ar[s][a] for a in ays)
                item["text"] = modern.modernize(" ".join(qen[s][a] for a in ays))
                item["source"] = "M. M. Pickthall, 1930 \u2014 %s %d" % (qnames.get(s, "Surah %d" % s), s)
            elif tradition == "judaism":
                p = parse_verse_ref(ref)
                if not p:
                    problems.append((e["id"], tradition, ref, "bad ref")); continue
                book, ch, v1, v2 = p
                vs = tanakh.get(slugify(book), {}).get(str(ch), {})
                if not vs:
                    problems.append((e["id"], tradition, ref, "not in JPS data")); continue
                item["text"] = modern.modernize(" ".join(vs[str(n)] for n in range(v1, v2 + 1) if str(n) in vs))
            else:                                       # mormon
                p = parse_verse_ref(ref)
                if not p:
                    problems.append((e["id"], tradition, ref, "bad ref")); continue
                book, ch, v1, v2 = p
                vs = bom.get(book, {}).get(ch, {})
                if not vs:
                    problems.append((e["id"], tradition, ref, "not in Book of Mormon data")); continue
                item["text"] = modern.modernize(" ".join(vs[n] for n in range(v1, v2 + 1) if n in vs))
            sides.append(item)

        # Every comparison is the Bible against ONE other tradition, so a theme
        # that appears in several traditions becomes several Bible-centred pairs
        # rather than one wide table.
        bible_side = None
        other_sides = []
        for s in sides:
            if s["tradition"] == "bible":
                bible_side = s
            else:
                other_sides.append(s)

        if bible_side is None or not other_sides:
            out_entries.append({"id": e["id"], "title": e["title"], "note": e["note"],
                                "sides": sides})
            continue

        for other in other_sides:
            if len(other_sides) == 1:
                out_entries.append({"id": e["id"], "title": e["title"], "note": e["note"],
                                    "sides": [bible_side, other]})
            else:
                out_entries.append({
                    "id": "%s-%s" % (e["id"], other["tradition"]),
                    "title": "%s \u2014 %s" % (e["title"], other["label"]),
                    "note": e["note"], "sides": [bible_side, other],
                })

    os.makedirs(OUT, exist_ok=True)
    bundle = {
        "note": ("Every comparison is the Bible against one other tradition \u2014 one passage against "
                 "one passage. "
                 "The Bible is read from this site's own translations; the other traditions are quoted from "
                 "the public-domain editions named under sources, in the same present-day English. Only the "
                 "passages compared here are bundled \u2014 the full texts are not part of this site."),
        "traditions": labels,
        "entries": out_entries,
    }
    with open(os.path.join(OUT, "parallels.json"), "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
        f.write("\n")

    from collections import Counter
    counts = Counter(s["tradition"] for e in out_entries for s in e["sides"])
    print(f"  {len(out_entries)} entries written to data/compare/parallels.json")
    print(f"  four-way: {sum(1 for e in out_entries if len(e['sides']) == 4)}"
          f" | 1:1 pairs: {sum(1 for e in out_entries if len(e['sides']) == 2)}")
    print(f"  passages frozen by tradition: {dict(counts)}")
    print(f"  problems: {problems if problems else 'none'}")


if __name__ == "__main__":
    main()
