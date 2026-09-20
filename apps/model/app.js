/* Can this machine run the local model? js/ask.js answers that with a reason and
   a sentence about what the machine reported; this page is that answer, made
   readable, with the fix for whichever reason it is. No model is fetched here:
   the check asks the browser about WebGPU and stops. */
(function () {
  "use strict";

  var el = document.getElementById("result");

  function row(term, value) {
    if (!value) { return null; }
    var wrap = document.createElement("div");
    var dt = document.createElement("dt");
    dt.textContent = term;
    var dd = document.createElement("dd");
    dd.textContent = value;
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    return wrap;
  }

  function link(href, text) {
    var a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    a.textContent = text;
    return a;
  }

  function para(parts, className) {
    var p = document.createElement("p");
    if (className) { p.className = className; }
    (parts || []).forEach(function (part) {
      p.appendChild(typeof part === "string" ? document.createTextNode(part) : part);
    });
    return p;
  }

  function cannot(diag) {
    el.appendChild(document.createElement("h2")).textContent = "The answer";
    var v = document.createElement("p");
    v.className = "verdict bad";
    v.textContent = diag.reason === "no-adapter"
      ? "Not on this machine as it stands: WebGPU is here, but no GPU adapter is behind it."
      : "Not on this machine: this browser has no WebGPU.";
    el.appendChild(v);
    el.appendChild(para([STAsk.advice(diag.reason)], "advice"));
    el.appendChild(para(["Chrome and Edge 121+, Safari 26 and Firefox 141+ have WebGPU. Check this " +
      "browser at ", link("https://webgpureport.org/", "webgpureport.org"), ", or open ",
      "chrome://gpu in Chrome and look for the line beginning WebGPU."]));
    var facts = document.createElement("dl");
    facts.className = "facts";
    [row("What the browser said", diag.detail),
     row("Adapter", diag.adapter ? [diag.adapter.vendor, diag.adapter.architecture,
       diag.adapter.description].filter(Boolean).join(" ") : ""),
     row("Device memory", diag.memory ? "about " + diag.memory + " GB" : ""),
     row("Browser reports", navigator.userAgent)].forEach(function (r) {
      if (r) { facts.appendChild(r); }
    });
    el.appendChild(facts);
    el.appendChild(para(["If none of that helps, the line above is the thing to quote when asking " +
      "someone: it says what the browser itself reported, which is the difference between a browser " +
      "that is too old and a machine whose GPU the browser will not use."], "muted small"));
    el.appendChild(para(["Everything else on this site works without the model &mdash; the reader, " +
      "the commentary, the concordance, the original languages and the notes are all plain files."],
      "muted small"));
  }

  function can(diag) {
    el.appendChild(document.createElement("h2")).textContent = "The answer";
    var v = document.createElement("p");
    v.className = "verdict good";
    v.textContent = "Yes. This machine can run the model.";
    el.appendChild(v);
    el.appendChild(para(["The reader's verse panel is where you turn it on. It is off until you ask " +
      "for it, the download happens once, and after that it runs on your device with nothing sent " +
      "anywhere."]));
    var facts = document.createElement("dl");
    facts.className = "facts";
    [row("Adapter", diag.adapter ? [diag.adapter.vendor, diag.adapter.architecture,
       diag.adapter.description].filter(Boolean).join(" ") : ""),
     row("Device memory", diag.memory ? "about " + diag.memory + " GB" : ""),
     row("Browser reports", navigator.userAgent)].forEach(function (r) { if (r) { facts.appendChild(r); } });
    el.appendChild(facts);
    var list = document.createElement("div");
    list.style.marginTop = "12px";
    (STAsk.MODELS || []).forEach(function (m) {
      var line = document.createElement("div");
      line.className = "model-row";
      var left = document.createElement("div");
      left.appendChild(document.createTextNode(m.label + " "));
      var note = document.createElement("span");
      note.className = "muted small";
      note.textContent = m.note || "";
      left.appendChild(note);
      var size = document.createElement("span");
      size.className = "size";
      size.textContent = m.size || "";
      line.appendChild(left);
      line.appendChild(size);
      list.appendChild(line);
    });
    el.appendChild(list);
    el.appendChild(para([link("../bible/", "Open the reader and turn it on \u2192")]));
  }

  function run() {
    el.innerHTML = "";
    el.appendChild(para(["Checking\u2026"], "muted small"));
    STAsk.diagnose().then(function (diag) {
      el.innerHTML = "";
      if (diag.ok) { can(diag); } else { cannot(diag); }
      var again = document.createElement("button");
      again.type = "button";
      again.textContent = "Check again";
      again.style.marginTop = "14px";
      again.addEventListener("click", run);
      el.appendChild(again);
    });
  }

  document.title = "Can this machine run the model? — StudyTools";
  run();
})();
