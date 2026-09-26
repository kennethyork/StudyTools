#!/usr/bin/env bash
#
# Render a demo walkthrough of StudyTools.
#
#   ./demo/make-demo.sh [OUTDIR]
#
# Produces demo/studytools-demo.mp4: sixteen captioned screens, about a minute,
# no audio.
#
# ---------------------------------------------------------------------------
# WHY IT NEEDS NO ACCOUNT, NO SERVER AND NO SAMPLE DATA
#
# StudyTools is a set of static pages: the reader, the twenty-four tools, the
# texts, the commentary, the atlas and its ground all ship in this repository
# and are read in the browser. So the demo is shot against a copy of the site
# served from this repository on the loopback address — the same files that are
# deployed, which means the video shows what the site does rather than what it
# looked like the day the video was made — and it can be rendered again on a
# machine with no network at all.
#
# ---------------------------------------------------------------------------
# WHY THERE IS A HARNESS
#
# Every page here draws after it has fetched its data. Chrome's
# --virtual-time-budget alone does not order the paint after the fetch: a page
# screenshotted that way comes back blank perhaps half the time, and the atlas
# was worse — the map, the labels and the terrain arrive in stages, and catching
# it mid-stage gives a frame with no ground under it. So each scene is rendered
# inside a small harness, written below into the repository root and deleted on
# exit, which holds a timer ticking while the page inside loads. Virtual time
# advances with that timer, so the page finishes and paints inside the budget.
#
# Every shot is also checked for being blank, by size, and retaken once if it
# is. A demo with one empty scene in it is worse than no demo, and the failure
# is silent: the frame renders, it is simply the wrong picture.
#
# ---------------------------------------------------------------------------
# DEPENDENCIES
#
# Chrome or Chromium, ffmpeg with libfreetype (for drawtext), and Python 3 —
# the last only to serve the directory. There is nothing to install and nothing
# here is used at runtime by the site.
#
# Captions are burned in with drawtext rather than composited with a Python
# imaging library, and the caption text is passed through a FILE rather than on
# the command line: drawtext's escaping rules for quotes, commas and colons are
# a small language of their own, and most captions below contain at least one of
# them.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/demo}"
PORT="${DEMO_PORT:-8107}"
W=1280
H=820
# Long enough to read a caption, short enough that sixteen of them fit in a
# minute. A few scenes hold longer: the ones with something to read in them.
HOLD=3.4
# Captions are one line and cannot wrap, so they have to fit the frame: at this
# size roughly eighty characters on a 1280-wide screen. Anything longer runs off
# the edge, which is how the first render of this came out.
CAPSIZE=25
# The caption bar, drawn over the foot of every frame. Scenes that aim at a line
# near the bottom of a page are told about it so it is not hidden behind it.
BAR=84
FONT="${DEMO_FONT:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}"

BROWSER="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
[ -n "$BROWSER" ] || { echo "error: no Chrome or Chromium found." >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "error: ffmpeg not found." >&2; exit 1; }
[ -f "$FONT" ] || { echo "error: no font at $FONT — set DEMO_FONT." >&2; exit 1; }

# Two traps here, both of which once reported a MISSING drawtext on a machine
# that has it.
#
#  1. No `-v error`. The filter list is informational output, so asking ffmpeg
#     to be quiet about everything also hides the thing being checked.
#
#  2. The list is captured into a variable rather than piped into `grep -q`.
#     `grep -q` exits the instant it matches, which sends SIGPIPE to ffmpeg, and
#     under `set -o pipefail` the pipeline then reports FAILURE for a successful
#     search. The check was failing on success.
FILTERS="$(ffmpeg -hide_banner -filters 2>/dev/null || true)"
case "$FILTERS" in
  *drawtext*) ;;
  *) echo "error: this ffmpeg has no drawtext filter (build it with libfreetype)." >&2
     exit 1 ;;
esac

WORK="$(mktemp -d "${TMPDIR:-/tmp}/studytools-demo.XXXXXX")"
HARNESS="$ROOT/_demo-frame.html"
cleanup() {
  local pid
  pid="$(ss -ltnp 2>/dev/null | grep ":${PORT}" | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  [ -n "${pid}" ] && kill "${pid}" 2>/dev/null || true
  rm -f "$HARNESS"
  rm -rf "$WORK"
}
trap cleanup EXIT

# ----------------------------------------------------------------- the harness
# Served from the repository root, so the page inside it is same-origin and the
# harness can settle it: wait for what the scene needs, then scroll to it. The
# scroll target is a CSS selector and an offset, because the reader's verse
# panel is its own scrolling column — the bottom of that panel, where the
# Prayer Book readings are, is not the bottom of the page.
cat > "$HARNESS" <<'HARNESS_HTML'
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: #f7f4ed; }
  iframe { border: 0; display: block; }
