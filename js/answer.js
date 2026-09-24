/* Asking the site itself, with no model anywhere.

   The reader can offer a small language model, which needs WebGPU and a download,
   and cannot run everywhere. This is the other half: a question answered out of
   the files this site already holds — the commentary, the dictionaries, the
   cross-references, the topical Bibles, the interlinear and the concordance —
   with every part of the answer cited back to the book it came from.

   Nothing here is generated. A question is turned into a plan of lookups, the
   lookups are made, and what they return is what you are shown; where they return
   nothing, it says so rather than filling the space. That is why it works with no
   GPU, no network and no waiting: it is a reader of this site's own shelves.

   classify() is pure and answer() takes its data through `ctx`, so the whole
   thing can be checked in node against the real files (scripts/check-answer.js)
   without a browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { root.STAnswer = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BOOKS_OF_THE_BIBLE = ["genesis", "exodus", "leviticus", "numbers", "deuteronomy",
    "joshua", "judges", "ruth", "i-samuel", "ii-samuel", "i-kings", "ii-kings",
    "i-chronicles", "ii-chronicles", "ezra", "nehemiah", "esther", "job", "psalms",
    "proverbs", "ecclesiastes", "song-of-solomon", "isaiah", "jeremiah", "lamentations",
    "ezekiel", "daniel", "hosea", "joel", "amos", "obadiah", "jonah", "micah", "nahum",
    "habakkuk", "zephaniah", "haggai", "zechariah", "malachi", "matthew", "mark", "luke",
    "john", "acts", "romans", "i-corinthians", "ii-corinthians", "galatians", "ephesians",
    "philippians", "colossians", "i-thessalonians", "ii-thessalonians", "i-timothy",
    "ii-timothy", "titus", "philemon", "hebrews", "james", "i-peter", "ii-peter",
    "i-john", "ii-john", "iii-john", "jude", "revelation-of-john"];

  var STOPWORDS = ("a an the of in on at to for from with about into over under is are was were be been " +
    "being am do does did who whom whose what which when where why how that this these those there " +
    "here and or but if then than so as it its he she they them his her their our your my me you we us " +
    "does did can could should would will shall may might must say says said tell show give find help " +
    "please bible scripture verse verses passage chapter mean means meaning definition explain " +
    "understand about concerning regarding according").split(/\s+/);

  /* ---------- reading the question ---------- */

  function words(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/)
      .filter(function (w) { return w && STOPWORDS.indexOf(w) === -1; });
  }

  /* H0853 and H853 are the same number: the interlinear and the vocabulary decks
     pad with zeros and the concordance does not, so every comparison goes through
     this. */
  function normalizeStrongs(value) {
    var m = String(value == null ? "" : value).toUpperCase().match(/([HG])\s*0*(\d{1,4})/);
    return m ? m[1] + String(Number(m[2])) : null;
  }

  function strongsNumber(text) {
    var m = String(text || "").match(/\b([HG])\s*0*(\d{1,4})\b/i);
    if (m) { return normalizeStrongs(m[0]); }
    m = String(text || "").match(/\bstrong'?s?\s*(?:number|no\.?)?\s*0*(\d{1,4})\b/i);
    if (m) {
      var n = Number(m[1]);
      return (n >= 1 && n <= 8674) ? "H" + n : "G" + n;
    }
    return null;
  }

  /* A reference, however it is written: "John 3:16", "1 Cor 13", "ps 23:1-4" —
     inside a sentence as often as on its own ("what does John 3:16 say?"). The
     caller's parser is tried first; if it cannot read what is plainly there, the
     pieces are put together here, so a weak parser upstream does not turn a
     reference into a word search. */
  function reference(text, parseRef, normalizeBook) {
    var raw = String(text || "").trim();
    var parsed = parseRef ? parseRef(raw) : null;
    if (parsed) { return parsed; }
    var m = raw.match(/\b((?:[1-4]|I{1,3})\s*)?([A-Za-z][A-Za-z.]{1,15})\s+(\d{1,3})(?::(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?/);
    if (!m) { return null; }
    var guess = m[0].trim();
    parsed = parseRef ? parseRef(guess) : null;
    if (parsed) { return parsed; }
    var book = normalizeBook ? normalizeBook((m[1] || "") + m[2]) : null;
    if (!book) { return null; }
    var start = m[4] ? Number(m[4]) : null;
    return { book: book, chapter: Number(m[3]),
             verseStart: start, verseEnd: m[5] ? Number(m[5]) : start };
  }

  function wantsComparison(text) {
    return /\b(compare|comparison|side by side|other translations|every translation|versions)\b/i.test(text);
  }

  /* What the question is asking for, as a plan rather than a guess at a single
     intent: a question can name a reference and a word, and then both are shown. */
  function classify(question, parseRef, normalizeBook) {
    var text = String(question || "").trim();
    var plan = { question: text, ref: null, number: null, terms: [], wantsComparison: false,
                 askedFor: [] };
    if (!text) { return plan; }
    plan.ref = reference(text, parseRef, normalizeBook);
    plan.number = strongsNumber(text);
    plan.wantsComparison = wantsComparison(text);
    if (plan.ref) { plan.askedFor.push("reference"); }
    if (plan.number) { plan.askedFor.push("number"); }
    if (/\b(hebrew|greek|original)\b/i.test(text)) { plan.askedFor.push("original"); }
    if (/\b(prayer book|office|lectionary|liturgy|appointed)\b/i.test(text)) { plan.askedFor.push("liturgy"); }
    var terms = words(text);
    if (!plan.ref && !plan.number) {
      /* the terms the lookups can actually use: longest words first, and the
         whole question is kept when it is short enough to be a name or a topic */
      plan.terms = terms.slice().sort(function (a, b) { return b.length - a.length; }).slice(0, 4);
      if (terms.length && terms.join(" ").length <= 40) { plan.terms.unshift(terms.join(" ")); }
      plan.askedFor.push("word");
    }
    return plan;
  }

  /* ---------- building the answer ---------- */

  function block(title, lines, links, source) {
    return { title: title, lines: lines || [], links: links || [], source: source || null };
  }

  function refLabel(bookName, chapter, verse) {
    return bookName + " " + chapter + (verse ? ":" + verse : "");
  }

  /* A reading from the Prayer Book, named as plainly as can be when the lectionary
     that knows how to name them is not handed in. This block used to ask for
     r.label || r.name || String(r) — and a reading carries `where`, `slot` and
     `kind`, none of them a label — so every line of the block came out as
     "[object Object]". */
  function readingLine(h, ctx) {
    if (ctx && ctx.readingLabel) { return ctx.readingLabel(h); }
    if (!h) { return ""; }
    return [h.where, h.slot, h.kind].filter(Boolean).join(" \u00b7 ");
  }

  /* The text of one verse, or undefined. It used to hand back the whole chapter
     when it was asked for an undefined verse — a parsed reference carries
     verseStart, not verse — and every line of the passage came out as
     "[object Object]". */
  function verseOf(data, chapter, verse) {
    var c = (data && data.chapters && data.chapters[String(chapter)]) || {};
    return verse == null ? undefined : c[String(verse)];
  }

  function passageBlocks(plan, ctx) {
    var done = [];
    var ref = plan.ref;
    var books = ctx.books ? ctx.books() : [];
    var book = null;
    for (var i = 0; i < books.length; i++) { if (books[i].slug === ref.book) { book = books[i]; } }
    if (!book) { return { blocks: done, missing: true }; }

    var translations = (book.translations || []).slice(0, 24);
    var asked = plan.wantsComparison ? translations : translations.slice(0, 3);

    var read = asked.map(function (tr) {
      return ctx.chapter(ref.book, tr, ref.chapter).then(function (data) {
        return { tr: tr, data: data };
      }).catch(function () { return null; });
    });

    return Promise.all(read).then(function (loaded) {
      var lines = [];
      var at = ref.verse != null ? ref.verse : ref.verseStart;
      loaded.forEach(function (item) {
        if (!item || !item.data) { return; }
        var text = verseOf(item.data, ref.chapter, at);
        if (!text) { return; }
        var label = refLabel(book.name, ref.chapter, at);
        lines.push({ text: text, who: item.tr, ref: label });
      });
      if (lines.length) {
        done.push(block(plan.wantsComparison ? "Every translation here" : "The passage",
          lines.map(function (l) { return { who: l.who, text: l.text }; }),
          [{ href: "apps/bible/?ref=" + encodeURIComponent(
            refLabel(book.name, ref.chapter, ref.verse != null ? ref.verse : ref.verseStart)),
            text: "Read it in the reader" },
           { href: "apps/matrix/?ref=" + encodeURIComponent(refLabel(book.name, ref.chapter)),
             text: "Compare the chapter" },
           { href: "apps/study/?ref=" + encodeURIComponent(
             refLabel(book.name, ref.chapter, ref.verse != null ? ref.verse : ref.verseStart)),
             text: "Everything on this passage" }]));
      }

      /* the commentators, on the verse that opens the passage */
      var at = ref.verse != null ? ref.verse : ref.verseStart;
      return ctx.commentary(ref.book, ref.chapter).then(function (commentary) {
        var entries = ((commentary || {}).verses || {})[String(at)] || [];
        if (!entries.length) {
          var intros = ((commentary || {}).introductions || []);
          if (intros.length) {
            done.push(block("What the commentators said", [], [],
              { who: intros[0].short, year: intros[0].year,
                text: (intros[0].paragraphs || []).join(" ").slice(0, 900) }));
          }
          return null;
        }
        entries.slice(0, 4).forEach(function (entry) {
          done.push(block("What the commentators said", [], [],
            { who: entry.short, text: entry.text }));
        });
        return null;
      }).catch(function () { return null; });
    }).then(function () {
      return ctx.crossref(ref.book, ref.chapter).catch(function () { return null; });
    }).then(function (xref) {
      var at = ref.verse != null ? ref.verse : ref.verseStart;
      var refs = ((xref || {}).refs || []).filter(function (r) { return r.from === at; })
        .sort(function (a, b) { return b.votes - a.votes; }).slice(0, 6);
      if (refs.length) {
        done.push(block("Where else Scripture points", refs.map(function (r) {
          var to = r.to;
          return { text: refLabel(titleCase(to.book), to.chapter,
            to.verseStart === to.verseEnd ? to.verseStart : to.verseStart + "-" + to.verseEnd),
            who: r.votes + (r.votes === 1 ? " vote" : " votes") };
        }), [{ href: "apps/xref/?ref=" + encodeURIComponent(refLabel(book.name, ref.chapter, at)),
               text: "All the cross-references" }]));
      }
      return null;
    }).then(function () {
      return ctx.interlinear(ref.book, ref.chapter).catch(function () { return null; });
    }).then(function (inter) {
      var at = ref.verse != null ? ref.verse : ref.verseStart;
      var ws = ((inter || {}).verses || {})[String(at)] || [];
      if (ws.length) {
        done.push(block("The words behind it", ws.slice(0, 14).map(function (w) {
          return { text: w.s + " " + (w.l || "") + " " + (w.t ? "(" + w.t + ")" : "") + " \u2014 " +
            (w.e || "no gloss on file"), who: w.g || "" };
        }), [{ href: "apps/interlinear/?strong=" + encodeURIComponent(ws[0].s),
               text: "Every verse this first word appears in" },
             { href: "apps/interlinear/?ref=" + encodeURIComponent(refLabel(book.name, ref.chapter)),
               text: "The chapter word by word" }]));
      }
      return null;
    }).then(function () {
      if (!ctx.readings) { return null; }
      return ctx.readings(ref.book, ref.chapter, ref.verse != null ? ref.verse : ref.verseStart)
        .then(function (readings) {
          if (readings && readings.length) {
            /* no source on this block: the title already says whose readings these
               are, and a source is printed after the title as well as in the sources
               line, where it would then read twice */
            done.push(block("Read in the Prayer Book (1928)",
              readings.slice(0, 6).map(function (r) { return { text: readingLine(r, ctx) }; }),
              [{ href: "apps/lectionary/", text: "The lectionary" }]));
          }
          return null;
        }).catch(function () { return null; });
    }).then(function () { return { blocks: done, book: book }; });
  }

  function titleCase(slug) {
    return String(slug || "").split("-").map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }).join(" ").replace(/\bI\b/g, "I").replace(/\bIi\b/g, "II").replace(/\bIii\b/g, "III");
  }

  function numberBlocks(plan) {
    /* the loaders live on ctx, and `this` does not survive into the callbacks
       below, so it is kept here */
    var ctx = this || {};
    var letter = plan.number.charAt(0);
    var want = plan.number;
    return Promise.all([
      ctx.vocab ? Promise.resolve(ctx.vocab(letter === "H" ? "hebrew" : "greek"))
        .catch(function () { return null; }) : null,
      ctx.concordance ? Promise.resolve(ctx.concordance(letter))
        .catch(function () { return null; }) : null
    ]).then(function (loaded) {
      var vocab = loaded[0], conc = loaded[1];
      var blocks = [];
      var word = null;
      if (vocab && vocab.words) {
        for (var i = 0; i < vocab.words.length; i++) {
          var w = vocab.words[i];
          var num = normalizeStrongs(w.strongs || w.s || w.number || w.id);
          if (String(num).toUpperCase() === want) { word = w; break; }
        }
      }
      var entry = conc && ((conc.words || {})[want]);
      var lines = [];
      if (word) {
        lines.push({ text: (word.lemma || word.l || "") + " " + (word.translit || word.t || "") +
          " \u2014 " + (word.gloss || word.e || "no gloss on file"),
          who: (word.frequency ? word.frequency + " times in " + (vocab.language === "hebrew" ? "the Hebrew Bible" : "the Greek New Testament") : "the original text") });
      }
      if (entry) {
        lines.push({ text: entry.l + " " + (entry.t ? "(" + entry.t + ")" : "") + " \u2014 " + entry.e,
          who: entry.n.toLocaleString() + " verses in this site's translations" });
      }
      if (!word && !entry) { return blocks; }
      blocks.push(block("The word " + want, lines,
        [{ href: "apps/interlinear/?strong=" + want, text: "Every verse it appears in" }],
        { who: "OpenGNT and the Open Scriptures Hebrew Bible", text: "Word, gloss and count from the interlinear and concordance this site bundles." }));
      if (entry && entry.n) {
        var ids = String(entry.ids || "").split(",");
        var out = [], previous = 0;
        for (var j = 0; j < ids.length && out.length < 8; j++) {
          previous += Number(ids[j]);
          out.push(previous);
        }
        var books = ctx.books ? ctx.books() : [];
        var refs = out.map(function (id) {
          var book = books[Math.floor(id / 1000000)] || {};
          var chapter = Math.floor((id % 1000000) / 1000);
          var verse = id % 1000;
          return { text: refLabel(book.name || "?", chapter, verse) };
        });
        if (refs.length) {
          blocks.push(block("The first of those verses", refs, [], null));
        }
      }
      return blocks;
    });
  }

  function termBlocks(plan, ctx) {
    var terms = (plan.terms || []).filter(Boolean);
    if (!terms.length) { return Promise.resolve([]); }
    var lookups = [];
    terms.forEach(function (term) {
      var letter = term.charAt(0).toLowerCase();
      if (!/[a-z]/.test(letter)) { return; }
      lookups.push((ctx.dictionary ? ctx.dictionary(letter) : Promise.resolve(null))
        .catch(function () { return null; }).then(function (d) { return { term: term, dict: d }; }));
      ["nave", "torrey"].forEach(function (source) {
        lookups.push((ctx.topical ? ctx.topical(source, letter) : Promise.resolve(null))
          .catch(function () { return null; }).then(function (t) {
            return { term: term, topical: t, source: source };
          }));
      });
    });
    return Promise.all(lookups).then(function (results) {
      var blocks = [];
      var seenEntry = {}, seenTopic = {};
      results.forEach(function (r) {
        if (r.dict && r.dict.entries) {
          r.dict.entries.forEach(function (entry) {
            var name = String(entry.name || "").toLowerCase();
            if (seenEntry[entry.slug]) { return; }
            /* The entry has to start with what was asked. Matching the other way
               round made "asdfgh" match the headword "A" — and "A" matches
               everything. */
            if (name !== r.term && name.indexOf(r.term) !== 0) { return; }
            if (name.length < 3 && name !== r.term) { return; }
            seenEntry[entry.slug] = true;
            (entry.definitions || []).slice(0, 3).forEach(function (def) {
              blocks.push(block("From the dictionaries", [], [],
                { who: def.sourceLabel + (def.year ? ", " + def.year : ""),
                  text: String(def.text || "").slice(0, 1200) }));
            });
          });
        }
        if (r.topical && r.topical.topics) {
          r.topical.topics.forEach(function (topic) {
            var name = String(topic.name || "").toLowerCase();
            if (seenTopic[topic.slug]) { return; }
            if (name !== r.term && name.indexOf(r.term) !== 0) { return; }
            if (name.length < 3 && name !== r.term) { return; }
            seenTopic[topic.slug] = true;
            var entries = (topic.entries || []).slice(0, 6).map(function (e) {
              return { text: e.text, who: (e.refs || []).join(", ") };
            });
            blocks.push(block("From the topical Bibles", entries,
              [{ href: "apps/topical/?topic=" + encodeURIComponent(topic.slug),
                 text: "The whole subject" }],
              { who: (r.source === "nave" ? "Nave's Topical Bible, 1897" :
                "Torrey's New Topical Textbook, 1897") + " \u2014 " + topic.name }));
          });
        }
      });
      return blocks;
    });
  }

  function suggestions(plan, ctx) {
    var terms = (plan.terms || []).filter(Boolean);
    if (!terms.length || !ctx.dictionary) { return Promise.resolve([]); }
    var term = terms[0];
    var letter = term.charAt(0).toLowerCase();
    if (!/[a-z]/.test(letter)) { return Promise.resolve([]); }
    return ctx.dictionary(letter).catch(function () { return null; }).then(function (d) {
      var out = [];
      ((d || {}).entries || []).forEach(function (entry) {
        var name = String(entry.name || "").toLowerCase();
        /* an entry has to start with the question, and be more than a letter:
           "A" is a real headword and matches everything */
        if (out.length < 6 && name.length > 2 && name.indexOf(term.slice(0, 3)) === 0) {
          out.push(entry.name);
        }
      });
      return out;
    });
  }

  function nothingFound(plan, ctx) {
    return suggestions(plan, ctx).then(function (hints) {
      var blocks = [block("What this can answer",
        [{ text: "A reference \u2014 \u201cJohn 3:16\u201d, \u201cPsalm 23\u201d, \u201cRomans 8:28-30\u201d" },
         { text: "A word, person or place \u2014 \u201cgrace\u201d, \u201cMelchizedek\u201d, \u201cbaptism\u201d" },
         { text: "A Strong's number \u2014 \u201cH7225\u201d, \u201cG26\u201d, \u201cStrong's 430\u201d" },
         { text: "A comparison \u2014 \u201ccompare John 1:1 in the translations\u201d" },
         { text: "Where the Prayer Book reads it \u2014 \u201cis Psalm 23 in the office?\u201d" }],
        [{ href: "apps/search/", text: "Search the text for a word instead" },
         { href: "apps/dictionary/", text: "Look a word up in the dictionaries" },
         { href: "apps/topical/", text: "Browse the topical Bibles" }],
        { who: "This is not a model", note: true,
          text: "It searches the commentary, dictionaries, " +
          "cross-references, topical Bibles, interlinear and concordance this site holds and shows " +
          "you what they say. Nothing is written for you, and nothing leaves the page." })];
      if (hints.length) {
        blocks.unshift(block("Nothing under that name \u2014 these are close", hints.map(function (h) {
          return { text: h };
        }), [{ href: "apps/dictionary/?term=" + encodeURIComponent(hints[0]),
               text: "Open the first of them" }]));
      }
      return blocks;
    });
  }

  function answer(question, ctx) {
    ctx = ctx || {};
    var plan = classify(question, ctx.parseRef, ctx.normalizeBook);
    var work;
    if (plan.ref) {
      /* passageBlocks returns early — without a promise — when the book is not in
         the catalogue, so both shapes are accepted here rather than assumed. */
      work = Promise.resolve(passageBlocks(plan, ctx)).then(function (r) {
        return (r && r.blocks) || [];
      });
    } else if (plan.number) {
      work = numberBlocks.call(ctx, plan);
    } else {
      work = termBlocks(plan, ctx);
    }
    return Promise.resolve(work).then(function (blocks) {
      if (blocks && blocks.length) {
        if (plan.askedFor.indexOf("liturgy") !== -1 && plan.ref && ctx.readings) {
          return { plan: plan, blocks: blocks, citations: citations(blocks) };
        }
        return { plan: plan, blocks: blocks, citations: citations(blocks) };
      }
      return nothingFound(plan, ctx).then(function (fallback) {
        return { plan: plan, blocks: fallback, citations: citations(fallback), nothingFound: true };
      });
    });
  }

  /* What an answer is made of: the works it came from, each named once, in the order
     they were used. This used to paste the first 120 characters of each source's own
     text after its name — which is the remark printed in full a few lines above it —
     so the line read as an essay cut off mid-word. A citation names the book. */
  function citations(blocks) {
    var out = [];
    (blocks || []).forEach(function (b) {
      var src = b.source;
      if (!src || !src.who || src.note) { return; }
      var name = String(src.who) + (src.year ? ", " + src.year : "");
      if (out.indexOf(name) === -1) { out.push(name); }
    });
    return out;
  }

  return {
    classify: classify,
    answer: answer,
    BOOKS: BOOKS_OF_THE_BIBLE,
    strongsNumber: strongsNumber,
    normalizeStrongs: normalizeStrongs,
    reference: reference
  };
});
