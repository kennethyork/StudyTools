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

  /* The King James' forms of a word, so that a reader who looks up "aboundeth" is
     shown "Abound". The dictionary headwords are lemmas, as dictionaries have
     always been; the text is not. Suffixes are stripped in passes because a form can
     carry two of them ("pouredst"), and a short list covers the irregulars the text
     uses, which no rule turns into their headword: "oxen" is not a form of "oxe".
     This is a reading aid, not a stemmer: it suggests, and the reader decides. */
  var IRREGULAR = {
    // pronouns and the verbs that go with them: the King James' thou, thee, thy
    thee: "thou", thy: "thou", thine: "thou", thou: "thou", ye: "you", yourselves: "yourself",
    hath: "have", hast: "have", hadst: "have", art: "be", wast: "be", wert: "be",
    doth: "do", dost: "do", didst: "do", saith: "say", sayest: "say", saidst: "say",
    canst: "can", couldest: "can", shalt: "shall", shouldest: "shall", wilt: "will",
    wouldest: "will", mayest: "may", mightest: "may", might: "mighty",
    // the older spellings the text is full of
    shew: "show", shewed: "show", shewest: "show", sheweth: "show", shewing: "show",
    intreat: "entreat", intreated: "entreat", intreaty: "entreaty",
    musick: "music", jubile: "jubilee", fulfil: "fulfill", skilful: "skillful",
    plenteous: "plenty", bountiful: "bounty", merciful: "mercy",
    // participles and preterites that no rule reaches
    known: "know", drawn: "draw", grew: "grow", drew: "draw", spake: "speak",
    forgat: "forget", forsook: "forsake", forsookest: "forsake", holden: "hold",
    shaven: "shave", laden: "lade", graven: "grave", molten: "melt", cloven: "cleave",
    begat: "beget", begot: "beget", begun: "begin", began: "begin",
    sware: "swear", bare: "bear", tare: "tear", clave: "cleave",
    overthrew: "overthrow", overcame: "overcome", withstood: "withstand",
    withdrew: "withdraw", dwelt: "dwell", spent: "spend", dealt: "deal",
    trodden: "tread", arisen: "arise", borne: "bear", sworn: "swear", torn: "tear",
    worn: "wear", gotten: "get", begotten: "beget", forgotten: "forget",
    // plurals and comparatives that are their own words
    oxen: "ox", kine: "cow", brethren: "brother", children: "child", men: "man",
    women: "woman", feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
    higher: "high", greater: "great", wiser: "wise", deeper: "deep", easier: "easy",
    mightier: "mighty", mightiest: "mighty", honourably: "honourable",
    // the plurals that are their own words, the other way round: the text says
    // horsemen and the dictionary's entry is Horseman
    horsemen: "horseman", footmen: "footman", husbandmen: "husbandman",
    workmen: "workman", watchmen: "watchman", herdmen: "herdman",
    craftsmen: "craftsman", kinsmen: "kinsman", bondmen: "bondman",
    countrymen: "countryman", menservants: "manservant", bondwoman: "bondman",
    womenservants: "womanservant", brethren: "brother", children: "child"
  };
  var SUFFIXES = [["eth", ""], ["est", ""], ["edst", ""], ["ed", ""], ["ing", ""],
    ["ies", "y"], ["es", ""], ["s", ""], ["i", "y"]];

  /* Webster spells American and the King James British, so a reader who types
     "honour" is looking for the entry under Honor. The same in reverse, and for the
     endings that differ (-ise/-ize, -re/-er, -ce/-se). */
  function spellingFolds(word) {
    var out = [];
    if (word.indexOf("our") !== -1) { out.push(word.replace(/our/g, "or")); }
    if (word.indexOf("or") !== -1) { out.push(word.replace(/or/g, "our")); }
    if (/ise$/.test(word)) { out.push(word.slice(0, -3) + "ize"); }
    if (/ize$/.test(word)) { out.push(word.slice(0, -3) + "ise"); }
    if (/re$/.test(word)) { out.push(word.slice(0, -2) + "er"); }
    if (/er$/.test(word)) { out.push(word.slice(0, -2) + "re"); }
    if (/ce$/.test(word)) { out.push(word.slice(0, -2) + "se"); }
    if (/se$/.test(word)) { out.push(word.slice(0, -2) + "ce"); }
    if (/-/.test(word)) { out.push(word.replace(/-/g, "")); }
    return out;
  }

  /* The King James writes compounds solid where Webster keeps them apart:
     threshingfloor, armourbearer, selfsame, lovingkindness. */
  function compoundFolds(word) {
    var out = [];
    for (var at = 3; at <= word.length - 3; at++) {
      out.push(word.slice(0, at) + "-" + word.slice(at));
    }
    return out;
  }

  function stems(word) {
    var out = [], seen = {}, queue = [word];
    function add(w) { if (w && w.length >= 2 && !seen[w]) { seen[w] = true; out.push(w); } }
    function variants(w) {
      var next = [];
      spellingFolds(w).forEach(function (v) { add(v); next.push(v); });
      if (w.length >= 7) { compoundFolds(w).forEach(function (v) { add(v); next.push(v); }); }
      return next;
    }
    for (var pass = 0; pass < 3 && queue.length; pass++) {
      var next = [];
      queue.forEach(function (w) {
        if (IRREGULAR[w]) { add(IRREGULAR[w]); next = next.concat(variants(IRREGULAR[w])); }
        variants(w).forEach(function (v) { next.push(v); });
        SUFFIXES.forEach(function (pair) {
          if (w.length <= pair[0].length + 1 || w.slice(-pair[0].length) !== pair[0]) { return; }
          var base = w.slice(0, -pair[0].length) + pair[1];
          add(base); add(base + "e");
          if (base.length > 2 && base[base.length - 1] === base[base.length - 2]) { add(base.slice(0, -1)); }
          next.push(base);
        });
        /* and the other way: a reader looks up the singular of what the text says
           in the plural ("philistine" for the Philistines, "liar" for liars) */
        if (!/(s|eth|est|ing|ed)$/.test(w)) {
          add(w + "s");
          add(w + "es");
          if (w.length >= 7) { compoundFolds(w + "s").forEach(add); }
        }
      });
      queue = next;
    }
    return out;
  }

  /* slug -> where it lives, for looking a word up without walking the index */
  var bySlug = {};
  function buildSlugIndex() {
    Object.keys(index.letters).forEach(function (letter) {
      index.letters[letter].forEach(function (entry) { bySlug[entry.slug] = { letter: letter, entry: entry }; });
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
      var already = {};
      Object.keys(index.letters).forEach(function (letter) {
        index.letters[letter].forEach(function (entry) {
          if (entry.name.toLowerCase().indexOf(query) !== -1 || entry.slug.indexOf(query) !== -1) {
            results.push({ letter: letter, entry: entry });
            already[entry.slug] = true;
          }
        });
      });
      /* Nothing by that name: it may be a form of one the dictionary has, which is
         what a reader of the King James runs into — "pouredst", "aboundeth",
         "oxen". Those are offered, labelled as what they are. */
      var forms = stems(query.replace(/[^a-z']/g, ""));
      forms.forEach(function (form) {
        var hit = bySlug[form];
        if (hit && !already[hit.entry.slug]) {
          already[hit.entry.slug] = true;
          results.push({ letter: hit.letter, entry: hit.entry, form: query });
        }
      });
      results.sort(function (a, b) {
        if (!!a.form !== !!b.form) { return a.form ? 1 : -1; }
        return a.entry.name.localeCompare(b.entry.name);
      });
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
    /* The whole of Webster's 1828 is here now, so a letter can hold seven thousand
       terms. They are put in two runs — the words the King James uses first, since
       that is what a reader of the Bible is looking for, then the rest — and only
       the first few hundred are drawn, because seven thousand buttons is not a
       list, it is a stall. Searching still reaches all of them. */
    var all = index.letters[activeLetter].map(function (entry) {
      return { letter: activeLetter, entry: entry };
    });
    all.sort(function (a, b) {
      if (!!a.entry.kjv !== !!b.entry.kjv) { return a.entry.kjv ? -1 : 1; }
      return a.entry.name.localeCompare(b.entry.name);
    });
    paintList(all.slice(0, SHOWN), all.length);
  }

  /* The list is drawn from the index, which carries each term's name and how many
     sources it has; the definitions arrive when one is opened. */
  var SHOWN = 300;                 /* how many terms of a letter are drawn at once */

  function paintList(items, total) {
    els.list.innerHTML = "";
    els.listCount.textContent = total.toLocaleString() + (total === 1 ? " term" : " terms");
    if (!items.length) {
      els.list.appendChild(ST.el("p", { class: "muted small", text: "Nothing matches that search." }));
      return;
    }
    if (items.length < total) {
      els.list.appendChild(ST.el("p", { class: "muted small", style: "margin:0 0 6px", text:
        "Showing the first " + items.length + " of " + total.toLocaleString() +
        " — type in the search box to reach the rest." }));
    }
    items.forEach(function (item) {
      var btn = ST.el("button", { type: "button",
        class: "term-item" + (item.entry.slug === activeSlug ? " active" : "") });
      btn.appendChild(ST.el("span", { text: item.entry.name }));
      if (item.entry.kjv) {
        btn.appendChild(ST.el("span", { class: "muted small", text: "  King James" }));
      }
      if (item.form) {
        btn.appendChild(ST.el("span", { class: "muted small", text: "  the King James' \u201c" + item.form + "\u201d" }));
      }
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
    if (bySlug[slug]) { return bySlug[slug]; }
    var forms = stems(slug);
    for (var f = 0; f < forms.length; f++) {
      if (bySlug[forms[f]]) { return bySlug[forms[f]]; }
    }
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
      buildSlugIndex();
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
