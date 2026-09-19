#!/usr/bin/env python3
"""Build the modernized King James Version per-book JSON.

Source: the Abrahamic Library (kennethyork/AbrahamicLibrary). Its `kjv-bible`
work is the public-domain King James Version brought to present-day American
English ("modernized in full"), with the Apocrypha.

The library ships chapters as individual gzip members inside five byte-range
bundles. GitHub's raw host times out on thousands of small range requests, so
this script downloads each bundle once, extracts every chapter recorded in the
work metadata, and deletes the bundle when it is done with it.

Output: data/bible/<slug>.KJVM.json and updates data/bible/books.json.
The id "KJVM" (KJV Modernized) is this repository's own label for the edition;
it is not the "Modern King James Version", which is a different translation.
"""
import gzip
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "bible")
CACHE = os.path.join(ROOT, "scripts", ".cache", "abr")

RAW = "https://raw.githubusercontent.com/kennethyork/AbrahamicLibrary/main/docs/"
INDEX_URL = RAW + "corpus/index.json"
META_URL = RAW + "corpus/meta.bin"
BUNDLE_URL = RAW + "corpus/christianity/b{}.bin"

TRANSLATION = "KJVM"
WORK_ID = "kjv-bible"
UA = {"User-Agent": "StudyTools-build/1.0"}

SLUG_RE = re.compile(r"[^a-z0-9]+")

SLUG_OVERRIDES = {
    "1 samuel": "i-samuel", "2 samuel": "ii-samuel",
    "1 kings": "i-kings", "2 kings": "ii-kings",
    "1 chronicles": "i-chronicles", "2 chronicles": "ii-chronicles",
    "song of solomon": "song-of-solomon", "psalms": "psalms",
    "1 corinthians": "i-corinthians", "2 corinthians": "ii-corinthians",
    "1 thessalonians": "i-thessalonians", "2 thessalonians": "ii-thessalonians",
    "1 timothy": "i-timothy", "2 timothy": "ii-timothy",
    "1 peter": "i-peter", "2 peter": "ii-peter",
    "1 john": "i-john", "2 john": "ii-john", "3 john": "iii-john",
    "revelation": "revelation-of-john",
    "the rest of esther": "additions-to-esther",
    "the epistle of jeremiah": "epistle-of-jeremiah",
    "the song of the three holy children": "prayer-of-azariah",
    "the prayer of manasseh": "prayer-of-manasses",
    "1 esdras": "i-esdras", "2 esdras": "ii-esdras",
    "1 maccabees": "i-maccabees", "2 maccabees": "ii-maccabees",
}


def slugify(name):
    key = name.strip().lower()
    return SLUG_OVERRIDES.get(key, SLUG_RE.sub("-", key).strip("-"))


def retry(fn, attempts=6, pause=4):
    last = None
    for i in range(attempts):
        try:
            return fn()
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
            last = exc
            print("    retry {}/{} after {}: {}".format(i + 1, attempts, exc, pause), flush=True)
            time.sleep(pause * (i + 1))
    raise last


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"

    def go():
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
        os.replace(tmp, dest)

    retry(go)
    return dest


def fetch_bytes(url, offset, length, dest):
    if os.path.exists(dest) and os.path.getsize(dest) == length:
        with open(dest, "rb") as f:
            return f.read()
    return b""


def read_member(bundle_path, offset, length, chapter_cache, bundle):
    cached = os.path.join(chapter_cache, "ch-{}-{}.bin".format(bundle, offset))
    if os.path.exists(cached) and os.path.getsize(cached) == length:
        with open(cached, "rb") as f:
            return f.read()
    with open(bundle_path, "rb") as f:
        f.seek(offset)
        data = f.read(length)
    if len(data) != length:
        raise IOError("short read: wanted {}, got {}".format(length, len(data)))
    with open(cached, "wb") as f:
        f.write(data)
    return data


def clean(text):
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)

    print("fetching corpus index ...", flush=True)
    index = json.loads(retry(lambda: urllib.request.urlopen(
        urllib.request.Request(INDEX_URL, headers=UA), timeout=240).read().decode("utf-8")))["works"]
    religion, offset, length = index[WORK_ID]
    meta_path = os.path.join(CACHE, "kjv-meta.bin")
    if not (os.path.exists(meta_path) and os.path.getsize(meta_path) == length):
        data = retry(lambda: urllib.request.urlopen(
            urllib.request.Request(META_URL, headers=dict(UA, Range="bytes={}-{}".format(offset, offset + length - 1))),
            timeout=240).read())
        if len(data) != length:
            whole = retry(lambda: urllib.request.urlopen(
                urllib.request.Request(META_URL, headers=UA), timeout=600).read())
            data = whole[offset:offset + length]
        with open(meta_path, "wb") as f:
            f.write(data)
    with open(meta_path, "rb") as f:
        meta = json.loads(gzip.decompress(f.read()).decode("utf-8"))
    chapters = meta["chapters"]
    print("{} chapters in {} bundles".format(len(chapters), len({c[3] for c in chapters})), flush=True)

    by_bundle = {}
    for entry in chapters:
        by_bundle.setdefault(entry[3], []).append(entry)

    books = {}
    order = []
    done = 0
    t0 = time.time()
    for bundle in sorted(by_bundle):
        url = BUNDLE_URL.format(bundle)
        bundle_path = os.path.join(CACHE, "bundle-{}.bin".format(bundle))
        print("bundle {}: {} chapters".format(bundle, len(by_bundle[bundle])), flush=True)
        download(url, bundle_path)
        for entry in by_bundle[bundle]:
            title = entry[1]
            match = re.match(r"^(.*) (\d+)$", title)
            if not match:
                print("  skipping unparsable title: {!r}".format(title), flush=True)
                continue
            book_name, local_n = match.group(1), match.group(2)
            off, ln = entry[4], entry[5]
            if book_name not in books:
                books[book_name] = {}
                order.append(book_name)
            raw = read_member(bundle_path, off, ln, CACHE, bundle)
            chapter = json.loads(gzip.decompress(raw).decode("utf-8"))
            books[book_name][local_n] = {str(v["n"]): clean(v["text"]) for v in chapter.get("verses", [])}
            done += 1
            if done % 100 == 0 or done == len(chapters):
                print("  {}/{} chapters ({:.0f}s)".format(done, len(chapters), time.time() - t0), flush=True)

    for book_name in order:
        slug = slugify(book_name)
        with open(os.path.join(OUT, "{}.{}.json".format(slug, TRANSLATION)), "w", encoding="utf-8") as f:
            json.dump({
                "book": book_name,
                "slug": slug,
                "translation": TRANSLATION,
                "modernized": True,
                "chapters": books[book_name],
            }, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote {} books".format(len(order)), flush=True)

    with open(os.path.join(OUT, "books.json"), encoding="utf-8") as f:
        idx = json.load(f)
    by_slug = {b["slug"]: b for b in idx}
    for book_name in order:
        slug = slugify(book_name)
        if slug in by_slug:
            trs = set(by_slug[slug].get("translations") or ["KJV", "ASV", "WEB", "YLT"])
            trs.add(TRANSLATION)
            by_slug[slug]["translations"] = sorted(trs)
        else:
            idx.append({
                "name": book_name, "slug": slug, "chapters": len(books[book_name]),
                "testament": "DC", "deuterocanon": True, "translations": [TRANSLATION],
            })
    with open(os.path.join(OUT, "books.json"), "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
    print("books.json: {} books".format(len(idx)))


if __name__ == "__main__":
    main()