</style></head>
<body>
<script>
var p = new URLSearchParams(location.search);
var w = +(p.get("w") || 1280), h = +(p.get("h") || 820);
try { if (p.get("theme")) { localStorage.setItem("studytools.theme", p.get("theme")); } } catch (e) {}
var frame = document.createElement("iframe");
frame.width = w; frame.height = h;
frame.src = p.get("u") || "./index.html";
document.body.appendChild(frame);
/* the tick: virtual time advances with it, so what the page inside fetches and
   paints happens inside the budget rather than after the screenshot */
setInterval(function () {}, 40);

/* Where a scene wants to be looking: `container::anchor::align`.
   "" is the top of the page; "doc::.answer-cite::end" is the foot of a long
   answer; ".verse-panel::.vp-readings::start" is a section of the reader's verse
   panel, which is its own scrolling column rather than part of the page. The
   offset is arithmetic rather than scrollIntoView, which scrolls whatever
   ancestors it likes and left the shot at the top of the page more than once. */
function place(d, spec) {
  if (!spec) { return false; }
  var bits = spec.split("::");
  var scrolling = d.scrollingElement || d.documentElement;
  var box = !bits[0] || bits[0] === "doc" ? scrolling : d.querySelector(bits[0]);
  var anchor = bits[1] ? d.querySelector(bits[1]) : null;
  if (!box || !anchor) { return false; }
  var br = anchor.getBoundingClientRect();
  var inDoc = box === scrolling;
  var boxTop = inDoc ? 0 : box.getBoundingClientRect().top;
  /* the caption bar is drawn over the foot of the frame, so a scene aligned to
     the end has to stop above it or the line it was aimed at is behind it */
  var bar = +(p.get("bar") || 0);
  var boxH = (inDoc ? d.documentElement.clientHeight : box.clientHeight) - bar;
  var top = (br.top - boxTop) + box.scrollTop;
  /* "start" leaves a little air above the anchor, "end" a little below it — and
     below the anchor means above the bar, so the gap is added, not taken away.
     Subtracting it put the sources line under the caption for a render. */
  var gap = 22;
  box.scrollTop = Math.max(0, bits[2] === "end" ? top + br.height - boxH + gap : top - gap);
  return true;
}

var tidied = false;
function settle() {
  var d = frame.contentDocument;
  if (!d || !d.body || !d.querySelector("main")) { setTimeout(settle, 120); return; }
  if (!tidied) {
    var style = d.createElement("style");
    /* no scrollbar in the shot; scrolling still works */
    style.textContent = "html::-webkit-scrollbar{display:none}body{scrollbar-width:none}";
    d.head.appendChild(style);
    tidied = true;
  }
  var spec = p.get("scroll") || "";
  if (!spec) { return; }
  /* Asked for again and again until the budget runs out, because the page is
     still growing: an answer arrives a block at a time, and a position worked
     out when the section first appeared is wrong a moment later. The last ask
     before the screenshot is the one that counts. */
  if (place(d, spec)) { setTimeout(settle, 250); }
  else { setTimeout(settle, 200); }
}
setTimeout(settle, 900);
</script>
</body></html>
HARNESS_HTML

# --------------------------------------------------------------------- serve
python3 -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
sleep 1.2
BASE="http://127.0.0.1:${PORT}"

quote() { python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }

shot() { # slug path scrollspec theme
  local slug="$1" path="$2" spec="$3" theme="${4:-light}"
  local url="${BASE}/_demo-frame.html?w=${W}&h=${H}&bar=${BAR}&u=$(quote "$path")"
  url="${url}&scroll=$(quote "$spec")"
  [ "$theme" = "dark" ] && url="${url}&theme=dark"
  local tries=0 size=0
  while [ "$tries" -lt 2 ]; do
    rm -rf "$WORK/profile-$slug"
    "$BROWSER" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
      --user-data-dir="$WORK/profile-$slug" --window-size="${W},${H}" \
      --virtual-time-budget=25000 --screenshot="$WORK/$slug.png" "$url" >/dev/null 2>&1
    size=$(stat -c%s "$WORK/$slug.png" 2>/dev/null || echo 0)
    # A blank or half-drawn page compresses to a few kilobytes; a page with text
    # and a map in it does not.
    [ "$size" -ge 20000 ] && break
    tries=$((tries + 1))
    printf '  retry  %s (frame was %s bytes)\n' "$slug" "$size"
  done
  [ "$size" -ge 20000 ] || { echo "error: $slug rendered blank ($size bytes)." >&2; exit 1; }
  printf '  shot   %s\n' "$slug"
}

