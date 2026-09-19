(function () {
  "use strict";
  var els = {
    ref: document.getElementById("ref"),
    book: document.getElementById("book"),
    chapter: document.getElementById("chapter"),
    go: document.getElementById("go"),
    reader: document.getElementById("reader"),
    loading: document.getElementById("loading")
  };
  var books = [], currentData = null;
  function init() {
    ST.loadJSON(ST.siteRoot() + "data/bible/books.json").then(function (data) {
      books = data;
      els.book.innerHTML = "";
      books.forEach(function (b) { els.book.appendChild(ST.el("option", { value: b.slug, text: b.name })); });
      els.book.onchange = fillChapters;
      fillChapters();
    });
    els.go.onclick = function () {
      var slug = els.book.value, chapter = els.chapter.value;
      if (slug && chapter) show(slug, chapter);
    };
    els.ref.onkeydown = function (e) {
      if (e.key === "Enter") {
        var parts = els.ref.value.split(/\s+/);
        if (parts.length >= 2) {
          var book = books.find(function (b) { return b.name.toLowerCase() === parts[0].toLowerCase(); });
          if (book) {
            els.book.value = book.slug;
            els.chapter.value = parts[1].replace(/[^0-9]/g, "");
            show(book.slug, els.chapter.value);
          }
        }
      }
    };
  }
  function fillChapters() {
    var book = books.find(function (b) { return b.slug === els.book.value; });
    els.chapter.innerHTML = "";
    if (book) {
      for (var i = 1; i <= book.chapters; i++) els.chapter.appendChild(ST.el("option", { value: i, text: i.toString() }));
    }
  }
  function show(slug, chapter) {
    els.loading.classList.add("visible");
    ST.loadJSON(ST.siteRoot() + "data/bible/" + slug + ".KJV.json").then(function (data) {
      currentData = data;
      render(data, chapter);
      els.loading.classList.remove("visible");
    }).catch(function (err) {
      els.loading.classList.remove("visible");
      els.reader.innerHTML = '<div class="card"><p class="error">Failed to load KJV data.</p></div>';
    });
  }
  function render(data, chapter) {
    var chapterData = data.chapters[chapter];
    if (!chapterData) { els.reader.innerHTML = '<div class="card"><p class="muted">Chapter not found.</p></div>'; return; }
    var html = '<div class="card"><h2>' + data.book + ' ' + chapter + '</h2>';
    for (var v in chapterData) {
      html += '<div class="verse-block" id="v-' + v + '"><div class="verse-num">' + v + '</div>';
      html += '<div class="verse-text">' + chapterData[v] + '</div>';
      html += '<div class="verse-modern" id="m-' + v + '"></div>';
      html += '<button class="modernize-btn" onclick="ST.apps.kjv_reader.modernize(\'' + v + '\')">Modernize</button></div>';
    }
    els.reader.innerHTML = html + '</div>';
  }
  window.ST.apps = window.ST.apps || {};
  window.ST.apps.kjv_reader = {
    modernize: function (vId) {
      var textEl = document.getElementById('v-' + vId).querySelector('.verse-text');
      var modEl = document.getElementById('m-' + vId);
      var btn = document.querySelector('#v-' + vId + ' .modernize-btn');
      var txt = textEl.innerText;
      btn.disabled = true; btn.innerText = "...";
      modEl.classList.add("visible"); modEl.innerText = "Thinking...";
      fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemma4:26b",
          prompt: "Modernize this King James Version Bible verse into natural, modern English. Provide ONLY the modernized text: " + txt,
          stream: false
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        modEl.innerText = j.response.trim();
        btn.innerText = "Done";
      }).catch(function (e) {
        modEl.innerText = "Error: Could not reach Ollama.";
        btn.innerText = "Retry";
        btn.disabled = false;
      });
    }
  };
  init();
})();