/* Your Data: read what this browser holds, export it, and merge another
   device's copy into it. The rules live in js/data.js; this is the page.
   Depends on js/common.js and js/data.js. */
(function () {
  "use strict";

  var els = {
    summary: document.getElementById("summary"),
    keys: document.getElementById("keys"),
    exportJson: document.getElementById("export-json"),
    makeCode: document.getElementById("make-code"),
    copyCode: document.getElementById("copy-code"),
    code: document.getElementById("code"),
    makeLink: document.getElementById("make-link"),
    link: document.getElementById("link"),
    file: document.getElementById("file"),
    useCode: document.getElementById("use-code"),
    report: document.getElementById("report")
  };

  /* The raw store, so the keys can be listed as well as read. */
  function rawStore() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        out[key] = localStorage.getItem(key);
      }
    } catch (e) { /* private mode, or storage switched off */ }
    return out;
  }

  function localData() { return STData.collect(rawStore()); }

  function writeData(data) {
    Object.keys(data || {}).forEach(function (short) {
      ST.store(short, data[short]);
    });
  }

  var LABELS = {
    "verse-notes.v1": "Verse notes",
    "reading-plan.v1": "Reading plan and ticks",
    "memory-deck.v1": "Memory deck",
    "vocab-progress.v1": "Vocabulary marked known",
    "prayer-journal.v1": "Prayer journal",
    "sermon-notebook.v1": "Sermon notebook",
    "blog-ideas.v1": "Saved blog ideas",
    "bible-translation.v1": "Preferred Bible translation",
    "study-translation.v1": "Preferred study translation",
    "parallels-translation.v1": "Preferred parallels translation",
    "answer-model.v1": "Chosen local model",
    "ask-model.v1": "Chosen local model"
  };

  function render() {
    var data = localData();
    els.summary.textContent = STData.describe(data);
    els.keys.innerHTML = "";
    Object.keys(data).sort().forEach(function (key) {
      var value = JSON.stringify(data[key]);
      els.keys.appendChild(ST.el("div", { class: "k" }, [
        ST.el("span", { class: "n", text: LABELS[key] || key }),
        ST.el("span", { class: "v", text: (value ? value.length : 0) + " bytes" })
      ]));
    });
    if (!Object.keys(data).length) {
      els.keys.appendChild(ST.el("p", { class: "muted small",
        text: "Nothing yet: write a note, tick a day, or mark a word known and it appears here." }));
    }
  }

  function report(rows) {
    els.report.innerHTML = "";
    if (!rows.length) { return; }
    rows.forEach(function (r) {
      els.report.appendChild(ST.el("li", {}, [
        ST.el("span", { class: "act", text: r.action }),
        document.createTextNode(" \u2014 " + (LABELS[r.key] || r.key) + ": " + r.note)
      ]));
    });
    els.report.appendChild(ST.el("li", { class: "muted small",
      text: "Your data is now the two devices' copies brought together." }));
  }

  function importData(incoming) {
    var result = STData.merge(localData(), incoming);
    writeData(result.data);
    report(result.report);
    render();
    ST.toast("Brought in " + STData.describe(incoming));
  }

  function exportJson() {
    var data = localData();
    var payload = { format: STData.FORMAT, version: STData.VERSION,
      exported: new Date().toISOString(), data: data };
    ST.download("studytools-backup.json", JSON.stringify(payload, null, 2), "application/json");
    ST.toast("Backup downloaded");
  }

  function makeCode() {
    els.code.value = "";
    els.code.placeholder = "Packing\u2026";
    return STData.toCode(localData()).then(function (code) {
      els.code.value = code;
      els.copyCode.disabled = false;
      els.makeLink.disabled = false;
      els.useCode.disabled = false;
      return code;
    }).catch(function () {
      els.code.placeholder = "Could not make a code in this browser.";
    });
  }

  function showLink() {
    if (!els.code.value) { return; }
    var url = location.origin + location.pathname + "#d=" + encodeURIComponent(els.code.value);
    els.link.textContent = "";
    els.link.appendChild(ST.el("a", { href: url, text: "Open this on the other device \u2014 the code is in the link, after the #" }));
    els.link.appendChild(document.createTextNode(" (" + url.length + " characters.)"));
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        if (!parsed || parsed.format !== STData.FORMAT) { throw new Error("not a backup of this site"); }
        importData(parsed.data || {});
      } catch (err) {
        ST.toast("That file could not be read: " + err.message, true);
      }
    };
    reader.readAsText(file);
  }

  function init() {
    render();

    els.exportJson.addEventListener("click", exportJson);
    els.makeCode.addEventListener("click", makeCode);

    els.copyCode.addEventListener("click", function () {
      ST.copyText(els.code.value);
      ST.toast("Code copied \u2014 paste it on the other device");
    });

    els.makeLink.addEventListener("click", showLink);

    els.useCode.addEventListener("click", function () {
      var code = els.code.value.trim();
      if (!code) { return; }
      STData.fromCode(code).then(importData).catch(function (err) {
        ST.toast("That code could not be read: " + err.message, true);
      });
    });

    els.file.addEventListener("change", function () {
      if (els.file.files && els.file.files[0]) { readFile(els.file.files[0]); }
    });

    /* A code can arrive as a link: apps/sync/#d=<code> */
    var fromHash = STData.codeFromHash(location.hash);
    if (fromHash) {
      els.code.value = fromHash;
      els.copyCode.disabled = false;
      els.useCode.disabled = false;
      STData.fromCode(fromHash).then(function (data) {
        var s = STData.summary(data);
        els.report.innerHTML = "";
        els.report.appendChild(ST.el("li", {}, [
          ST.el("span", { class: "act", text: "waiting" }),
          document.createTextNode(" \u2014 this link carries " + STData.describe(data) +
            " (notes " + s.notes + ", ticks " + s.ticks + ", cards " + s.deck + "). Press " +
            "\u201cImport the code above\u201d to bring it together with what is here.")
        ]));
      }).catch(function () {
        ST.toast("The code in this link could not be read", true);
      });
    }
  }

  init();
})();
