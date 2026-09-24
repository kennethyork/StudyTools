/* Shared helpers for StudyTools apps. No build step, no dependencies. */
(function () {
  "use strict";

  var APPS = [
    { id: "bible", name: "Read the Bible", href: "apps/bible/" },
    { id: "parallels", name: "Parallel Passages", href: "apps/parallels/" },
    { id: "study", name: "Study a Passage", href: "apps/study/" },
    { id: "ask", name: "Ask the Site", href: "apps/ask/" },
    { id: "commentary", name: "Commentary", href: "apps/commentary/" },
    { id: "atlas", name: "Atlas", href: "apps/atlas/" },
    { id: "lectionary", name: "Sunday Lectionary", href: "apps/lectionary/" },
    { id: "lectern", name: "Lectern", href: "apps/lectern/" },
    { id: "search", name: "Search the Bible", href: "apps/search/" },
    { id: "notes", name: "Verse Notes", href: "apps/notes/" },
    { id: "sermon", name: "Sermon Notebook", href: "apps/sermon/" },
    { id: "matrix", name: "Verse Matrix", href: "apps/matrix/" },
    { id: "xref", name: "Cross-References", href: "apps/xref/" },
    { id: "dictionary", name: "Dictionary", href: "apps/dictionary/" },
    { id: "vocab", name: "Greek & Hebrew Cards", href: "apps/vocab/" },
    { id: "interlinear", name: "Interlinear", href: "apps/interlinear/" },
    { id: "topical", name: "Topical Bible", href: "apps/topical/" },
    { id: "prayer", name: "Prayer Clock", href: "apps/prayer/" },
    { id: "memory", name: "Memory Verses", href: "apps/memory/" },
    { id: "blog", name: "Blog Ideas", href: "apps/blog/" },
    { id: "devotional", name: "Family Devotional", href: "apps/devotional/" },
    { id: "calendar", name: "Church Calendar", href: "apps/calendar/" },
    { id: "plan", name: "Reading Plan", href: "apps/plan/" },
    { id: "sync", name: "Your Data", href: "apps/sync/" }
];

  function siteRoot() {
    // Every app page includes a <body data-root="../.."> style marker.
    var root = document.body.getAttribute("data-root");
    return root === null ? "./" : root;
  }

  var BOOKS = null;
  var TRANSLATIONS = ["WEBU", "KJVM", "RVM"];

  var BOOK_ALIASES = {
    genesis: "genesis", gen: "genesis",
    exodus: "exodus", exod: "exodus", ex: "exodus",
    leviticus: "leviticus", lev: "leviticus",
    numbers: "numbers", num: "numbers",
    deuteronomy: "deuteronomy", deut: "deuteronomy",
    joshua: "joshua", josh: "joshua",
    judges: "judges", judg: "judges",
    ruth: "ruth",
    "1samuel": "i-samuel", "1sam": "i-samuel", "isamuel": "i-samuel", "i samuel": "i-samuel",
    "2samuel": "ii-samuel", "2sam": "ii-samuel", "iisamuel": "ii-samuel", "ii samuel": "ii-samuel",
    "1kings": "i-kings", "1kgs": "i-kings", "ikings": "i-kings", "i kings": "i-kings",
    "2kings": "ii-kings", "2kgs": "ii-kings", "iikings": "ii-kings", "ii kings": "ii-kings",
    "1chronicles": "i-chronicles", "1chr": "i-chronicles", "ichronicles": "i-chronicles", "i chronicles": "i-chronicles",
    "2chronicles": "ii-chronicles", "2chr": "ii-chronicles", "iichronicles": "ii-chronicles", "ii chronicles": "ii-chronicles",
    ezra: "ezra", nehemiah: "nehemiah", neh: "nehemiah", esther: "esther", esth: "esther",
    job: "job", psalm: "psalms", psalms: "psalms", ps: "psalms", psalter: "psalms",
    proverbs: "proverbs", prov: "proverbs", pr: "proverbs",
    ecclesiastes: "ecclesiastes", eccl: "ecclesiastes", ecc: "ecclesiastes",
    songofsolomon: "song-of-solomon", song: "song-of-solomon", sos: "song-of-solomon", canticles: "song-of-solomon",
    isaiah: "isaiah", isa: "isaiah", jeremiah: "jeremiah", jer: "jeremiah",
    lamentations: "lamentations", lam: "lamentations",
    ezekiel: "ezekiel", ezek: "ezekiel", daniel: "daniel", dan: "daniel",
    hosea: "hosea", hos: "hosea", joel: "joel", amos: "amos", obadiah: "obadiah", obad: "obadiah",
    jonah: "jonah", micah: "micah", mic: "micah", nahum: "nahum", nah: "nahum",
    habakkuk: "habakkuk", hab: "habakkuk", zephaniah: "zephaniah", zeph: "zephaniah",
    haggai: "haggai", hag: "haggai", zechariah: "zechariah", zech: "zechariah", malachi: "malachi", mal: "malachi",
    matthew: "matthew", matt: "matthew", mat: "matthew", mt: "matthew",
    mark: "mark", mk: "mark", mrk: "mark", luke: "luke", lk: "luke", luk: "luke",
    john: "john", jn: "john", jhn: "john",
    acts: "acts", act: "acts",
    romans: "romans", rom: "romans",
    "1corinthians": "i-corinthians", "1cor": "i-corinthians", "icorinthians": "i-corinthians", "i corinthians": "i-corinthians",
    "2corinthians": "ii-corinthians", "2cor": "ii-corinthians", "iicorinthians": "ii-corinthians", "ii corinthians": "ii-corinthians",
    galatians: "galatians", gal: "galatians",
    ephesians: "ephesians", eph: "ephesians",
    philippians: "philippians", phil: "philippians", php: "philippians",
    colossians: "colossians", col: "colossians",
    "1thessalonians": "i-thessalonians", "1thess": "i-thessalonians", "1th": "i-thessalonians", "ithessalonians": "i-thessalonians", "i thessalonians": "i-thessalonians",
    "2thessalonians": "ii-thessalonians", "2thess": "ii-thessalonians", "2th": "ii-thessalonians", "iithessalonians": "ii-thessalonians", "ii thessalonians": "ii-thessalonians",
    "1timothy": "i-timothy", "1tim": "i-timothy", "1ti": "i-timothy", "itimothy": "i-timothy", "i timothy": "i-timothy",
    "2timothy": "ii-timothy", "2tim": "ii-timothy", "2ti": "ii-timothy", "iitimothy": "ii-timothy", "ii timothy": "ii-timothy",
    titus: "titus", tit: "titus", philemon: "philemon", phlm: "philemon", phm: "philemon",
    hebrews: "hebrews", heb: "hebrews",
    james: "james", jas: "james", jm: "james",
    "1peter": "i-peter", "1pet": "i-peter", "1pe": "i-peter", "ipeter": "i-peter", "i peter": "i-peter",
    "2peter": "ii-peter", "2pet": "ii-peter", "2pe": "ii-peter", "iipeter": "ii-peter", "ii peter": "ii-peter",
    "1john": "i-john", "1jn": "i-john", "ijohn": "i-john", "i john": "i-john",
    "2john": "ii-john", "2jn": "ii-john", "iijohn": "ii-john", "ii john": "ii-john",
    "3john": "iii-john", "3jn": "iii-john", "iiijohn": "iii-john", "iii john": "iii-john",
    jude: "jude", revelation: "revelation-of-john", rev: "revelation-of-john",
    revelations: "revelation-of-john", apocalypse: "revelation-of-john",
    // Deuterocanon / Apocrypha
    "1esdras": "i-esdras", "1esd": "i-esdras", "iesdras": "i-esdras", "i esdras": "i-esdras",
    "2esdras": "ii-esdras", "2esd": "ii-esdras", "iiesdras": "ii-esdras", "ii esdras": "ii-esdras",
    tobit: "tobit", tob: "tobit", tobias: "tobit",
    judith: "judith", jdt: "judith",
    "additionstoesther": "additions-to-esther", "additionstoesther": "additions-to-esther",
    "restofesther": "additions-to-esther", "addesther": "additions-to-esther", "adesther": "additions-to-esther",
    wisdom: "wisdom", wisd: "wisdom", "wisdomofsolomon": "wisdom", wis: "wisdom",
    sirach: "sirach", sir: "sirach", ecclesiasticus: "sirach", ecclus: "sirach",
    baruch: "baruch", bar: "baruch",
    "epistleofjeremiah": "epistle-of-jeremiah", "letterofjeremiah": "epistle-of-jeremiah", letjer: "epistle-of-jeremiah",
    "prayerofazariah": "prayer-of-azariah",
    "songofthethreeholychildren": "prayer-of-azariah", "azariah": "prayer-of-azariah",
    susanna: "susanna", sus: "susanna",
    "belandthedragon": "bel-and-the-dragon", bel: "bel-and-the-dragon",
    "prayerofmanasses": "prayer-of-manasses", "prayerofmanasseh": "prayer-of-manasses",
    manasses: "prayer-of-manasses", manasseh: "prayer-of-manasses",
    "1maccabees": "i-maccabees", "1macc": "i-maccabees", "imaccabees": "i-maccabees", "i maccabees": "i-maccabees",
    "2maccabees": "ii-maccabees", "2macc": "ii-maccabees", "iimaccabees": "ii-maccabees", "ii maccabees": "ii-maccabees",
    maccabees: "i-maccabees", macc: "i-maccabees",
    "additionalpsalm": "additional-psalm",
    "psalm151": "psalm-151", ps151: "psalm-151", psalmcli: "psalm-151",
    "3maccabees": "iii-maccabees", "3macc": "iii-maccabees",
    "iiimaccabees": "iii-maccabees", "iii maccabees": "iii-maccabees",
    "4maccabees": "iv-maccabees", "4macc": "iv-maccabees",
    "ivmaccabees": "iv-maccabees", "iv maccabees": "iv-maccabees",
    // names that begin with "The" reach the table with it still attached, because
    // normalizing removes punctuation and case but not that word
    "therestofesther": "additions-to-esther",
    "theepistleofjeremiah": "epistle-of-jeremiah",
    "thesongofthethreeholychildren": "prayer-of-azariah",
    "esthergreek": "esther-greek", greekesther: "esther-greek",
    "danielgreek": "daniel-greek", greekdaniel: "daniel-greek",
    "songofthethree": "prayer-of-azariah",
    laodiceans: "laodiceans", "epistleoflaodiceans": "laodiceans",
    // Compact abbreviations used by Nave's and Torrey's topical Bibles
    ge: "genesis", ex: "exodus", le: "leviticus", nu: "numbers", num: "numbers",
    de: "deuteronomy", jos: "joshua", jdj: "judges", ru: "ruth",
    "1sa": "i-samuel", "2sa": "ii-samuel", "1ki": "i-kings", "2ki": "ii-kings",
    "1ch": "i-chronicles", "2ch": "ii-chronicles", ezr: "ezra", ne: "nehemiah", neh: "nehemiah",
    es: "esther", ps: "psalms", pr: "proverbs", ec: "ecclesiastes",
    so: "song-of-solomon", song: "song-of-solomon", isa: "isaiah", jer: "jeremiah",
    la: "lamentations", eze: "ezekiel", da: "daniel", ho: "hosea", hos: "hosea",
    joe: "joel", am: "amos", ob: "obadiah", jon: "jonah", mic: "micah", na: "nahum",
    hab: "habakkuk", zep: "zephaniah", hag: "haggai", zec: "zechariah", mal: "malachi",
    mt: "matthew", mr: "mark", lu: "luke", joh: "john", jn: "john", ac: "acts",
    ro: "romans", "1co": "i-corinthians", "2co": "ii-corinthians", ga: "galatians",
    eph: "ephesians", php: "philippians", col: "colossians",
    "1th": "i-thessalonians", "2th": "ii-thessalonians", "1ti": "i-timothy", "2ti": "ii-timothy",
    tit: "titus", phm: "philemon", heb: "hebrews", jas: "james",
    "1pe": "i-peter", "2pe": "ii-peter", "1jo": "i-john", "2jo": "ii-john", "3jo": "iii-john",
    jud: "judges", jdj: "judges", jude: "jude", re: "revelation-of-john"
  };

  function normalizeBook(name) {
    var key = String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    key = key.replace(/ /g, "");
    if (BOOK_ALIASES[key]) return BOOK_ALIASES[key];
    var spaced = key.replace(/^([123])(?=[a-z])/, "$1 ");
    return BOOK_ALIASES[spaced] || null;
  }

  /* The numeral in front of a book's name runs to 4, because 4 Maccabees is a
     book this reader ships: with [1-3] here, "4 Maccabees 1:1" could never be
     parsed at all. IV as well as fourth, for readers who write it that way. */
  var REF_RE = /^\s*((?:[1-4]|IV|I{1,3})?\s*[A-Za-z][A-Za-z. ]*?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/;

  function parseRef(text) {
    var m = String(text || "").trim().match(REF_RE);
    if (!m) return null;
    var book = normalizeBook(m[1]);
    if (!book) return null;
    var chapter = parseInt(m[2], 10);
    /* "Psalm 151" is the additional psalm preserved in the Septuagint, and a book
       in its own right here. It used to be sent to additional-psalm, which is a
       placeholder the Douay-Rheims carries with no text in it — so a reader asking
       for Psalm 151 was taken to an empty page while the psalm itself, in the
       World English Bible, went unread. A book whose name ends in a number is
       matched by name first; the fallback stays for a text that has no psalm 151. */
    var together = normalizeBook(m[1] + " " + m[2]);
    if (together && together !== book) {
      return {
        book: together,
        chapter: 1,
        verseStart: m[3] ? parseInt(m[3], 10) : null,
        verseEnd: m[4] ? parseInt(m[4], 10) : (m[3] ? parseInt(m[3], 10) : null)
      };
    }
    if (book === "psalms" && chapter === 151) {
      book = "psalm-151";
      chapter = 1;
    }
    return {
      book: book,
      chapter: chapter,
      verseStart: m[3] ? parseInt(m[3], 10) : null,
      verseEnd: m[4] ? parseInt(m[4], 10) : (m[3] ? parseInt(m[3], 10) : null)
    };
  }

  function loadJSON(path) {
    var cacheKey = "__st_cache_" + path;
    if (window[cacheKey]) return Promise.resolve(window[cacheKey]);
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(r.status + " " + path);
      return r.json();
    }).then(function (data) {
      window[cacheKey] = data;
      return data;
    });
  }

  function loadBooks() {
    if (BOOKS) return Promise.resolve(BOOKS);
    return loadJSON(siteRoot() + "data/bible/books.json").then(function (d) {
      BOOKS = d;
      return d;
    });
  }

  function loadTranslation(slug, translation) {
    return loadJSON(siteRoot() + "data/bible/" + slug + "." + translation + ".json");
  }

  // The translations shipped with the site, straight from translations.json so
  // there is one source of truth for ids, names and canon coverage.
  var TRANSLATIONS_DATA = null;
  function loadTranslations() {
    if (TRANSLATIONS_DATA) return Promise.resolve(TRANSLATIONS_DATA);
    return loadJSON(siteRoot() + "data/bible/translations.json").then(function (d) {
      TRANSLATIONS_DATA = (d && d.translations) || [];
      return TRANSLATIONS_DATA;
    });
  }

  // Group translations by what they actually contain, so the pickers can offer
  // the full Bible as a distinct option from the 66-book canon and from the
  // Hebrew Bible on its own (the Jewish translation).
  var GROUP_LABELS = {
    full: "Full Bible (with Apocrypha)",
    canon: "66-book canon",
    tanakh: "Hebrew Bible \u2014 Jewish translation",
    vulgate: "Vulgate numbering \u2014 read on its own, never beside the others"
  };
  var GROUP_ORDER = ["full", "canon", "tanakh", "vulgate"];

  function translationGroups(list) {
    var bucket = {};
    (list || []).forEach(function (t) {
      var key = (t && t.scope) || (t && t.deuterocanon ? "full" : "canon");
      (bucket[key] = bucket[key] || []).push(t);
    });
    return GROUP_ORDER.filter(function (k) { return bucket[k]; }).map(function (k) {
      return { id: k, label: GROUP_LABELS[k] || k, translations: bucket[k] };
    });
  }

  function translationSub(t) {
    return (t && t.year ? t.year + " \u00b7 " : "") + "public domain";
  }

  // "THE FIRST SUNDAY IN ADVENT" reads as "The First Sunday in Advent".
  var SMALL_WORDS = { in: 1, of: 1, the: 1, and: 1, after: 1, before: 1, next: 1, upon: 1, on: 1, at: 1 };
  function titleCase(text) {
    return String(text == null ? "" : text).toLowerCase().replace(/\b[a-z][a-z']*/g, function (word, offset) {
      if (offset > 0 && SMALL_WORDS[word]) { return word; }
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).replace(/^[a-z]/, function (c) { return c.toUpperCase(); });
  }

  function escapeHTML(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* Installable and usable offline: a service worker, registered from any page
     that loads this file. It is a bonus, not a requirement — every failure is
     swallowed, and the site works exactly as before without it. */
  function registerServiceWorker() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) { return; }
    if (location.protocol !== "http:" && location.protocol !== "https:") { return; }
    var register = function () {
      navigator.serviceWorker.register(siteRoot() + "sw.js").catch(function () { /* never mind */ });
    };
    if (document.readyState === "complete") { register(); }
    else { window.addEventListener("load", register); }
  }

  function qs(name) {
    var m = new URLSearchParams(window.location.search);
    return m.get(name);
  }

  function store(key, value) {
    var fullKey = "studytools." + key;
    if (value === undefined) {
      try { return JSON.parse(localStorage.getItem(fullKey)); } catch (e) { return null; }
    }
    localStorage.setItem(fullKey, JSON.stringify(value));
    return value;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function isoAddDays(iso, days) {
    var p = iso.split("-").map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function formatDate(iso, opts) {
    var p = iso.split("-").map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.toLocaleDateString(undefined, opts || { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); resolve(); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  function toast(message, isError) {
    var t = document.getElementById("st-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "st-toast";
      t.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:" +
        (isError ? "#a8442f" : "#2b2320") + ";color:#fff;padding:9px 16px;border-radius:999px;" +
        "font-size:.85rem;z-index:99;opacity:0;transition:opacity .18s;box-shadow:0 4px 18px rgba(0,0,0,.2)";
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.style.background = isError ? "#a8442f" : "#2b2320";
    t.style.opacity = "1";
    clearTimeout(t.__timer);
    t.__timer = setTimeout(function () { t.style.opacity = "0"; }, 2200);
  }

  var THEME_KEY = "theme";

  function getTheme() {
    try {
      var stored = localStorage.getItem("studytools." + THEME_KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch (e) { /* storage unavailable */ }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("studytools." + THEME_KEY, theme); } catch (e) { /* ignore */ }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#191512" : "#f7f4ed");
    document.dispatchEvent(new CustomEvent("st:themechange", { detail: { theme: theme } }));
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    return next;
  }

  function themeToggleButton() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    var btn = el("button", {
      type: "button",
      class: "theme-toggle",
      title: dark ? "Switch to light mode" : "Switch to dark mode",
      "aria-label": dark ? "Switch to light mode" : "Switch to dark mode"
    });
    btn.appendChild(el("span", { class: "theme-icon", "aria-hidden": "true", text: dark ? "☀" : "☾" }));
    btn.addEventListener("click", function () {
      var next = toggleTheme();
      btn.title = next === "dark" ? "Switch to light mode" : "Switch to dark mode";
      btn.setAttribute("aria-label", btn.title);
      btn.firstChild.textContent = next === "dark" ? "☀" : "☾";
    });
    return btn;
  }

  /* Top-level sections of the site: every page's top bar shows these. A section
     may point at another site — Witness lives on its own subdomain — so an
     absolute URL is left alone instead of being rooted like a page of this one. */
  var SECTIONS = [
    { id: "bible", name: "Bible", href: "index.html" },
    { id: "tools", name: "Study Tools", href: "tools.html" },
    { id: "about", name: "About", href: "about.html" },
    { id: "witness", name: "Witness \u2197", href: "https://witness.studytools.cc/", external: true }
  ];

  function mountTopbar(currentId) {
    var root = siteRoot();
    var host = document.querySelector("[data-topbar]");
    if (!host) return;
    var nav = el("nav");
    SECTIONS.forEach(function (section) {
      var href = /^[a-z]+:/i.test(section.href) ? section.href : root + section.href;
      var a = el("a", { href: href, text: section.name });
      if (section.id === currentId) a.setAttribute("aria-current", "page");
      if (section.external) { a.setAttribute("rel", "noopener"); a.title = "Witness, on its own site"; }
      nav.appendChild(a);
    });
    host.className = "topbar";
    host.innerHTML = "";
    var inner = el("div", { class: "topbar-inner" }, [
      el("a", { class: "brand", href: root + "index.html", text: "StudyTools" }),
      el("span", { class: "spacer" }),
      nav,
      themeToggleButton()
    ]);
    host.appendChild(inner);
  }

  // Map from the data/ book slugs to the WEB module's two-to-four letter
  // division codes (see webu/info.json), so a book can link to its pre-built
  // chapter page in webu/ (e.g. john 3 -> webu/JN3.html). The same codes
  // supply the short badges on the home page's book grid.
  var WEBU_MODULES = {
    genesis: "GN", exodus: "EX", leviticus: "LV", numbers: "NU", deuteronomy: "DT",
    joshua: "JS", judges: "JG", ruth: "RT",
    "i-samuel": "S1", "ii-samuel": "S2", "i-kings": "K1", "ii-kings": "K2",
    "i-chronicles": "R1", "ii-chronicles": "R2", ezra: "ER", nehemiah: "NH", esther: "ET",
    job: "JB", psalms: "PS", proverbs: "PR", ecclesiastes: "EC", "song-of-solomon": "SS",
    isaiah: "IS", jeremiah: "JR", lamentations: "LM", ezekiel: "EK", daniel: "DN",
    hosea: "HS", joel: "JL", amos: "AM", obadiah: "OB", jonah: "JH", micah: "MC",
    nahum: "NM", habakkuk: "HK", zephaniah: "ZP", haggai: "HG", zechariah: "ZC", malachi: "ML",
    tobit: "TB", judith: "JT", wisdom: "WS", sirach: "SR", baruch: "BR",
    "i-esdras": "E1", "ii-esdras": "E2", "prayer-of-manasses": "PN", "additional-psalm": "PX",
    "i-maccabees": "M1", "ii-maccabees": "M2",
    matthew: "MT", mark: "MK", luke: "LK", john: "JN", acts: "AC",
    romans: "RM", "i-corinthians": "C1", "ii-corinthians": "C2", galatians: "GL",
    ephesians: "EP", philippians: "PP", colossians: "CL",
    "i-thessalonians": "H1", "ii-thessalonians": "H2", "i-timothy": "T1", "ii-timothy": "T2",
    titus: "TT", philemon: "PM", hebrews: "HB", james: "JM",
    "i-peter": "P1", "ii-peter": "P2", "i-john": "J1", "ii-john": "J2", "iii-john": "J3",
    jude: "JD", "revelation-of-john": "RV"
  };

  var WEBU_DIR = "webu/";

  function moduleCode(slug) {
    return WEBU_MODULES[slug] || null;
  }

  // The module's pre-built chapter page for a book, e.g. "webu/GN1.html".
  function versePageUrl(parsed) {
    var code = moduleCode(parsed && parsed.book);
    return code ? WEBU_DIR + code + parsed.chapter + ".html" : null;
  }

  // Canonical reading order, grouped for browsing. Shared by the home page
  // and the Bible reader so the two never drift apart.
  var BOOK_GROUPS = [
    { id: "law", label: "Law", slugs: ["genesis", "exodus", "leviticus", "numbers", "deuteronomy"] },
    { id: "history", label: "History", slugs: ["joshua", "judges", "ruth", "i-samuel", "ii-samuel",
        "i-kings", "ii-kings", "i-chronicles", "ii-chronicles", "ezra", "nehemiah", "esther"] },
    { id: "wisdom", label: "Wisdom", slugs: ["job", "psalms", "proverbs", "ecclesiastes", "song-of-solomon"] },
    { id: "prophets", label: "Prophets", slugs: ["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel",
        "hosea", "joel", "amos", "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah",
        "haggai", "zechariah", "malachi"] },
    { id: "gospels", label: "Gospels", slugs: ["matthew", "mark", "luke", "john"] },
    { id: "letters", label: "Letters", slugs: ["acts", "romans", "i-corinthians", "ii-corinthians",
        "galatians", "ephesians", "philippians", "colossians", "i-thessalonians", "ii-thessalonians",
        "i-timothy", "ii-timothy", "titus", "philemon", "hebrews", "james", "i-peter", "ii-peter",
        "i-john", "ii-john", "iii-john", "jude", "revelation-of-john"] },
    { id: "apocrypha", label: "Apocrypha", deuterocanon: true, slugs: [] }
  ];

  window.ST = {
    APPS: APPS,
    TRANSLATIONS: TRANSLATIONS,
    siteRoot: siteRoot,
    normalizeBook: normalizeBook,
    parseRef: parseRef,
    loadBooks: loadBooks,
    BOOK_GROUPS: BOOK_GROUPS,
    loadTranslation: loadTranslation,
    loadTranslations: loadTranslations,
    translationGroups: translationGroups,
    translationSub: translationSub,
    loadJSON: loadJSON,
    titleCase: titleCase,
    escapeHTML: escapeHTML,
    el: el,
    qs: qs,
    versePageUrl: versePageUrl,
    moduleCode: moduleCode,
    store: store,
    todayISO: todayISO,
    isoAddDays: isoAddDays,
    formatDate: formatDate,
    download: download,
    copyText: copyText,
    toast: toast,
    mountTopbar: mountTopbar,
    getTheme: getTheme,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme
  };

  // Auto-mount the shared header on any page that declares a placeholder.
  // The page's own script sets data-app on <body> to highlight the current tab.
  function autoMount() {
    if (!document.querySelector("[data-topbar]")) return;
    var appId = document.body.getAttribute("data-app") || undefined;
    mountTopbar(appId);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else {
    autoMount();
  }
  registerServiceWorker();
})();
