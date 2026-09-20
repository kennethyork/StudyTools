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
| **Sunday Lectionary** (`apps/lectionary/`) | The Revised Common Lectionary, Years A, B and C: the readings for every Sunday and festival, each opening in Study a Passage or going to the lectern to be read aloud. |
| **Lectern** (`apps/lectern/`) | One passage in large type with nothing else on the screen, for reading aloud in a service. Arrow keys move by chapter, verse numbers can be hidden, and the text can be enlarged. |
| **Study a Passage** (`apps/study/`) | Type a reference and get everything the site holds on it in one place: the text in three translations, the cross-references drawn to those verses ranked by votes, the comparisons in the other traditions that touch the chapter, and the Greek word by word for the New Testament. Printable as a teaching handout. |
| **Parallel Passages** (`apps/parallels/`) | The Bible beside the Qur'an, the Jewish Tanakh and the Book of Mormon on the same figures and events (Adam, Noah, Abraham, Joseph, Moses, Jonah, Mary, Jesus, the Sermon on the Mount, the Ten Commandments, charity, faith). 99 comparisons, each one the Bible against a single other tradition (Tanakh, Qur'an or Book of Mormon), one passage against one passage, quoted from its own public-domain edition and modernized into the same present-day English. Every book of the Tanakh and every book of the Book of Mormon is covered. Only the compared passages are bundled — the full texts are not part of this site. |
| **Verse Comparative Matrix** (`apps/matrix/`) | Type a reference and see three modern, public-domain translations side by side — the World English Bible (Updated), the modernized King James Version, and the modernized Revised Version — each including the deuterocanonical books — and, for the Old Testament, the Jewish Publication Society's Tanakh. Whole chapters or single verses, with chapter shortcuts and copy/print. |
| **Cross-Reference Explorer** (`apps/xref/`) | Every passage openbible.info links to the verse you are reading, grouped by destination chapter and ranked by votes. Follow a link to jump to it. |
| **Bible Dictionary** (`apps/dictionary/`) | Search Easton's (1897), Smith's (1863), and Hastings' (1909) dictionaries together. Scripture citations link straight into the Verse Matrix. |
| **Topical Bible** (`apps/topical/`) | Nave's Topical Bible and Torrey's New Topical Textbook together: 5,941 subjects, searchable, with every reference linked to the verse. |
| **Greek Interlinear** (`apps/interlinear/`) | The Greek New Testament word by word: accented text, transliteration, morphology, Strong's number, and a literal English gloss, with a tap-to-highlight both views. |
| **Biblical Language Flashcards** (`apps/vocab/`) | The 500 most frequent Greek New Testament words and 500 most frequent Hebrew Bible words with glosses, transliteration, morphology, and frequency. Flashcard and browse modes with known-word tracking. |
| **Prayer Prompt & Journal Clock** (`apps/prayer/`) | A daily rotating prayer focus (Family, Community, Global Missions, Church, Nation, Sick & Suffering, Unbelievers), a focus timer with full-screen mode, and a private journal. |
| **Scripture Memory (SRS)** (`apps/memory/`) | Paste verses and review them with a simplified SM-2 spaced-repetition schedule. Can load the WEBU/KJVM/RVM/JPSM text for a reference automatically. |
| **Blog Idea Generator** (`apps/blog/`) | Pick a scope and a writing angle and get a passage, a working title, and an outline. Seven angles (devotional, Bible study, personal story, practical list, honest questions, two passages, church season), saveable and exportable, with one-click send to the sermon notebook. |
| **Family Devotional Randomizer** (`apps/devotional/`) | Spin a canvas topic wheel and get a public-domain passage, three discussion questions, and a short prayer. Copy the whole devotional to share. |
| **Reading Plan** (`apps/plan/`) | The whole Bible in a year, the New Testament in 90 days, or the Old Testament in half a year, worked out from the chapter counts in `data/bible/books.json` rather than stored as a table. Read the day's portion on the page or open it in the reader, tick days off, and see days read, chapters read, streak and how far behind you are. Today's portion also appears on the front page. |
| **Church Calendar Tracker** (`apps/calendar/`) | Liturgical year (Advent, Christmas, Epiphany, Lent, Easter, Whitsunday, the season after Trinity) with the Book of Common Prayer (1928) psalms and lessons for each day's morning and evening office, the Apostles'/Nicene/Athanasian creeds, the Heidelberg Catechism, and the Westminster Shorter Catechism. |

Every page has a light/dark theme toggle in the header. The choice follows the
system setting until the reader picks one, then it is remembered.

## Repository layout

