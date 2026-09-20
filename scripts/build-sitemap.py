#!/usr/bin/env python3
"""Write sitemap.xml from the pages the site actually ships.

    python3 scripts/build-sitemap.py

The front pages and every folder under apps/, so a new app is in the sitemap by
existing rather than by someone remembering to add it. robots.txt points at it.
This does not make anyone visit; it only stops the site being unindexed for no
reason.
"""
import datetime
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://studytools.cc/"


def main():
    apps = sorted(name for name in os.listdir(os.path.join(ROOT, "apps"))
                  if os.path.isdir(os.path.join(ROOT, "apps", name)))
    pages = ["", "index.html", "tools.html", "about.html"] + ["apps/%s/" % a for a in apps]
    today = datetime.date.today().isoformat()
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for page in pages:
        lines += ["  <url>", "    <loc>%s%s</loc>" % (BASE, page),
                  "    <lastmod>%s</lastmod>" % today, "  </url>"]
    lines.append("</urlset>")
    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("  sitemap.xml: {} pages ({} apps)".format(len(pages), len(apps)))


if __name__ == "__main__":
    main()
