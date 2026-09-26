(function () {
  "use strict";

  var els = {
    search: document.getElementById("search"),
    clear: document.getElementById("clear"),
    letters: document.getElementById("letters"),
    list: document.getElementById("term-list"),
    listTitle: document.getElementById("list-title"),
    listCount: document.getElementById("list-count"),
    entry: document.getElementById("entry")
  };

  var index = null;
  var activeLetter = null;
  var activeSlug = null;
  var letterCache = {};

  // Turn bare references like "Ex. 6:20" or "1 Chr. 2:10" into Verse Matrix links.
  var REF_RE = /(?:^|[\s(;,])([1-3]?\s?[A-Z][A-Za-z]{1,3}\.?\s?\d+:\d+(?:-\d+)?)/g;

  function linkify(text) {
    var escaped = ST.escapeHTML(text);
    return escaped.replace(REF_RE, function (match, ref) {
      var cleanRef = ref.trim().replace(/\./g, "").replace(/\s+/g, " ");
      return match.replace(ref, '<a class="scripture-link" href="../matrix/?ref=' + encodeURIComponent(cleanRef) + '">' + ref + "</a>");
    });
  }

  function loadLetter(letter) {
    if (letterCache[letter]) return Promise.resolve(letterCache[letter]);
    return ST.loadJSON(ST.siteRoot() + "data/dictionary/" + letter + ".json").then(function (data) {
      letterCache[letter] = data.entries;
      return data.entries;
    });
  }

  function renderLetters() {
    els.letters.innerHTML = "";
    Object.keys(index.letters).forEach(function (letter) {
      var btn = ST.el("button", { type: "button", class: letter === activeLetter ? "active" : "", text: letter.toUpperCase() });
      btn.addEventListener("click", function () {
        activeLetter = letter;
        els.search.value = "";
        renderLetters();
        renderList();
      });
      els.letters.appendChild(btn);
    });
  }

  function renderList() {
    els.list.innerHTML = "";
    var query = els.search.value.trim().toLowerCase();

    if (query) {
      els.listTitle.textContent = "Search results";
      /* Searched in the index, not in the letter files: every name the dictionary
         holds is in the index the page already has, and looking in the letters meant
         fetching all twenty-six of them — fifteen megabytes — before the first result
         could be shown. Clicking a result opens the one file its entry is in. */
      var results = [];
      Object.keys(index.letters).forEach(function (letter) {
        index.letters[letter].forEach(function (entry) {
          if (entry.name.toLowerCase().indexOf(query) !== -1 || entry.slug.indexOf(query) !== -1) {
            results.push({ letter: letter, entry: entry });
          }
        });
      });
      results.sort(function (a, b) { return a.entry.name.localeCompare(b.entry.name); });
      paintList(results.slice(0, 400), results.length);
      return;
    }

    if (!activeLetter) {
      els.listCount.textContent = index.total.toLocaleString() + " terms";
      els.listTitle.textContent = "Browse by letter";
      els.list.appendChild(ST.el("p", { class: "muted small", text: "Pick a letter above, or search for a word." }));
      return;
    }

    els.listTitle.textContent = "Terms starting with " + activeLetter.toUpperCase();
    paintList(index.letters[activeLetter].map(function (entry) {
      return { letter: activeLetter, entry: entry };
    }), index.letters[activeLetter].length);
  }

  /* The list is drawn from the index, which carries each term's name and how many
     sources it has; the definitions arrive when one is opened. */
  function paintList(items, total) {
    els.list.innerHTML = "";
    els.listCount.textContent = total.toLocaleString() + (total === 1 ? " term" : " terms");
    if (!items.length) {
      els.list.appendChild(ST.el("p", { class: "muted small", text: "Nothing matches that search." }));
      return;
    }
    items.forEach(function (item) {
      var btn = ST.el("button", { type: "button",
        class: "term-item" + (item.entry.slug === activeSlug ? " active" : "") });
      btn.appendChild(ST.el("span", { text: item.entry.name }));
      btn.appendChild(ST.el("span", { class: "count", text: "  · " + item.entry.count }));
      btn.addEventListener("click", function () { openEntry(item.letter, item.entry.slug); });
      els.list.appendChild(btn);
    });
  }

  function openEntry(letter, slug) {
    activeLetter = letter;
    activeSlug = slug;
    renderLetters();
    loadLetter(letter).then(function (entries) {
      var full = entries.filter(function (e) { return e.slug === slug; })[0];
      if (full) { showEntry(full); }
      renderList();
    });
  }

  function showEntry(entry) {
    els.entry.innerHTML = "";
    els.entry.appendChild(ST.el("div", { class: "row", style: "justify-content:space-between;align-items:baseline" }, [
      ST.el("h2", { class: "serif", style: "margin:0;font-size:1.5rem", text: entry.name }),
      ST.el("span", { class: "muted small", text: entry.definitions.length + (entry.definitions.length === 1 ? " source" : " sources") })
    ]));

    entry.definitions.forEach(function (def) {
      var block = ST.el("div", { class: "def" }, [
        ST.el("span", { class: "badge", text: def.sourceLabel + " · " + def.year }),
        ST.el("p", { html: linkify(def.text) })
      ]);
      els.entry.appendChild(block);
    });
    document.title = entry.name + " — Bible Dictionary";
    try { history.replaceState(null, "", "?term=" + encodeURIComponent(entry.slug)); } catch (e) { /* file:// */ }
  }

  function lookup(slug) {
    var letters = Object.keys(index.letters);
    for (var i = 0; i < letters.length; i++) {
      var found = index.letters[letters[i]].filter(function (e) { return e.slug === slug; })[0];
      if (found) return { letter: letters[i], entry: found };
    }
    return null;
  }

  var searchTimer = null;
  function bind() {
    els.search.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderList, 200);
    });
    els.clear.addEventListener("click", function () {
      els.search.value = "";
      activeSlug = null;
      renderList();
      els.entry.innerHTML = "";
      els.entry.appendChild(ST.el("p", { class: "muted", text: "Choose a word to read its entry." }));
    });
  }

  /* Nothing under that name, and what is close to it. */
  function renderMissing(term, near) {
    els.entry.innerHTML = "";
    var card = ST.el("div", {});
    card.appendChild(ST.el("h2", { class: "serif", style: "margin:0 0 6px;font-size:1.35rem",
      text: "Nothing under \u201c" + term + "\u201d" }));
    card.appendChild(ST.el("p", { class: "muted", style: "margin:0 0 10px", text: near.length
      ? "These begin with it."
      : "No term in the five dictionaries begins with it. Try a shorter spelling, or browse a letter." }));
    if (near.length) {
      var list = ST.el("div", { class: "term-list" });
      near.forEach(function (item) {
        var button = ST.el("button", { type: "button", class: "term-item" });
        button.appendChild(ST.el("span", { text: item.entry.name }));
        button.appendChild(ST.el("span", { class: "count", text: "  \u00b7 " + item.entry.count }));
        button.addEventListener("click", function () { openEntry(item.letter, item.entry.slug); });
        list.appendChild(button);
      });
      card.appendChild(list);
    }
    els.entry.appendChild(card);
    document.title = "Nothing under " + term + " — Bible Dictionary";
  }

  function init() {
    ST.loadJSON(ST.siteRoot() + "data/dictionary/index.json").then(function (data) {
      index = data;
      activeLetter = "a";
      renderLetters();
      renderList();

      var term = ST.qs("term");
      var hit = term ? lookup(term) : null;
      if (hit) {
        openEntry(hit.letter, hit.entry.slug);
      } else if (term) {
        /* A word this dictionary does not have: say so, and offer what begins with
           it. It used to open the first entry — ask for "meek" and the page showed
           you "A", as if that were the answer. */
        var want = String(term).toLowerCase();
        var near = [];
        Object.keys(index.letters).forEach(function (letter) {
          index.letters[letter].forEach(function (entry) {
            if (near.length < 12 && (entry.name.toLowerCase().indexOf(want) === 0 ||
                entry.slug.indexOf(want) === 0)) {
              near.push({ letter: letter, entry: entry });
            }
          });
        });
        renderMissing(term, near);
        renderList();
      } else {
        // Open the first entry so the page is never empty.
        loadLetter("a").then(function (entries) {
          if (entries.length) {
            activeSlug = entries[0].slug;
            showEntry(entries[0]);
            renderList();
          }
        });
      }
    }).catch(function () {
      els.entry.innerHTML = "";
      els.entry.appendChild(ST.el("div", { class: "notice error", text: "Could not load the dictionary. Serve this folder over HTTP." }));
    });

    bind();
  }

  init();
})();
