(function () {
  "use strict";

  var PROGRESS_KEY = "vocab-progress.v1";

  var state = {
    lang: "greek",
    mode: "quiz",
    deck: "all",
    direction: "orig",
    decks: {},
    progress: ST.store(PROGRESS_KEY) || {},
    order: [],
    index: 0,
    revealed: false,
    streak: 0
  };

  var els = {
    quizView: document.getElementById("quiz-view"),
    browseView: document.getElementById("browse-view"),
    word: document.getElementById("flash-word"),
    translit: document.getElementById("flash-translit"),
    answer: document.getElementById("flash-answer"),
    gloss: document.getElementById("flash-gloss"),
    meta: document.getElementById("flash-meta"),
    meaning: document.getElementById("flash-meaning"),
    reveal: document.getElementById("reveal"),
    gradeActions: document.getElementById("grade-actions"),
    quizActions: document.getElementById("quiz-actions"),
    position: document.getElementById("deck-position"),
    source: document.getElementById("deck-source"),
    known: document.getElementById("stat-known"),
    deckStat: document.getElementById("stat-deck"),
    streakStat: document.getElementById("stat-streak"),
    fill: document.getElementById("progress-fill"),
    body: document.getElementById("vocab-body"),
    search: document.getElementById("search")
  };

  function progressKey(word) {
    return state.lang + ":" + word.strongs;
  }

  function isKnown(word) {
    return !!state.progress[progressKey(word)];
  }

  function setKnown(word, value) {
    var key = progressKey(word);
    if (value) state.progress[key] = true;
    else delete state.progress[key];
    ST.store(PROGRESS_KEY, state.progress);
  }

  function currentDeck() {
    return state.decks[state.lang] || [];
  }

  function buildOrder() {
    var words = currentDeck();
    var filtered;
    if (state.deck === "unknown") {
      filtered = words.filter(function (w) { return !isKnown(w); });
    } else if (state.deck === "all") {
      filtered = words.slice();
    } else {
      var parts = state.deck.split("-").map(Number);
      filtered = words.slice(parts[0] - 1, parts[1]);
    }
    if (state.direction === "eng") {
      // Keep a stable shuffle so English prompts vary instead of staying rank-ordered.
      filtered = filtered.slice().sort(function (a, b) { return (a.strongs > b.strongs) - (a.strongs < b.strongs); });
    }
    state.order = filtered;
    state.index = 0;
    state.revealed = false;
  }

  function updateStats() {
    var words = currentDeck();
    var knownCount = words.filter(isKnown).length;
    els.known.textContent = knownCount;
    els.deckStat.textContent = currentDeck().length;
    els.streakStat.textContent = state.streak;
    els.fill.style.width = words.length ? (knownCount / words.length * 100) + "%" : "0%";
    els.source.textContent = state.lang === "greek" ? "OpenGNT frequency · STEPBible gloss" : "WLC frequency · STEPBible gloss";
  }

  function currentWord() {
    return state.order[state.index] || null;
  }

  function renderCard() {
    var word = currentWord();
    var answerVisible = state.revealed;
    els.answer.classList.toggle("hidden", !answerVisible);
    els.gradeActions.classList.toggle("hidden", !answerVisible);
    els.quizActions.classList.toggle("hidden", answerVisible);

    if (!word) {
      els.word.textContent = "Deck complete";
      els.word.className = "flash-word";
      els.translit.textContent = "Mark words as known or switch decks to keep going.";
      els.position.textContent = "";
      els.quizActions.classList.add("hidden");
      els.gradeActions.classList.add("hidden");
      return;
    }

    var originalSide = state.direction === "orig";
    var langClass = state.lang === "greek" ? "greek" : "hebrew";
    els.word.className = "flash-word " + langClass;
    els.word.textContent = originalSide ? word.lemma : word.gloss;
    els.word.classList.toggle("hebrew", originalSide && state.lang === "hebrew");
    els.word.classList.toggle("greek", originalSide && state.lang === "greek");

    if (originalSide) {
      els.translit.textContent = word.translit ? word.translit : "";
      els.gloss.textContent = word.gloss;
      els.meta.textContent = word.strongs + " · " + word.morph + " · appears " + word.count.toLocaleString() + "×";
    } else {
      els.translit.textContent = "";
      els.gloss.className = "flash-gloss " + (state.lang === "greek" ? "greek" : "hebrew");
      els.gloss.textContent = word.lemma;
      els.gloss.setAttribute("style", "font-family:" + (state.lang === "greek" ? "var(--greek)" : "var(--hebrew)") + ";font-size:1.5rem;margin-top:4px");
      els.meta.textContent = (word.translit || "") + " · " + word.strongs + " · appears " + word.count.toLocaleString() + "×";
    }
    if (originalSide) els.gloss.setAttribute("style", "");

    els.meaning.textContent = word.meaning || "";
    els.position.textContent = "Card " + (state.index + 1) + " of " + state.order.length;
  }

  function nextCard(advance) {
    state.revealed = false;
    if (advance !== false) state.index += 1;
    if (state.index >= state.order.length && advance !== false) {
      state.index = state.order.length;
    }
    renderCard();
  }

  function refresh(mode) {
    buildOrder();
    if (mode !== "browse") renderCard();
    updateStats();
    if (state.mode === "browse") renderTable();
  }

  function renderTable() {
    var query = els.search.value.trim().toLowerCase();
    els.body.innerHTML = "";
    var shown = 0;
    currentDeck().forEach(function (word) {
      var haystack = (word.lemma + " " + word.translit + " " + word.gloss + " " + word.meaning).toLowerCase();
      if (query && haystack.indexOf(query) === -1) return;
      shown += 1;
      var tr = ST.el("tr", { class: isKnown(word) ? "known" : "" });
      var langClass = state.lang === "greek" ? "greek" : "hebrew";
      tr.appendChild(ST.el("td", { class: "lemma " + langClass, html: ST.escapeHTML(word.lemma) }));
      tr.appendChild(ST.el("td", { class: "muted", text: word.translit }));
      tr.appendChild(ST.el("td", { text: word.gloss, title: word.meaning }));
      tr.appendChild(ST.el("td", { class: "tag", text: word.morph }));
      tr.appendChild(ST.el("td", { class: "count", text: word.count.toLocaleString() }));
      var toggle = ST.el("button", { class: "ghost", style: "font-size:.74rem;padding:3px 8px", text: isKnown(word) ? "Learned" : "Know it" });
      toggle.addEventListener("click", function () {
        setKnown(word, !isKnown(word));
        refresh("browse");
      });
      tr.appendChild(ST.el("td", {}, [toggle]));
      els.body.appendChild(tr);
    });
    if (!shown) {
      els.body.appendChild(ST.el("tr", {}, [ST.el("td", { colspan: "6", class: "muted center", text: "No words match that search." })]));
    }
  }

  function setPressed(container, attr, value) {
    container.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-" + attr) === value ? "true" : "false");
    });
  }

  function loadLanguage(lang) {
    state.lang = lang;
    if (state.decks[lang]) {
      refresh();
      return;
    }
    els.word.textContent = "Loading…";
    ST.loadJSON(ST.siteRoot() + "data/vocab/" + lang + ".json").then(function (data) {
      state.decks[lang] = data.words;
      state.streak = 0;
      refresh();
      document.title = (lang === "greek" ? "Biblical Greek" : "Biblical Hebrew") + " Flashcards — StudyTools";
    }).catch(function () {
      els.word.textContent = "Could not load vocabulary";
      els.translit.textContent = "Serve this folder over HTTP so the JSON data can be fetched.";
    });
  }

  function bind() {
    document.getElementById("lang-seg").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      setPressed(this, "lang", btn.getAttribute("data-lang"));
      state.streak = 0;
      loadLanguage(btn.getAttribute("data-lang"));
    });

    document.getElementById("mode-seg").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      setPressed(this, "mode", btn.getAttribute("data-mode"));
      state.mode = btn.getAttribute("data-mode");
      els.quizView.classList.toggle("hidden", state.mode !== "quiz");
      els.browseView.classList.toggle("hidden", state.mode !== "browse");
      refresh(state.mode);
    });

    els.reveal.addEventListener("click", function () {
      state.revealed = true;
      renderCard();
    });

    document.getElementById("known").addEventListener("click", function () {
      var word = currentWord();
      if (word) setKnown(word, true);
      state.streak += 1;
      nextCard();
      updateStats();
    });

    document.getElementById("again").addEventListener("click", function () {
      var word = currentWord();
      if (word) setKnown(word, false);
      state.streak = 0;
      nextCard();
      updateStats();
    });

    document.getElementById("skip").addEventListener("click", function () {
      state.streak = 0;
      nextCard();
      updateStats();
    });

    document.getElementById("deck").addEventListener("change", function () {
      state.deck = this.value;
      refresh(state.mode);
    });

    document.getElementById("direction").addEventListener("change", function () {
      state.direction = this.value;
      refresh(state.mode);
    });

    document.getElementById("reset-progress").addEventListener("click", function () {
      if (!window.confirm("Clear all known-word progress?")) return;
      state.progress = {};
      ST.store(PROGRESS_KEY, state.progress);
      refresh(state.mode);
    });

    els.search.addEventListener("input", renderTable);

    document.getElementById("mark-visible").addEventListener("click", function () {
      var query = els.search.value.trim().toLowerCase();
      var words = currentDeck().filter(function (word) {
        if (!query) return true;
        return (word.lemma + " " + word.translit + " " + word.gloss + " " + word.meaning).toLowerCase().indexOf(query) !== -1;
      });
      words.forEach(function (w) { setKnown(w, true); });
      refresh("browse");
    });

    document.addEventListener("keydown", function (e) {
      if (state.mode !== "quiz" || document.activeElement.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!state.revealed) { state.revealed = true; renderCard(); }
      } else if (state.revealed && (e.key === "k" || e.key === "ArrowRight")) {
        document.getElementById("known").click();
      } else if (state.revealed && (e.key === "l" || e.key === "ArrowLeft")) {
        document.getElementById("again").click();
      }
    });
  }

  bind();
  updateStats();
  loadLanguage("greek");
})();
