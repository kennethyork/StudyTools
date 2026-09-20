#!/usr/bin/env python3
"""Build the modernized King James Version per-book JSON.

Source: the Abrahamic Library (kennethyork/AbrahamicLibrary). Its `kjv-bible`
work is the public-domain King James Version brought to present-day American
English ("modernized in full"), with the Apocrypha.

That text is nearly modern, not quite: 103 verses still carry a "thee", a "ye",
a "thou" or a "thine" beside the "you" in the same sentence ("I sent to thee;
and you have well done that you are come"), and 109 more keep "wrought". So the
same rule-based pass this repository uses for the Revised Version, the JPS
Tanakh, the American Standard Version, Young's Literal and the Douay-Rheims
finishes the text here, and every replacement it makes is recorded in
scripts/.cache/kjvm-pairs.txt for reading.

The library ships chapters as individual gzip members inside five byte-range
bundles. GitHub's raw host times out on thousands of small range requests, so
this script downloads each bundle once, extracts every chapter recorded in the
work metadata, and deletes the bundle when it is done with it.

Output: data/bible/<slug>.KJVM.json and updates data/bible/books.json.
The id "KJVM" (KJV Modernized) is this repository's own label for the edition;
it is not the "Modern King James Version", which is a different translation.
"""
import gzip
import importlib.util
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


def load_pass():
    """The modernization pass, imported: scripts/modernize.py is the one place
    these rules live, and the KJVM build uses the same ones rather than a second
    copy of them."""
    spec = importlib.util.spec_from_file_location(
        "modernize", os.path.join(ROOT, "scripts", "modernize.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.load_corpus()
    return module


def write_pairs(module, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for (before, after), n in sorted(module.PAIRS.items(), key=lambda x: -x[1]):
            f.write("{:6d}  {}  ->  {}\n".format(n, before, after))


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)

    print("fetching corpus index ...", flush=True)
    meta_path = os.path.join(CACHE, "kjv-meta.bin")
    try:
        index = json.loads(retry(lambda: urllib.request.urlopen(
            urllib.request.Request(INDEX_URL, headers=UA), timeout=240).read().decode("utf-8"),
            attempts=2, pause=3))["works"]
        offset, length = index[WORK_ID][1], index[WORK_ID][2]
    except Exception as exc:
        # The library is gone, or the network is. The chapter list was cached the
        # last time it worked and every chapter is already unpacked, so carry on
        # from the cache rather than failing the build.
        if not os.path.exists(meta_path):
            raise
        print("  index unreachable ({}); using the cached chapter list".format(exc), flush=True)
        offset, length = 0, os.path.getsize(meta_path)
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

    finish = load_pass()
    books = {}
    order = []
    done = 0
    t0 = time.time()
    for bundle in sorted(by_bundle):
        url = BUNDLE_URL.format(bundle)
        bundle_path = os.path.join(CACHE, "bundle-{}.bin".format(bundle))
        print("bundle {}: {} chapters".format(bundle, len(by_bundle[bundle])), flush=True)
        try:
            download(url, bundle_path)
        except Exception as exc:
            unpacked = sum(
                1 for entry in by_bundle[bundle]
                if os.path.exists(os.path.join(CACHE, "ch-{}-{}.bin".format(bundle, entry[4]))))
            if unpacked != len(by_bundle[bundle]):
                raise
            print("  bundle unreachable ({}); its {} chapters are already unpacked".format(
                exc, unpacked), flush=True)
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
            books[book_name][local_n] = {str(v["n"]): finish.modernize(clean(v["text"]))
                                         for v in chapter.get("verses", [])}
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
    print("wrote {} books; {} distinct replacements by the pass".format(
        len(order), len(finish.PAIRS)), flush=True)
    write_pairs(finish, os.path.join(ROOT, "scripts", ".cache", "kjvm-pairs.txt"))

    with open(os.path.join(OUT, "books.json"), encoding="utf-8") as f:
        idx = json.load(f)
    by_slug = {b["slug"]: b for b in idx}
    for book_name in order:
        slug = slugify(book_name)
        if slug in by_slug:
            # The order in books.json is the order the reader offers, newest and
            # most complete first, and the first one is what a chapter opens in.
            # Adding this translation must not reshuffle that.
            trs = list(by_slug[slug].get("translations") or ["KJV", "ASV", "WEB", "YLT"])
            if TRANSLATION not in trs:
                trs.append(TRANSLATION)
            by_slug[slug]["translations"] = trs
        else:
            idx.append({
                "name": book_name, "slug": slug, "chapters": len(books[book_name]),
                "testament": "DC", "deuterocanon": True, "translations": [TRANSLATION],
            })
    # written the way the rest of the repository keeps it, one book per line, so a
    # change to it reads as a change rather than as the whole file again
    with open(os.path.join(OUT, "books.json"), "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("books.json: {} books".format(len(idx)))


if __name__ == "__main__":
    main()
