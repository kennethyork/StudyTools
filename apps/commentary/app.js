/* Read the commentary on a chapter, not one verse at a time.

   Everything here is already on disk: the chapter files the reader loads when you
   tap a verse carry every remark on that chapter, attributed. This page shows them
   in order and lets you narrow them to one work — or, for the Catena, to one of the
   Fathers Aquinas quoted. Nothing is fetched from anywhere else and nothing is
   generated: what you see is what those files say. */
(function () {
  "use strict";

  var root = ST.siteRoot();
  var els = {
    book: document.getElementById("book"),
    chapter: document.getElementById("chapter"),
    who: document.getElementById("who"),
    out: document.getElementById("out"),
    print: document.getElementById("print")
  };
  var books = [], index = null, showFrom = "all";

  /* The Fathers the Catena quotes, as the volumes name them — the list is the
     data's, not the parser's: check-commentary.js fails the build on a name here
     that is in no remark, and on a name in the remarks that is not here, so the
     dropdown offers exactly what the commentary has. */
  var FATHERS = ["Ambrose",
    "Anselm",
    "Augustine",
    "Bede",
    "Cassian",
    "Chrysostom",
    "Cyprian",
    "Cyril",
    "Faustus",
    "Glossa Ordinaria",
    "Gregory",
    "Hilary",
    "Isidore",
    "Jerome",
    "Leo",
    "Maximus",
    "Origen",
    "Pseudo-Augustine",
    "Pseudo-Chrysostom",
    "Pseudo-Jerome",
    "Rabanus Maurus",
    "Remigius",
    "Severianus",
    "Theophylact",
    "Titus of Bostra"];

  function el(tag, attrs, kids) { return ST.el(tag, attrs, kids); }

  function fillBooks() {
    els.book.innerHTML = "";
    books.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.slug;
      o.textContent = b.name + (hasCommentary(b.slug) ? "" : " — none here");
      els.book.appendChild(o);
    });
    els.book.value = ST.qs("book") || "john";
    fillChapters();
  }

  function hasCommentary(slug) {
    return !!index && (index.books || []).indexOf(slug) !== -1;
  }

  function currentBook() {
    return books.filter(function (b) { return b.slug === els.book.value; })[0];
  }

  function fillChapters() {
    var book = currentBook();
    els.chapter.innerHTML = "";
    if (!book) { return; }
    for (var c = 1; c <= book.chapters; c++) {
      var o = document.createElement("option");
      o.value = String(c);
      o.textContent = c;
      els.chapter.appendChild(o);
    }
    els.chapter.value = ST.qs("chapter") || "1";
  }

  function fillWho() {
    els.who.innerHTML = "";
    var all = document.createElement("option");
    all.value = "all";
    all.textContent = "Everything on the chapter";
    els.who.appendChild(all);
    var group = document.createElement("optgroup");
    group.label = "The works";
    (index.sources || []).forEach(function (s) {
      var o = document.createElement("option");
      o.value = "source:" + s.id;
      o.textContent = s.name + (s.year ? " (" + s.year + ")" : "");
      group.appendChild(o);
    });
    els.who.appendChild(group);
    var fathers = document.createElement("optgroup");
    fathers.label = "The Fathers (Matthew and Mark)";
    FATHERS.forEach(function (name) {
      var o = document.createElement("option");
      o.value = "father:" + name;
      o.textContent = name;
      fathers.appendChild(o);
    });
    els.who.appendChild(fathers);
  }

  function wanted(entry) {
    if (showFrom === "all") { return true; }
    if (showFrom.indexOf("source:") === 0) {
      return entry.source === showFrom.slice("source:".length);
    }
    return entry.short === showFrom.slice("father:".length);
  }

  function render() {
    var book = currentBook();
    var chapter = els.chapter.value;
    els.out.innerHTML = "";
    if (!book) { return; }
    document.title = book.name + " " + chapter + " — Commentary";
    try { history.replaceState(null, "", "?book=" + book.slug + "&chapter=" + chapter); } catch (e) {}

    var head = el("div", { class: "card no-print" }, [
      el("h2", { class: "serif", style: "margin:0 0 4px;font-size:1.2rem", text: book.name + " " + chapter }),
      el("p", { class: "muted small", style: "margin:0", text: "Loading the remarks\u2026" })
    ]);
    els.out.appendChild(head);

    var translation = (book.translations || [])[0];
    Promise.all([
      ST.loadJSON(root + "data/commentary/" + book.slug + "/" + chapter + ".json")
        .catch(function () { return null; }),
      translation ? ST.loadJSON(root + "data/bible/" + book.slug + "." + translation + ".json")
        .catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (loaded) {
      var data = loaded[0], text = loaded[1];
      els.out.removeChild(head);
      if (!data || !Object.keys(data.verses || {}).length) {
        els.out.appendChild(el("div", { class: "card" }, [
          el("p", { style: "margin:0", text: "No commentary on this chapter in the works bundled here." }),
          el("p", { class: "muted small", style: "margin:8px 0 0" }, [
            document.createTextNode("The deuterocanonical books have none beyond what Haydock and Charles cover; Luke and John have no Catena. "),
            el("a", { href: root + "apps/ask/", text: "Ask the site about a verse instead \u2192" })
          ])
        ]));
        return;
      }
      var verses = Object.keys(data.verses).map(Number).sort(function (a, b) { return a - b; });
      var shown = 0;
      var card = el("div", { class: "card" });
      verses.forEach(function (v) {
        var entries = (data.verses[String(v)] || []).filter(wanted);
        if (!entries.length) { return; }
        shown += entries.length;
        var block = el("div", { class: "cm-verse" });
        block.appendChild(el("div", { class: "cm-ref", text: book.name + " " + chapter + ":" + v + "  \u00b7  " +
          entries.length + (entries.length === 1 ? " remark" : " remarks") }));
        var verse = text && ((text.chapters || {})[chapter] || {})[String(v)];
        if (verse) { block.appendChild(el("p", { class: "cm-text", text: verse })); }
        entries.forEach(function (entry) {
          block.appendChild(el("div", { class: "cm-remark" }, [
            el("span", { class: "who", text: entry.short }),
            el("p", { text: entry.text })
          ]));
        });
        var links = ST.el("div", { class: "row no-print", style: "margin-top:6px;font-size:.82rem" }, [
          el("a", { href: root + "apps/study/?ref=" + encodeURIComponent(book.name + " " + chapter + ":" + v),
            text: "Study this passage \u2192" }),
          el("a", { href: root + "apps/ask/?q=" + encodeURIComponent(book.name + " " + chapter + ":" + v),
            text: "Ask the site about it \u2192" })
        ]);
        block.appendChild(links);
        card.appendChild(block);
      });
      if (!shown) {
        els.out.appendChild(el("div", { class: "card" }, [
          el("p", { style: "margin:0", text: "Nothing on this chapter from that writer." }),
          el("p", { class: "muted small", style: "margin:8px 0 0", text:
            "The Catena covers Matthew and Mark only, and Haydock the deuterocanon." })
        ]));
        return;
      }
      var summary = el("p", { class: "muted small", style: "margin:0 0 4px",
        text: shown.toLocaleString() + (shown === 1 ? " remark" : " remarks") + " on " +
          book.name + " " + chapter + ", from " + (showFrom === "all" ? "every work here" :
          (showFrom.indexOf("source:") === 0 ? "one work" : showFrom.slice("father:".length))) + "." });
      card.insertBefore(summary, card.firstChild);
      els.out.appendChild(card);
    });
  }

  els.book.addEventListener("change", function () { fillChapters(); render(); });
  els.chapter.addEventListener("change", render);
  els.who.addEventListener("change", function () { showFrom = els.who.value; render(); });
  els.print.addEventListener("click", function () { window.print(); });

  Promise.all([
    ST.loadJSON(root + "data/bible/books.json"),
    ST.loadJSON(root + "data/commentary/index.json")
  ]).then(function (loaded) {
    books = loaded[0] || [];
    index = loaded[1] || { sources: [], books: [] };
    fillBooks();
    fillWho();
    showFrom = "all";
    render();
  }).catch(function () {
    els.out.appendChild(el("div", { class: "card" }, [
      el("p", { class: "notice error", text: "Could not load the book list. Serve this folder over HTTP." })
    ]));
  });
})();
