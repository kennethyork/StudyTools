/* Lectern: one passage in large type, nothing else on screen, for reading aloud.
   Arrow keys move by chapter, # hides the verse numbers, A+/- changes the size.
   Depends on js/common.js. */
(function () {
  "use strict";

  var ROOT = ST.siteRoot();
  var STORE_SIZE = "lectern-size.v1";
  var STORE_TR = "lectern-translation.v1";
  var STORE_NUMBERS = "lectern-numbers.v1";

  var els = {
    lectern: document.getElementById("lectern"),
    title: document.getElementById("title"),
    meta: document.getElementById("meta"),
    text: document.getElementById("text"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    tr: document.getElementById("tr"),
    numbers: document.getElementById("numbers"),
    smaller: document.getElementById("smaller"),
    bigger: document.getElementById("bigger"),
    exit: document.getElementById("exit")
  };

  var books = [], bySlug = {}, translations = [], tr = null;
  var state = { book: null, chapter: 1 };
  var size = parseFloat(ST.store(STORE_SIZE)) || 1.7;

  function applySize() {
    els.text.style.fontSize = size.toFixed(2) + "rem";
    ST.store(STORE_SIZE, String(size));
  }

  function setNumbers(on) {
    els.lectern.setAttribute("data-numbers", on ? "on" : "off");
    ST.store(STORE_NUMBERS, on ? "on" : "off");
  }

  function load() {
    var book = bySlug[state.book];
    if (!book) { return; }
    els.title.textContent = book.name + " " + state.chapter;
    els.meta.textContent = "";
    els.text.innerHTML = "";
    els.text.appendChild(ST.el("p", { class: "meta", style: "color:var(--ink-faint)", text: "Loading\u2026" }));
    ST.loadTranslation(book.slug, tr).then(function (data) {
      var ch = data.chapters[String(state.chapter)] || {};
      els.meta.textContent = translationName(tr);
      els.text.innerHTML = "";
      var nums = Object.keys(ch).map(Number).sort(function (a, b) { return a - b; });
      if (!nums.length) { els.text.appendChild(ST.el("p", { class: "muted", text: "No text for this chapter." })); return; }
      nums.forEach(function (n) {
        var p = document.createElement("p");
        p.className = "verse";
        var s = document.createElement("span");
        s.className = "n";
        s.textContent = String(n);
        p.appendChild(s);
        p.appendChild(document.createTextNode(ch[String(n)]));
        els.text.appendChild(p);
      });
      els.exit.href = ROOT + "apps/bible/?book=" + encodeURIComponent(book.slug) + "&chapter=" + state.chapter;
      try { history.replaceState(null, "", "?ref=" + encodeURIComponent(book.name + " " + state.chapter)); } catch (e) { /* file:// */ }
      els.prev.disabled = state.book === books[0].slug && state.chapter === 1;
      els.next.disabled = state.book === books[books.length - 1].slug && state.chapter >= book.chapters;
    }).catch(function () {
      els.text.innerHTML = "";
      els.text.appendChild(ST.el("p", { class: "muted", text: "Could not load that passage. Serve the folder over HTTP." }));
    });
  }

  function translationName(id) {
    var name = id;
    translations.forEach(function (t) { if (t.id === id) { name = t.name; } });
    return name;
  }

  function step(delta) {
    var book = bySlug[state.book];
    var ch = state.chapter + delta;
    if (ch < 1) {
      var i = books.indexOf(book);
      if (i <= 0) { return; }
      book = books[i - 1];
      ch = book.chapters;
    } else if (ch > book.chapters) {
      var j = books.indexOf(book);
      if (j === -1 || j === books.length - 1) { return; }
      book = books[j + 1];
      ch = 1;
    }
    state.book = book.slug;
    state.chapter = ch;
    load();
  }

  function init() {
    var storedTr = ST.store(STORE_TR);
    var storedNum = ST.store(STORE_NUMBERS);
    Promise.all([ST.loadBooks(), ST.loadTranslations()]).then(function (r) {
      books = r[0] || [];
      bySlug = {};
      books.forEach(function (b) { bySlug[b.slug] = b; });
      translations = r[1] || [];
      els.tr.innerHTML = "";
      translations.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id; o.textContent = t.id;
        o.title = t.name;
        els.tr.appendChild(o);
      });
      tr = (storedTr && translations.some(function (t) { return t.id === storedTr; })) ? storedTr : translations[0].id;
      els.tr.value = tr;

      var start = { book: "john", chapter: 1 };
      var ref = ST.qs("ref");
      if (ref) {
        var parsed = ST.parseRef(ref);
        if (parsed && bySlug[parsed.book]) { start = { book: parsed.book, chapter: parsed.chapter }; }
      }
      state = start;
      setNumbers(storedNum !== "off");
      applySize();
      load();
    });
  }

  els.prev.addEventListener("click", function () { step(-1); });
  els.next.addEventListener("click", function () { step(1); });
  els.tr.addEventListener("change", function () { tr = els.tr.value; ST.store(STORE_TR, tr); load(); });
  els.numbers.addEventListener("click", function () {
    setNumbers(els.lectern.getAttribute("data-numbers") !== "on");
  });
  els.bigger.addEventListener("click", function () { size = Math.min(3.4, size + 0.15); applySize(); });
  els.smaller.addEventListener("click", function () { size = Math.max(1.1, size - 0.15); applySize(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown") { step(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { step(-1); }
    else if (e.key === "#") { els.numbers.click(); }
    else if (e.key === "+" || e.key === "=") { els.bigger.click(); }
    else if (e.key === "-") { els.smaller.click(); }
  });
  els.controls = document.getElementById("controls");
  els.controls.addEventListener("mousemove", function () { els.controls.classList.remove("quiet"); });
  setTimeout(function () { els.controls.classList.add("quiet"); }, 4000);
  init();
})();