# --------------------------------------------------------------------- scenes
# slug | path | scroll (container::anchor::align, or empty) | caption | hold
#
# One entry per scene, in order. The caption is what the tool IS, not what it
# would be nice to claim — a demo that overstates is worse than no demo. The
# hold is optional; the scenes with something to read hold longer.
#
# No scene asks the reader for a verse (?verse=), because that scrolls the page to
# the verse and the frame then opens mid-sentence, past the translation picker the
# caption is about.
#
# The anchor for the ask scene is the sources line at the foot of the answer, and
# it is written as a child of the card because the same class is used for the
# source text printed inside a block — pick the class alone and the shot scrolls
# to the wrong one, which is where this scene sat for two renders.
SCENES=(
  "front|/index.html||StudyTools — twenty-four tools for reading the Bible, studytools.cc|4.6"
  "tools|/tools.html||Every tool in one place. No account, no tracking, nothing uploaded."
  "read|/apps/bible/?book=john&chapter=3||The whole Bible in seven public-domain translations"
  "panel|/apps/bible/?book=malachi&chapter=3&panel=1||Tap a verse for what the site holds on it"
  "panel2|/apps/bible/?book=malachi&chapter=3&panel=1|.verse-panel::.vp-readings::start|The Prayer Book's readings for it, then the highlight colours|4.6"
  "study|/apps/study/?ref=John%203:16||Study a passage: everything the site holds on it|4.6"
  "matrix|/apps/matrix/?ref=John%201:1||Translations side by side, verse by verse"
  "interlinear|/apps/interlinear/?ref=John%201:1||Every word of the Greek and Hebrew, with its gloss"
  "search|/apps/search/?q=grace||Search every translation at once, Apocrypha included"
  "atlas|/apps/atlas/||An atlas of every place the Bible names, on real terrain|4.6"
  "route|/apps/atlas/?route=Paul's%20first%20journey||A journey, drawn stop by stop"
  "ask|/apps/ask/?q=is%20Psalm%2023%20in%20the%20office%3F|doc::#thread .card > .answer-cite::end|Ask the site: no model, every answer cited|4.6"
  "parallels|/apps/parallels/||The Bible beside the Qur'an, the Tanakh and the Book of Mormon"
  "plan|/apps/plan/||Read the whole Bible in a year, and tick it off"
  "sync|/apps/sync/||Notes and reading, carried to another device with a code"
  "dark|/apps/bible/?book=psalms&chapter=23&panel=1||Light and dark|"
)

echo "Rendering demo into $OUT"
mkdir -p "$OUT"

i=0
for entry in "${SCENES[@]}"; do
  IFS='|' read -r slug path spec caption hold <<<"$entry"
  hold="${hold:-$HOLD}"
  theme=light; [ "$slug" = "dark" ] && theme=dark
  shot "$slug" "$path" "$spec" "$theme"

  # The caption goes through a file, never the command line. See the note at the
  # top about drawtext escaping.
  printf '%s' "$caption" > "$WORK/cap-$i.txt"

  # The caption bar is the site's own ink and gold, so the video looks like the
  # thing it is showing.
  ffmpeg -y -v error -loop 1 -i "$WORK/$slug.png" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,\
pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xf7f4ed,\
drawbox=y=ih-${BAR}:w=iw:h=${BAR}:color=0x2b2320@1:t=fill,\
drawbox=y=ih-${BAR}:w=iw:h=4:color=0xb8863b@1:t=fill,\
drawtext=fontfile=${FONT}:textfile=$WORK/cap-$i.txt:fontcolor=0xf7f4ed:fontsize=${CAPSIZE}:x=(w-text_w)/2:y=h-53" \
    -t "$hold" -r 30 -pix_fmt yuv420p -c:v libx264 -crf 20 "$WORK/part-$i.mp4"
  i=$((i + 1))
done

# ---------------------------------------------------------------- concatenate
# Re-encoded rather than stream-copied: the parts come from the same encoder so
# a copy would work, but a copy also inherits whatever per-part quirks the filter
# chain introduced, and this is a minute of video.
: > "$WORK/list.txt"
for n in $(seq 0 $((i - 1))); do
  printf "file '%s/part-%s.mp4'\n" "$WORK" "$n" >> "$WORK/list.txt"
done

ffmpeg -y -v error -f concat -safe 0 -i "$WORK/list.txt" \
  -vf fps=30 -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -movflags +faststart "$OUT/studytools-demo.mp4"

DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT/studytools-demo.mp4")"
SIZE="$(du -h "$OUT/studytools-demo.mp4" | cut -f1)"
printf '\nWrote %s (%s scenes, %.0fs, %s)\n' "$OUT/studytools-demo.mp4" "$i" "$DUR" "$SIZE"
printf 'Regenerate after any change to a page: it takes about a minute.\n'
