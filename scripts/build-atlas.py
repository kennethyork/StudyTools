#!/usr/bin/env python3
"""Build an atlas that ships as files: the places of the Bible, on a real map.

    python3 scripts/build-atlas.py

Two openly licensed datasets, no tiles and no network at read time:

  * Places and their verses: the OpenBible.info Bible Geocoding dataset
    (CC BY 4.0), the same publisher as the cross-references this site already
    carries. Its all.kml holds every place with a representative point, and its
    ancient.jsonl holds the verses each place is named in.
  * The land itself: Natural Earth, 1:110m, public domain, as GeoJSON.

Both are reduced here to what a browser can read whole — a coastline of a few
hundred kilobytes and a place list with its verses — so the atlas opens offline,
like the rest of the site, and no tile server ever learns what you are reading.

Output:
  data/atlas/places.json   every place: name, position, what it is, its verses
  data/atlas/land.json     Natural Earth 110m land, as GeoJSON
  data/atlas/water.json    the rivers and lakes of the dataset, as lines
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "atlas")
CACHE = os.path.join(ROOT, "scripts", ".cache", "atlas")
UA = {"User-Agent": "StudyTools-build/1.0 (openly licensed map data)"}

KML = "https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/main/all.kml"
ANCIENT = ("https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/"
           "main/data/ancient.jsonl")
LAND = ("https://raw.githubusercontent.com/martynafford/natural-earth-geojson/"
        "master/110m/physical/ne_110m_land.json")
LAKES = ("https://raw.githubusercontent.com/martynafford/natural-earth-geojson/"
         "master/110m/physical/ne_110m_lakes.json")

# OSIS book code to the slug this reader uses.
OSIS = {
    "Gen": "genesis", "Exod": "exodus", "Lev": "leviticus", "Num": "numbers",
    "Deut": "deuteronomy", "Josh": "joshua", "Judg": "judges", "Ruth": "ruth",
    "1Sam": "i-samuel", "2Sam": "ii-samuel", "1Kgs": "i-kings", "2Kgs": "ii-kings",
    "1Chr": "i-chronicles", "2Chr": "ii-chronicles", "Ezra": "ezra",
    "Neh": "nehemiah", "Esth": "esther", "Job": "job", "Ps": "psalms",
    "Prov": "proverbs", "Eccl": "ecclesiastes", "Song": "song-of-solomon",
    "Isa": "isaiah", "Jer": "jeremiah", "Lam": "lamentations", "Ezek": "ezekiel",
    "Dan": "daniel", "Hos": "hosea", "Joel": "joel", "Amos": "amos",
    "Obad": "obadiah", "Jonah": "jonah", "Mic": "micah", "Nah": "nahum",
    "Hab": "habakkuk", "Zeph": "zephaniah", "Hag": "haggai", "Zech": "zechariah",
    "Mal": "malachi", "Matt": "matthew", "Mark": "mark", "Luke": "luke",
    "John": "john", "Acts": "acts", "Rom": "romans", "1Cor": "i-corinthians",
    "2Cor": "ii-corinthians", "Gal": "galatians", "Eph": "ephesians",
    "Phil": "philippians", "Col": "colossians", "1Thess": "i-thessalonians",
    "2Thess": "ii-thessalonians", "1Tim": "i-timothy", "2Tim": "ii-timothy",
    "Titus": "titus", "Phlm": "philemon", "Heb": "hebrews", "Jas": "james",
    "1Pet": "i-peter", "2Pet": "ii-peter", "1John": "i-john", "2John": "ii-john",
    "3John": "iii-john", "Jude": "jude", "Rev": "revelation-of-john",
}

PLACEMARK = re.compile(r"<Placemark>(.*?)</Placemark>", re.S)


def fetch(url, name, least=1000):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not (os.path.exists(path) and os.path.getsize(path) > least):
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read()
        with open(path, "wb") as f:
            f.write(body)
    return open(path, "rb").read()


def tag(block, name):
    m = re.search(r"<" + name + r">(.*?)</" + name + r">", block, re.S)
    return m.group(1).strip() if m else ""


def points(text):
    out = []
    for pair in text.replace("\n", " ").split():
        parts = pair.split(",")
        if len(parts) >= 2:
            try:
                out.append((round(float(parts[0]), 5), round(float(parts[1]), 5)))
            except ValueError:
                pass
    return out


def read_kml():
    """Markers from the representative-point placemarks, lines from the rest."""
    text = fetch(KML, "all.kml", least=1_000_000).decode("utf-8", "replace")
    markers = {}
    water = []
    for block in PLACEMARK.findall(text):
        style = tag(block, "styleUrl").lstrip("#")
        label = re.sub(r"\s+", " ", tag(block, "name"))
        name = label.split(" / ")[0].strip()
        line = re.search(r"<LineString>(.*?)</LineString>", block, re.S)
        if line and "representativepoint" not in style:
            coords = points(tag(line.group(1), "coordinates"))
            if len(coords) > 1 and style.startswith("water"):
                water.append(coords)
            continue
        point = re.search(r"<Point>(.*?)</Point>", block, re.S)
        if not point:
            continue
        coords = points(tag(point.group(1), "coordinates"))
        if not coords:
            continue
        lon, lat = coords[0]
        if name not in markers:
            markers[name] = {"name": name, "label": label, "lon": lon, "lat": lat,
                             "water": style.startswith("water")}
    return markers, water


def read_places(markers):
    """Attach each place's verses, from the dataset's own verse list."""
    text = fetch(ANCIENT, "ancient.jsonl", least=1_000_000).decode("utf-8", "replace")
    joined = 0
    for line in text.splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        name = (rec.get("friendly_id") or "").strip()
        place = markers.get(name)
        if not place:
            continue
        joined += 1
        place["types"] = rec.get("types") or []
        verses = []
        for v in rec.get("verses") or []:
            parts = (v.get("osis") or "").split(".")
            if len(parts) < 3:
                continue
            slug = OSIS.get(parts[0])
            if not slug:
                continue
            try:
                verses.append([slug, int(parts[1]), int(parts[2])])
            except ValueError:
                continue
        # a place named in a hundred verses says so with the first dozen
        place["verses"] = verses[:400]
        place["verses_total"] = len(verses)
    return joined


def main():
    markers, water = read_kml()
    joined = read_places(markers)
    os.makedirs(OUT, exist_ok=True)

    land = json.loads(fetch(LAND, "ne_110m_land.json", least=100_000).decode("utf-8"))
    lakes = json.loads(fetch(LAKES, "ne_110m_lakes.json", least=10_000).decode("utf-8"))
    for lake in lakes.get("features", []):
        geom = lake.get("geometry") or {}
        rings = geom.get("coordinates") or []
        if geom.get("type") == "Polygon":
            rings = [rings]
        for poly in rings:
            for ring in poly[:1]:
                if len(ring) > 2:
                    water.append([(round(x, 4), round(y, 4)) for x, y in ring])

    places = sorted(markers.values(), key=lambda p: p["name"])
    with open(os.path.join(OUT, "places.json"), "w", encoding="utf-8") as f:
        json.dump({
            "source": {
                "places": "OpenBible.info Bible Geocoding (CC BY 4.0)",
                "land": "Natural Earth 1:110m (public domain)",
            },
            "count": len(places),
            "places": places,
        }, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "land.json"), "w", encoding="utf-8") as f:
        json.dump(land, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "water.json"), "w", encoding="utf-8") as f:
        json.dump(water, f, ensure_ascii=False, separators=(",", ":"))

    named = sum(1 for p in places if p.get("verses"))
    print("  {:,} places with a position, {:,} of them named in verses".format(
        len(places), named))
    print("  {:,} joined to the verse lists by name".format(joined))
    print("  {} water lines".format(len(water)))
    for name in ("places.json", "land.json", "water.json"):
        print("  {:<12} {:>7.2f} MB".format(
            name, os.path.getsize(os.path.join(OUT, name)) / 1e6))


if __name__ == "__main__":
    main()
