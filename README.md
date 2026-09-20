# StudyTools

A collection of small, dependency-free Bible study apps that run entirely in the
browser. Everything is static HTML, CSS, and JavaScript, so the whole thing can
be served from GitHub Pages (or any static host) with no build step and no
backend. Notes, journals, and study progress are saved in `localStorage` and
never leave the device.

## Apps

| App | What it does |
| --- | --- |
| **Read the Bible** (`apps/bible/`) | The whole Bible in the site's own reader: pick a book and chapter and switch translations as you read. Books are grouped by canon (Law, History, Wisdom, Prophets, Gospels, Letters, Apocrypha), and the translation switcher offers the **full Bible** (the texts carrying the Apocrypha) as its own option alongside the 66-book canon. Chapter navigation runs across book boundaries. |
| **Sermon Notebook & Outline Builder** (`apps/sermon/`) | Markdown notebook for Sunday notes with SOAP, inductive, expository, and blank templates, live preview, one-click PDF (print) export, copy markdown/outline, and download `.md`. |
| **Verse Comparative Matrix** (`apps/matrix/`) | Type a reference and see three modern, public-domain translations side by side — the World English Bible (Updated), the modernized King James Version, and the Berean Standard Bible — including the deuterocanonical books. The picker groups them by canon, so the full Bible is a distinct option from the 66-book canon. Whole chapters or single verses, with chapter shortcuts and copy/print. |
| **Cross-Reference Explorer** (`apps/xref/`) | Every passage openbible.info links to the verse you are reading, grouped by destination chapter and ranked by votes. Follow a link to jump to it. |
| **Bible Dictionary** (`apps/dictionary/`) | Search Easton's (1897), Smith's (1863), and Hastings' (1909) dictionaries together. Scripture citations link straight into the Verse Matrix. |
| **Topical Bible** (`apps/topical/`) | Nave's Topical Bible and Torrey's New Topical Textbook together: 5,941 subjects, searchable, with every reference linked to the verse. |
| **Greek Interlinear** (`apps/interlinear/`) | The Greek New Testament word by word: accented text, transliteration, morphology, Strong's number, and a literal English gloss, with a tap-to-highlight both views. |
| **Biblical Language Flashcards** (`apps/vocab/`) | The 500 most frequent Greek New Testament words and 500 most frequent Hebrew Bible words with glosses, transliteration, morphology, and frequency. Flashcard and browse modes with known-word tracking. |
| **Prayer Prompt & Journal Clock** (`apps/prayer/`) | A daily rotating prayer focus (Family, Community, Global Missions, Church, Nation, Sick & Suffering, Unbelievers), a focus timer with full-screen mode, and a private journal. |
| **Scripture Memory (SRS)** (`apps/memory/`) | Paste verses and review them with a simplified SM-2 spaced-repetition schedule. Can load the WEBU/KJVM/BSB text for a reference automatically. |
| **Blog Idea Generator** (`apps/blog/`) | Pick a scope and a writing angle and get a passage, a working title, and an outline. Seven angles (devotional, Bible study, personal story, practical list, honest questions, two passages, church season), saveable and exportable, with one-click send to the sermon notebook. |
| **Family Devotional Randomizer** (`apps/devotional/`) | Spin a canvas topic wheel and get a public-domain passage, three discussion questions, and a short prayer. Copy the whole devotional to share. |
| **Church Calendar Tracker** (`apps/calendar/`) | Liturgical year (Advent, Christmas, Epiphany, Lent, Easter, Pentecost, Ordinary Time) with the BCP daily office psalms and lessons, the Apostles'/Nicene/Athanasian creeds, the Heidelberg Catechism, and the Westminster Shorter Catechism. |

Every page has a light/dark theme toggle in the header. The choice follows the
system setting until the reader picks one, then it is remembered.

## Repository layout

