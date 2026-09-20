/* Home page for the Bible section: verse of the day, study tools, and the
   book grid that links into the pre-built World English Bible (Updated)
   chapter pages. Depends on js/common.js. */
(function () {
  "use strict";

  var VOTD = [
    ["john", 3, 16], ["psalms", 23, 1], ["romans", 8, 28], ["philippians", 4, 13],
    ["isaiah", 40, 31], ["proverbs", 3, 5], ["matthew", 11, 28], ["psalms", 119, 105],
    ["joshua", 1, 9], ["john", 14, 6], ["romans", 12, 2], ["galatians", 5, 22],
    ["ephesians", 2, 8], ["hebrews", 11, 1], ["james", 1, 5], ["i-peter", 5, 7],
    ["i-john", 1, 9], ["revelation-of-john", 21, 4], ["micah", 6, 8], ["psalms", 46, 1]
  ];

  function root() { return ST.siteRoot(); }

  /* Books open in the reader, so reading stays inside the site's own UI. */
  function bookHref(book) {
    return root() + "apps/bible/?book=" + encodeURIComponent(book.slug);
  }

  function bookCode(book) {
    var code = ST.moduleCode(book.slug);
    if (code) return code;
    var initials = book.name.replace(/[^A-Za-z ]/g, "").split(/\s+/)
      .map(function (w) { return w.charAt(0); }).join("");
    return initials.slice(0, 3).toUpperCase();
  }

  function initials(name) {
    return name.replace(/[^A-Za-z& ]/g, "").split(/\s+/)
      .filter(function (w) { return w && w.toLowerCase() !== "and"; })
      .map(function (w) { return w.charAt(0); }).join("").slice(0, 3).toUpperCase();
  }

  function dayOfYear() {
    var iso = ST.todayISO();
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) d = new Date();
    var start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  }

  function buildVerseOfDay() {
    var refEl = document.getElementById("votd-ref");
    var textEl = document.getElementById("votd-text");
    var linkEl = document.getElementById("votd-links");
    if (!refEl || !textEl) return;

    var pick = VOTD[dayOfYear() % VOTD.length];
    var slug = pick[0], chapter = pick[1], verse = pick[2];

    ST.loadTranslation(slug, "WEBU").then(function (data) {
      var text = (data.chapters[String(chapter)] || {})[String(verse)];
      var name = data.book || slug;
      var label = name + " " + chapter + ":" + verse;
      refEl.textContent = label;
      textEl.textContent = text || "Verse not available.";
      if (linkEl && text) {
        linkEl.setAttribute("href", root() + "apps/bible/?book=" + encodeURIComponent(slug) +
          "&chapter=" + chapter + "&verse=" + verse);
        linkEl.textContent = "Read the chapter \u2192";
      }
    }).catch(function () {
      textEl.textContent = "Could not load the verse of the day.";
    });
  }

  /* Today's reading: the plan's day for today, tickable from here. The plan is
     worked out by js/plan.js, and the ticks are the same store the Reading Plan
     app keeps, so ticking here shows there and the other way about. */
  var PLAN_KEY = "reading-plan.v1";

  function planState() {
    var saved = ST.store(PLAN_KEY) || {};
    return {
      id: saved.id && STPlan.byId(saved.id) ? saved.id : STPlan.PLANS[0].id,
      start: saved.start || ST.todayISO(),
      done: saved.done && typeof saved.done === "object" ? saved.done : {},
      tr: saved.tr || "WEBU"
    };
  }

  function buildTodaysReading() {
    var portionEl = document.getElementById("plan-portion");
    var refEl = document.getElementById("plan-ref");
    var subEl = document.getElementById("plan-sub");
    var actions = document.getElementById("plan-actions");
    if (!portionEl || !refEl || !actions) return;

    ST.loadBooks().then(function (books) {
      var state = planState();
      var plan = STPlan.build(books, state.id);
      var p = STPlan.progress(plan, state.start, state.done, ST.todayISO());
      actions.innerHTML = "";

      if (p.starts) {
        refEl.textContent = plan.name;
        portionEl.textContent = "Starts " + ST.formatDate(state.start, { month: "long", day: "numeric" }) + ".";
        subEl.textContent = plan.chapters.toLocaleString() + " chapters over " + p.days + " days.";
        actions.appendChild(ST.el("a", { class: "btn", href: root() + "apps/plan/", text: "Open the plan \u2192" }));
        return;
      }
      if (p.finished) {
        refEl.textContent = plan.name;
        portionEl.textContent = "Finished \u2014 well read.";
        subEl.textContent = p.daysRead + " of " + p.days + " days, " + p.chaptersRead.toLocaleString() +
          " of " + p.chapters.toLocaleString() + " chapters.";
        actions.appendChild(ST.el("a", { class: "btn secondary", href: root() + "apps/plan/", text: "See the plan \u2192" }));
        return;
      }

      var dateKey = STPlan.addDays(state.start, p.day);
      var read = !!state.done[dateKey];
      refEl.textContent = "Day " + (p.day + 1) + " of " + p.days;
      portionEl.textContent = STPlan.format(p.todayPortion);
      subEl.textContent = plan.name + " \u00b7 " + p.chaptersRead.toLocaleString() + " of " +
        p.chapters.toLocaleString() + " chapters read" +
        (p.streak > 1 ? " \u00b7 " + p.streak + " days in a row" : "");

      var first = p.todayPortion[0];
      actions.appendChild(ST.el("a", { class: "btn",
        href: root() + "apps/bible/?book=" + encodeURIComponent(first.slug) + "&chapter=" + first.chapter,
        text: "Read today's portion \u2192" }));
      var tick = ST.el("button", { type: "button", class: read ? "secondary" : "",
        text: read ? "\u2713 Read \u2014 undo" : "Mark as read" });
      tick.addEventListener("click", function () {
        var current = planState();
        if (current.done[dateKey]) { delete current.done[dateKey]; } else { current.done[dateKey] = true; }
        ST.store(PLAN_KEY, { id: current.id, start: current.start, done: current.done, tr: current.tr });
        buildTodaysReading();
      });
      actions.appendChild(tick);
    }).catch(function () {
      portionEl.textContent = "Could not load the book list.";
    });
  }

  function buildToolGrid() {
    var host = document.getElementById("tools-grid");
    if (!host) return;
    host.innerHTML = "";
    ST.APPS.forEach(function (app) {
      host.appendChild(ST.el("a", { class: "app-book", href: root() + app.href }, [
        ST.el("span", { class: "abbrev", text: initials(app.name) }),
        ST.el("span", { class: "name", text: app.name })
      ]));
    });
  }

  function buildBookGrid(books) {
    var host = document.getElementById("book-grid");
    if (!host) return;

    var bySlug = {};
    books.forEach(function (b) { bySlug[b.slug] = b; });

    function render(group) {
      host.innerHTML = "";
      var def = null;
      ST.BOOK_GROUPS.forEach(function (g) { if (g.id === group) def = g; });
      var slugs = (def && def.deuterocanon)
        ? books.filter(function (b) { return b.deuterocanon; }).map(function (b) { return b.slug; })
        : (def ? def.slugs : []);
      var shown = 0;
      slugs.forEach(function (slug) {
        var b = bySlug[slug];
        if (!b) return;
        shown++;
        host.appendChild(ST.el("a", { class: "app-book", href: bookHref(b), title: b.name + " \u2014 " + b.chapters + " chapters" }, [
          ST.el("span", { class: "abbrev", text: bookCode(b) }),
          ST.el("span", { class: "name", text: b.name })
        ]));
      });
      if (!shown) {
        host.appendChild(ST.el("p", { class: "lemma-desc", text: "No books in this group." }));
      }
    }

    var tabs = document.querySelectorAll(".book-tabs .tab");
    if (tabs.length) {
      Array.prototype.forEach.call(tabs, function (tab) {
        tab.addEventListener("click", function () {
          Array.prototype.forEach.call(tabs, function (t) {
            t.setAttribute("aria-selected", t === tab ? "true" : "false");
          });
          render(tab.getAttribute("data-group"));
        });
      });
      var current = document.querySelector(".book-tabs .tab[aria-selected='true']");
      render(current ? current.getAttribute("data-group") : "law");
    } else {
      render("law");
    }
  }

  buildVerseOfDay();
  buildTodaysReading();
  buildToolGrid();
  ST.loadBooks().then(buildBookGrid).catch(function () {
    var host = document.getElementById("book-grid");
    if (host) host.appendChild(ST.el("p", { class: "lemma-desc", text: "Could not load the book list. Serve the folder over HTTP." }));
  });
})();
