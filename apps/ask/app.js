/* Ask the site: the deterministic side of the reader's Ask panel.

   All the data access lives here; js/answer.js decides what to look up and how to
   lay the answer out. The loaders are thin on purpose — every answer must be
   something these files actually say. */
(function () {
  "use strict";

  var root = ST.siteRoot();
  var thread = document.getElementById("thread");
  var form = document.getElementById("ask-form");
  var input = document.getElementById("q");
  var cache = {};
  var books = null;
  var liturgyIndex = null;

  var EXAMPLES = ["John 3:16", "what does grace mean", "baptism",
    "H7225", "compare John 1:1 in the translations", "who was Melchizedek",
    "Psalm 23:1-4", "is Psalm 23 in the office?"];

  function json(path) {
    if (!cache[path]) {
      cache[path] = ST.loadJSON(path).catch(function () { return null; });
    }
    return cache[path];
  }

  function readings(slug, chapter, verse) {
    return json(root + "data/liturgical/bcp1928-daily.json").then(function (daily) {
      if (!daily) { return []; }
      if (!liturgyIndex) { liturgyIndex = STLiturgy.readingIndex(daily, ST.parseRef); }
      return STLiturgy.readingsFor(liturgyIndex, slug, chapter, verse) || [];
    }).catch(function () { return []; });
  }

  var ctx = {
    parseRef: ST.parseRef,
    normalizeBook: ST.normalizeBook,
    books: function () { return books || []; },
    chapter: function (slug, tr, chapter) {
      return json(root + "data/bible/" + slug + "." + tr + ".json");
    },
    commentary: function (slug, chapter) {
      return json(root + "data/commentary/" + slug + "/" + chapter + ".json");
    },
    crossref: function (slug, chapter) {
      return json(root + "data/crossref/" + slug + "/" + chapter + ".json");
    },
    interlinear: function (slug, chapter) {
      return json(root + "data/interlinear/" + slug + "/" + chapter + ".json");
    },
    dictionary: function (letter) { return json(root + "data/dictionary/" + letter + ".json"); },
    topical: function (source, letter) {
      return json(root + "data/topical/" + source + "/" + letter + ".json");
    },
    vocab: function (language) { return json(root + "data/vocab/" + language + ".json"); },
    concordance: function (letter) { return json(root + "data/concordance/" + letter.toLowerCase() + ".json"); },
    readings: readings
  };

  function el(tag, attrs, kids) { return ST.el(tag, attrs, kids); }

  function turn(question) {
    var wrap = el("div", { class: "turn" });
    var q = el("div", { class: "turn-q" });
    q.appendChild(el("span", { class: "who", text: "You asked" }));
    q.appendChild(document.createTextNode(question));
    wrap.appendChild(q);
    var body = el("div", { class: "card", style: "margin-top:10px" });
    body.appendChild(el("p", { class: "muted small", text: "Looking through the commentary, the dictionaries, the cross-references, the topical Bibles and the concordance\u2026" }));
    wrap.appendChild(body);
    thread.insertBefore(wrap, thread.firstChild);
    return body;
  }

  function render(body, result) {
    body.innerHTML = "";
    if (result.nothingFound) {
      body.appendChild(el("p", { class: "muted small", text: "Nothing in the files here answers that." }));
    }
    result.blocks.forEach(function (b) {
      var section = el("div", { class: "answer-block" });
      if (b.source && b.source.who) {
        section.appendChild(el("h3", { text: b.title + " \u00b7 " + b.source.who }));
      } else if (b.title) {
        section.appendChild(el("h3", { text: b.title }));
      }
      if (b.source && b.source.text) {
        section.appendChild(el("p", { class: "answer-cite", text: b.source.text }));
      }
      (b.lines || []).forEach(function (line) {
        var p = el("p", { class: "answer-line" });
        if (line.who) { p.appendChild(el("span", { class: "who", text: line.who })); }
        p.appendChild(document.createTextNode(line.text));
        section.appendChild(p);
      });
      if ((b.links || []).length) {
        var links = el("div", { class: "answer-links" });
        b.links.forEach(function (l) {
          links.appendChild(el("a", { href: root + l.href, text: l.text }));
        });
        section.appendChild(links);
      }
      body.appendChild(section);
    });
    if (result.citations && result.citations.length) {
      body.appendChild(el("p", { class: "answer-cite", style: "margin-top:12px",
        text: "Sources: " + result.citations.join(" | ") }));
    }
  }

  function ask(question) {
    var text = String(question || "").trim();
    if (!text) { return; }
    input.value = "";
    var body = turn(text);
    STAnswer.answer(text, ctx).then(function (result) {
      render(body, result);
      try { history.replaceState(null, "", "?q=" + encodeURIComponent(text)); } catch (e) { /* file:// */ }
    }).catch(function (err) {
      body.innerHTML = "";
      body.appendChild(el("p", { class: "notice error", text: "That lookup failed: " + err.message }));
    });
  }

  function suggestionRow() {
    var host = document.getElementById("suggest");
    EXAMPLES.forEach(function (text) {
      var b = el("button", { type: "button", class: "btn secondary", text: text });
      b.addEventListener("click", function () { ask(text); });
      host.appendChild(b);
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
  });

  suggestionRow();
  json(root + "data/bible/books.json").then(function (data) {
    books = data || [];
    var first = ST.qs("q");
    if (first) { ask(first); }
  }).catch(function () { books = []; });
})();
