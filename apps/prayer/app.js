(function () {
  "use strict";

  var JOURNAL_KEY = "prayer-journal.v1";

  /* Sunday-first weekly rhythm, matching the classic prayer guide:
     Sunday: Family, Monday: Community, Tuesday: Global Missions, etc. */
  var RHYTHM = [
    { day: "Sunday", category: "Family", desc: "Pray for each person in your household by name, and for relatives near and far." },
    { day: "Monday", category: "Community", desc: "Neighbours, coworkers, schools, local leaders, and the needs on your street." },
    { day: "Tuesday", category: "Global Missions", desc: "Missionaries, the persecuted church, and peoples who have not heard the gospel." },
    { day: "Wednesday", category: "Church", desc: "Your pastors, elders, teachers, volunteers, and the unity of the congregation." },
    { day: "Thursday", category: "Nation", desc: "Government leaders, justice, peace, and the vulnerable in your country." },
    { day: "Friday", category: "Sick & Suffering", desc: "The ill, the grieving, the lonely, and those carrying heavy burdens." },
    { day: "Saturday", category: "Unbelievers", desc: "Friends and family who do not yet know Christ, that their hearts would open." }
  ];

  var PROMPTS = {
    Family: [
      "Lord, thank You for the people You have placed in my home. Show me how to love them better.",
      "Pray a blessing over each person in your family, one by one.",
      "Where has your family been anxious? Bring that anxiety to God and ask for peace."
    ],
    Community: [
      "Who near you is struggling right now? Ask God to meet their need, and ask if you should help.",
      "Pray for the places you pass every day: shops, schools, bus stops, parks.",
      "Ask God to make you a good neighbour this week."
    ],
    "Global Missions": [
      "Pray for a country you have heard about in the news this week.",
      "Ask God to raise up workers for the harvest, and to sustain those already on the field.",
      "Pray for believers who face hostility for their faith."
    ],
    Church: [
      "Pray for your pastor by name, and for the sermon this Sunday to land in open hearts.",
      "Thank God for the people who serve quietly in your church.",
      "Ask for unity where there is disagreement, and courage where there is complacency."
    ],
    Nation: [
      "Pray for leaders to act with wisdom and integrity.",
      "Ask God to protect the vulnerable: the poor, the stranger, and the unborn.",
      "Pray for peace where there is conflict."
    ],
    "Sick & Suffering": [
      "Name the person you know who is hurting most right now. Ask God to comfort them.",
      "Pray for those in hospital, hospice, or long-term care today.",
      "Ask God for endurance for caregivers."
    ],
    Unbelievers: [
      "Name one person who does not know Christ. Pray for them by name.",
      "Ask God to arrange a conversation where the gospel can be shared naturally.",
      "Pray that obstacles to belief would be removed."
    ]
  };

  var VERSES = {
    Family: "Psalm 128:1",
    Community: "Jeremiah 29:7",
    "Global Missions": "Matthew 9:37-38",
    Church: "Ephesians 4:15-16",
    Nation: "1 Timothy 2:1-2",
    "Sick & Suffering": "Psalm 34:18",
    Unbelievers: "Romans 10:1"
  };

  var TIMER_KEY = "prayer-timer-minutes";

  var els = {
    todayLabel: document.getElementById("today-label"),
    todayCategory: document.getElementById("today-category"),
    todayPrompt: document.getElementById("today-prompt"),
    todayVerse: document.getElementById("today-verse"),
    catList: document.getElementById("cat-list"),
    readout: document.getElementById("timer-readout"),
    sub: document.getElementById("timer-sub"),
    ring: document.getElementById("ring"),
    toggle: document.getElementById("timer-toggle"),
    reset: document.getElementById("timer-reset"),
    focusMode: document.getElementById("focus-mode"),
    overlay: document.getElementById("focus-overlay"),
    focusTime: document.getElementById("focus-time"),
    focusCategory: document.getElementById("focus-category"),
    focusPrompt: document.getElementById("focus-prompt"),
    focusToggle: document.getElementById("focus-toggle"),
    focusExit: document.getElementById("focus-exit"),
    journalInput: document.getElementById("journal-input"),
    journalList: document.getElementById("journal-list"),
    includePrompt: document.getElementById("include-prompt")
  };

  var today = RHYTHM[new Date().getDay()];
  var totalSeconds = (ST.store(TIMER_KEY) || 5) * 60;
  var remaining = totalSeconds;
  var running = false;
  var tickHandle = null;

  function fmt(seconds) {
    var s = Math.max(0, Math.round(seconds));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function renderTimer() {
    var text = fmt(remaining);
    els.readout.textContent = text;
    els.focusTime.textContent = text;
    var circumference = 2 * Math.PI * 58;
    var fraction = totalSeconds ? remaining / totalSeconds : 0;
    els.ring.setAttribute("stroke-dashoffset", String(circumference * (1 - fraction)));
    els.toggle.textContent = running ? "Pause" : (remaining === totalSeconds ? "Start" : "Resume");
    els.focusToggle.textContent = running ? "Pause" : "Resume";
    els.sub.textContent = Math.round(totalSeconds / 60) + " minutes of focused prayer";
  }

  function stopTicker() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function startTimer() {
    if (running) return;
    running = true;
    stopTicker();
    tickHandle = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        running = false;
        stopTicker();
        ST.toast("Prayer time complete");
        try {
          var ctx = window.AudioContext ? new AudioContext() : null;
          if (ctx) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 528;
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
            osc.start();
            osc.stop(ctx.currentTime + 1.5);
          }
        } catch (e) { /* audio optional */ }
      }
      renderTimer();
    }, 1000);
    renderTimer();
  }

  function pauseTimer() {
    running = false;
    stopTicker();
    renderTimer();
  }

  function setMinutes(minutes) {
    pauseTimer();
    totalSeconds = minutes * 60;
    remaining = totalSeconds;
    ST.store(TIMER_KEY, minutes);
    renderTimer();
  }

  function renderToday() {
    var dateText = ST.formatDate(ST.todayISO(), { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    els.todayLabel.textContent = dateText;
    els.todayCategory.textContent = today.category;
    var prompts = PROMPTS[today.category];
    var prompt = prompts[new Date().getDate() % prompts.length];
    els.todayPrompt.textContent = prompt;
    els.todayVerse.textContent = "Suggested reading: " + VERSES[today.category];

    els.catList.innerHTML = "";
    RHYTHM.forEach(function (item) {
      var li = ST.el("li", { class: item.day === today.day ? "is-today" : "" }, [
        ST.el("span", { class: "cat-name", text: item.day }),
        ST.el("span", { class: "cat-desc", text: item.category + " — " + item.desc })
      ]);
      els.catList.appendChild(li);
    });

    els.focusCategory.textContent = today.category;
    els.focusPrompt.textContent = prompt;
  }

  function renderJournal() {
    var entries = ST.store(JOURNAL_KEY) || [];
    els.journalList.innerHTML = "";
    if (!entries.length) {
      els.journalList.appendChild(ST.el("p", { class: "muted small", text: "No entries yet. Your first one can be a single sentence." }));
      return;
    }
    entries.slice().reverse().forEach(function (entry, reverseIndex) {
      var index = entries.length - 1 - reverseIndex;
      var wrap = ST.el("div", { class: "journal-entry" }, [
        ST.el("div", { class: "head" }, [
          ST.el("span", { text: ST.formatDate(entry.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + " · " + entry.category }),
          ST.el("button", { class: "ghost", style: "font-size:.72rem;padding:2px 8px", text: "Delete",
            onclick: function () {
              if (!window.confirm("Delete this entry?")) return;
              entries.splice(index, 1);
              ST.store(JOURNAL_KEY, entries);
              renderJournal();
            } })
        ]),
        ST.el("p", { text: entry.text })
      ]);
      els.journalList.appendChild(wrap);
    });
  }

  function saveEntry() {
    var text = els.journalInput.value.trim();
    if (!text) { ST.toast("Write something first", true); return; }
    var entries = ST.store(JOURNAL_KEY) || [];
    var body = text;
    if (els.includePrompt.checked) {
      body = "[" + today.category + "] " + els.todayPrompt.textContent + "\n\n" + text;
    }
    entries.push({ date: ST.todayISO(), category: today.category, text: body });
    ST.store(JOURNAL_KEY, entries);
    els.journalInput.value = "";
    renderJournal();
    ST.toast("Entry saved");
  }

  function exportJournal() {
    var entries = ST.store(JOURNAL_KEY) || [];
    if (!entries.length) { ST.toast("Nothing to export", true); return; }
    var md = "# Prayer Journal\n\n";
    entries.forEach(function (entry) {
      md += "## " + entry.date + " — " + entry.category + "\n\n" + entry.text + "\n\n";
    });
    ST.download("prayer-journal.md", md, "text/markdown;charset=utf-8");
  }

  function bind() {
    els.toggle.addEventListener("click", function () { running ? pauseTimer() : startTimer(); });
    els.reset.addEventListener("click", function () { pauseTimer(); remaining = totalSeconds; renderTimer(); });
    els.focusToggle.addEventListener("click", function () { running ? pauseTimer() : startTimer(); });

    document.querySelectorAll("[data-minutes]").forEach(function (b) {
      b.addEventListener("click", function () { setMinutes(parseInt(b.getAttribute("data-minutes"), 10)); });
    });

    els.focusMode.addEventListener("click", function () {
      els.overlay.classList.remove("hidden");
      renderTimer();
      startTimer();
    });

    els.focusExit.addEventListener("click", function () {
      els.overlay.classList.add("hidden");
    });

    document.getElementById("save-entry").addEventListener("click", saveEntry);
    document.getElementById("export-journal").addEventListener("click", exportJournal);

    els.journalInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEntry();
    });
  }

  renderToday();
  renderJournal();
  renderTimer();
  bind();
})();
