/* Bible reader: pick a book, a chapter, and one of the translations the site
   ships. Translations are grouped by canon so the full Bible (the texts that
   carry the Apocrypha) is an explicit option. Depends on js/common.js. */
(function () {
  "use strict";

  var STORE_KEY = "bible-translation.v1";

  var els = {
    book: document.getElementById("book"),
    chapter: document.getElementById("chapter"),
    prev: document.getElementById("prev"),
    next: document.getElementById("next"),
    reader: document.getElementById("reader"),
    picker: document.getElementById("translation-picker")
  };

  var books = [];
  var bySlug = {};
  var translations = [];
  /* stubModel / stubQuestion come from ?fakeModel= and ?askStub=, read at load
     because the reader rewrites its own query string afterwards. They exist so
     the page can be checked without a GPU; nothing else uses them. */
  var state = { book: null, chapter: 1, tr: null, pendingVerse: null,
                stubModel: false, stubQuestion: null };
  var lastChapter = {};            /* the chapter on screen, for the panel's actions */
  var notes = ST.store(STNotes.STORE_KEY) || {};   /* what the reader has written */

  /* A note belongs to book, chapter and verse; the margin marks the ones that
     have one. Kept in the same store the Notes app reads, so either can write. */
  function saveNote(k, text) {
    notes = STNotes.put(notes, k, text);
    ST.store(STNotes.STORE_KEY, notes);
    markNoted();
  }

  function markNoted() {
    var chapterNotes = STNotes.forChapter(notes, state.book, state.chapter);
    var rows = document.querySelectorAll(".verse-block.tappable");
    for (var i = 0; i < rows.length; i++) {
      var verse = Number(rows[i].id.replace(/^v/, ""));
      rows[i].classList.toggle("has-note", !!chapterNotes[verse]);
    }
  }

  /* ---------- the verse panel ----------
     Tapping a verse opens what this site already holds on it: the same verse in
     each translation, the cross-references the church has drawn to it, the Greek
     behind it (New Testament), and the places the Prayer Book reads it. Every
     part comes from one of the site's own files — nothing is fetched from
     anywhere else and nothing is sent anywhere. From there a verse can be
     studied further, copied, or sent to the memory deck. */

  var panelEl = null;
  var panelVerse = null;
  var readingIndexPromise = null;

  function ensurePanel() {
    if (panelEl) { return panelEl; }
    panelEl = document.createElement("aside");
    panelEl.id = "verse-panel";
    panelEl.className = "verse-panel";
    panelEl.hidden = true;
    panelEl.setAttribute("aria-label", "Study this verse");
    panelEl.innerHTML =
      '<div class="vp-head">' +
        '<div style="min-width:0">' +
          '<div class="vp-ref serif" id="vp-ref">\u2014</div>' +
          '<div class="muted small" id="vp-sub"></div>' +
        '</div>' +
        '<button type="button" class="ghost vp-close" id="vp-close" aria-label="Close the verse panel">\u00d7</button>' +
      '</div>' +
      '<div class="vp-body" id="vp-body"></div>';
    document.body.appendChild(panelEl);
    document.getElementById("vp-close").addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panelEl && !panelEl.hidden) { closePanel(); }
    });
    return panelEl;
  }

  function closePanel() {
    if (!panelEl || panelEl.hidden) { return; }
    panelEl.hidden = true;
    if (panelVerse) {
      var row = document.getElementById("v" + panelVerse);
      if (row) { row.setAttribute("aria-expanded", "false"); row.classList.remove("open"); }
    }
    panelVerse = null;
  }

  function togglePanel(verse) {
    if (panelEl && !panelEl.hidden && panelVerse === verse) { closePanel(); return; }
    openPanel(verse);
  }

  function refText(to) {
    var b = bySlug[to.book];
    var name = b ? b.name : to.book;
    var out = name + " " + to.chapter;
    if (to.verseStart) {
      out += ":" + to.verseStart + (to.verseEnd && to.verseEnd !== to.verseStart ? "-" + to.verseEnd : "");
    }
    return out;
  }

  /* the whole index of where the Prayer Book reads each chapter, built once */
  function readingIndex() {
    if (!readingIndexPromise) {
      readingIndexPromise = ST.loadJSON(ST.siteRoot() + "data/liturgical/bcp1928-daily.json")
        .then(function (daily) { return STLiturgy.readingIndex(daily, ST.parseRef); })
        .catch(function () { return {}; });
    }
    return readingIndexPromise;
  }

  function panelSection(title) {
    var s = document.createElement("section");
    s.className = "vp-section";
    var h = document.createElement("h4");
    h.textContent = title;
    s.appendChild(h);
    return s;
  }

  function wordChip(w) {
    var chip = document.createElement("span");
    chip.className = "word";
    chip.title = (w.l || "") + (w.m ? " \u00b7 " + w.m : "") + (w.s ? " \u00b7 " + w.s : "");
    var g = document.createElement("span");
    g.className = "g";
    g.textContent = w.g || w.t || "";
    chip.appendChild(g);
    var t = document.createElement("span");
    t.className = "t";
    t.textContent = w.t || "";
    chip.appendChild(t);
    if (w.e) {
      var gloss = document.createElement("a");
      gloss.className = "e";
      gloss.textContent = w.e;
      if (/^[A-Za-z][A-Za-z-]*$/.test(w.e)) {
        gloss.href = ST.siteRoot() + "apps/dictionary/?term=" + encodeURIComponent(w.e);
        gloss.title = "Look up \"" + w.e + "\" in the dictionaries";
      }
      chip.appendChild(gloss);
    }
    return chip;
  }

  function openPanel(verse) {
    var book = bySlug[state.book];
    if (!book) { return; }
    var slug = state.book, chapter = state.chapter;
    var verseText = (lastChapter[String(verse)] || "");
    var label = book.name + " " + chapter + ":" + verse;

    ensurePanel();
    panelEl.hidden = false;
    panelVerse = verse;
    var row = document.getElementById("v" + verse);
    if (row) { row.setAttribute("aria-expanded", "true"); row.classList.add("open"); }
    document.getElementById("vp-ref").textContent = label;
    document.getElementById("vp-sub").textContent = "Loading\u2026";
    var body = document.getElementById("vp-body");
    body.innerHTML = "";

    if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches &&
        row && row.scrollIntoView) {
      row.scrollIntoView({ block: "center" });
    }

    var root = ST.siteRoot();
    var translationsP = ST.loadTranslations().then(function (list) {
      return Promise.all((list || []).map(function (t) {
        return ST.loadTranslation(slug, t.id).then(function (data) {
          return { t: t, text: ((data.chapters || {})[String(chapter)] || {})[String(verse)] || null };
        }).catch(function () { return { t: t, text: null }; });
      }));
    });
    var crossrefP = ST.loadJSON(root + "data/crossref/" + slug + "/" + chapter + ".json")
      .catch(function () { return { refs: [] }; });
    var wordsP = ST.loadJSON(root + "data/interlinear/" + slug + "/" + chapter + ".json")
      .catch(function () { return null; });
    var readingsP = readingIndex().then(function (index) {
      return STLiturgy.readingsFor(index, slug, chapter, verse);
    });

    Promise.all([translationsP, crossrefP, wordsP, readingsP]).then(function (loaded) {
      if (panelVerse !== verse) { return; }            /* the reader moved on */
      var versions = loaded[0];
      var refs = ((loaded[1] || {}).refs || [])
        .filter(function (r) { return r.from === verse; })
        .sort(function (a, b) { return b.votes - a.votes; })
        .slice(0, 12);
      var interlinear = loaded[2];
      var readings = loaded[3];

      document.getElementById("vp-sub").textContent =
        ST.translationSub(translationById(state.tr)) + " \u00b7 " + book.name + " " + chapter;

      /* the same verse in each translation — translations with their own
         numbering stay out of this, because their verse 5 is not this verse 5 */
      var comparable = versions.filter(function (v) { return !STVersification.isVulgate(v.t); });
      var versionsSection = panelSection("The same verse in each translation");
      comparable.forEach(function (v) {
        if (!v.text) { return; }
        var item = document.createElement("div");
        item.className = "vp-version";
        var who = document.createElement("div");
        who.className = "who";
        who.textContent = v.t.name + (v.t.id === state.tr ? " \u00b7 reading now" : "");
        item.appendChild(who);
        var text = document.createElement("div");
        text.className = "what serif";
        text.textContent = v.text;
        item.appendChild(text);
        versionsSection.appendChild(item);
      });
      if (versions.length !== comparable.length) {
        versionsSection.appendChild(ST.el("p", { class: "muted small", style: "margin:8px 0 0",
          text: "The Douay-Rheims is not shown here: it keeps the Vulgate's numbering, so its verses do not line up with these. Open it in the reader to read it in its own." }));
      }
      body.appendChild(versionsSection);

      /* the cross-references the church has drawn to this verse */
      if (refs.length) {
        var xSection = panelSection("Cross-references");
        var list = document.createElement("ul");
        list.className = "vp-xrefs";
        refs.forEach(function (r) {
          var text = refText(r.to);
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = root + "apps/matrix/?ref=" + encodeURIComponent(text);
          a.textContent = text;
          li.appendChild(a);
          var votes = document.createElement("span");
          votes.className = "votes";
          votes.textContent = r.votes + (r.votes === 1 ? " vote" : " votes");
          li.appendChild(votes);
          var read = document.createElement("a");
          read.className = "go";
          read.href = root + "apps/bible/?ref=" + encodeURIComponent(text);
          read.textContent = "read\u2009\u2192";
          li.appendChild(read);
          list.appendChild(li);
        });
        xSection.appendChild(list);
        body.appendChild(xSection);
      }

      /* the words behind it, where the site has them */
      var words = interlinear && interlinear.verses ? interlinear.verses[String(verse)] : null;
      if (words && words.length) {
        var wSection = panelSection("The words behind it");
        var wrap = document.createElement("div");
        wrap.className = "vp-words";
        words.forEach(function (w) { wrap.appendChild(wordChip(w)); });
        wSection.appendChild(wrap);
        wSection.appendChild(ST.el("p", { class: "muted small", style: "margin:6px 0 0",
          text: "Greek from OpenGNT; hover a word for its lemma and parsing." }));
        body.appendChild(wSection);
      }

      /* where the Prayer Book reads it */
      if (readings.length) {
        var rSection = panelSection("Read in the Prayer Book (1928)");
        var rList = document.createElement("ul");
        rList.className = "vp-readings";
        readings.slice(0, 8).forEach(function (h) {
          var li = document.createElement("li");
          var where = h.where;
          var fixed = /^(.*) \((\d\d)-(\d\d)\)$/.exec(where);
          var movable = /^(.*) \(Easter (\u2212|\+)(\d+)\)$/.exec(where);
          if (fixed || movable) {
            var year = new Date().getFullYear();
            var iso;
            if (fixed) {
              iso = year + "-" + fixed[2] + "-" + fixed[3];
            } else {
              var sign = movable[2] === "\u2212" ? -1 : 1;
              var d = STLiturgy.easter(year);
              d.setDate(d.getDate() + sign * Number(movable[3]));
              iso = STLiturgy.iso(d);
            }
            var a = document.createElement("a");
            a.href = root + "apps/calendar/?date=" + iso;
            a.textContent = fixed ? ST.titleCase(fixed[1]) : movable[1];
            li.appendChild(a);
            li.appendChild(document.createTextNode(" \u00b7 " + ST.titleCase(h.slot) +
              " " + h.kind + " \u00b7 " + iso));
          } else {
            li.appendChild(document.createTextNode(ST.titleCase(where) + " \u00b7 " +
              ST.titleCase(h.slot) + " " + h.kind));
          }
          rList.appendChild(li);
        });
        rSection.appendChild(rList);
        body.appendChild(rSection);
      }

      /* a note on this verse, kept with every other note the site holds */
      var noteKey = STNotes.key(state.book, chapter, verse);
      var existing = STNotes.get(notes, noteKey);
      var noteBox = panelSection("Your note");
      var area = document.createElement("textarea");
      area.className = "note-area";
      area.rows = 4;
      area.value = existing ? existing.text : "";
      area.placeholder = "What do you want to remember about this verse?";
      noteBox.appendChild(area);
      var noteRow = ST.el("div", { class: "row", style: "margin-top:8px" });
      var noteStatus = ST.el("span", { class: "muted small" });
      var save = ST.el("button", { type: "button", text: "Save note" });
      save.addEventListener("click", function () {
        saveNote(noteKey, area.value);
        noteStatus.textContent = area.value.trim() ? "Saved " + label + "." : "Note removed.";
        setTimeout(function () { noteStatus.textContent = ""; }, 4000);
      });
      noteRow.appendChild(save);
      if (existing) {
        var drop = ST.el("button", { type: "button", class: "ghost", text: "Delete" });
        drop.addEventListener("click", function () {
          notes = STNotes.remove(notes, noteKey);
          ST.store(STNotes.STORE_KEY, notes);
          markNoted();
          area.value = "";
          noteStatus.textContent = "Note removed.";
        });
        noteRow.appendChild(drop);
      }
      noteBox.appendChild(noteRow);
      noteBox.appendChild(noteStatus);
      noteBox.appendChild(ST.el("p", { class: "muted small", style: "margin:6px 0 0" }, [
        document.createTextNode("Notes stay in this browser. "),
        ST.el("a", { href: ST.siteRoot() + "apps/notes/", text: "Open all your notes \u2192" })
      ]));
      body.appendChild(noteBox);

      /* what to do with it next */
      var actions = document.createElement("div");
      actions.className = "vp-actions";
      var study = document.createElement("a");
      study.className = "btn secondary";
      study.href = root + "apps/study/?ref=" + encodeURIComponent(label);
      study.textContent = "Study this passage \u2192";
      actions.appendChild(study);
      var memorize = document.createElement("button");
      memorize.type = "button";
      memorize.className = "ghost";
      memorize.textContent = "Memorize this verse";
      memorize.addEventListener("click", function () {
        memorizeVerse(label, verseText, state.tr);
      });
      actions.appendChild(memorize);
      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "ghost";
      copy.textContent = "Copy";
      copy.addEventListener("click", function () {
        ST.copyText(verseText + " (" + label + ", " + state.tr + ")");
      });
      actions.appendChild(copy);
      body.appendChild(actions);

      /* Asking a local model about this verse. Off until the reader turns it
         on, told plainly what it costs and what it cannot do, and given the
         material assembled above so it has something to answer from. */
      body.appendChild(askSection({
        label: label,
        translations: comparable.filter(function (v) { return v.text; })
          .map(function (v) { return { name: v.t.name, text: v.text }; }),
        references: refs.map(function (r) { return { ref: refText(r.to), votes: r.votes }; }),
        words: (words || []).map(function (w) { return { g: w.g, t: w.t, e: w.e }; }),
        readings: readings.map(function (h) { return h.where + " \u00b7 " + h.slot + " " + h.kind; }),
        noteKey: noteKey
      }, label));
    }).catch(function () {
      body.innerHTML = "";
      body.appendChild(ST.el("p", { class: "notice error", text: "Could not load the verse's material." }));
    });
  }

  /* ---------- asking a local model ---------- */

  function askSection(context, label) {
    var section = panelSection("Ask about this verse");
    var stub = !!state.stubModel;

    var chosen = ST.store("ask-model.v1") || STAsk.MODELS[0].id;
    var picker = document.createElement("select");
    picker.className = "ask-picker";
    STAsk.MODELS.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label + " · " + m.size + " — " + m.note;
      picker.appendChild(o);
    });
    picker.value = chosen;

    var intro = ST.el("p", { class: "muted small", style: "margin:0 0 8px", text:
      "A model can read this verse with you \u2014 the text, the cross-references, the original words and " +
      "where the Prayer Book reads it are handed to it. It runs on your device: nothing you type is sent " +
      "anywhere. The first time, it downloads a model (" + STAsk.MODELS[0].size + " for the default) and " +
      "keeps it in your browser. " + STAsk.CAVEAT });

    var status = ST.el("p", { class: "muted small", style: "margin:8px 0 0" });
    var answer = ST.el("div", { class: "ask-thread" });      /* the conversation so far */
    var row = ST.el("div", { class: "row", style: "margin-top:8px" });

    /* The thread is kept so a follow-up question knows what came before. The
       material is sent with the first question only; after that the question is
       the question, and the passage stays in the history beside it. Ten turns
       are kept, which is as far back as a small model follows anyway. */
    var history = [];
    function addTurn(role, text) {
      var block = ST.el("div", { class: "ask-turn " + (role === "user" ? "ask-q" : "ask-a") });
      if (role === "user") {
        block.appendChild(ST.el("div", { class: "ask-who", text: "You" }));
      } else {
        block.appendChild(ST.el("div", { class: "ask-who", text: "The model" }));
      }
      var body = ST.el("div", { class: "ask-body serif", text: text });
      block.appendChild(body);
      answer.appendChild(block);
      block.scrollIntoView({ block: "nearest" });
      return body;
    }

    /* which kind of question: each one points the model at a different part of
       the material above, and fills the box in so it can be edited */
    var modePicker = document.createElement("select");
    modePicker.className = "ask-picker";
    STAsk.MODES.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      o.textContent = m.label;
      modePicker.appendChild(o);
    });
    var ownMode = document.createElement("option");
    ownMode.value = "own";
    ownMode.textContent = "My own question";
    modePicker.appendChild(ownMode);
    modePicker.value = STAsk.MODES[0].id;

    var question = document.createElement("input");
    question.value = STAsk.MODES[0].question;
    modePicker.addEventListener("change", function () {
      var mode = STAsk.modeById(modePicker.value);
      if (mode) { question.value = mode.question; }
      question.focus();
    });
    question.type = "text";
    question.className = "ask-question";
    question.placeholder = "What does this verse mean by \u201cworld\u201d?";
    row.appendChild(modePicker);
    row.appendChild(question);
    var askBtn = ST.el("button", { type: "button", text: "Ask" });
    var stopBtn = ST.el("button", { type: "button", class: "ghost hidden", text: "Stop" });
    row.appendChild(askBtn);
    row.appendChild(stopBtn);

    section.appendChild(intro);
    var gate = ST.el("p", { class: "muted small", text: "Checking whether this machine can run it\u2026" });
    section.appendChild(gate);

    var engine = null;
    var asking = false;
    var start = null;

    function cannotRun() {
      gate.remove();
      section.appendChild(ST.el("p", { class: "notice", text:
        "This machine has no WebGPU, which the model needs to run. Chrome, Edge, Safari 26 and Firefox 141 " +
        "on Windows have it; Chrome on Linux is still arriving. " }));
      section.appendChild(ST.el("p", { class: "muted small" }, [
        document.createTextNode("You can check your browser at "),
        ST.el("a", { href: "https://webgpureport.org/", rel: "noopener", text: "webgpureport.org" }),
        document.createTextNode(", and everything else on this page works without it.")
      ]));
    }

    function canRun() {
      gate.remove();
      section.appendChild(picker);
      start = ST.el("button", { type: "button", text: "Turn on the model" });
      section.appendChild(ST.el("div", { class: "row", style: "margin-top:8px" }, [start]));
      section.appendChild(status);
      start.addEventListener("click", turnOn);
      /* ?fakeModel=1 turns the stub on by itself, so the page can be checked
         without a GPU; it never runs on its own for a reader. */
      if (stub) { turnOn(); }
    }

    (stub ? Promise.resolve(true) : STAsk.detect()).then(function (ok) {
      if (ok) { canRun(); } else { cannotRun(); }
    });

    function turnOn() {
      chosen = picker.value;
      ST.store("ask-model.v1", chosen);
      picker.disabled = true;
      start.disabled = true;
      status.textContent = "Starting\u2026";
      STAsk.load(chosen, function (report) {
        if (report.text) { status.textContent = report.text; }
        else if (typeof report.progress === "number") {
          status.textContent = "Downloading and starting: " + Math.round(report.progress * 100) + "%";
        }
      }, stub).then(function (e) {
        engine = e;
        start.remove();
        picker.remove();
        section.appendChild(row);
        section.appendChild(answer);
        status.textContent = "The model is running on your device.";
        if (stub && state.stubQuestion) { askIt(state.stubQuestion); }
      }).catch(function (err) {
        status.textContent = "";
        section.appendChild(ST.el("p", { class: "notice error", text:
          "The model could not start: " + (err && err.message ? err.message : "unknown error") +
          ". Your browser may not have WebGPU, or the download may have been blocked." }));
      });
    }

    function askIt(text) {
      if (asking || !engine) { return; }
      var q = String(text || question.value || "").trim();
      if (!q) { return; }
      asking = true;
      stopBtn.classList.remove("hidden");
      askBtn.disabled = true;
      status.textContent = "Asking\u2026";
      question.value = "";
      addTurn("user", q);
      var answerBody = addTurn("model", "");

      history.push({ role: "user", content: history.length
        ? q
        : STAsk.contextBlock(context) + "\n\nQuestion: " + q });
      if (history.length > 20) { history = history.slice(-20); }

      var messages = STAsk.buildMessages(context, q, modePicker.value, history);
      STAsk.ask(engine, messages, function (piece, whole) {
        answerBody.textContent = whole;
      }).then(function (whole) {
        asking = false;
        askBtn.disabled = false;
        stopBtn.classList.add("hidden");
        status.textContent = "";
        history.push({ role: "assistant", content: whole });

        var save = ST.el("button", { type: "button", class: "ghost", style: "font-size:.76rem",
          text: "Save this answer as my note on " + label });
        save.addEventListener("click", function () {
          var existing = STNotes.textFor(notes, state.book, state.chapter, verseOfKey(context.noteKey));
          var addition = "Q: " + q + "\nA: " + whole;
          saveNote(context.noteKey, existing ? existing + "\n\n" + addition : addition);
          save.disabled = true;
          save.textContent = "Saved to your notes";
          ST.toast("Saved to your note on " + label);
        });
        var row2 = ST.el("div", { class: "row no-print", style: "margin-top:6px" }, [save]);
        var restart = ST.el("button", { type: "button", class: "ghost", style: "font-size:.76rem",
          text: "Start over" });
        restart.title = "Forget this conversation and ask something fresh";
        restart.addEventListener("click", function () {
          history = [];
          answer.innerHTML = "";
        });
        row2.appendChild(restart);
        answerBody.parentNode.appendChild(row2);

        if (!answer.querySelector(".ask-fineprint")) {
          answer.appendChild(ST.el("p", { class: "muted small ask-fineprint", style: "margin:6px 0 0",
            text: "It cannot verify anything it says. Check it against the text above before you use it." }));
        }
      }).catch(function (err) {
        asking = false;
        askBtn.disabled = false;
        stopBtn.classList.add("hidden");
        status.textContent = err && err.message ? err.message : "The model stopped.";
        if (answerBody && !answerBody.textContent) { answerBody.parentNode.remove(); }
      });
    }

    askBtn.addEventListener("click", function () { askIt(); });
    question.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); askIt(); }
    });
    askBtn.title = "Enter asks; ask again to follow up on the answer";
    stopBtn.addEventListener("click", function () {
      /* the model streams into the same engine; throwing the page away stops it */
      asking = false;
      askBtn.disabled = false;
      stopBtn.classList.add("hidden");
      status.textContent = "Stopped. Reload the page to start the model again.";
      STAsk.unload();
      engine = null;
    });
    return section;
  }

  function verseOfKey(key) {
    var parsed = STNotes.parseKey(key);
    return parsed ? parsed.verse : 0;
  }

  /* The memory deck's shape is set by apps/memory/app.js; a card is the same
     fields, so a verse memorized here turns up in the review queue there. */
  function memorizeVerse(ref, text, translation) {
    if (!text) { ST.toast("No text to memorize", true); return; }
    var deck = ST.store("memory-deck.v1") || [];
    var already = deck.some(function (c) { return c.ref === ref; });
    if (already) { ST.toast(ref + " is already in your memory deck"); return; }
    deck.push({
      id: "v" + Date.now() + Math.random().toString(36).slice(2, 6),
      ref: ref, text: text, translation: translation,
      reps: 0, ease: 2.5, interval: 0, due: Date.now(), added: Date.now()
    });
    ST.store("memory-deck.v1", deck);
    ST.toast(ref + " added to your memory deck");
  }

  function translationById(id) {
    for (var i = 0; i < translations.length; i++) {
      if (translations[i].id === id) return translations[i];
    }
    return null;
  }

  function availableFor(slug) {
    var b = bySlug[slug];
    if (b && b.translations && b.translations.length) return b.translations.slice();
    return translations.map(function (t) { return t.id; });
  }

  function inGroup(group) {
    if (group.deuterocanon) {
      return books.filter(function (b) { return b.deuterocanon; });
    }
    var out = [];
    group.slugs.forEach(function (slug) { if (bySlug[slug]) out.push(bySlug[slug]); });
    return out;
  }

  function flatBooks() {
    var out = [];
    ST.BOOK_GROUPS.forEach(function (g) {
      inGroup(g).forEach(function (b) { out.push(b); });
    });
    return out;
  }

  function indexOfSlug(order, slug) {
    for (var i = 0; i < order.length; i++) if (order[i].slug === slug) return i;
    return -1;
  }

  function notice(text, isError) {
    var el = document.createElement("div");
    el.className = "notice" + (isError ? " error" : "");
    el.textContent = text;
    return el;
  }

  function fillBooks() {
    els.book.innerHTML = "";
    ST.BOOK_GROUPS.forEach(function (group) {
      var list = inGroup(group);
      if (!list.length) return;
      var og = document.createElement("optgroup");
      og.label = group.label;
      list.forEach(function (b) {
        var o = document.createElement("option");
        o.value = b.slug;
        o.textContent = b.name;
        og.appendChild(o);
      });
      els.book.appendChild(og);
    });
  }

  function fillChapterList(list) {
    els.chapter.innerHTML = "";
    list.forEach(function (n) {
      var o = document.createElement("option");
      o.value = String(n);
      o.textContent = String(n);
      els.chapter.appendChild(o);
    });
    if (list.indexOf(state.chapter) > -1) { els.chapter.value = String(state.chapter); }
  }

  function fillChapters(slug) {
    var b = bySlug[slug];
    var total = b ? b.chapters : 1;
    var list = [];
    for (var i = 1; i <= total; i++) { list.push(i); }
    fillChapterList(list);
  }

  function renderPicker() {
    if (!els.picker) return;
    els.picker.innerHTML = "";
    var avail = availableFor(state.book);
    ST.translationGroups(translations).forEach(function (group) {
      var wrap = document.createElement("div");

      var label = document.createElement("div");
      label.className = "tr-group-label";
      label.textContent = group.label;
      wrap.appendChild(label);

      var row = document.createElement("div");
      row.className = "tr-choices";
      group.translations.forEach(function (t) {
        var has = avail.indexOf(t.id) !== -1;

        var input = document.createElement("input");
        input.type = "radio";
        input.name = "bible-tr";
        input.id = "tr-" + t.id;
        input.value = t.id;
        input.checked = t.id === state.tr;
        input.disabled = !has;
        input.addEventListener("change", function () {
          state.tr = t.id;
          ST.store(STORE_KEY, state.tr);
          load();
        });

        var lab = document.createElement("label");
        lab.className = "tr-choice";
        lab.setAttribute("for", "tr-" + t.id);
        lab.appendChild(input);
        var span = document.createElement("span");
        span.textContent = has ? t.name : t.name + " \u2014 not in this book";
        lab.appendChild(span);

        row.appendChild(lab);
      });
      wrap.appendChild(row);
      els.picker.appendChild(wrap);
    });
  }

  function syncUrl() {
    var q = "?book=" + encodeURIComponent(state.book) + "&chapter=" + state.chapter +
            "&tr=" + encodeURIComponent(state.tr);
    try { history.replaceState(null, "", q); } catch (e) { /* file:// */ }
  }

  function scrollToVerse() {
    if (!state.pendingVerse) return;
    var target = document.getElementById("v" + state.pendingVerse);
    state.pendingVerse = null;
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "center" });
  }

  function renderChapter(book, t, data) {
    var chapterData = (data.chapters || {})[String(state.chapter)] || {};

    var card = document.createElement("section");
    card.className = "card";

    var head = document.createElement("div");
    head.className = "chapter-head";
    var h2 = document.createElement("h2");
    h2.textContent = book.name + " " + state.chapter;
    head.appendChild(h2);
    var meta = document.createElement("span");
    meta.className = "muted small";
    meta.textContent = t.name + " \u00b7 " + ST.translationSub(t);
    head.appendChild(meta);
    card.appendChild(head);

    /* A translation with its own numbering says so here, and says what the
       chapter the reader is looking at is called in the other numbering. */
    if (STVersification.isVulgate(t)) {
      var psalmNote = "";
      if (book.slug === "psalms") {
        var hebrew = STVersification.hebrewPsalm(state.chapter, 1);
        if (hebrew) {
          psalmNote = " Its Psalm " + state.chapter + " is the Hebrew Psalm " + hebrew.chapter + ".";
        }
      }
      card.appendChild(notice("The " + t.name + " keeps the Vulgate's numbering: references below are its own." +
        psalmNote + " It is kept out of the side-by-side views, so that nothing is placed beside the wrong verse."));
    }
    if (state.refNote) { card.appendChild(notice(state.refNote)); }

    if (book.deuterocanon) {
      card.appendChild(notice("This is a deuterocanonical book. The World English Bible (Updated), the modernized King James Version and the modernized Revised Version carry the Apocrypha; the American Standard Version, Young's Literal Translation and the JPS Tanakh keep to the Hebrew and Greek canons, so they have no text here. The Jewish and Catholic traditions include slightly different books, so a few of these appear in only one or two translations."));
    }

    var nums = Object.keys(chapterData)
      .map(Number)
      .filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });

    if (!nums.length) {
      card.appendChild(notice("No text for this chapter in " + t.name + ".", true));
    } else {
      nums.forEach(function (n) {
        var row = document.createElement("div");
        row.className = "verse-block tappable";
        row.id = "v" + n;
        /* every verse opens the panel: tap it, or press Enter or Space */
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("aria-expanded", "false");
        row.setAttribute("aria-label", book.name + " " + state.chapter + ":" + n + " \u2014 study this verse");
        var num = document.createElement("span");
        num.className = "num";
        num.textContent = String(n);
        var p = document.createElement("p");
        p.textContent = chapterData[String(n)];
        row.appendChild(num);
        row.appendChild(p);
        row.addEventListener("click", function () { togglePanel(n); });
        row.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePanel(n); }
        });
        card.appendChild(row);
      });
    }
    lastChapter = chapterData;

    els.reader.innerHTML = "";
    els.reader.appendChild(card);
    markNoted();            /* after the verses are in the page */

    var nav = document.createElement("div");
    nav.className = "reader-nav no-print";
    var matrix = document.createElement("a");
    matrix.className = "btn secondary";
    matrix.href = ST.siteRoot() + "apps/matrix/?ref=" + encodeURIComponent(book.name + " " + state.chapter);
    matrix.textContent = "Compare translations \u2192";
    nav.appendChild(matrix);
    var print = document.createElement("button");
    print.type = "button";
    print.className = "ghost";
    print.textContent = "Print";
    print.addEventListener("click", function () { window.print(); });
    nav.appendChild(print);
    els.reader.appendChild(nav);

    document.title = book.name + " " + state.chapter + " \u2014 Read the Bible";
    syncUrl();
    scrollToVerse();
    if (state.pendingPanel) {
      var verse = state.pendingPanel;
      state.pendingPanel = null;
      openPanel(verse);
    }
  }

  function load() {
    var book = bySlug[state.book];
    if (!book) return;
    var avail = availableFor(state.book);
    if (avail.indexOf(state.tr) === -1) state.tr = avail[0];
    var t = translationById(state.tr);
    if (!t) return;
    renderPicker();

    ST.loadTranslation(state.book, state.tr).then(function (data) {
      /* A translation with its own numbering may have a different number of
         chapters (the Vulgate's Daniel and Esther run longer); the dropdown is
         rebuilt from the file's own chapters so the reader never offers one the
         text does not have. */
      var chapters = Object.keys(data.chapters || {}).map(Number).sort(function (a, b) { return a - b; });
      if (chapters.length && chapters.length !== els.chapter.options.length) {
        fillChapterList(chapters);
      }
      renderChapter(book, t, data);
    }).catch(function () {
      els.reader.innerHTML = "";
      els.reader.appendChild(notice("Could not load that chapter. If you opened this file directly, serve the folder over HTTP.", true));
    });
  }

  function updateNavButtons() {
    var order = flatBooks();
    var idx = indexOfSlug(order, state.book);
    var book = order[idx];
    els.prev.disabled = idx <= 0 && state.chapter <= 1;
    els.next.disabled = !!book && idx === order.length - 1 && state.chapter >= book.chapters;
  }

  function go(slug, chapter, verse) {
    if (!bySlug[slug]) return;
    state.book = slug;
    state.chapter = chapter || 1;
    state.pendingVerse = verse || null;
    els.book.value = slug;
    fillChapters(slug);
    els.chapter.value = String(state.chapter);
    updateNavButtons();
    load();
  }

  function step(delta) {
    var order = flatBooks();
    var idx = indexOfSlug(order, state.book);
    if (idx === -1) return;
    var book = order[idx];
    var ch = state.chapter + delta;
    if (ch < 1) {
      if (idx === 0) return;
      book = order[idx - 1];
      ch = book.chapters;
    } else if (ch > book.chapters) {
      if (idx === order.length - 1) return;
      book = order[idx + 1];
      ch = 1;
    }
    go(book.slug, ch);
  }

  function init() {
    var stored = ST.store(STORE_KEY);

    Promise.all([ST.loadBooks(), ST.loadTranslations()]).then(function (loaded) {
      books = loaded[0] || [];
      translations = loaded[1] || [];
      bySlug = {};
      books.forEach(function (b) { bySlug[b.slug] = b; });
      fillBooks();

      var start = { book: "john", chapter: 1, verse: null };
      var ref = ST.qs("ref");
      if (ref) {
        var parsed = ST.parseRef(ref);
        if (parsed && bySlug[parsed.book]) {
          start.book = parsed.book;
          start.chapter = parsed.chapter;
          start.verse = parsed.verseStart;
        }
      }
      var qb = ST.qs("book");
      if (qb && bySlug[qb]) {
        start.book = qb;
        start.chapter = parseInt(ST.qs("chapter"), 10) || 1;
        start.verse = parseInt(ST.qs("verse"), 10) || null;
      }

      var qpanel = parseInt(ST.qs("panel"), 10);
      if (qpanel > 0) { start.verse = qpanel; state.pendingPanel = qpanel; }

      state.stubModel = !!ST.qs("fakeModel");
      state.stubQuestion = ST.qs("askStub");

      var qtr = ST.qs("tr");
      if (qtr && translationById(qtr)) state.tr = qtr;
      else if (stored && translationById(stored)) state.tr = stored;
      if (!state.tr) state.tr = availableFor(start.book)[0] || (translations[0] && translations[0].id);

      /* A link into a translation with its own numbering is read in that
         numbering: ask for Psalm 23 in the Douay-Rheims and it opens its
         Psalm 22, saying so. */
      if (start.verse !== null && start.verse !== undefined && start.verse !== false &&
          STVersification.isVulgate(translationById(state.tr))) {
        var mapped = STVersification.mapReference({
          book: start.book, chapter: start.chapter,
          verseStart: start.verse, verseEnd: start.verse
        }, "masoretic", "vulgate");
        if (mapped.mapped) {
          start.book = mapped.parsed.book;
          start.chapter = mapped.parsed.chapter;
          start.verse = mapped.parsed.verseStart;
          state.refNote = mapped.note;
        }
      }

      go(start.book, start.chapter, start.verse);
    }).catch(function () {
      els.reader.appendChild(notice("Could not load the Bible index. Serve the folder over HTTP instead of opening the file directly.", true));
    });

    els.book.addEventListener("change", function () { go(els.book.value, 1); });
    els.chapter.addEventListener("change", function () { go(state.book, parseInt(els.chapter.value, 10) || 1); });
    els.prev.addEventListener("click", function () { step(-1); });
    els.next.addEventListener("click", function () { step(1); });
  }

  init();
})();