```
index.html               Bible section: verse of the day, study tools, book grid
tools.html               hub page linking every study app
about.html               about page and translation attributions
index.css                styles for the Bible section
css/base.css             shared design system for the apps (light and dark themes)
js/theme.js              pre-paint theme chooser (no flash of wrong theme)
js/common.js             shared helpers (ref parsing, data loading, storage, toast, header)
js/liturgy.js            the Christian year: Easter, Advent, the 1928 cycle, the daily office
js/plan.js               reading plans, worked out from the book list
js/home.js               Bible-section home: verse of the day, tools grid, book grid
apps/<app>/              one self-contained app per folder
webu/                    the eBible.org World English Bible (Updated) chapter pages
                         for all 81 books, plus its fonts and lemma data
data/bible/              per-book WEBU, KJVM, RVM and JPSM JSON
data/compare/            the Qur'an / Tanakh / Book of Mormon passages quoted
                         in the Parallel Passages tool (only these passages)
data/vocab/              top-500 Greek and Hebrew vocabulary
data/blog/               blog idea kit (angles, fills, title patterns)
data/crossref/           openbible.info cross-references, grouped by chapter (30 MB)
data/dictionary/         Easton, Smith, and Hastings dictionary entries
data/topical/            Nave's and Torrey's topical entries, by initial
data/interlinear/        OpenGNT word-by-word Greek New Testament
data/catechism/          Heidelberg and Westminster Shorter
data/creeds/             Apostles', Nicene, Athanasian
data/devotional/         topic wheel content
data/liturgical/         BCP 1928 daily office and Sunday tables (public domain)
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
python3 scripts/build-ebible.py RV    # Revised Version (80 books) from eBible.org
python3 scripts/build-ebible.py JPS   # JPS Tanakh 1917 (39 books) from eBible.org
python3 scripts/modernize.py RV RVM   # rule-based modernization of any of the above
python3 scripts/modernize.py JPS JPSM
python3 scripts/build-compare.py      # freezes the compared passages (Qur'an, Tanakh, Book of Mormon)
python3 scripts/build-lectionary.py   # the BCP 1928 Sunday and daily office tables (public domain)
node scripts/check-liturgical.js      # re-checks the 1928 cycle, Easter and the feast days (needs node)
node scripts/check-refs.js            # re-checks reference parsing and the verse-to-office lookup
node scripts/check-plan.js            # re-checks the reading plans against the book list
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
| Revised Version, Modernized (RVM) | [eBible.org](https://ebible.org/eng-rv/) `eng-rv` USFM, modernized by this project | Public domain (the 1895 Revision is public domain; the modernization is this repository's own rule-based pass) |
| Qur'an, Arabic (uthmani) | [risan/quran-json](https://github.com/risan/quran-json) | The Arabic text, unmodified |
| Qur'an, Pickthall, Modernized (PKM) | [tanzil.net](https://tanzil.net/trans/en.pickthall) (M. M. Pickthall, 1930), modernized by this project | Public domain in the US since 1 January 2026; the modernization is this repository's own rule-based pass |
| JPS Tanakh, Modernized (JPSM) | [eBible.org](https://ebible.org/engjps/) `engjps` USFM (JPS 1917), modernized by this project | Public domain (the 1917 JPS translation is public domain; the modernization is this repository's own rule-based pass) |
| Topical entries | [topical-bible-search](https://github.com/j86schroeder/topical-bible-search) (Nave 1897, Torrey 1897) | MIT pipeline; source works public domain |
| Greek interlinear | [OpenGNT](https://github.com/eliranwong/OpenGNT) | CC BY-SA 4.0 |
| Cross-reference pairs | [openbible.info](https://www.openbible.info/labs/cross-references/) | CC BY 4.0 |
| Bible dictionaries | [NEUU bible-dictionary-dataset](https://github.com/neuu-org/bible-dictionary-dataset) (CCEL ThML) | CC BY 4.0; source texts public domain |
| Modernized King James Version (KJVM) | [Abrahamic Library](https://github.com/kennethyork/AbrahamicLibrary) (`kjv-bible`, "modernized in full") | Public domain text; MIT software |
| World English Bible, Updated (WEBU, 2000) | [eBible.org](https://ebible.org/engwebu/) `engwebu` USFM | Public domain (eBible.org / Michael Paul Johnson); “World English Bible” is a trademark of eBible.org |
| Greek vocabulary frequency | [eliranwong/OpenGNT](https://github.com/eliranwong/OpenGNT) | CC BY-SA 4.0 |
| Hebrew vocabulary frequency | [openscriptures/morphhb](https://github.com/openscriptures/morphhb) (Westminster Leningrad Codex) | CC BY 4.0 |
| Greek and Hebrew glosses/lexicon | [STEPBible-Data](https://github.com/STEPBible/STEPBible-Data) TBESG / TBESH | CC BY 4.0 |
| BCP 1928 Daily Office and Sunday tables | [vovchykbratyk/BCP_1928](https://github.com/vovchykbratyk/BCP_1928) | The 1928 Book of Common Prayer is public domain in the United States since 1 January 2024; the tables are transcribed from it |
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

`scripts/check-refs.js` and `scripts/check-plan.js` cover the other two pieces
of arithmetic in the site that a reader would notice getting wrong: the
references the Prayer Book prints ("Isa. 61:1-3,10-11" is Isaiah 61, verses 1 to
3, printed with an alternative), where each verse falls in those tables (so
tapping a verse in the reader can say which office reads it), and the reading
plans (every chapter once, in order, no day empty, and days that differ by at
most one chapter).

`scripts/check-liturgical.js` does the same job for the calendar: it walks every
year from 1900 to 2100 and checks that each Sunday is named as the Prayer Book
names it, that the names never run backwards through the year, and that every
date has both a morning and an evening office. Naming a Sunday comes before
looking its week up in the tables, because the 1928 cycle holds the Sundays a
year *may* have — six after the Epiphany and twenty-four after Trinity — and
counting weeks from Advent runs ahead of the names in a year that uses fewer.

## Notes

- No analytics, cookies, accounts, or network calls beyond loading the local
  JSON data files.
- Prayer journal entries, memory cards, reading-plan ticks, and vocabulary
  mastery are stored in browser `localStorage` under the `studytools.*` prefix.
  Reading-plan ticks are kept by date (`studytools.reading-plan.v1`), so moving
  a plan's start date moves which day each tick answers for, and a verse
  memorized from the reader's verse panel lands in the same deck `apps/memory/`
  reviews.
- Exporting to PDF uses the browser's print dialog, which keeps the project
  dependency-free.
