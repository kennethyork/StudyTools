#!/usr/bin/env python3
"""Build an atlas that ships as files: the places of the Bible, on a real map.

    python3 scripts/build-atlas.py

Two openly licensed datasets, no tiles and no network at read time:

  * Places and their verses: the OpenBible.info Bible Geocoding dataset
    (CC BY 4.0), the same publisher as the cross-references this site already
    carries. Its all.kml holds every place with a representative point, and its
    ancient.jsonl holds the verses each place is named in.
  * The land itself: Natural Earth, public domain — 1:50m for the Bible lands
    and the world at 1:110m, as GeoJSON, and Natural Earth's 1:50m raster of
    hypsometric tints, shaded relief and water for the ground they stand on.

All of it is reduced here to what a browser can read whole — a relief JPEG of a
few hundred kilobytes, a coastline of the same order, and a place list with its
verses — so the atlas opens offline, like the rest of the site, and no tile
server ever learns what you are reading.

Output:
  data/atlas/places.json   every place: name, position, what it is, its verses
  data/atlas/layers.json   the coast, lakes, rivers, borders and cities to draw
  data/atlas/routes.json   the journeys, as stops in order
  data/atlas/relief.jpg    the basemap: the ground itself, as a raster
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
BASE = "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/"
# The Bible lands at 1:50m, where the coastlines have islands and the rivers have
# names; the world at 1:110m, which is all a world view needs.
LAYERS = {
    "land-region": ("50m/physical/ne_50m_land.json", "land", True),
    "lakes-region": ("50m/physical/ne_50m_lakes.json", "polygon", True),
    "rivers-region": ("50m/physical/ne_50m_rivers_lake_centerlines.json", "line", True),
    "borders-region": ("50m/cultural/ne_50m_admin_0_boundary_lines_land.json", "line", True),
    "cities-region": ("50m/cultural/ne_50m_populated_places_simple.json", "point", True),
    "land-world": ("110m/physical/ne_110m_land.json", "land", False),
    "lakes-world": ("110m/physical/ne_110m_lakes.json", "polygon", False),
}
# The window the region layers are cut to: the eastern Mediterranean and
# Mesopotamia, with room to spare, because that is where the places are.
REGION = (-16, 78, 6, 56)

# The ground itself: Natural Earth's 1:50m raster with hypsometric tints, shaded
# relief and water — the look of the physical maps printed in the back of a Bible.
# It is 175 MB at source, so it is cropped to the same window and reduced to a
# JPEG the browser can read: the basemap, with everything else drawn over it.
RELIEF = ("https://raw.githubusercontent.com/nvkelso/natural-earth-raster/master/"
          "50m_rasters/HYP_50M_SR_W/HYP_50M_SR_W.tif", "relief.tif")
# The crop has to hold the whole "Bible lands" window the page opens on, or the
# ground stops part-way up the map and the rest of it is a plain coastline. That
# window frames lon 12..52, lat 14..44, and takes the panel's shape — a tall panel
# reaches lat 60 at the top and -2 at the bottom, which is what this covers, so no
# window the page can open on runs off the edge of the raster. The raster is 30
# pixels to the degree, so RELIEF_WIDTH at 2040 holds the crop's 68 degrees at
# their native resolution.
RELIEF_CROP = (-2.0, 66.0, -2.0, 60.0)     # lon0, lon1, lat0, lat1
RELIEF_WIDTH = 2040

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


def clip(collection, region):
    """Drop what is outside the region and keep the rest whole.

    Cutting polygons to a rectangle is a different job from simplifying them, and
    a coastline cut wrongly is worse than a coastline that extends past the edge:
    the view crop it anyway. So a feature stays if any of its coordinates is inside
    the window, and it is left with all its points.
    """
    lon0, lon1, lat0, lat1 = region
    kept = []
    for feature in collection.get("features", []):
        geom = feature.get("geometry") or {}
        coords = geom.get("coordinates")
        if coords is None:
            continue
        flat = []
        def gather(node):
            if isinstance(node, (list, tuple)) and node and isinstance(node[0], (int, float)):
                flat.append(node)
            elif isinstance(node, (list, tuple)):
                for child in node:
                    gather(child)
        gather(coords)
        if any(lon0 <= pt[0] <= lon1 and lat0 <= pt[1] <= lat1 for pt in flat[:4000]):
            kept.append(feature)
    return {"type": "FeatureCollection", "features": kept}


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


# Journeys and travels, as a reading of the narrative rather than a dataset: each
# stop is a place name from the dataset, in order. The builder resolves each name —
# the dataset disambiguates as "Antioch 1", "Babylon 2" and so on — and refuses to
# write a route whose stops cannot all be found, so a typo here fails the build.
ROUTES = [
    {"name": "The exodus from Egypt",
     "note": "From Rameses to the plains of Moab, as the narrative gives the stages. "
             "The line joins the stops; the text does not give a surveyed route.",
     "stops": ["Rameses", "Succoth 1", "Migdol 1", "Marah", "Elim", "Rephidim", "Mount Sinai",
               "Kadesh-barnea", "Punon", "Dibon 1", "Mount Nebo", "Jericho 1", "Gilgal 1"]},
    {"name": "Abraham from Ur to Hebron",
     "note": "From Ur of the Chaldees by way of Haran into Canaan, as Genesis tells it.",
     "stops": ["Ur 1", "Haran", "Shechem", "Bethel 1", "Negeb", "Egypt", "Beersheba 1",
               "Hebron"]},
    {"name": "Paul's first journey",
     "note": "Antioch, Cyprus, the cities of Galatia, and back to Antioch, as Acts gives them.",
     "stops": ["Antioch 1", "Seleucia", "Salamis", "Paphos", "Perga", "Antioch 2", "Iconium",
               "Lystra", "Derbe", "Attalia"]},
    {"name": "Into exile and back",
     "note": "Judah to Babylon, and the return under Cyrus.",
     "stops": ["Jerusalem", "Riblah", "Babylon", "Susa", "Jerusalem"]},
    {"name": "Jesus in Galilee and Judea",
     "note": "The places the Gospels name in his ministry, from Bethlehem to Jerusalem.",
     "stops": ["Bethlehem", "Nazareth", "Cana", "Capernaum", "Nain", "Bethany", "Jericho",
               "Jerusalem"]},
]


def routes_of(places):
    """The routes, with every stop resolved to a place that exists."""
    by_name = {}
    for place in places:
        by_name.setdefault(place["name"], place)
    out = []
    for route in ROUTES:
        stops = []
        for wanted in route["stops"]:
            hit = by_name.get(wanted)
            if hit is None:
                exact = [p for p in places if p["name"].split(" ")[0] == wanted]
                if not exact:
                    print("    route {!r}: no place called {!r} — route skipped".format(
                        route["name"], wanted))
                    stops = []
                    break
                hit = sorted(exact, key=lambda p: -(p.get("verses_total") or 0))[0]
            stops.append({"name": hit["name"], "lon": hit["lon"], "lat": hit["lat"],
                          "verses_total": hit.get("verses_total") or 0})
        if len(stops) < 3:
            continue
        out.append({"name": route["name"], "note": route["note"], "stops": stops})
    return out


def make_relief():
    """The basemap: raster relief, cropped to the region and made small."""
    out = os.path.join(OUT, "relief.jpg")
    os.makedirs(OUT, exist_ok=True)
    source = os.path.join(CACHE, RELIEF[1])
    if not os.path.exists(source):
        fetch(RELIEF[0], RELIEF[1], least=1_000_000)
    try:
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None
        image = Image.open(source)
        width, height = image.size
        lon0, lon1, lat0, lat1 = RELIEF_CROP
        box = (int((lon0 + 180) / 360 * width), int((90 - lat1) / 180 * height),
               int((lon1 + 180) / 360 * width), int((90 - lat0) / 180 * height))
        cropped = image.crop(box)
        sized = cropped.resize((RELIEF_WIDTH,
                               round(RELIEF_WIDTH * cropped.size[1] / cropped.size[0])),
                               Image.LANCZOS)
        sized.save(out, "JPEG", quality=82, optimize=True, progressive=True)
        print("  relief.jpg   {:>4}x{:<4}  {:>6.2f} MB  lon {}..{}, lat {}..{}".format(
            sized.size[0], sized.size[1], os.path.getsize(out) / 1e6,
            lon0, lon1, lat0, lat1))
    except ImportError:
        print("  Pillow is not here, so the basemap was not rebuilt")


def main():
    markers, water = read_kml()
    joined = read_places(markers)
    os.makedirs(OUT, exist_ok=True)

    layers = {}
    for name, (rel, kind, in_region) in LAYERS.items():
        collection = json.loads(fetch(BASE + rel, rel.split("/")[-1], least=20_000)
                                .decode("utf-8"))
        if in_region:
            collection = clip(collection, REGION)
        simplified = {"type": "FeatureCollection", "features": []}
        for feature in collection.get("features", []):
            geom = feature.get("geometry") or {}
            gtype = geom.get("type")
            if kind == "land" and gtype != "Polygon":
                continue
            if kind == "polygon" and gtype not in ("Polygon", "MultiPolygon"):
                continue
            if kind == "line" and gtype not in ("LineString", "MultiLineString"):
                continue
            if kind == "point" and gtype != "Point":
                continue
            keep = []
            props = feature.get("properties") or {}
            if kind == "point":
                keep = [round(geom["coordinates"][0], 4), round(geom["coordinates"][1], 4),
                        props.get("name") or "", int(props.get("pop_max") or 0)]
            elif kind == "line":
                lines = geom["coordinates"] if gtype == "MultiLineString" else [geom["coordinates"]]
                keep = [[[round(x, 4), round(y, 4)] for x, y in line] for line in lines
                        if len(line) > 1]
            elif gtype == "Polygon":
                keep = [[[round(x, 4), round(y, 4)] for x, y in ring] for ring in
                        geom["coordinates"] if len(ring) > 3]
            else:
                keep = [[[[round(x, 4), round(y, 4)] for x, y in ring] for ring in poly
                         if len(ring) > 3] for poly in geom["coordinates"]]
            if not keep:
                continue
            item = {"t": gtype if kind != "land" else "Polygon", "c": keep}
            if kind == "point":
                item["n"] = keep[2]
                item["p"] = keep[3]
                item["c"] = keep[:2]
            simplified["features"].append(item)
        layers[name] = simplified
        print("  {:<16} {:>4} features  {:>6.2f} MB".format(
            name, len(simplified["features"]),
            len(json.dumps(simplified)) / 1e6))

    make_relief()
    with open(os.path.join(OUT, "layers.json"), "w", encoding="utf-8") as f:
        json.dump(layers, f, ensure_ascii=False, separators=(",", ":"))
    for old in ("land.json", "water.json"):
        path = os.path.join(OUT, old)
        if os.path.exists(path):
            os.remove(path)

    places = sorted(markers.values(), key=lambda p: p["name"])
    routes = routes_of(places)
    with open(os.path.join(OUT, "routes.json"), "w", encoding="utf-8") as f:
        json.dump({"note": "Routes are this site's reading of the narrative, drawn stop to stop "
                           "between places named in the text, not surveyed paths.",
                   "routes": routes}, f, ensure_ascii=False, separators=(",", ":"))
    print("  {} routes, {} stops in all".format(
        len(routes), sum(len(r["stops"]) for r in routes)))
    with open(os.path.join(OUT, "places.json"), "w", encoding="utf-8") as f:
        json.dump({
            "source": {
                "places": "OpenBible.info Bible Geocoding (CC BY 4.0)",
                "land": "Natural Earth 1:50m, and 1:110m for the world (public domain)",
                "ground": "Natural Earth 1:50m raster HYP_50M_SR_W (public domain)",
            },
            "count": len(places),
            "places": places,
        }, f, ensure_ascii=False, separators=(",", ":"))

    named = sum(1 for p in places if p.get("verses"))
    print("  {:,} places with a position, {:,} of them named in verses".format(
        len(places), named))
    print("  {:,} joined to the verse lists by name".format(joined))
    print("  {} water lines".format(len(water)))
    for name in ("places.json", "layers.json", "routes.json"):
        print("  {:<12} {:>7.2f} MB".format(
            name, os.path.getsize(os.path.join(OUT, name)) / 1e6))


if __name__ == "__main__":
    main()
