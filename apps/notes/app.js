/* Verse Notes: everything written against a verse in the reader, editable here.
   The rules live in js/notes.js; this holds the store and draws it. Depends on
   js/common.js and js/notes.js. */
(function () {
  "use strict";

  var els = {
    filter: document.getElementById("filter"),
    sort: document.getElementById("sort"),
    exportMd: document.getElementById("export-md"),
    exportJson: document.getElementById("export-json"),
    summary: document.getElementById("summary"),
    out: document.getElementById("out")
  };

  var notes = ST.store(STNotes.STORE_KEY) || {};
  var books = [];
  var names = {};                 /* slug -> the site's name for the book */
  var order = [];                 /* slugs in canonical order */

  function save() {
    ST.store(STNotes.STORE_KEY, notes);
    render();
  }

  function when(iso) {
    if (!iso) { return ""; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    var days = Math.round((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) { return "today"; }
    if (days === 1) { return "yesterday"; }
    if (days < 30) { return days + " days ago"; }
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function label(note) {
    return STNotes.label(note.slug, note.chapter, note.verse, names);
  }

  /* The verse text if the site can reach it, for showing the note in context. */
  function verseText(note) {
    return ST.loadTranslation(note.slug, "WEBU").then(function (data) {
      var chapter = (data.chapters || {})[String(note.chapter)];
      return chapter ? (chapter[String(note.verse)] || "") : "";
    }).catch(function () { return ""; });
  }

  function matches(note, needle) {
    if (!needle) { return true; }
    var hay = (label(note) + " " + note.text + " " + note.slug + " " + note.chapter + ":" + note.verse).toLowerCase();
    return hay.indexOf(needle.toLowerCase()) > -1;
  }

  function noteCard(note) {
    var card = ST.el("div", { class: "note", "data-key": note.key });
    card.appendChild(ST.el("div", { class: "note-head" }, [
      ST.el("a", { class: "ref serif",
        href: ST.siteRoot() + "apps/bible/?ref=" + encodeURIComponent(label(note)),
        text: label(note) }),
      ST.el("span", { class: "when", text: when(note.updated) }),
      ST.el("span", { class: "actions no-print" }, [
        ST.el("a", { class: "ghost btn", style: "font-size:.76rem;padding:3px 9px",
          href: ST.siteRoot() + "apps/study/?ref=" + encodeURIComponent(label(note)), text: "study \u2192" }),
        (function () {
          var del = ST.el("button", { type: "button", class: "ghost", style: "font-size:.76rem;padding:3px 9px", text: "\u00d7" });
          del.title = "Delete this note";
          del.addEventListener("click", function () {
            if (!window.confirm("Delete your note on " + label(note) + "?")) { return; }
            notes = STNotes.remove(notes, note.key);
            save();
          });
          return del;
        })()
      ])
    ]));

    var area = document.createElement("textarea");
    area.value = note.text;
    area.setAttribute("aria-label", "Note on " + label(note));
    area.addEventListener("change", function () {
      notes = STNotes.put(notes, note.key, area.value);
      save();
    });
    card.appendChild(area);

    var quote = ST.el("blockquote", { text: "\u2026" });
    verseText(note).then(function (text) { quote.textContent = text || ""; });
    card.appendChild(quote);
    return card;
  }

  function render() {
    var needle = els.filter.value.trim();
    var list = els.sort.value === "scripture"
      ? STNotes.byScripture(notes, order)
      : STNotes.byUpdated(notes);
    var shown = list.filter(function (n) { return matches(n, needle); });

    var total = STNotes.count(notes);
    var chapters = {};
    list.forEach(function (n) { chapters[n.slug + "." + n.chapter] = true; });
    els.summary.textContent = total === 0
      ? "No notes yet."
      : total + (total === 1 ? " note" : " notes") + " on " +
        Object.keys(chapters).length + (Object.keys(chapters).length === 1 ? " chapter" : " chapters") +
        (needle ? " \u2014 " + shown.length + " matching \u201c" + needle + "\u201d" : "");

    els.out.innerHTML = "";
    if (!total) {
      els.out.appendChild(ST.el("p", { class: "muted" }, [
        document.createTextNode("No notes yet. Open the reader, tap a verse, and write one \u2014 "),
        ST.el("a", { href: ST.siteRoot() + "apps/bible/", text: "read the Bible \u2192" })
      ]));
      return;
    }
    if (!shown.length) {
      els.out.appendChild(ST.el("p", { class: "muted", text: "No note matches \u201c" + needle + "\u201d." }));
      return;
    }
    shown.forEach(function (n) { els.out.appendChild(noteCard(n)); });
  }

  function exportMarkdown() {
    var text = STNotes.toMarkdown(notes, {
      names: names,
      order: order,
      date: new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    });
    if (!text) {
      ST.toast("There are no notes to export");
      return;
    }
    ST.download("verse-notes.md", text, "text/markdown");
  }

  function exportJson() {
    var payload = {
      format: "studytools.verse-notes",
      version: 1,
      exported: new Date().toISOString(),
      notes: notes
    };
    ST.download("verse-notes.json", JSON.stringify(payload, null, 2), "application/json");
  }

  function init() {
    ST.loadBooks().then(function (loaded) {
      books = loaded || [];
      books.forEach(function (b, i) {
        names[b.slug] = b.name;
        order.push(b.slug);
      });
      render();
    }).catch(function () {
      /* the notes are still readable without the book list, just less pretty */
      render();
    });

    els.filter.addEventListener("input", render);
    els.sort.addEventListener("change", render);
    els.exportMd.addEventListener("click", exportMarkdown);
    els.exportJson.addEventListener("click", exportJson);
  }

  init();
})();
