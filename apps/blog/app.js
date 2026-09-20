(function () {
  "use strict";

  var SAVED_KEY = "blog-ideas.v1";
  var TRANSLATION = "KJVM";

  var els = {
    scope: document.getElementById("scope"),
    angle: document.getElementById("angle"),
    generate: document.getElementById("generate"),
    another: document.getElementById("another"),
    idea: document.getElementById("idea"),
    saved: document.getElementById("saved"),
    exportSaved: document.getElementById("export-saved")
  };

  var books = [];
  var bySlug = {};
  var kit = null;
  var chapterCache = {};
  var current = null;
  var saved = ST.store(SAVED_KEY) || [];

  var SCOPES = {
    OT: function (b) { return b.testament === "OT"; },
    NT: function (b) { return b.testament === "NT"; },
    DC: function (b) { return b.testament === "DC"; },
    gospels: function (b) { return ["matthew", "mark", "luke", "john"].indexOf(b.slug) !== -1; },
    epistles: function (b) {
      return ["romans", "i-corinthians", "ii-corinthians", "galatians", "ephesians", "philippians", "colossians",
        "i-thessalonians", "ii-thessalonians", "i-timothy", "ii-timothy", "titus", "philemon", "hebrews", "james",
        "i-peter", "ii-peter", "i-john", "ii-john", "iii-john", "jude"].indexOf(b.slug) !== -1;
    },
    wisdom: function (b) { return ["job", "psalms", "proverbs", "ecclesiastes", "song-of-solomon", "wisdom", "sirach"].indexOf(b.slug) !== -1; },
    prophets: function (b) {
      return ["isaiah", "jeremiah", "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos", "obadiah", "jonah",
        "micah", "nahum", "habakkuk", "zephaniah", "haggai", "zechariah", "malachi", "baruch"].indexOf(b.slug) !== -1;
    }
  };

  // Passages that are short, self-contained, and worth a whole post.
  var SEEDS = [
    ["psalms", 23, 1, 6], ["psalms", 27, 1, 4], ["psalms", 34, 4, 8], ["psalms", 46, 1, 3],
    ["psalms", 51, 10, 12], ["psalms", 63, 1, 4], ["psalms", 90, 12, 17], ["psalms", 103, 8, 14],
    ["psalms", 121, 1, 8], ["psalms", 139, 1, 6], ["psalms", 139, 13, 18],
    ["isaiah", 40, 28, 31], ["isaiah", 43, 1, 3], ["isaiah", 53, 4, 6], ["isaiah", 55, 6, 11],
    ["jeremiah", 29, 11, 13], ["lamentations", 3, 21, 26], ["micah", 6, 6, 8],
    ["habakkuk", 3, 17, 19], ["zephaniah", 3, 14, 17],
    ["proverbs", 3, 1, 8], ["proverbs", 15, 1, 4], ["proverbs", 16, 1, 9], ["proverbs", 27, 17, 19],
    ["ecclesiastes", 3, 1, 8], ["ecclesiastes", 4, 9, 12], ["job", 38, 1, 7], ["job", 42, 1, 6],
    ["matthew", 5, 3, 12], ["matthew", 5, 13, 16], ["matthew", 6, 5, 15], ["matthew", 6, 25, 34],
    ["matthew", 7, 1, 5], ["matthew", 11, 28, 30], ["matthew", 22, 34, 40], ["matthew", 28, 16, 20],
    ["mark", 4, 35, 41], ["mark", 8, 34, 38], ["mark", 10, 42, 45], ["mark", 12, 41, 44],
    ["luke", 6, 27, 36], ["luke", 10, 25, 37], ["luke", 11, 1, 4], ["luke", 15, 11, 24],
    ["luke", 22, 24, 27], ["luke", 24, 13, 27],
    ["john", 1, 1, 14], ["john", 3, 16, 21], ["john", 4, 4, 14], ["john", 8, 31, 36],
    ["john", 10, 7, 18], ["john", 13, 1, 17], ["john", 14, 1, 6], ["john", 15, 1, 11], ["john", 17, 1, 5],
    ["acts", 1, 6, 11], ["acts", 2, 42, 47], ["acts", 4, 23, 31],
    ["romans", 5, 1, 5], ["romans", 6, 11, 14], ["romans", 8, 1, 4], ["romans", 8, 12, 17],
    ["romans", 8, 18, 25], ["romans", 8, 31, 39], ["romans", 12, 1, 2], ["romans", 12, 9, 21],
    ["i-corinthians", 1, 26, 31], ["i-corinthians", 13, 1, 8], ["i-corinthians", 15, 12, 20],
    ["ii-corinthians", 1, 3, 7], ["ii-corinthians", 4, 7, 12], ["ii-corinthians", 5, 14, 21],
    ["ii-corinthians", 12, 7, 10], ["galatians", 2, 19, 21], ["galatians", 5, 16, 25],
    ["ephesians", 1, 3, 14], ["ephesians", 2, 1, 10], ["ephesians", 3, 14, 21], ["ephesians", 4, 1, 6],
    ["ephesians", 6, 10, 20], ["philippians", 1, 3, 11], ["philippians", 2, 1, 11], ["philippians", 3, 7, 14],
    ["philippians", 4, 4, 9], ["philippians", 4, 10, 13], ["colossians", 1, 15, 23], ["colossians", 3, 1, 17],
    ["i-thessalonians", 4, 13, 18], ["i-thessalonians", 5, 12, 24], ["ii-timothy", 1, 5, 10],
    ["ii-timothy", 3, 10, 17], ["hebrews", 4, 12, 16], ["hebrews", 10, 19, 25], ["hebrews", 11, 1, 6],
    ["hebrews", 12, 1, 3], ["hebrews", 12, 4, 11], ["hebrews", 13, 1, 8],
    ["james", 1, 2, 8], ["james", 1, 19, 25], ["james", 2, 14, 20], ["james", 3, 1, 12], ["james", 4, 1, 10],
    ["i-peter", 1, 3, 9], ["i-peter", 2, 9, 12], ["i-peter", 3, 8, 12], ["i-peter", 5, 6, 11],
    ["i-john", 1, 5, 10], ["i-john", 3, 1, 3], ["i-john", 4, 7, 12], ["i-john", 4, 13, 19],
    ["revelation-of-john", 21, 1, 7], ["revelation-of-john", 3, 14, 22],
    ["sirach", 2, 1, 11], ["tobit", 4, 5, 19], ["wisdom", 3, 1, 9], ["i-maccabees", 2, 49, 64]
  ];

  function scopeBook(slug) {
    var b = bySlug[slug];
    if (!b) return false;
    var fn = SCOPES[els.scope.value];
    return !fn || fn(b);
  }

  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function fill(template, parts) {
    return template.replace(/\{(\w+)\}/g, function (_, key) { return parts[key] || ""; });
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function referenceFor(seed) {
    var book = bySlug[seed[0]];
    if (!book) return seed[0] + " " + seed[1];
    var ref = book.name + " " + seed[1] + ":" + seed[2];
    if (seed[3] !== seed[2]) ref += "-" + seed[3];
    return ref;
  }

  function loadPassage(seed) {
    var slug = seed[0];
    var cacheKey = slug;
    var promise = chapterCache[cacheKey] ? Promise.resolve(chapterCache[cacheKey])
      : ST.loadTranslation(slug, TRANSLATION).then(function (data) {
          chapterCache[cacheKey] = data;
          return data;
        });
    return promise.then(function (data) {
      var chapter = data.chapters[String(seed[1])];
      if (!chapter) throw new Error("no chapter");
      var verses = [];
      for (var v = seed[2]; v <= seed[3]; v++) {
        if (chapter[String(v)]) verses.push(chapter[String(v)]);
      }
      if (!verses.length) throw new Error("no verses");
      return verses.join(" ");
    });
  }

  function chooseSeed() {
    var pool = SEEDS.filter(function (s) { return scopeBook(s[0]); });
    if (!pool.length) pool = SEEDS;
    return pick(pool);
  }

  function chooseAngle() {
    if (els.angle.value !== "any") {
      return kit.angles.filter(function (a) { return a.id === els.angle.value; })[0] || pick(kit.angles);
    }
    return pick(kit.angles);
  }

  function generate(keepAngle) {
    var angle = keepAngle && current ? current.angle : chooseAngle();
    var seed = chooseSeed();
    var theme = capitalize(pick(kit.fillers.theme));
    var parts = { theme: theme, ref: referenceFor(seed), audience: pick(kit.audiences), opening: pick(kit.fillers.opening) };

    loadPassage(seed).then(function (text) {
      var companion = null;
      if (angle.id === "comparison") {
        var otherSeed = chooseSeed();
        var tries = 0;
        while (tries < 6 && otherSeed[0] === seed[0] && otherSeed[1] === seed[1]) {
          otherSeed = chooseSeed();
          tries += 1;
        }
        companion = { ref: referenceFor(otherSeed), seed: otherSeed };
      }

      var finish = function (companionText) {
        var idea = {
          id: "i" + Date.now(),
          at: new Date().toISOString(),
          angleId: angle.id,
          angleName: angle.name,
          title: fill(pick(angle.titles), parts),
          blurb: angle.blurb,
          outline: angle.outline.slice(),
          opening: parts.opening,
          audience: parts.audience,
          theme: theme,
          ref: parts.ref,
          passage: text,
          companionRef: companion ? companion.ref : null,
          companionPassage: companionText || null,
          translation: TRANSLATION
        };
        current = { idea: idea, angle: angle };
        renderIdea(idea);
      };

      if (companion) {
        loadPassage(companion.seed).then(function (otherText) { finish(otherText); })
          .catch(function () { finish(null); });
      } else {
        finish(null);
      }
    }).catch(function () {
      els.idea.innerHTML = "";
      els.idea.appendChild(ST.el("div", { class: "notice error", text: "Could not load that passage. Serve this folder over HTTP and try again." }));
    });
  }

  function renderIdea(idea) {
    els.idea.innerHTML = "";
    els.idea.appendChild(ST.el("div", { class: "meta-row" }, [
      ST.el("span", { class: "pill", text: idea.angleName }),
      ST.el("span", { class: "pill", text: idea.theme }),
      ST.el("span", { class: "pill", text: "for " + idea.audience })
    ]));
    els.idea.appendChild(ST.el("h2", { class: "idea-title", text: idea.title }));
    els.idea.appendChild(ST.el("div", { class: "idea-passage" }, [
      ST.el("div", { class: "ref", text: idea.ref + " (" + idea.translation + ")" }),
      ST.el("div", { class: "text", text: idea.passage })
    ]));
    if (idea.companionRef) {
      els.idea.appendChild(ST.el("div", { class: "idea-passage companion" }, [
        ST.el("div", { class: "ref", text: idea.companionRef + " (" + idea.translation + ")" }),
        ST.el("div", { class: "text", text: idea.companionPassage || "The companion passage could not be loaded." })
      ]));
    }
    els.idea.appendChild(ST.el("p", { class: "muted small", text: idea.blurb + " " + idea.opening }));

    els.idea.appendChild(ST.el("h3", { class: "serif", style: "font-size:1.02rem;margin:14px 0 0", text: "Outline" }));
    var list = ST.el("ol", { class: "outline-list" });
    idea.outline.forEach(function (step) { list.appendChild(ST.el("li", { text: step })); });
    els.idea.appendChild(list);

    var actions = ST.el("div", { class: "row no-print", style: "margin-top:16px" }, [
      ST.el("button", { id: "save-idea", text: "Save this idea" }),
      ST.el("button", { class: "secondary", text: "Copy as markdown",
        onclick: function () { copyIdea(idea); } }),
      ST.el("button", { class: "ghost", text: "Send to notebook",
        onclick: function () { sendToNotebook(idea); } })
    ]);
    els.idea.appendChild(actions);
    document.getElementById("save-idea").addEventListener("click", function () { saveIdea(idea); });
    document.title = idea.title + " — Blog Idea Generator";
  }

  function ideaMarkdown(idea) {
    var lines = [];
    lines.push("# " + idea.title, "");
    lines.push("**Angle:** " + idea.angleName + "  ");
    lines.push("**Theme:** " + idea.theme + "  ");
    lines.push("**Audience:** " + idea.audience, "");
    lines.push("> " + idea.ref + " (" + idea.translation + ")");
    lines.push("> " + idea.passage, "");
    if (idea.companionRef) {
      lines.push("> " + idea.companionRef + " (" + idea.translation + ")");
      lines.push("> " + (idea.companionPassage || ""), "");
    }
    lines.push("## Outline");
    idea.outline.forEach(function (step, i) { lines.push((i + 1) + ". " + step); });
    lines.push("", idea.blurb);
    return lines.join("\n");
  }

  function copyIdea(idea) {
    ST.copyText(ideaMarkdown(idea)).then(function () { ST.toast("Idea copied"); }, function () { ST.toast("Copy failed", true); });
  }

  function sendToNotebook(idea) {
    try {
      var key = "studytools.sermon-notebook.v1";
      var note = JSON.parse(localStorage.getItem(key) || "null") || {};
      var block = ideaMarkdown(idea);
      note.body = (note.body ? note.body + "\n\n---\n\n" : "") + block;
      if (!note.title) note.title = idea.title;
      note.updated = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(note));
      ST.toast("Added to Sermon Notebook");
    } catch (e) {
      ST.toast("Could not reach the notebook", true);
    }
  }

  function saveIdea(idea) {
    if (saved.some(function (s) { return s.title === idea.title && s.ref === idea.ref; })) {
      ST.toast("Already saved");
      return;
    }
    saved.unshift(idea);
    if (saved.length > 60) saved = saved.slice(0, 60);
    ST.store(SAVED_KEY, saved);
    renderSaved();
    ST.toast("Idea saved");
  }

  function renderSaved() {
    els.saved.innerHTML = "";
    if (!saved.length) {
      els.saved.appendChild(ST.el("p", { class: "muted small", text: "Nothing saved yet. Ideas you keep will show up here." }));
      return;
    }
    saved.forEach(function (idea, index) {
      var item = ST.el("div", { class: "history-item" }, [
        ST.el("div", {}, [
          ST.el("div", { style: "font-weight:600", text: idea.title }),
          ST.el("div", { class: "muted", style: "font-size:.76rem", text: idea.ref + " · " + idea.angleName })
        ]),
        ST.el("button", { class: "ghost", style: "font-size:.7rem;padding:1px 7px", text: "×", title: "Remove",
          onclick: function (e) {
            e.stopPropagation();
            saved.splice(index, 1);
            ST.store(SAVED_KEY, saved);
            renderSaved();
          } })
      ]);
      item.addEventListener("click", function () {
        current = { idea: idea, angle: kit.angles.filter(function (a) { return a.id === idea.angleId; })[0] || kit.angles[0] };
        renderIdea(idea);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      els.saved.appendChild(item);
    });
  }

  function exportSaved() {
    if (!saved.length) { ST.toast("Nothing saved yet", true); return; }
    var md = "# Blog ideas\n\n" + saved.map(ideaMarkdown).join("\n\n---\n\n");
    ST.download("blog-ideas.md", md, "text/markdown;charset=utf-8");
  }

  function init() {
    Promise.all([
      ST.loadBooks(),
      ST.loadJSON(ST.siteRoot() + "data/blog/idea-kit.json")
    ]).then(function (results) {
      books = results[0];
      kit = results[1];
      bySlug = {};
      books.forEach(function (b) { bySlug[b.slug] = b; });

      kit.angles.forEach(function (a) {
        els.angle.appendChild(ST.el("option", { value: a.id, text: a.name }));
      });
      els.angle.value = "any";

      renderSaved();
      generate(false);
    }).catch(function () {
      els.idea.innerHTML = "";
      els.idea.appendChild(ST.el("div", { class: "notice error", text: "Could not load the idea kit. Serve this folder over HTTP." }));
    });

    els.generate.addEventListener("click", function () { generate(false); });
    els.another.addEventListener("click", function () { generate(true); });
    els.exportSaved.addEventListener("click", exportSaved);
  }

  init();
})();
