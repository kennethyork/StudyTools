/* Minimal, dependency-free markdown renderer for the sermon notebook.
   Supports headings, bold/italic, inline code, links, blockquotes, lists,
   horizontal rules, and paragraphs. Input is escaped before rendering. */
(function () {
  "use strict";

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function inline(s) {
    var text = esc(s);
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
    text = text.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    return text;
  }

  function render(markdown) {
    var lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    var html = [];
    var listStack = [];
    var paragraph = [];

    function flushParagraph() {
      if (paragraph.length) {
        html.push("<p>" + paragraph.join("<br>") + "</p>");
        paragraph = [];
      }
    }

    function closeLists(toDepth) {
      while (listStack.length > (toDepth || 0)) {
        html.push("</" + listStack.pop() + ">");
      }
    }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      var quote = line.match(/^>\s?(.*)$/);
      var ul = line.match(/^\s*[-*+](?:\s+(.*))?$/);
      var ol = line.match(/^\s*\d+[.)](?:\s+(.*))?$/);

      if (/^\s*$/.test(line)) {
        flushParagraph();
        closeLists(0);
        return;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
        flushParagraph();
        closeLists(0);
        html.push("<hr>");
        return;
      }

      if (heading) {
        flushParagraph();
        closeLists(0);
        var level = heading[1].length;
        html.push("<h" + level + ">" + inline(heading[2]) + "</h" + level + ">");
        return;
      }

      if (quote) {
        flushParagraph();
        closeLists(0);
        html.push("<blockquote>" + inline(quote[1]) + "</blockquote>");
        return;
      }

      if (ul || ol) {
        flushParagraph();
        var tag = ul ? "ul" : "ol";
        var depth = Math.floor((line.match(/^\s*/) || [""])[0].length / 2) + 1;
        while (listStack.length > depth) html.push("</" + listStack.pop() + ">");
        if (listStack.length < depth) {
          while (listStack.length < depth) {
            html.push("<" + tag + ">");
            listStack.push(tag);
          }
        } else if (listStack[listStack.length - 1] !== tag) {
          html.push("</" + listStack.pop() + ">");
          html.push("<" + tag + ">");
          listStack.push(tag);
        }
        html.push("<li>" + inline((ul || ol)[1] || "") + "</li>");
        return;
      }

      closeLists(0);
      paragraph.push(inline(line));
    });

    flushParagraph();
    closeLists(0);
    return html.join("\n");
  }

  window.SermonMarkdown = { render: render };
})();
