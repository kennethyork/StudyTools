/* Shared helpers for StudyTools apps. No build step, no dependencies. */
(function () {
  "use strict";

  var APPS = [
    { id: "sermon", name: "Sermon Notebook", href: "apps/sermon/" },
    { id: "matrix", name: "Verse Matrix", href: "apps/matrix/" },
    { id: "xref", name: "Cross-References", href: "apps/xref/" },
    { id: "dictionary", name: "Dictionary", href: "apps/dictionary/" },
    { id: "vocab", name: "Greek & Hebrew Cards", href: "apps/vocab/" },
    { id: "prayer", name: "Prayer Clock", href: "apps/prayer/" },
    { id: "memory", name: "Memory Verses", href: "apps/memory/" },
    { id: "blog", name: "Blog Ideas", href: "apps/blog/" },
    { id: "devotional", name: "Family Devotional", href: "apps/devotional/" },
    { id: "calendar", name: "Church Calendar", href: "apps/calendar/" }
  ];

  function siteRoot() {
    // Every app page includes a <body data-root="../.."> style marker.
    var root = document.body.getAttribute("data-root");
    return root === null ? "./" : root;
  }

  var BOOKS = null;
  var TRANSLATIONS = ["KJV", "ASV", "WEB", "YLT"];

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
    "prayerofazariah": "prayer-of-azariah", "songofthethree": "prayer-of-azariah",
    "songofthethreeholychildren": "prayer-of-azariah", "azariah": "prayer-of-azariah",
    susanna: "susanna", sus: "susanna",
    "belandthedragon": "bel-and-the-dragon", bel: "bel-and-the-dragon",
    "prayerofmanasses": "prayer-of-manasses", "prayerofmanasseh": "prayer-of-manasses",
    manasses: "prayer-of-manasses", manasseh: "prayer-of-manasses",
    "1maccabees": "i-maccabees", "1macc": "i-maccabees", "imaccabees": "i-maccabees", "i maccabees": "i-maccabees",
    "2maccabees": "ii-maccabees", "2macc": "ii-maccabees", "iimaccabees": "ii-maccabees", "ii maccabees": "ii-maccabees",
    maccabees: "i-maccabees", macc: "i-maccabees",
    "additionalpsalm": "additional-psalm", "psalm151": "additional-psalm",
    laodiceans: "laodiceans", "epistleoflaodiceans": "laodiceans"
  };

  function normalizeBook(name) {
    var key = String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    key = key.replace(/ /g, "");
    if (BOOK_ALIASES[key]) return BOOK_ALIASES[key];
    var spaced = key.replace(/^([123])(?=[a-z])/, "$1 ");
    return BOOK_ALIASES[spaced] || null;
  }

  var REF_RE = /^\s*((?:[1-3]|I{1,3})?\s*[A-Za-z][A-Za-z. ]*?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/;

  function parseRef(text) {
    var m = String(text || "").trim().match(REF_RE);
    if (!m) return null;
    var book = normalizeBook(m[1]);
    if (!book) return null;
    var chapter = parseInt(m[2], 10);
    // "Psalm 151" is the additional psalm preserved in the Septuagint.
    if (book === "psalms" && chapter === 151) {
      book = "additional-psalm";
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

  function mountTopbar(currentId) {
    var root = siteRoot();
    var host = document.querySelector("[data-topbar]");
    if (!host) return;
    var nav = el("nav");
    APPS.forEach(function (app) {
      var a = el("a", { href: root + app.href, text: app.name });
      if (app.id === currentId) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });
    host.className = "topbar";
    host.innerHTML = "";
    var inner = el("div", { class: "topbar-inner" }, [
      el("a", { class: "brand", href: root + "index.html", text: "Study Tools" }),
      el("span", { class: "spacer" }),
      nav,
      themeToggleButton()
    ]);
    host.appendChild(inner);
  }

  window.ST = {
    APPS: APPS,
    TRANSLATIONS: TRANSLATIONS,
    siteRoot: siteRoot,
    normalizeBook: normalizeBook,
    parseRef: parseRef,
    loadBooks: loadBooks,
    loadTranslation: loadTranslation,
    loadJSON: loadJSON,
    escapeHTML: escapeHTML,
    el: el,
    qs: qs,
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
})();
