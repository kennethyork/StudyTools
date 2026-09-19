(function () {
  "use strict";

  var els = {
    sourceSeg: document.getElementById("source-seg"),
    search: document.getElementById("search"),
    clear: document.getElementById("clear"),
    letters: document.getElementById("letters"),
    list: document.getElementById("topic-list"),
    listTitle: document.getElementById("list-title"),
    listCount: document.getElementById("list-count"),
    topic: document.getElementById("topic")
  };

  var index = null;
  var sources = ["nave"];
  var activeLetter = "a";
  var activeSlug = null;
  var cache = {};

  function sourceList() {
    return sources.indexOf("both") !== -1 ? ["nave", "torrey"] : sources;
  }

  function loadLetter(source, letter) {
    var key = source + "." + letter;
    if (cache[key]) return Promise.resolve(cache[key]);
    var letters = (index.sources[source].letters || []);
    if (letters.indexOf(letter) === -1) return Promise.resolve([]);
    return ST.loadJSON(ST.siteRoot() + "data/topical/" + source + "/" + letter + ".json").then(function (data) {
      cache[key] = data.topics;
      return data.topics;
    });
  }

  function loadActiveLetters(letter) {
    return Promise.all(sourceList().map(function (s) { return loadLetter(s, letter); }));
  }

  function searchAll(query) {
    var tasks = [];
    sourceList().forEach(function (source) {
      (index.sources[source].letters || []).forEach(function (letter) {
        tasks.push(loadLetter(source, letter));
      });
    });
    return Promise.all(tasks).then(function (lists) {
      var results = [];
      lists.forEach(function (topics) {
        topics.forEach(function (topic) {
          if (topic.name.toLowerCase().indexOf(query) !== -1 || topic.slug.indexOf(query) !== -1) {
            results.push(topic);
          }
        });
      });
      results.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return results;
    });
  }

  function renderLetters() {
    els.letters.innerHTML = "";
    var letters = {};
    sourceList().forEach(function (source) {
      (index.sources[source].letters || []).forEach(function (l) { letters[l] = true; });
    });
    Object.keys(letters).sort().forEach(function (letter) {
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

  function paintTopics(topics) {
    els.list.innerHTML = "";
    if (!topics.length) {
      els.list.appendChild(ST.el("p", { class: "muted small", text: "Nothing matches." }));
      return;
    }
    topics.slice(0, 500).forEach(function (topic) {
      var btn = ST.el("button", { type: "button", class: "topic-item" + (topic.slug === activeSlug ? " active" : "") });
      btn.appendChild(ST.el("span", { text: topic.name }));
      btn.appendChild(ST.el("span", { class: "count", text: "  · " + topic.entries.length }));
      btn.addEventListener("click", function () {
        activeSlug = topic.slug;
        showTopic(topic);
        renderList();
      });
      els.list.appendChild(btn);
    });
  }

  function renderList() {
    var query = els.search.value.trim().toLowerCase();
    if (query) {
      els.listTitle.textContent = "Search results";
      els.list.innerHTML = "";
      els.list.appendChild(ST.el("p", { class: "muted small", text: "Searching…" }));
      searchAll(query).then(function (results) {
        els.listCount.textContent = results.length.toLocaleString() + (results.length === 1 ? " subject" : " subjects");
        paintTopics(results);
      });
      return;
    }

    els.listTitle.textContent = "Subjects starting with " + activeLetter.toUpperCase();
    loadActiveLetters(activeLetter).then(function (lists) {
      var merged = [];
      lists.forEach(function (topics) { merged = merged.concat(topics); });
      merged.sort(function (a, b) { return a.name.localeCompare(b.name); });
      els.listCount.textContent = merged.length.toLocaleString() + (merged.length === 1 ? " subject" : " subjects");
      paintTopics(merged);
    });
  }

  function refLabel(ref) {
    return ref.trim();
  }

  function showTopic(topic) {
    els.topic.innerHTML = "";
    var sourceLabel = topic.source === "nave" ? "Nave's Topical Bible" : "Torrey's New Topical Textbook";
    els.topic.appendChild(ST.el("div", { class: "row", style: "justify-content:space-between;align-items:baseline" }, [
      ST.el("h2", { class: "serif", style: "margin:0;font-size:1.45rem", text: topic.name }),
      ST.el("span", { class: "pill", text: sourceLabel })
    ]));
    els.topic.appendChild(ST.el("p", { class: "muted small", text: topic.entries.length + (topic.entries.length === 1 ? " entry" : " entries") }));

    topic.entries.forEach(function (entry) {
      var block = ST.el("div", { class: "entry" });
      // Entry text repeats the references; show the topical phrase alone when
      // the references carry the citation information.
      var phrase = entry.text;
      if (entry.refs.length && phrase) {
        var firstRef = entry.refs[0];
        var idx = phrase.indexOf(firstRef.replace(/\s+/g, " "));
        if (idx > 0) phrase = phrase.slice(0, idx).replace(/[;,.\s]+$/, "");
      }
      if (phrase) block.appendChild(ST.el("p", { class: "entry-text", text: phrase }));

      var refWrap = ST.el("div", { class: "ref-list" });
      entry.refs.forEach(function (ref) {
        var chip = ST.el("a", {
          class: "ref-chip",
          href: "../matrix/?ref=" + encodeURIComponent(refLabel(ref)),
          text: refLabel(ref),
          title: "Open in the Verse Matrix"
        });
        refWrap.appendChild(chip);
      });
      if (entry.refs.length) block.appendChild(refWrap);
      els.topic.appendChild(block);
    });

    if (topic.seeAlso && topic.seeAlso.length) {
      var see = ST.el("div", { class: "see-also no-print" });
      see.appendChild(ST.el("span", { class: "muted small", style: "align-self:center", text: "See also:" }));
      topic.seeAlso.forEach(function (name) {
        var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        var btn = ST.el("button", { type: "button", text: name });
        btn.addEventListener("click", function () {
          ST.loadJSON(ST.siteRoot() + "data/topical/" + topic.source + "/" + (name[0].toLowerCase()) + ".json")
            .then(function (data) {
              var hit = data.topics.filter(function (t) { return t.name.toLowerCase() === name.toLowerCase() || t.slug === slug; })[0];
              if (hit) { activeSlug = hit.slug; showTopic(hit); renderList(); window.scrollTo({ top: 0, behavior: "smooth" }); }
              else ST.toast("Not in this edition");
            }).catch(function () { ST.toast("Not in this edition", true); });
        });
        see.appendChild(btn);
      });
      els.topic.appendChild(see);
    }

    document.title = topic.name + " — Topical Bible";
    try { history.replaceState(null, "", "?topic=" + encodeURIComponent(topic.source + ":" + topic.slug)); } catch (e) { /* file:// */ }
  }

  function findTopic(source, slug) {
    var letters = index.sources[source].letters || [];
    for (var i = 0; i < letters.length; i++) {
      var topics = cache[source + "." + letters[i]];
      if (!topics) continue;
      var hit = topics.filter(function (t) { return t.slug === slug; })[0];
      if (hit) return { letter: letters[i], topic: hit };
    }
    return null;
  }

  function setSource(value) {
    sources = [value];
    els.sourceSeg.querySelectorAll("button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-source") === value ? "true" : "false");
    });
    renderLetters();
    renderList();
  }

  var searchTimer = null;
  function init() {
    ST.loadJSON(ST.siteRoot() + "data/topical/index.json").then(function (data) {
      index = data;
      // Warm the first letter for both sources so search works immediately.
      loadActiveLetters("a").then(function () {});
      renderLetters();
      renderList();

      var q = ST.qs("topic");
      var parts = q ? q.split(":") : null;
      if (parts && index.sources[parts[0]]) {
        setSource(parts[0]);
        loadLetter(parts[0], parts[1][0].toLowerCase()).then(function (topics) {
          var hit = topics.filter(function (t) { return t.slug === parts[1]; })[0];
          if (hit) { activeLetter = parts[1][0].toLowerCase(); activeSlug = hit.slug; renderLetters(); renderList(); showTopic(hit); }
        });
      }
    }).catch(function () {
      els.topic.innerHTML = "";
      els.topic.appendChild(ST.el("div", { class: "notice error", text: "Could not load the topical data. Serve this folder over HTTP." }));
    });

    els.sourceSeg.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (btn) setSource(btn.getAttribute("data-source"));
    });

    els.search.addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderList, 250);
    });

    els.clear.addEventListener("click", function () {
      els.search.value = "";
      renderList();
    });
  }

  init();
})();
