(function () {
  "use strict";

  var STORAGE_KEY = "sermon-notebook.v1";

  var TEMPLATES = {
    soap: function (meta) {
      return [
        "# " + (meta.title || "Sermon notes"),
        "",
        "**Speaker:** " + (meta.speaker || "") + "  ",
        "**Passage:** " + (meta.passage || "") + "  ",
        "**Date:** " + (meta.date || ""),
        "",
        "## S — Scripture",
        "> " + (meta.passage || "Write out the passage here."),
        "",
        "## O — Observation",
        "What does the text say? (Who, what, when, where, why, how)",
        "",
        "- ",
        "",
        "## A — Application",
        "What does this mean for my life this week?",
        "",
        "- ",
        "",
        "## P — Prayer",
        "Write your response to God.",
        "",
        "> ",
        "",
        "## Notes",
        "- "
      ].join("\n");
    },
    inductive: function (meta) {
      return [
        "# " + (meta.title || "Inductive study"),
        "",
        "**Passage:** " + (meta.passage || "") + "  ",
        "**Date:** " + (meta.date || ""),
        "",
        "## 1. Observation — What does it say?",
        "- Key words and repeated phrases:",
        "- People, places, and structure:",
        "- ",
        "",
        "## 2. Interpretation — What does it mean?",
        "- Context (before and after):",
        "- Cross-references:",
        "- ",
        "",
        "## 3. Application — What do I do?",
        "- Sin to confess:",
        "- Promise to trust:",
        "- Example to follow:",
        "- ",
        "",
        "## Outline",
        "1. ",
        "2. ",
        "3. ",
        "",
        "## Prayer"
      ].join("\n");
    },
    expository: function (meta) {
      return [
        "# " + (meta.title || "Expository outline"),
        "",
        "**Preacher:** " + (meta.speaker || "") + "  ",
        "**Text:** " + (meta.passage || "") + "  ",
        "**Date:** " + (meta.date || ""),
        "",
        "## Big idea",
        "> The main point of the passage in one sentence.",
        "",
        "## Introduction",
        "- ",
        "",
        "## I. First point",
        "> Supporting verse",
        "- Explanation:",
        "- Illustration:",
        "- Application:",
        "",
        "## II. Second point",
        "> Supporting verse",
        "- Explanation:",
        "- Illustration:",
        "- Application:",
        "",
        "## III. Third point",
        "> Supporting verse",
        "- Explanation:",
        "- Illustration:",
        "- Application:",
        "",
        "## Conclusion / Gospel connection",
        "",
        "## Takeaway this week",
        "- "
      ].join("\n");
    },
    notes: function (meta) {
      return [
        "# " + (meta.title || "Sermon notes"),
        "",
        "**Speaker:** " + (meta.speaker || "") + "  ",
        "**Passage:** " + (meta.passage || "") + "  ",
        "**Date:** " + (meta.date || ""),
        "",
        "## Notes",
        "- ",
        "",
        "## Key verse",
        "> ",
        "",
        "## Application",
        "- ",
        "",
        "## Prayer requests",
        "- "
      ].join("\n");
    }
  };

  var els = {
    title: document.getElementById("sermon-title"),
    speaker: document.getElementById("sermon-speaker"),
    passage: document.getElementById("sermon-passage"),
    date: document.getElementById("sermon-date"),
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    status: document.getElementById("save-status")
  };

  function meta() {
    return {
      title: els.title.value.trim(),
      speaker: els.speaker.value.trim(),
      passage: els.passage.value.trim(),
      date: els.date.value
    };
  }

  function renderPreview() {
    els.preview.innerHTML = window.SermonMarkdown.render(els.editor.value);
    var heading = meta().title;
    document.title = (heading || "Sermon Notebook") + " — StudyTools";
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      ST.store(STORAGE_KEY, {
        title: els.title.value,
        speaker: els.speaker.value,
        passage: els.passage.value,
        date: els.date.value,
        body: els.editor.value,
        updated: new Date().toISOString()
      });
      els.status.textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }, 300);
  }

  function load() {
    var saved = ST.store(STORAGE_KEY);
    if (saved) {
      els.title.value = saved.title || "";
      els.speaker.value = saved.speaker || "";
      els.passage.value = saved.passage || "";
      els.date.value = saved.date || "";
      els.editor.value = saved.body || "";
      els.status.textContent = "Loaded from this browser";
    } else {
      els.date.value = ST.todayISO();
      els.editor.value = TEMPLATES.soap(meta());
    }
    renderPreview();
  }

  function applyTemplate(name) {
    var m = meta();
    if (m.date === "") m.date = ST.todayISO();
    if (els.editor.value.trim() !== "" && !window.confirm("Replace the current note with the " + name.toUpperCase() + " template?")) {
      return;
    }
    els.editor.value = TEMPLATES[name](m);
    if (!els.title.value) {
      els.title.value = name === "soap" ? "SOAP journal" : name === "inductive" ? "Inductive study" : name === "expository" ? "Sermon outline" : "Sermon notes";
    }
    renderPreview();
    save();
  }

  function plainTextOutline() {
    var m = meta();
    var lines = [];
    if (m.title) lines.push(m.title.toUpperCase(), "");
    if (m.speaker) lines.push("Speaker: " + m.speaker);
    if (m.passage) lines.push("Passage: " + m.passage);
    if (m.date) lines.push("Date: " + ST.formatDate(m.date, { year: "numeric", month: "long", day: "numeric" }));
    lines.push("");
    els.editor.value.split("\n").forEach(function (line) {
      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      var bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      var numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      var quote = line.match(/^>\s?(.*)$/);
      if (heading) {
        lines.push(heading[2].toUpperCase());
      } else if (numbered) {
        lines.push("  " + numbered[1] + ". " + numbered[2]);
      } else if (bullet) {
        lines.push("  - " + bullet[1]);
      } else if (quote) {
        lines.push("  \"" + quote[1] + "\"");
      } else if (line.trim() !== "") {
        lines.push(line);
      }
    });
    return lines.join("\n");
  }

  function bind() {
    [els.title, els.speaker, els.passage, els.date].forEach(function (input) {
      input.addEventListener("input", function () {
        if (input === els.title || input === els.speaker || input === els.passage) {
          document.title = (els.title.value.trim() || "Sermon Notebook") + " — StudyTools";
        }
        save();
      });
    });

    els.editor.addEventListener("input", function () { renderPreview(); save(); });

    document.querySelectorAll("[data-template]").forEach(function (btn) {
      btn.addEventListener("click", function () { applyTemplate(btn.getAttribute("data-template")); });
    });

    document.getElementById("export-pdf").addEventListener("click", function () {
      window.print();
    });

    document.getElementById("copy-md").addEventListener("click", function () {
      ST.copyText(els.editor.value).then(function () { ST.toast("Markdown copied"); }, function () { ST.toast("Copy failed", true); });
    });

    document.getElementById("copy-text").addEventListener("click", function () {
      ST.copyText(plainTextOutline()).then(function () { ST.toast("Outline copied"); }, function () { ST.toast("Copy failed", true); });
    });

    document.getElementById("download-md").addEventListener("click", function () {
      var name = (meta().title || "sermon-notes").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      ST.download(name + ".md", els.editor.value, "text/markdown;charset=utf-8");
    });

    document.getElementById("clear-note").addEventListener("click", function () {
      if (!window.confirm("Clear the notebook? This cannot be undone.")) return;
      els.title.value = "";
      els.speaker.value = "";
      els.passage.value = "";
      els.date.value = ST.todayISO();
      els.editor.value = TEMPLATES.notes(meta());
      renderPreview();
      save();
    });
  }

  bind();
  load();
})();
