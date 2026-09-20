#!/usr/bin/env python3
"""Build the Qur'an data: Arabic text plus a public-domain English translation.

Arabic  : risan/quran-json (Uthmani script; the Arabic text is not modified)
English : M. M. Pickthall, "The Meaning of the Glorious Koran" (1930), served by
          tanzil.net. Pickthall died in 1936 and the translation entered the
          US public domain on 1 January 2026.

Each surah is written in the same shape as the Bible books, so the site's
modernizer and its apps can treat it uniformly:

    data/quran/surah-002.AR.json   (Arabic)
    data/quran/surah-002.PK.json   (Pickthall's English)
    data/quran/surahs.json         (index: number, names, ayah count)
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "quran")
CACHE = os.path.join(ROOT, "scripts", ".cache", "quran")

ARABIC_URL = "https://raw.githubusercontent.com/risan/quran-json/main/dist/quran.json"
ENGLISH_URL = "https://tanzil.net/trans/en.pickthall"
UA = {"User-Agent": "StudyTools-build/1.0"}


def fetch(url, name):
    dest = os.path.join(CACHE, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    os.makedirs(CACHE, exist_ok=True)
    print(f"  downloading {name} ...", flush=True)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def slug(n):
    return "surah-%03d" % n


def clean(t):
    return re.sub(r"\s+", " ", t.replace("\u00a0", " ")).strip()


def main():
    os.makedirs(OUT, exist_ok=True)

    arabic = json.load(open(fetch(ARABIC_URL, "quran.json"), encoding="utf-8"))
    english = {}
    with open(fetch(ENGLISH_URL, "en.pickthall.txt"), encoding="utf-8") as f:
        last = None
        for line in f:
            m = re.match(r"^(\d+)\|(\d+)\|(.*)$", line.rstrip("\n"))
            if m:
                s, a, text = int(m.group(1)), int(m.group(2)), m.group(3)
                english.setdefault(s, {})[str(a)] = clean(text)
                last = (s, str(a))
            elif last and line.strip():          # a wrapped continuation line
                s, a = last
                english[s][a] = clean(english[s][a] + " " + line)

    index = []
    written = 0
    for s in arabic:
        n = s["id"]
        ar = {str(v["id"]): clean(v["text"]) for v in s["verses"]}
        en = english.get(n, {})
        missing = [k for k in ar if k not in en]
        name = s.get("transliteration") or s.get("name") or slug(n)
        for tr, verses in (("AR", ar), ("PK", en)):
            if not verses:
                continue
            out = {"book": name, "slug": slug(n), "translation": tr,
                   "chapters": {"1": verses}}
            with open(os.path.join(OUT, f"{slug(n)}.{tr}.json"), "w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
            written += 1
        index.append({"number": n, "slug": slug(n), "name": name,
                      "arabicName": s.get("name"), "ayahs": len(ar),
                      "revelation": s.get("type"), "missingEnglish": len(missing)})

    with open(os.path.join(OUT, "surahs.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  {written} files written to data/quran/  ({len(index)} surahs)")

    gap = [(e["number"], e["missingEnglish"]) for e in index if e["missingEnglish"]]
    print(f"  surahs with ayahs missing from the English: {gap if gap else 'none'}")


if __name__ == "__main__":
    main()
