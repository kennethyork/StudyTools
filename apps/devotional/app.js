(function () {
  "use strict";

  var COLORS = ["#b8863b", "#7a4f2b", "#3f7a52", "#8a5a83", "#4f6f8a", "#a8442f", "#6b7a3f",
    "#9a6a2f", "#5c7a6b", "#7a4f5c", "#4f7a7a", "#8a7a3b"];

  var els = {
    canvas: document.getElementById("wheel"),
    spin: document.getElementById("spin"),
    surprise: document.getElementById("surprise"),
    result: document.getElementById("result"),
    history: document.getElementById("history")
  };

  var topics = [];
  var rotation = 0;
  var spinning = false;
  var recent = [];

  function drawWheel() {
    var ctx = els.canvas.getContext("2d");
    var size = els.canvas.width;
    var center = size / 2;
    var radius = center - 6;
    var styles = getComputedStyle(document.documentElement);
    var hubFill = (styles.getPropertyValue("--card") || "").trim() || "#fffdf8";
    var ringStroke = (styles.getPropertyValue("--accent") || "").trim() || "#7a4f2b";
    ctx.clearRect(0, 0, size, size);

    var slice = (Math.PI * 2) / topics.length;
    topics.forEach(function (topic, i) {
      var start = i * slice - Math.PI / 2 - slice / 2;
      var end = start + slice;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.65)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(start + slice / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fffdf8";
      ctx.font = "600 25px Georgia, serif";
      ctx.fillText(topic.name, radius - 22, 9);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, 52, 0, Math.PI * 2);
    ctx.fillStyle = hubFill;
    ctx.fill();
    ctx.strokeStyle = ringStroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function pickIndex() {
    var available = topics.map(function (t, i) { return i; }).filter(function (i) { return recent.indexOf(topics[i].id) === -1; });
    if (!available.length) { recent = []; available = topics.map(function (t, i) { return i; }); }
    return available[Math.floor(Math.random() * available.length)];
  }

  function spinTo(index) {
    if (spinning) return;
    spinning = true;
    els.spin.disabled = true;

    var sliceDeg = 360 / topics.length;
    var targetCenter = index * sliceDeg + sliceDeg / 2;
    var turns = 4 + Math.floor(Math.random() * 3);
    var jitter = (Math.random() - 0.5) * (sliceDeg * 0.5);
    var currentMod = ((rotation % 360) + 360) % 360;
    var desired = (360 - targetCenter + jitter) % 360;
    var delta = turns * 360 + ((desired - currentMod + 360) % 360);
    rotation += delta;

    els.canvas.style.transform = "rotate(" + rotation + "deg)";

    setTimeout(function () {
      spinning = false;
      els.spin.disabled = false;
      reveal(index);
    }, 4100);
  }

  function reveal(index) {
    var topic = topics[index];
    recent.push(topic.id);
    if (recent.length > 3) recent.shift();

    els.result.innerHTML = "";
    els.result.appendChild(ST.el("div", { class: "row", style: "justify-content:space-between;align-items:baseline" }, [
      ST.el("h2", { text: topic.name }),
      ST.el("span", { class: "pill", text: "Topic" })
    ]));

    var scripture = topic.scriptures[Math.floor(Math.random() * topic.scriptures.length)];
    els.result.appendChild(ST.el("div", { class: "passage" }, [
      ST.el("div", { class: "ref", text: scripture.ref + " (" + scripture.translation + ")" }),
      ST.el("div", { class: "text", text: scripture.verse })
    ]));

    var qLabel = ST.el("h3", { class: "serif", style: "font-size:1.05rem;margin:14px 0 6px", text: "Talk about it" });
    var list = ST.el("ol", { class: "questions" });
    topic.questions.forEach(function (q) { list.appendChild(ST.el("li", { text: q })); });
    els.result.appendChild(qLabel);
    els.result.appendChild(list);

    var prayers = [topic.prayer];
    els.result.appendChild(ST.el("h3", { class: "serif", style: "font-size:1.05rem;margin:16px 0 0", text: "Pray together" }));
    els.result.appendChild(ST.el("div", { class: "prayer-box", text: prayers[0] }));

    els.result.appendChild(ST.el("div", { class: "row no-print", style: "margin-top:14px" }, [
      ST.el("button", { class: "secondary", text: "Copy devotional",
        onclick: function () { copyDevotional(topic, scripture); } })
    ]));

    var recentNames = recent.map(function (id) {
      var t = topics.filter(function (x) { return x.id === id; })[0];
      return t ? t.name : id;
    });
    els.history.textContent = recentNames.length ? "Recent: " + recentNames.join(" · ") : "";
    document.title = topic.name + " — Family Devotional";
  }

  function copyDevotional(topic, scripture) {
    var lines = ["Family Devotional — " + topic.name, ""];
    lines.push(scripture.ref + " (" + scripture.translation + ")");
    lines.push(scripture.verse, "");
    lines.push("Talk about it:");
    topic.questions.forEach(function (q, i) { lines.push((i + 1) + ". " + q); });
    lines.push("", "Pray together:", topic.prayer);
    ST.copyText(lines.join("\n")).then(function () { ST.toast("Devotional copied"); }, function () { ST.toast("Copy failed", true); });
  }

  function init() {
    ST.loadJSON(ST.siteRoot() + "data/devotional/topics.json").then(function (data) {
      topics = data.topics;
      drawWheel();
      els.spin.disabled = false;
    }).catch(function () {
      els.result.innerHTML = "";
      els.result.appendChild(ST.el("div", { class: "notice error", text: "Could not load devotional topics. Serve this folder over HTTP." }));
    });

    els.spin.addEventListener("click", function () { spinTo(pickIndex()); });
    els.surprise.addEventListener("click", function () {
      if (spinning) return;
      reveal(pickIndex());
    });
    els.canvas.addEventListener("click", function () { if (!spinning) spinTo(pickIndex()); });
    document.addEventListener("st:themechange", function () { if (topics.length) drawWheel(); });
  }

  els.spin.disabled = true;
  init();
})();
