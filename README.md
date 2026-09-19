# StudyTools

A collection of small, dependency-free Bible study apps that run entirely in the
browser. Everything is static HTML, CSS, and JavaScript, so the whole thing can
be served from GitHub Pages (or any static host) with no build step and no
backend. Notes, journals, and study progress are saved in `localStorage` and
never leave the device.

## Apps

| App | What it does |
| --- | --- |
| **Sermon Notebook & Outline Builder** (`apps/sermon/`) | Markdown notebook for Sunday notes with SOAP, inductive, expository, and blank templates, live preview, one-click PDF (print) export, copy markdown/outline, and download `.md`. |
| **Verse Comparative Matrix** (`apps/matrix/`) | Type a reference and see KJV, ASV, WEB, and YLT side by side. Whole chapters or single verses, with chapter shortcuts and copy/print. |
| **Biblical Language Flashcards** (`apps/vocab/`) | The 500 most frequent Greek New Testament words and 500 most frequent Hebrew Bible words with glosses, transliteration, morphology, and frequency. Flashcard and browse modes with known-word tracking. |
| **Prayer Prompt & Journal Clock** (`apps/prayer/`) | A daily rotating prayer focus (Family, Community, Global Missions, Church, Nation, Sick & Suffering, Unbelievers), a focus timer with full-screen mode, and a private journal. |
| **Scripture Memory (SRS)** (`apps/memory/`) | Paste verses and review them with a simplified SM-2 spaced-repetition schedule. Can load the KJV/ASV/WEB/YLT text for a reference automatically. |
| **Family Devotional Randomizer** (`apps/devotional/`) | Spin a canvas topic wheel and get a public-domain passage, three discussion questions, and a short prayer. Copy the whole devotional to share. |
| **Church Calendar Tracker** (`apps/calendar/`) | Liturgical year (Advent, Christmas, Epiphany, Lent, Easter, Pentecost, Ordinary Time) with the BCP daily office psalms and lessons, the Apostles'/Nicene/Athanasian creeds, the Heidelberg Catechism, and the Westminster Shorter Catechism. |

## Repository layout

```
index.html               hub page linking every app
css/base.css             shared design system
js/common.js             shared helpers (ref parsing, data loading, storage, toast)
apps/<app>/              one self-contained app per folder
data/bible/              per-book KJV, ASV, WEB, YLT JSON (66 books x 4)
data/vocab/              top-500 Greek and Hebrew vocabulary
data/catechism/          Heidelberg and Westminster Shorter
data/creeds/             Apostles', Nicene, Athanasian
data/devotional/         topic wheel content
data/liturgical/         BCP 1979 daily office (Year One, Year Two, holy days)
scripts/                 data build scripts (Python 3, no third-party deps)
```

## Running locally

Fetching JSON with `fetch()` needs an HTTP origin, so open the folder through a
local server rather than double-clicking the HTML files:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Publishing to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**, select the branch
   and the `/ (root)` folder.
3. The included `.nojekyll` file tells Pages to serve the files as-is.

All paths are relative, so the site works from a project subpath
(`https://user.github.io/repo/`) without changes.

## Rebuilding the data

The `scripts/` folder contains the pipeline that produced everything under
`data/`. It only needs Python 3 and network access; downloads are cached in
`scripts/.cache/` (gitignored).

```sh
python3 scripts/build-bible.py       # KJV / ASV / YLT / Webster per-book JSON
python3 scripts/build-web.py         # World English Bible per-book JSON
python3 scripts/build-vocab.py       # top-500 Greek and Hebrew vocabulary
python3 scripts/build-content.py     # creeds, catechisms
python3 scripts/verify-devotional.py # re-checks every devotional verse against the KJV data
```

## Data sources and licences

All Scripture texts bundled here are in the **public domain**.

| Data | Source | Licence |
| --- | --- | --- |
| King James Version (1769), American Standard Version (1901), Young's Literal Translation (1862) | [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | Public domain texts; repository under MIT |
| World English Bible | [TehShrike/world-english-bible](https://github.com/TehShrike/world-english-bible) | Public domain (eBible.org / Michael Paul Johnson) |
| Greek vocabulary frequency | [eliranwong/OpenGNT](https://github.com/eliranwong/OpenGNT) | CC BY-SA 4.0 |
| Hebrew vocabulary frequency | [openscriptures/morphhb](https://github.com/openscriptures/morphhb) (Westminster Leningrad Codex) | CC BY 4.0 |
| Greek and Hebrew glosses/lexicon | [STEPBible-Data](https://github.com/STEPBible/STEPBible-Data) TBESG / TBESH | CC BY 4.0 |
| BCP 1979 Daily Office Lectionary (Year One, Year Two, Holy Days) | [reubenlillie/daily-office](https://github.com/reubenlillie/daily-office) | MIT |
| Heidelberg Catechism (1975 CRC translation) | [ldweeks/Heidelberg-Catechism](https://github.com/ldweeks/Heidelberg-Catechism) | Base text public domain |
| Westminster Shorter Catechism | Wikisource | Public domain |
| Apostles', Nicene, Athanasian creeds | Book of Common Prayer (1662) | Public domain |

The verse text in `data/devotional/topics.json` is verified by
`scripts/verify-devotional.py` against the bundled KJV data so the app cannot
display a misquoted verse.

## Notes

- No analytics, cookies, accounts, or network calls beyond loading the local
  JSON data files.
- Prayer journal entries, memory cards, reading progress, and vocabulary
  mastery are stored in browser `localStorage` under the `studytools.*` prefix.
- Exporting to PDF uses the browser's print dialog, which keeps the project
  dependency-free.
