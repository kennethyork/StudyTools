(function () {
  "use strict";

  var DECK_KEY = "memory-deck.v1";
  var DAY = 86400000;

  /* Simplified SM-2 style SRS.
     grade: 0 = forgot, 1 = hard, 2 = good, 3 = easy */
  var GRADE = {
    forgot: { quality: 0, label: "Forgot", sub: "10 min" },
    hard: { quality: 2, label: "Hard", sub: "soon" },
    good: { quality: 3, label: "Good", sub: "on track" },
    easy: { quality: 5, label: "Easy", sub: "longer" }
  };

  var deck = ST.store(DECK_KEY) || [];
  var session = { active: false, card: null, mode: "read" };

  var els = {
    addRef: document.getElementById("add-ref"),
    addText: document.getElementById("add-text"),
    addStatus: document.getElementById("add-status"),
    loadVerse: document.getElementById("load-verse"),
    translation: document.getElementById("add-translation"),
    addVerse: document.getElementById("add-verse"),
    queue: document.getElementById("queue"),
    reviewArea: document.getElementById("review-area"),
    exportDeck: document.getElementById("export-deck")
  };

  function save() { ST.store(DECK_KEY, deck); }

  function dueCards() {
    var now = Date.now();
    return deck.filter(function (c) { return c.due <= now; }).sort(function (a, b) { return a.due - b.due; });
  }

  function nextDueText(card) {
    var diff = card.due - Date.now();
    if (diff <= 0) return "due now";
    var days = Math.ceil(diff / DAY);
    return days === 1 ? "due tomorrow" : "due in " + days + " days";
  }

  function renderQueue() {
    var now = Date.now();
    els.queue.innerHTML = "";
    if (!deck.length) {
      els.queue.appendChild(ST.el("p", { class: "muted small", text: "No verses yet. Add one on the left, or load a reference's text with one click." }));
      return;
    }
    var sorted = deck.slice().sort(function (a, b) { return a.due - b.due; });
    sorted.forEach(function (card) {
      var overdue = card.due <= now;
      var item = ST.el("div", { class: "queue-item" }, [
        ST.el("div", {}, [
          ST.el("div", { style: "font-weight:600", text: card.ref }),
          ST.el("div", { class: "muted", style: "font-size:.78rem", text: card.translation + " · reps " + card.reps + " · ease " + card.ease.toFixed(2) })
        ]),
        ST.el("div", { class: "due" + (overdue ? " overdue" : ""), text: nextDueText(card) })
      ]);
      var remove = ST.el("button", { class: "ghost", style: "font-size:.7rem;padding:1px 7px", text: "×", title: "Remove verse",
        onclick: function () {
          if (!window.confirm("Remove " + card.ref + " from your deck?")) return;
          deck = deck.filter(function (c) { return c.id !== card.id; });
          save();
          renderQueue();
          renderReview();
        } });
      item.appendChild(remove);
      els.queue.appendChild(item);
    });
  }

  function renderReview() {
    if (session.active && session.card) { renderCard(); return; }
    var due = dueCards();
    els.reviewArea.innerHTML = "";
    if (!deck.length) {
      els.reviewArea.appendChild(ST.el("div", { class: "empty-state" }, [
        ST.el("p", { class: "serif", style: "font-size:1.2rem;margin:0 0 6px", text: "Your memory deck is empty" }),
        ST.el("p", { class: "small", text: "Add verses on the left and they will appear here for review." })
      ]));
      return;
    }
    if (!due.length) {
      var soonest = deck.slice().sort(function (a, b) { return a.due - b.due; })[0];
      els.reviewArea.appendChild(ST.el("div", { class: "empty-state" }, [
        ST.el("p", { class: "serif", style: "font-size:1.2rem;margin:0 0 6px", text: "All caught up" }),
        ST.el("p", { class: "small", text: "Nothing is due right now. Next review: " + soonest.ref + " " + nextDueText(soonest) + "." })
      ]));
      return;
    }
    var preview = ST.el("div", {}, [
      ST.el("h2", { class: "serif", style: "margin:0 0 6px;font-size:1.2rem", text: due.length + (due.length === 1 ? " verse due" : " verses due") }),
      ST.el("p", { class: "muted small", text: "Review them now, or keep going about your day and come back." })
    ]);
    var start = ST.el("button", { text: "Start review" });
    start.addEventListener("click", function () {
      session.active = true;
      session.card = due[0];
      session.mode = "read";
      renderCard();
    });
    preview.appendChild(ST.el("div", { style: "margin-top:16px" }, [start]));
    els.reviewArea.appendChild(preview);
  }

  function maskText(text, fraction) {
    var words = text.split(/\s+/);
    var show = Math.ceil(words.length * fraction);
    return words.map(function (w, i) {
      if (i < show) return ST.escapeHTML(w);
      return '<span class="blank">' + ST.escapeHTML(w) + "</span>";
    }).join(" ");
  }

  function renderCard() {
    var card = session.card;
    els.reviewArea.innerHTML = "";
    els.reviewArea.appendChild(ST.el("div", { class: "row", style: "justify-content:space-between" }, [
      ST.el("span", { class: "pill", text: "Rep " + (card.reps + 1) + " · " + card.translation }),
      ST.el("button", { class: "ghost", style: "font-size:.76rem", text: "Stop", onclick: endSession })
    ]));
    els.reviewArea.appendChild(ST.el("div", { class: "review-ref", style: "margin-top:10px", text: card.ref }));

    if (session.mode === "read") {
      els.reviewArea.appendChild(ST.el("div", { class: "review-text", text: card.text }));
      var gradeRow = ST.el("div", { class: "grade-row no-print", style: "margin-top:auto" });
      Object.keys(GRADE).forEach(function (key) {
        var g = GRADE[key];
        var b = ST.el("button", { class: gradeButtonClass(key) }, [
          document.createTextNode(g.label),
          ST.el("small", { text: g.sub })
        ]);
        b.addEventListener("click", function () { grade(key); });
        gradeRow.appendChild(b);
      });
      els.reviewArea.appendChild(gradeRow);
    } else if (session.mode === "blur") {
      els.reviewArea.appendChild(ST.el("div", { class: "review-text blurred", text: card.text }));
      var show = ST.el("button", { text: "Show verse" });
      show.addEventListener("click", function () { session.mode = "read"; renderCard(); });
      var tap = ST.el("p", { class: "muted small", style: "margin-top:auto", text: "Try to say it from memory, then reveal." });
      els.reviewArea.appendChild(ST.el("div", { class: "row", style: "margin-top:auto" }, [show]));
      els.reviewArea.appendChild(tap);
    } else {
      var fraction = [0.34, 0.5, 0.67, 0.9][Math.min(card.reps, 3)];
      els.reviewArea.appendChild(ST.el("div", { class: "blanks", html: maskText(card.text, fraction) }));
      var reveal = ST.el("button", { text: "Show full verse" });
      reveal.addEventListener("click", function () { session.mode = "read"; renderCard(); });
      els.reviewArea.appendChild(ST.el("div", { class: "row", style: "margin-top:auto" }, [reveal]));
    }
  }

  function gradeButtonClass(key) {
    if (key === "forgot") return "danger";
    if (key === "hard") return "secondary";
    if (key === "easy") return "ghost";
    return "";
  }

  function grade(key) {
    var card = session.card;
    var g = GRADE[key];
    var q = g.quality;
    var ease = card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ease = Math.max(1.3, Math.min(2.8, ease));

    var intervalDays;
    if (q < 3) {
      card.reps = 0;
      intervalDays = q === 0 ? 1 / 144 : 0.5; // 10 minutes for a lapse
    } else {
      card.reps += 1;
      if (card.reps === 1) intervalDays = 1;
      else if (card.reps === 2) intervalDays = 3;
      else intervalDays = Math.round(card.interval * ease);
      if (key === "easy") intervalDays = Math.round(intervalDays * 1.3);
    }
    intervalDays = Math.min(intervalDays, 365);

    card.ease = ease;
    card.interval = intervalDays;
    card.due = Date.now() + intervalDays * DAY;
    card.lastGrade = key;
    save();

    session.card = dueCards().filter(function (c) { return c.id !== card.id; })[0] || null;
    if (!session.card) {
      session.active = false;
      renderQueue();
      renderReview();
      ST.toast("Review complete");
    } else {
      session.mode = "read";
      renderCard();
    }
    renderQueue();
  }

  function endSession() {
    session.active = false;
    session.card = null;
    renderReview();
  }

  function addVerse() {
    var ref = els.addRef.value.trim();
    var text = els.addText.value.trim();
    if (!ref || !text) { ST.toast("A reference and verse text are required", true); return; }
    if (deck.some(function (c) { return c.ref.toLowerCase() === ref.toLowerCase(); })) {
      ST.toast("That reference is already in your deck", true);
      return;
    }
    deck.push({
      id: "v" + Date.now() + Math.random().toString(36).slice(2, 6),
      ref: ref,
      text: text,
      translation: els.translation.value,
      reps: 0,
      ease: 2.5,
      interval: 0,
      due: Date.now(),
      added: Date.now()
    });
    save();
    els.addRef.value = "";
    els.addText.value = "";
    els.addStatus.textContent = "Added";
    renderQueue();
    renderReview();
    ST.toast("Verse added");
  }

  function loadVerseText() {
    var parsed = ST.parseRef(els.addRef.value);
    if (!parsed) { ST.toast("Enter a reference like John 3:16", true); return; }
    els.addStatus.textContent = "Loading…";
    ST.loadTranslation(parsed.book, els.translation.value).then(function (data) {
      var chapter = data.chapters[String(parsed.chapter)];
      if (!chapter) throw new Error("no chapter");
      var parts = [];
      if (parsed.verseStart) {
        for (var v = parsed.verseStart; v <= parsed.verseEnd; v++) {
          if (chapter[String(v)]) parts.push(chapter[String(v)]);
        }
      } else {
        Object.keys(chapter).map(Number).sort(function (a, b) { return a - b; }).forEach(function (v) {
          parts.push(chapter[String(v)]);
        });
      }
      if (!parts.length) throw new Error("no verses");
      els.addText.value = parts.join(" ");
      els.addStatus.textContent = "Loaded from " + els.translation.value;
    }).catch(function () {
      els.addStatus.textContent = "";
      ST.toast("Could not load that passage", true);
    });
  }

  function exportDeck() {
    if (!deck.length) { ST.toast("Nothing to export", true); return; }
    var md = "# Scripture Memory Deck\n\n";
    deck.slice().sort(function (a, b) { return a.due - b.due; }).forEach(function (card) {
      md += "## " + card.ref + " (" + card.translation + ")\n\n" + card.text + "\n\nNext review: " + new Date(card.due).toLocaleDateString() + "\n\n";
    });
    ST.download("scripture-memory.md", md, "text/markdown;charset=utf-8");
  }

  function init() {
    els.addVerse.addEventListener("click", addVerse);
    els.loadVerse.addEventListener("click", loadVerseText);
    els.exportDeck.addEventListener("click", exportDeck);
    els.addRef.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); loadVerseText(); } });
    renderQueue();
    renderReview();
  }

  init();
})();
