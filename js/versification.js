/* Two ways of numbering the same psalms.

   The Douay-Rheims keeps the Vulgate's numbering, and the Vulgate's psalms do
   not simply run one behind the Hebrew ones. Two Hebrew psalms (9 and 10) are a
   single Vulgate psalm; two more (114 and 115) are a single Vulgate psalm; one
   Hebrew psalm (116) is two Vulgate psalms; and one more (147) is two as well.
   Everywhere else the shift is one, which is why a reference looks right until
   it lands on one of those.

     Hebrew   1-8    -> Vulgate   1-8
     Hebrew   9      -> Vulgate   9, verses 1-21
     Hebrew  10      -> Vulgate   9, verses 22-39     (Hebrew 10:1 = Vulgate 9:22)
     Hebrew  11-113  -> Vulgate  10-112
     Hebrew 114      -> Vulgate 113, verses 1-8
     Hebrew 115      -> Vulgate 113, verses 9-26      (Hebrew 115:1 = Vulgate 113:9)
     Hebrew 116      -> Vulgate 114 (vv 1-9) and 115 (vv 10-19)
     Hebrew 117-146  -> Vulgate 116-145
     Hebrew 147      -> Vulgate 146 (vv 1-11) and 147 (vv 12-20)
     Hebrew 148-150  -> Vulgate 148-150

   Everything outside the Psalter that differs (Daniel and Esther carrying their
   additions as chapters, verse counts dividing differently) is left alone: the
   Douay-Rheims is shown in its own numbering, labelled, and kept out of the
   side-by-side views, so nothing is silently placed beside the wrong verse.

   Loaded with a plain <script>, exposing window.STVersification; under node it
   sets module.exports, which is how scripts/check-versification.js runs it. */
(function () {
  "use strict";

  var VULGATE = "vulgate";

  /* Hebrew psalm -> where it sits in the Vulgate, plus a note where the psalm is
     only part of a Vulgate psalm. */
  function vulgatePsalm(n) {
    if (n < 1 || n > 150) { return null; }
    if (n <= 8 || n >= 148) { return { chapter: n, verseOffset: 0, part: null }; }
    if (n === 9) { return { chapter: 9, verseOffset: 0, part: "first part of Psalm 9" }; }
    if (n === 10) { return { chapter: 9, verseOffset: 21, part: "second part of Psalm 9" }; }
    if (n >= 11 && n <= 113) { return { chapter: n - 1, verseOffset: 0, part: null }; }
    if (n === 114) { return { chapter: 113, verseOffset: 0, part: "first part of Psalm 113" }; }
    if (n === 115) { return { chapter: 113, verseOffset: 8, part: "second part of Psalm 113" }; }
    if (n === 116) { return { chapter: 114, verseOffset: 0, part: "verses 10-19 are Psalm 115" }; }
    if (n === 147) { return { chapter: 146, verseOffset: 0, part: "verses 12-20 are Psalm 147" }; }
    if (n >= 117 && n <= 146) { return { chapter: n - 1, verseOffset: 0, part: null }; }
    return null;
  }

  /* Vulgate psalm and verse -> the Hebrew psalm and verse. The verse is needed:
     three Vulgate psalms each hold parts of two Hebrew ones. */
  function hebrewPsalm(chapter, verse) {
    if (chapter >= 1 && chapter <= 8) { return { chapter: chapter, verse: verse }; }
    if (chapter === 9) {
      return verse > 21 ? { chapter: 10, verse: verse - 21 } : { chapter: 9, verse: verse };
    }
    if (chapter >= 10 && chapter <= 112) { return { chapter: chapter + 1, verse: verse }; }
    if (chapter === 113) {
      return verse > 8 ? { chapter: 115, verse: verse - 8 } : { chapter: 114, verse: verse };
    }
    if (chapter === 114) { return { chapter: 116, verse: verse }; }
    if (chapter === 115) { return { chapter: 116, verse: verse + 9 }; }
    if (chapter >= 116 && chapter <= 145) { return { chapter: chapter + 1, verse: verse }; }
    if (chapter === 146) { return { chapter: 147, verse: verse }; }
    if (chapter === 147) { return { chapter: 147, verse: verse + 11 }; }
    if (chapter >= 148 && chapter <= 150) { return { chapter: chapter, verse: verse }; }
    return null;
  }

  function isVulgate(translation) {
    return !!translation && translation.versification === VULGATE;
  }

  /* Map a parsed reference from one numbering to the other. Books other than the
     Psalter come back as they are: their chapter numbers agree, even where the
     verses inside a chapter divide differently. */
  function mapReference(parsed, from, to) {
    if (!parsed || from === to) { return { parsed: parsed, mapped: false, note: null }; }
    if (parsed.book !== "psalms") { return { parsed: parsed, mapped: false, note: null }; }

    if (to === VULGATE) {
      var out = vulgatePsalm(parsed.chapter);
      if (!out) { return { parsed: parsed, mapped: false, note: null }; }
      var verse = parsed.verseStart == null ? null : parsed.verseStart + out.verseOffset;
      var end = parsed.verseEnd == null ? verse : parsed.verseEnd + out.verseOffset;
      return {
        parsed: { book: parsed.book, chapter: out.chapter, verseStart: verse, verseEnd: end },
        mapped: true,
        note: "Psalm " + parsed.chapter + " in the Hebrew numbering is Psalm " + out.chapter +
          (out.verseOffset ? ", from verse " + (out.verseOffset + 1) : "") +
          (out.part ? " \u2014 the " + out.part + "." : ".")
      };
    }

    var back = hebrewPsalm(parsed.chapter, parsed.verseStart == null ? 1 : parsed.verseStart);
    if (!back) { return { parsed: parsed, mapped: false, note: null }; }
    return {
      parsed: {
        book: parsed.book, chapter: back.chapter,
        verseStart: parsed.verseStart == null ? null : back.verse,
        verseEnd: parsed.verseEnd == null ? (parsed.verseStart == null ? null : back.verse) : back.verse
      },
      mapped: true,
      note: "Psalm " + parsed.chapter + " as the Vulgate numbers it is Psalm " + back.chapter +
        " in the Hebrew numbering."
    };
  }

  var api = {
    VULGATE: VULGATE,
    vulgatePsalm: vulgatePsalm,
    hebrewPsalm: hebrewPsalm,
    isVulgate: isVulgate,
    mapReference: mapReference
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STVersification = api; }
})();
