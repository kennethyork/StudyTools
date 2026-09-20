/* Study a Passage: one reference, everything the site holds on it - the text in
   three translations, cross-references, the ground it shares with the other
   traditions, and the Greek word by word. Built for preparing to teach.
   Depends on js/common.js. */
(function () {
  "use strict";

  var ROOT = ST.siteRoot();
  var TRS = ["WEBU", "KJVM", "RVM"];
  var STORE_KEY = "study-translation.v1";
  var MAX_VERSES = 60;
  var MAX_XREFS = 40;

  var els = {
    ref: document.getElementById("ref"),
    tr: document.getElementById("tr"),
    go: document.getElementById("go"),
    tries: document.getElementById("tries"),
    out: document.getElementById("out")
  };

  var books = [], bySlug = {}, translations = [], tr = null;
  var parallels = null;
  var cache = {};

  function q(key, url) {
    if (cache[key]) { return Promise.resolve(cache[key]); }
    return ST.loadJSON(ROOT + url).then(function (d) { cache[key] = d; return d; })
      .catch(function () { return null; });
  }

  function verseLine(n, text) {
    var row = document.createElement("div");
    row.className = "verse-line";
    var a = document.createElement("span"); a.className = "n"; a.textContent = String(n);
    var p = document.createElement("p"); p.textContent = text;
    row.appendChild(a); row.appendChild(p);
    return row;
  }

  function block(title, sub) {
    var b = document.createElement("section");
    b.className = "card block";
    var h = document.createElement("h2"); h.textContent = title; b.appendChild(h);
    if (sub) { var s = document.createElement("p"); s.className = "sub"; s.textContent = sub; b.appendChild(s); }
    return b;
  }

  function range(parsed, chapterData) {
    var all = Object.keys(chapterData).map(Number).sort(function (a, b) { return a - b; });
    if (!parsed.verseStart) { return all; }
    var from = parsed.verseStart, to = parsed.verseEnd || from;
    return all.filter(function (n) { return n >= from && n <= to; });
  }

  function bookName(slug) { return bySlug[slug] ? bySlug[slug].name : slug; }

  /* ---------------------------------------------------------------- render */
  function render(parsed) {
    var book = bySlug[parsed.book];
    els.out.innerHTML = "";
    if (!book) {
      els.out.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "Could not understand that reference. Try a format like \"Genesis 22\" or \"John 3:16\"." })
      ]));
      return;
    }
    var ch = parsed.chapter;
    var label = bookName(book.slug) + " " + ch + (parsed.verseStart
      ? ":" + parsed.verseStart + (parsed.verseEnd && parsed.verseEnd !== parsed.verseStart ? "-" + parsed.verseEnd : "")
      : "");
    try { history.replaceState(null, "", "?ref=" + encodeURIComponent(label)); } catch (e) { /* file:// */ }

    /* 1. the passage, in the chosen translation */
    var passage = block("The passage", label + " \u00b7 " + (translationName(tr)));
    els.out.appendChild(passage);
    var tools = ST.el("div", { class: "row no-print", style: "margin-bottom:10px" });
    tools.appendChild(ST.el("a", { class: "btn secondary", href: ROOT + "apps/bible/?book=" + encodeURIComponent(book.slug) + "&chapter=" + ch, text: "Open in the reader \u2192" }));
    tools.appendChild(ST.el("a", { class: "btn secondary", href: ROOT + "apps/matrix/?ref=" + encodeURIComponent(label), text: "Open in the Verse Matrix \u2192" }));
    tools.appendChild(ST.el("a", { class: "btn secondary", href: ROOT + "apps/lectern/?ref=" + encodeURIComponent(label), text: "Read aloud \u2192" }));
    var printBtn = ST.el("button", { class: "ghost", text: "Print this page" });
    printBtn.addEventListener("click", function () { window.print(); });
    tools.appendChild(printBtn);
    passage.appendChild(tools);
    var passageBody = ST.el("div", { class: "muted small", text: "Loading\u2026" });
    passage.appendChild(passageBody);

    ST.loadTranslation(book.slug, tr).then(function (data) {
      passageBody.remove();
      var chapterData = data.chapters[String(ch)] || {};
      var nums = range(parsed, chapterData);
      if (!nums.length) { passage.appendChild(ST.el("p", { class: "muted small", text: "No text for that reference." })); return; }
      nums.slice(0, MAX_VERSES).forEach(function (n) { passage.appendChild(verseLine(n, chapterData[String(n)])); });
      if (nums.length > MAX_VERSES) {
        passage.appendChild(ST.el("p", { class: "muted small", text: "Showing the first " + MAX_VERSES + " verses." }));
      }
    }).catch(function () { passageBody.textContent = "Could not load that passage."; });

    /* 2. the same verses in each translation */
    var cmp = block("The same verses in each translation", "Three modern public-domain texts, side by side.");
    cmp.appendChild(ST.el("div", { class: "tr-cols" }, TRS.map(function (t) {
      var col = document.createElement("div");
      col.className = "tr-col";
      var h = document.createElement("h3"); h.textContent = translationName(t); col.appendChild(h);
      var body = ST.el("div", { class: "muted small", text: "Loading\u2026" });
      col.appendChild(body);
      q("tr:" + book.slug + ":" + t, "data/bible/" + book.slug + "." + t + ".json").then(function (data) {
        body.remove();
        if (!data) { col.appendChild(ST.el("p", { class: "muted small", text: "Not available in this translation." })); return; }
        var chapterData = data.chapters[String(ch)] || {};
        var nums = range(parsed, chapterData);
        if (!nums.length) { col.appendChild(ST.el("p", { class: "muted small", text: "Not available." })); return; }
        nums.slice(0, MAX_VERSES).forEach(function (n) { col.appendChild(verseLine(n, chapterData[String(n)])); });
      });
      return col;
    })));
    els.out.appendChild(cmp);

    /* 3. cross-references */
    var xref = block("Cross-references", "Every passage the church has linked to these verses, ranked by how often it is cited.");
    var xbody = ST.el("div", { class: "muted small", text: "Loading\u2026" });
    xref.appendChild(xbody);
    q("xref:" + book.slug + ":" + ch, "data/crossref/" + book.slug + "/" + ch + ".json").then(function (d) {
      xbody.remove();
      if (!d || !d.refs || !d.refs.length) {
        xref.appendChild(ST.el("p", { class: "muted small", text: "No cross-references recorded for this chapter." }));
        return;
      }
      var mine = d.refs.filter(function (r) {
        return !parsed.verseStart || (r.from >= parsed.verseStart && r.from <= (parsed.verseEnd || parsed.verseStart));
      }).sort(function (a, b) { return b.votes - a.votes; });
      if (!mine.length) { mine = d.refs.slice().sort(function (a, b) { return b.votes - a.votes; }); }
      var ul = document.createElement("ul");
      ul.className = "xlist";
      mine.slice(0, MAX_XREFS).forEach(function (r) {
        var to = r.to;
        var ref = bookName(to.book) + " " + to.chapter +
          ":" + to.verseStart + (to.verseEnd && to.verseEnd !== to.verseStart ? "-" + to.verseEnd : "");
        var li = document.createElement("li");
        var v = document.createElement("span"); v.className = "v"; v.textContent = r.from + " \u2192";
        var a = document.createElement("a"); a.className = "r"; a.textContent = ref;
        a.href = ROOT + "apps/matrix/?ref=" + encodeURIComponent(ref);
        var c = document.createElement("span"); c.className = "c"; c.textContent = r.votes + (r.votes === 1 ? " vote" : " votes");
        li.appendChild(v); li.appendChild(a); li.appendChild(c);
        ul.appendChild(li);
      });
      xref.appendChild(ul);
    });
    els.out.appendChild(xref);

    /* 4. the same ground in the other traditions */
    var par = block("The same ground in the other traditions", "Comparisons from Parallel Passages that touch this chapter.");
    var pbody = ST.el("div", { class: "muted small", text: "Loading\u2026" });
    par.appendChild(pbody);
    loadParallels().then(function (d) {
      pbody.remove();
      var hits = (d && d.entries || []).filter(function (e) {
        return (e.sides || []).some(function (s) {
          if (s.tradition !== "bible") { return false; }
          var p = ST.parseRef(s.ref);
          return p && p.book === book.slug && p.chapter === ch;
        });
      });
      if (!hits.length) {
        par.appendChild(ST.el("p", { class: "muted small", text: "No comparison in the other traditions touches this chapter." }));
        return;
      }
      var ul = document.createElement("ul");
      ul.className = "xlist";
      hits.slice(0, 20).forEach(function (e) {
        var other = (e.sides || []).filter(function (s) { return s.tradition !== "bible"; })[0] || {};
        var li = document.createElement("li");
        var v = document.createElement("span"); v.className = "v"; v.textContent = (other.label || "") + " ";
        var a = document.createElement("a"); a.className = "r"; a.textContent = e.title;
        a.href = ROOT + "apps/parallels/?entry=" + encodeURIComponent(e.id);
        var c = document.createElement("span"); c.className = "c"; c.textContent = other.ref || "";
        li.appendChild(v); li.appendChild(a); li.appendChild(c);
        ul.appendChild(li);
      });
      par.appendChild(ul);
    });
    els.out.appendChild(par);

    /* 5. the Greek, for the New Testament */
    if (book.testament === "NT") {
      var gk = block("The Greek, word by word", "Accented form, transliteration, morphology, Strong's number and a gloss.");
      var gbody = ST.el("div", { class: "muted small", text: "Loading\u2026" });
      gk.appendChild(gbody);
      q("il:" + book.slug + ":" + ch, "data/interlinear/" + book.slug + "/" + ch + ".json").then(function (d) {
        gbody.remove();
        if (!d || !d.verses) {
          gk.appendChild(ST.el("p", { class: "muted small", text: "No interlinear data for this chapter." }));
          return;
        }
        var nums = Object.keys(d.verses).map(Number).sort(function (a, b) { return a - b; });
        if (parsed.verseStart) {
          var to = parsed.verseEnd || parsed.verseStart;
          nums = nums.filter(function (n) { return n >= parsed.verseStart && n <= to; });
        }
        var wrap = document.createElement("div");
        wrap.className = "words";
        nums.slice(0, 30).forEach(function (n) {
          var row = document.createElement("div");
          row.className = "row";
          (d.verses[String(n)] || []).forEach(function (w) {
            var span = document.createElement("span");
            span.appendChild(ST.el("span", { class: "g", text: w.g }));
            span.appendChild(document.createTextNode(" "));
            span.appendChild(ST.el("span", { class: "t", text: w.t + " \u00b7 " + w.m + " \u00b7 " + (w.e || "") }));
            row.appendChild(span);
          });
          wrap.appendChild(row);
        });
        gk.appendChild(wrap);
      });
      els.out.appendChild(gk);
    }
  }

  function translationName(id) {
    var name = id;
    translations.forEach(function (t) { if (t.id === id) { name = t.name; } });
    return name;
  }
  function loadParallels() {
    if (parallels) { return Promise.resolve(parallels); }
    return ST.loadJSON(ROOT + "data/compare/parallels.json").then(function (d) { parallels = d; return d; })
      .catch(function () { return null; });
  }

  function run() {
    var raw = els.ref.value.trim();
    if (!raw) { return; }
    var parsed = ST.parseRef(raw);
    if (!parsed) {
      els.out.innerHTML = "";
      els.out.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "Could not understand that reference. Try \"Genesis 22\" or \"John 3:16\"." })
      ]));
      return;
    }
    render(parsed);
  }

  function init() {
    var stored = ST.store(STORE_KEY);
    Promise.all([ST.loadBooks(), ST.loadTranslations()]).then(function (r) {
      books = r[0] || [];
      bySlug = {};
      books.forEach(function (b) { bySlug[b.slug] = b; });
      translations = r[1] || [];
      els.tr.innerHTML = "";
      translations.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id; o.textContent = t.name;
        els.tr.appendChild(o);
      });
      tr = (stored && translations.some(function (t) { return t.id === stored; })) ? stored : translations[0].id;
      els.tr.value = tr;

      ["Genesis 22", "Psalm 23", "Isaiah 53", "John 3:16", "Acts 2", "Romans 8", "1 Corinthians 13"].forEach(function (ex) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = ex;
        b.addEventListener("click", function () { els.ref.value = ex; run(); });
        els.tries.appendChild(b);
      });

      var fromQuery = ST.qs("ref");
      els.ref.value = fromQuery || "Genesis 22";
      run();
    }).catch(function () {
      els.out.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "Could not load the Bible index. Serve the folder over HTTP." })
      ]));
    });

    els.go.addEventListener("click", run);
    els.ref.addEventListener("keydown", function (e) { if (e.key === "Enter") { run(); } });
    els.tr.addEventListener("change", function () {
      tr = els.tr.value;
      ST.store(STORE_KEY, tr);
      run();
    });
  }

  init();
})();