```
index.html               hub page linking every app
css/base.css             shared design system (light and dark themes)
js/theme.js              pre-paint theme chooser (no flash of wrong theme)
js/common.js             shared helpers (ref parsing, data loading, storage, toast, header)
apps/<app>/              one self-contained app per folder
data/bible/              per-book WEBU, KJVM, and BSB JSON
data/vocab/              top-500 Greek and Hebrew vocabulary
data/blog/               blog idea kit (angles, fills, title patterns)
data/crossref/           openbible.info cross-references, grouped by chapter (30 MB)
data/dictionary/         Easton, Smith, and Hastings dictionary entries
data/topical/            Nave's and Torrey's topical entries, by initial
data/interlinear/        OpenGNT word-by-word Greek New Testament
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
python3 scripts/build-webu.py         # World English Bible, Updated (81 books, with Apocrypha)
python3 scripts/build-kjvm.py         # modernized KJV (81 books, with Apocrypha)
python3 scripts/build-bsb.py          # Berean Standard Bible (66 books)
python3 scripts/build-vocab.py        # top-500 Greek and Hebrew vocabulary
python3 scripts/build-crossref.py     # openbible.info cross-references (30 MB)
python3 scripts/build-dictionary.py   # Easton / Smith / Hastings dictionaries
python3 scripts/build-topical.py      # Nave's and Torrey's topical Bibles
python3 scripts/build-interlinear.py  # OpenGNT Greek interlinear
python3 scripts/build-content.py      # creeds, catechisms
python3 scripts/verify-devotional.py  # re-checks every devotional verse against the KJV data
```

## Data sources and licences

All Scripture texts bundled here are in the **public domain**.

| Data | Source | Licence |
| --- | --- | --- |
| Berean Standard Bible (BSB, 2023) | [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | Public domain — dedicated to the public domain (CC0) on 30 April 2023 |
| Topical entries | [topical-bible-search](https://github.com/j86schroeder/topical-bible-search) (Nave 1897, Torrey 1897) | MIT pipeline; source works public domain |
| Greek interlinear | [OpenGNT](https://github.com/eliranwong/OpenGNT) | CC BY-SA 4.0 |
| Cross-reference pairs | [openbible.info](https://www.openbible.info/labs/cross-references/) | CC BY 4.0 |
| Bible dictionaries | [NEUU bible-dictionary-dataset](https://github.com/neuu-org/bible-dictionary-dataset) (CCEL ThML) | CC BY 4.0; source texts public domain |
| Modernized King James Version (KJVM) | [Abrahamic Library](https://github.com/kennethyork/AbrahamicLibrary) (`kjv-bible`, "modernized in full") | Public domain text; MIT software |
| World English Bible, Updated (WEBU, 2000) | [eBible.org](https://ebible.org/engwebu/) `engwebu` USFM | Public domain (eBible.org / Michael Paul Johnson); “World English Bible” is a trademark of eBible.org |
| Greek vocabulary frequency | [eliranwong/OpenGNT](https://github.com/eliranwong/OpenGNT) | CC BY-SA 4.0 |
| Hebrew vocabulary frequency | [openscriptures/morphhb](https://github.com/openscriptures/morphhb) (Westminster Leningrad Codex) | CC BY 4.0 |
| Greek and Hebrew glosses/lexicon | [STEPBible-Data](https://github.com/STEPBible/STEPBible-Data) TBESG / TBESH | CC BY 4.0 |
| BCP 1979 Daily Office Lectionary (Year One, Year Two, Holy Days) | [reubenlillie/daily-office](https://github.com/reubenlillie/daily-office) | MIT |
| Heidelberg Catechism (1975 CRC translation) | [ldweeks/Heidelberg-Catechism](https://github.com/ldweeks/Heidelberg-Catechism) | Base text public domain |
| Westminster Shorter Catechism | Wikisource | Public domain |
| Apostles', Nicene, Athanasian creeds | Book of Common Prayer (1662) | Public domain |

`KJVM` is this repository's own label for the modernized King James edition. It
is not the "Modern King James Version", which is a different, copyrighted
translation. The modernized text is drawn from the Abrahamic Library's
`kjv-bible` work, which uses the King James Version as its public-domain source
and states the edition is "modernized in full".

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
