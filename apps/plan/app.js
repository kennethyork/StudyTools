/* Reading Plan: the whole Bible, the New Testament, or the Old Testament, on a
   plan worked out from the books this site carries (js/plan.js). Tick a day when
   you have read it; the ticks live in localStorage under studytools.* and
   nothing leaves the browser. Depends on js/common.js and js/plan.js. */
(function () {
  "use strict";

  var STORE = "reading-plan.v1";
  var MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
  var DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var els = {
    plan: document.getElementById("plan"),
    start: document.getElementById("start"),
    tr: document.getElementById("tr"),
    reset: document.getElementById("reset"),
    head: document.getElementById("progress-head"),
    sub: document.getElementById("progress-sub"),
    fill: document.getElementById("progress-fill"),
    days: document.getElementById("days"),
    card: document.getElementById("day-card")
  };

  var books = [];
  var translations = [];
  var plan = null;                 /* the built plan: an array of days of chapters */
  /* pick: a day asked for by ?date=, taken once the plan is built */
  var state = { id: "bible", start: ST.todayISO(), tr: "WEBU", done: {}, selected: 0, pick: null };
  var fetched = {};                /* chapter text already asked for, by slug.translation */

  /* ---------- dates ---------- */

  function dateOf(index) { return STPlan.addDays(state.start, index); }
  function todayIndex() { return STPlan.dayIndex(state.start, ST.todayISO()); }
  function isDone(index) { return STPlan.isDone(plan, state.start, state.done, index); }
  function where() { return STPlan.progress(plan, state.start, state.done, ST.todayISO()); }

  function shortDate(iso) {
    var d = STPlan.isoToDate(iso);
    return DAY_SHORT[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3);
  }

  function longDate(iso) {
    var d = STPlan.isoToDate(iso);
    return DAY_LONG[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }

  /* ---------- the plan list ---------- */

  function renderList() {
    els.days.innerHTML = "";
    var today = todayIndex();
    var month = null;
    plan.days.forEach(function (day, i) {
      var date = dateOf(i);
      var name = MONTHS[STPlan.isoToDate(date).getMonth()] + " " + STPlan.isoToDate(date).getFullYear();
      if (name !== month) {
        month = name;
        els.days.appendChild(ST.el("div", { class: "month-head", text: name }));
      }

      var row = ST.el("div", {
        class: "plan-day" + (i === today ? " today" : "") + (isDone(i) ? " done" : ""),
        "data-day": String(i)
      });

      var tick = ST.el("button", {
        type: "button", class: "tick",
        "aria-pressed": isDone(i) ? "true" : "false",
        "aria-label": "Mark day " + (i + 1) + " read",
        title: isDone(i) ? "Mark this day unread" : "Mark this day read",
        text: isDone(i) ? "\u2713" : ""
      });
      tick.addEventListener("click", function () { toggle(i); });
      row.appendChild(tick);

      var open = ST.el("button", { type: "button", class: "day-open" }, [
        ST.el("span", { class: "d-num", text: String(i + 1) }),
        ST.el("span", { class: "d-date", text: shortDate(date) }),
        ST.el("span", { class: "d-portion", text: STPlan.format(day) })
      ]);
      open.addEventListener("click", function () { select(i); });
      row.appendChild(open);
      els.days.appendChild(row);
    });
  }

  function markSelected(scroll) {
    var rows = els.days.querySelectorAll(".plan-day");
    for (var i = 0; i < rows.length; i++) {
      var isIt = Number(rows[i].getAttribute("data-day")) === state.selected;
      rows[i].classList.toggle("selected", isIt);
      if (isIt && scroll && rows[i].scrollIntoView) { rows[i].scrollIntoView({ block: "nearest" }); }
    }
  }

  function select(index, scroll) {
    state.selected = index;
    markSelected(scroll);
    renderDay();
  }

  function toggle(index) {
    var key = dateOf(index);
    if (state.done[key]) { delete state.done[key]; } else { state.done[key] = true; }
    save();

    var row = els.days.querySelector('.plan-day[data-day="' + index + '"]');
    if (row) {
      row.classList.toggle("done", isDone(index));
      var tick = row.querySelector(".tick");
      tick.setAttribute("aria-pressed", isDone(index) ? "true" : "false");
      tick.setAttribute("title", isDone(index) ? "Mark this day unread" : "Mark this day read");
      tick.textContent = isDone(index) ? "\u2713" : "";
    }
    renderProgress();
    renderDay();
  }

  /* ---------- the day ---------- */

  function renderChapter(entry, data) {
    var wrap = ST.el("div", { class: "chapter" });
    wrap.appendChild(ST.el("h4", { text: entry.name + " " + entry.chapter }));
    var chapterData = (data.chapters || {})[String(entry.chapter)] || {};
    var nums = Object.keys(chapterData).map(Number).filter(function (n) { return !isNaN(n); })
      .sort(function (a, b) { return a - b; });
    if (!nums.length) {
      wrap.appendChild(ST.el("p", { class: "notice", text: "No text for " + entry.name + " " + entry.chapter + " in this translation." }));
      return wrap;
    }
    nums.forEach(function (n) {
      wrap.appendChild(ST.el("div", { class: "verse-block" }, [
        ST.el("span", { class: "num", text: String(n) }),
        ST.el("p", { text: chapterData[String(n)] })
      ]));
    });
    return wrap;
  }

  function renderDay() {
    var index = state.selected;
    var day = plan.days[index];
    var date = dateOf(index);
    var today = todayIndex();
    els.card.innerHTML = "";

    els.card.appendChild(ST.el("div", { class: "row", style: "justify-content:space-between;align-items:baseline" }, [
      ST.el("h2", { class: "day-title", text: STPlan.format(day) }),
      ST.el("span", { class: "pill", text: "Day " + (index + 1) + " of " + plan.days.length })
    ]));
    els.card.appendChild(ST.el("p", { class: "muted small", style: "margin:2px 0 0",
      text: longDate(date) + (index === today ? " \u00b7 today" : "") + " \u00b7 " +
        day.length + (day.length === 1 ? " chapter" : " chapters") }));

    var actions = ST.el("div", { class: "row no-print day-actions", style: "margin:12px 0 4px" });
    var mark = ST.el("button", {
      type: "button",
      class: isDone(index) ? "secondary" : "",
      text: isDone(index) ? "\u2713 Read \u2014 undo" : "Mark as read"
    });
    mark.addEventListener("click", function () { toggle(index); });
    actions.appendChild(mark);
    actions.appendChild(ST.el("a", { class: "btn secondary",
      href: ST.siteRoot() + "apps/bible/?book=" + encodeURIComponent(day[0].slug) + "&chapter=" + day[0].chapter,
      text: "Open in the reader \u2192" }));
    var print = ST.el("button", { type: "button", class: "ghost", text: "Print this day" });
    print.addEventListener("click", function () { window.print(); });
    actions.appendChild(print);
    els.card.appendChild(actions);

    var text = ST.el("div");
    text.appendChild(ST.el("p", { class: "muted small", text: "Loading\u2026" }));
    els.card.appendChild(text);

    Promise.all(day.map(function (entry) {
      var key = entry.slug + "." + state.tr;
      if (!fetched[key]) { fetched[key] = ST.loadTranslation(entry.slug, state.tr); }
      return fetched[key].then(function (data) { return { entry: entry, data: data }; });
    })).then(function (loaded) {
      text.innerHTML = "";
      loaded.forEach(function (item) { text.appendChild(renderChapter(item.entry, item.data)); });
    }).catch(function () {
      text.innerHTML = "";
      text.appendChild(ST.el("p", { class: "notice error", text: "Could not load the text. Serve the folder over HTTP." }));
    });
  }

  /* ---------- the progress line ---------- */

  function renderProgress() {
    var p = where();
    var head;

    if (p.starts) {
      head = "Starts " + longDate(state.start);
    } else if (p.finished) {
      head = "Plan finished \u2014 the last day was " + longDate(dateOf(p.days - 1));
    } else {
      head = "Today, day " + (p.day + 1) + " of " + p.days + ": " + STPlan.format(p.todayPortion);
    }

    var bits = [p.daysRead + " of " + p.days + " days read (" + p.percent + "%)",
                p.chaptersRead.toLocaleString() + " of " + p.chapters.toLocaleString() + " chapters"];
    if (p.streak > 0) { bits.push(p.streak === 1 ? "1 day in a row" : p.streak + " days in a row"); }
    if (p.behind > 0) { bits.push(p.behind === 1 ? "1 day behind" : p.behind + " days behind"); }

    els.head.textContent = head;
    els.sub.textContent = bits.join(" \u00b7 ");
    els.fill.style.width = p.percent + "%";
  }

  /* ---------- controls ---------- */

  function save() {
    ST.store(STORE, { id: state.id, start: state.start, tr: state.tr, done: state.done });
  }

  function fillControls() {
    els.plan.innerHTML = "";
    STPlan.PLANS.forEach(function (p) {
      var built = STPlan.build(books, p.id);
      var o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name + " \u2014 " + built.chapters.toLocaleString() + " chapters, " + p.days + " days";
      els.plan.appendChild(o);
    });
    els.plan.value = state.id;

    els.tr.innerHTML = "";
    translations.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      els.tr.appendChild(o);
    });
    els.tr.value = state.tr;
    els.start.value = state.start;
  }

  function buildPlan() {
    plan = STPlan.build(books, state.id);
    var index = state.pick === null ? todayIndex() : state.pick;
    state.pick = null;
    state.selected = Math.min(Math.max(index, 0), plan.days.length - 1);
  }

  function render() {
    buildPlan();
    fillControls();
    renderProgress();
    renderList();
    markSelected(true);
    renderDay();
  }

  /* ---------- start ---------- */

  function init() {
    var saved = ST.store(STORE) || {};
    if (saved.id && STPlan.byId(saved.id)) { state.id = saved.id; }
    if (saved.start) { state.start = saved.start; }
    if (saved.tr) { state.tr = saved.tr; }
    if (saved.done && typeof saved.done === "object") { state.done = saved.done; }

    /* ?plan= and ?date= open somewhere particular, so a day can be linked to */
    var wantedPlan = ST.qs("plan");
    if (wantedPlan && STPlan.byId(wantedPlan)) { state.id = wantedPlan; }
    var wantedDate = ST.qs("date");
    var wantedTr = ST.qs("tr");

    Promise.all([ST.loadBooks(), ST.loadTranslations()]).then(function (loaded) {
      books = loaded[0] || [];
      translations = loaded[1] || [];
      if (wantedTr && translations.some(function (t) { return t.id === wantedTr; })) { state.tr = wantedTr; }
      if (!translations.some(function (t) { return t.id === state.tr; })) {
        state.tr = translations.length ? translations[0].id : "WEBU";
      }
      if (wantedDate) { state.pick = STPlan.dayIndex(state.start, wantedDate); }
      render();
    }).catch(function () {
      els.days.innerHTML = "";
      els.days.appendChild(ST.el("p", { class: "notice error", text: "Could not load the book list. Serve the folder over HTTP." }));
    });

    els.plan.addEventListener("change", function () { state.id = els.plan.value; save(); render(); });
    els.start.addEventListener("change", function () {
      if (!els.start.value) { return; }
      state.start = els.start.value;
      save();
      render();
    });
    els.tr.addEventListener("change", function () { state.tr = els.tr.value; save(); renderDay(); });
    els.reset.addEventListener("click", function () {
      if (!window.confirm("Clear every tick and start the plan today?")) { return; }
      state.done = {};
      state.start = ST.todayISO();
      save();
      render();
    });
  }

  init();
})();
