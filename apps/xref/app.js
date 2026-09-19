(function () {
  "use strict";

  var BOOKS = null;
  var bySlug = {};

  var els = {
    ref: document.getElementById("ref"),
    go: document.getElementById("go"),
    print: document.getElementById("print"),
    translation: document.getElementById("translation"),
    minVotes: document.getElementById("min-votes"),
    source: document.getElementById("source-card"),
    results: document.getElementById("results")
  };

  var chapterCache = {};
  var bookCache = {};

  function bookName(slug) {
    return bySlug[slug] ? bySlug[slug].name : slug;
  }

  function refLabel(target) {
    var label = bookName(target.book) + " " + target.chapter + ":" + target.verseStart;
    if (target.verseEnd && target.verseEnd !== target.verseStart) label += "-" + target.verseEnd;
    return label;
  }

  function loadChapter(slug, chapter, translation) {
    var key = slug + "." + chapter + "." + translation;
    if (chapterCache[key]) return Promise.resolve(chapterCache[key]);
    return ST.loadTranslation(slug, translation).then(function (data) {
      var ch = data.chapters[String(chapter)];
      if (!ch) throw new Error("no chapter");
      chapterCache[key] = ch;
      return ch;
    });
  }

  function renderSource(parsed, translation) {
    return loadChapter(parsed.book, parsed.chapter, translation).then(function (chapter) {
      els.source.innerHTML = "";
      els.source.appendChild(ST.el("h2", { class: "serif", style: "margin:0 0 4px;font-size:1.15rem",
        text: bookName(parsed.book) + " " + parsed.chapter }));
      var sub = parsed.verseStart ? "Verses " + parsed.verseStart + (parsed.verseEnd !== parsed.verseStart ? "-" + parsed.verseEnd : "") : "Whole chapter";
      els.source.appendChild(ST.el("div", { class: "muted small", style: "margin-bottom:10px", text: sub + " · " + translation }));

      var focus = parsed.verseStart;
      var start = focus || 1;
      var end = focus ? Math.min(parsed.verseEnd, Number(Object.keys(chapter).length) || parsed.verseEnd) : Number(Object.keys(chapter).length);
      for (var v = start; v <= end; v++) {
        var text = chapter[String(v)];
        if (!text) continue;
        var line = ST.el("div", { class: "verse-line" + (focus ? " is-source" : "") }, [
          ST.el("span", { class: "num", text: v }),
          ST.el("p", { text: text })
        ]);
        els.source.appendChild(line);
      }
    });
  }

  function renderResults(parsed) {
    var minVotes = parseInt(els.minVotes.value, 10) || 0;
    els.results.innerHTML = "";
    if (!parsed.verseStart) {
      els.results.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice", text: "Cross-references are stored verse by verse. Add a verse, like \"" + bookName(parsed.book) + " " + parsed.chapter + ":1\"." })
      ]));
      return;
    }

    ST.loadJSON(ST.siteRoot() + "data/crossref/" + parsed.book + "/" + parsed.chapter + ".json").then(function (data) {
      var matches = data.refs.filter(function (r) {
        return r.from >= parsed.verseStart && r.from <= parsed.verseEnd && r.votes >= minVotes;
      });

      els.results.innerHTML = "";
      var head = ST.el("div", { class: "card" }, [
        ST.el("div", { class: "row", style: "justify-content:space-between;align-items:baseline" }, [
          ST.el("h2", { class: "serif", style: "margin:0;font-size:1.2rem", text: "Cross-references" }),
          ST.el("span", { class: "muted small", text: matches.length + (matches.length === 1 ? " connection" : " connections") })
        ])
      ]);
      els.results.appendChild(head);

      if (!matches.length) {
        els.results.appendChild(ST.el("div", { class: "card" }, [
          ST.el("p", { class: "muted", text: "No cross-references above this threshold. Try lowering the minimum votes." })
        ]));
        return;
      }

      // Group by the destination chapter so the panel stays readable.
      var groups = [];
      var groupMap = {};
      matches.forEach(function (m) {
        var key = m.to.book + "." + m.to.chapter;
        if (!groupMap[key]) {
          groupMap[key] = { book: m.to.book, chapter: m.to.chapter, items: [], maxVotes: 0 };
          groups.push(groupMap[key]);
        }
        groupMap[key].items.push(m);
        groupMap[key].maxVotes = Math.max(groupMap[key].maxVotes, m.votes);
      });
      groups.sort(function (a, b) { return b.maxVotes - a.maxVotes; });
      var topVotes = groups.length ? groups[0].maxVotes : 1;

      groups.forEach(function (group) {
        var wrap = ST.el("div", { class: "card", style: "margin-top:12px" });
        wrap.appendChild(ST.el("div", { class: "xref-head" }, [
          ST.el("span", { class: "xref-ref", text: bookName(group.book) + " " + group.chapter }),
          ST.el("span", { class: "votes", text: group.items.length + " link" + (group.items.length === 1 ? "" : "s") + " from this chapter" })
        ]));

        group.items.slice(0, 12).forEach(function (item) {
          var block = ST.el("div", { class: "xref-group" });
          block.appendChild(ST.el("div", { class: "xref-head" }, [
            ST.el("a", { class: "xref-ref", href: "?ref=" + encodeURIComponent(refLabel(item.to)), text: refLabel(item.to) }),
            ST.el("span", { class: "votes", text: item.votes + " votes" })
          ]));
          var bar = ST.el("div", { class: "vote-bar", style: "width:" + Math.max(4, Math.round(item.votes / topVotes * 100)) + "%" });
          var textP = ST.el("p", { class: "xref-text", text: "Loading…" });
          block.appendChild(textP);
          block.appendChild(bar);
          wrap.appendChild(block);

          loadChapter(item.to.book, item.to.chapter, els.translation.value).then(function (chapter) {
            var parts = [];
            for (var v = item.to.verseStart; v <= item.to.verseEnd; v++) {
              if (chapter[String(v)]) parts.push(chapter[String(v)]);
            }
            textP.textContent = parts.join(" ") || "Verse not present in this translation.";
          }).catch(function () {
            textP.textContent = "Text unavailable for this translation.";
          });
        });

        if (group.items.length > 12) {
          wrap.appendChild(ST.el("p", { class: "muted small", style: "margin-top:8px", text: "Showing the 12 strongest of " + group.items.length + " links from this chapter." }));
        }
        els.results.appendChild(wrap);
      });
    }).catch(function () {
      els.results.innerHTML = "";
      els.results.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice", text: "No cross-references are stored for " + bookName(parsed.book) + " " + parsed.chapter + "." })
      ]));
    });
  }

  function run() {
    var raw = els.ref.value.trim();
    if (!raw) return;
    var parsed = ST.parseRef(raw);
    if (!parsed || !bySlug[parsed.book]) {
      els.results.innerHTML = "";
      els.results.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: 'Could not understand that reference. Try something like "John 3:16" or "Romans 8:28-30".' })
      ]));
      return;
    }
    try { history.replaceState(null, "", "?ref=" + encodeURIComponent(raw)); } catch (e) { /* file:// */ }
    renderSource(parsed, els.translation.value).catch(function () {
      els.source.innerHTML = "";
      els.source.appendChild(ST.el("p", { class: "muted small", text: "Could not load that passage." }));
    });
    renderResults(parsed);
    document.title = refLabel({ book: parsed.book, chapter: parsed.chapter, verseStart: parsed.verseStart || 1, verseEnd: parsed.verseEnd || parsed.verseStart || 1 }) + " — Cross-References";
  }

  function init() {
    ST.loadBooks().then(function (list) {
      BOOKS = list;
      bySlug = {};
      list.forEach(function (b) { bySlug[b.slug] = b; });
      els.ref.value = ST.qs("ref") || "John 3:16";
      run();
    }).catch(function () {
      els.results.innerHTML = "";
      els.results.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "Could not load the Bible index. Serve this folder over HTTP." })
      ]));
    });

    els.go.addEventListener("click", run);
    els.print.addEventListener("click", function () { window.print(); });
    els.translation.addEventListener("change", run);
    els.minVotes.addEventListener("change", run);
    els.ref.addEventListener("keydown", function (e) { if (e.key === "Enter") run(); });
    document.querySelectorAll("[data-quick]").forEach(function (b) {
      b.addEventListener("click", function () { els.ref.value = b.getAttribute("data-quick"); run(); });
    });
  }

  init();
})();
