#!/usr/bin/env python3
"""Modernize an archaic public-domain English text in data/bible/.

Usage:  python3 scripts/modernize.py RV RVM           # Revised Version -> modern
        python3 scripts/modernize.py JPS JPSM         # JPS Tanakh 1917 -> modern
        python3 scripts/modernize.py PK PKM quran     # Pickthall's Qur'an -> modern

Reads data/bible/<slug>.<SRC>.json and writes data/bible/<slug>.<DEST>.json,
applying the same conservative, rule-based modernization the site uses for its
modernized King James text:

    thou/thee/thy/thine/ye  ->  you/your/yours
    knowest -> know, cometh -> comes, saith -> says, shalt -> shall
    spake -> spoke, shew -> show, unto -> to, whilst -> while
    whosoever -> whoever, peradventure -> perhaps
    Holy Ghost -> Holy Spirit

Every rule was derived from the forms that actually occur in the RV text, and
non-verbs that merely end in -est/-eth (greatest, manifest, teeth, Nazareth)
are protected. The script records every replacement it makes in
scripts/.cache/rvm-pairs.txt so the result can be audited.
"""
import json
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = "bible"
OUT = os.path.join(ROOT, "data", DATA_DIR)
REPORT = os.path.join(ROOT, "scripts", ".cache", "rvm-pairs.txt")

SRC, DEST = "RV", "RVM"   # overridden by argv

CORPUS = set()
PAIRS = {}

SEED = {"be", "am", "is", "are", "was", "were", "have", "has", "had", "do", "does",
        "did", "go", "goes", "went", "say", "says", "said", "see", "sees", "saw",
        "come", "comes", "came", "make", "makes", "made", "give", "gives", "gave",
        "know", "knows", "knew", "take", "takes", "took", "speak", "speaks", "spoke",
        "love", "loves", "live", "lives", "hear", "hears", "eat", "eats", "dwell",
        "dwells", "keep", "keeps", "sit", "sits", "abide", "abides", "pass", "passes",
        "seek", "seeks", "work", "works", "touch", "touches", "cause", "causes",
        "fall", "falls", "hate", "hates", "put", "puts", "bring", "brings", "send",
        "sends", "call", "calls", "show", "shows", "cry", "cries", "glory", "carry",
        "bury", "abhor", "let", "forget", "begin", "compel", "excel", "lead"}

# Unambiguous second-person auxiliaries — no other use in this text.
AUX = {"shalt": "shall", "hast": "have", "hadst": "had", "wilt": "will", "didst": "did",
       "dost": "do", "doest": "do", "wast": "were", "wert": "were", "canst": "can",
       "mayest": "may", "mightest": "might", "couldest": "could", "shouldest": "should",
       "wouldest": "would"}

IRREGULAR = {"seest": "see", "sawest": "saw", "gavest": "gave", "camest": "came",
             "madest": "made", "saidst": "said", "knewest": "knew", "wentest": "went",
             "gottest": "got", "sattest": "sat", "heardest": "heard", "tookest": "took",
             "spakest": "spoke", "toldest": "told", "foundest": "found", "leftest": "left",
             "keptest": "kept", "sentest": "sent", "slewest": "slew", "drewest": "drew",
             "thoughtest": "thought", "broughtest": "brought", "bearest": "bear",
             "fleest": "flee"}

# Endings that look archaic but are not verbs.
KEEP_EST = {"greatest", "youngest", "strongest", "highest", "lowest", "oldest", "deepest",
            "longest", "richest", "wisest", "darkest", "sweetest", "nearest", "dearest",
            "manifest", "harvest", "honest", "priest", "rest", "west", "best", "guest",
            "nest", "pest", "test", "chest", "crest", "quest", "forest", "tempest",
            "earnest", "modest", "arrest", "digest", "interest", "request", "lest",
            "farthest", "furthest", "eldest", "fattest", "goodliest", "hottest",
            "mightiest", "holiest", "happiest", "worthiest", "lowliest", "readiest",
            "heaviest", "easiest", "sittest", "surest", "safest", "purest", "sorest"}
KEEP_ETH = {"teeth", "nazareth", "twentieth", "beneath", "underneath", "seth", "heath",
            "sheath", "wreath", "breath", "death", "sabbath", "forth", "fourth",
            "tashheth", "azmaveth", "basshebeth", "zoheth", "hareseth"}

WORDS = {"unto": "to", "yea": "yes", "nay": "no", "verily": "truly", "spake": "spoke",
         "brake": "broke", "sware": "swore", "drave": "drove", "gat": "got",
         "shew": "show", "shewed": "showed", "shewest": "show", "sheweth": "shows",
         "shewn": "shown", "peradventure": "perhaps", "whosoever": "whoever",
         "whatsoever": "whatever", "wheresoever": "wherever", "whithersoever": "wherever",
         "howsoever": "however", "whichsoever": "whichever", "whomsoever": "whomever",
         "whoso": "whoever", "whatso": "whatever", "whiles": "while", "whilst": "while",
         "amongst": "among", "amidst": "amid", "towards": "toward", "aught": "anything",
         "naught": "nothing", "sith": "since", "hath": "has", "doth": "does",
         "saith": "says",
         # relative adverbs and the rest of Pickthall's Qur'an register
         "whereof": "of which", "thereof": "of it", "wherein": "in which",
         "wherewith": "with which", "whereby": "by which", "whereon": "on which",
         "whereupon": "after which", "thereon": "on it", "therein": "in it",
         "therewith": "with it", "thereto": "to it", "therefrom": "from it",
         "thereabouts": "about it", "henceforth": "from now on",
         "hither": "here", "thither": "there", "whither": "where",
         "thence": "from there", "whence": "from where", "wrought": "worked",
         "lo": "indeed", "henceforth": "now"}

RE_VERB_ETH = re.compile(r"\b([A-Za-z]{2,})eth\b")
RE_VERB_EST = re.compile(r"\b([A-Za-z]{2,})est\b")
RE_THOU_VERB = re.compile(r"\b(Thou|thou)\s+([A-Za-z]+)\b")
RE_VERB_THOU = re.compile(r"\b([A-Za-z]{3,})est\s+(thou|thee)\b")
RE_THINE = re.compile(r"\b(Thine|thine)(?=\s+[A-Za-z])")
RE_THINE_END = re.compile(r"\b(Thine|thine)\b")
RE_SECOND_PERSON = re.compile(r"\b(?:thou|thee|thy|thine|ye|thyself|yourselves)\b", re.IGNORECASE)



# Rare verbs (mostly in the Apocrypha) whose base form never appears elsewhere
# in the bundled texts, so the lexicon check cannot resolve them. Listed
# explicitly so every one is reviewable.
OVERRIDES = {
    "acceptest": "accept", "approvest": "approve", "gloriest": "glory",
    "knowest": "know", "makest": "make", "recompensest": "recompense",
    "restest": "rest", "searchest": "search", "sendest": "send", "sittest": "sit",
    "smotest": "smote", "speakest": "speak", "teachest": "teach",
    "terrifiest": "terrify", "understandest": "understand",
    "aileth": "ails", "bedimmeth": "bedims", "belieth": "belies",
    "cavilleth": "cavils", "compresseth": "compresses", "enforceth": "enforces",
    "fancieth": "fancies", "fluttereth": "flutters", "foreseeth": "foresees",
    "forestalleth": "forestalls", "glueth": "glues", "leaketh": "leaks",
    "pervadeth": "pervades", "swoopeth": "swoops", "throbbeth": "throbs",
    "waneth": "wanes",
    # The JPS Tanakh uses a wider poetic vocabulary.
    "gatherest": "gather", "holdest": "hold", "impairest": "impair",
    "ministerest": "minister", "profanest": "profane", "showest": "show",
    "snarlest": "snarl", "spokest": "spoke", "stillest": "still",
    "acheth": "aches", "crumbleth": "crumbles", "deemeth": "deems",
    "droopeth": "droops", "enwrappeth": "enwraps", "hovereth": "hovers",
    "peereth": "peers", "unfoldeth": "unfolds",
}

def record(before, after):
    if before != after:
        PAIRS[(before, after)] = PAIRS.get((before, after), 0) + 1


def keep_case(src, out):
    out = out[:1].upper() + out[1:] if src[:1].isupper() else out
    record(src, out)
    return out


def base_verb(stem):
    low = stem.lower()
    cands = [low, low + "e", low + "y"]
    if low.endswith("i"):
        cands.insert(0, low[:-1] + "y")      # glori -> glory, cri -> cry
    if len(low) > 3 and low[-1] == low[-2]:
        cands.append(low[:-1])            # abhorr -> abhor, sitt -> sit
    for cand in cands:
        if cand in CORPUS or cand in SEED:
            return cand
    return None


def verb_eth(word):
    if word.lower() in KEEP_ETH:
        return word
    base = base_verb(word[:-3])
    if not base:
        return word
    if base.endswith("y") and len(base) > 1 and base[-2] not in "aeiou":
        return keep_case(word, base[:-1] + "ies")
    if base.endswith(("s", "x", "z", "ch", "sh")) or base in ("do", "go"):
        return keep_case(word, base + "es")
    return keep_case(word, base + "s")


def verb_est(word, allow=True):
    low = word.lower()
    if low in IRREGULAR:
        return keep_case(word, IRREGULAR[low])
    if low in KEEP_EST or not allow:
        return word
    if low.endswith("est") and len(word) > 4:
        base = base_verb(word[:-3])
        if base:
            return keep_case(word, base)
    return word


def modernize(text):
    for a, b in OVERRIDES.items():
        text = re.sub(r"\b" + a + r"\b", lambda m, b=b: keep_case(m.group(0), b), text,
                      flags=re.IGNORECASE)
    text = re.sub(r"\bHoly Ghost\b", "Holy Spirit", text)
    text = re.sub(r"\bsave\b(?=\s+(?:Him|Thee|thee|you|ye|us|me|it|them|those|the|his|her|"
                  r"Allah|God|One|that|this|what)\b)",
                  lambda m: keep_case(m.group(0), "except"), text)
    # `art` is a noun elsewhere, so only convert it in a second-person context.
    text = re.sub(r"\bark\b", "ark", text)
    text = re.sub(r"\bart\b(?=\s+(?:thou|thee|ye|you|not\b))",
                  lambda m: keep_case(m.group(0), "are"), text, flags=re.IGNORECASE)
    NOUN_BEFORE = re.compile(
        r"(?:(?:the|a|an|my|your|his|her|their|its|thy|no|some|any|such|all|this|that|every|"
        r"without|of|by|in|with|careful|great|much|\w+['\u2019]s)\s+)\bart\b", re.IGNORECASE)

    def fix_art(m):
        start = m.start()
        if NOUN_BEFORE.search(text[max(0, start - 30):m.end()]):
            return m.group(0)
        return keep_case(m.group(0), "are")
    text = re.sub(r"\bart\b", fix_art, text)
    text = re.sub(r"\b(which|who|that|wherefore|how|why)(\s+)art\b",
                  lambda m: m.group(1) + m.group(2) + keep_case("art", "are"), text, flags=re.IGNORECASE)
    # auxiliaries, everywhere and unconditionally
    for a, b in AUX.items():
        text = re.sub(r"\b" + a + r"\b", lambda m, b=b: keep_case(m.group(0), b), text,
                      flags=re.IGNORECASE)
    # "knowest thou" -> "do you know" / "art thou" -> "are you"
    def verb_thou(m):
        v = verb_est(m.group(0).split()[0]) if m.group(0).split()[0].lower() not in AUX else None
        first = m.group(0).split()[0]
        out = verb_est(first) if first.lower() not in AUX else AUX.get(first.lower(), first)
        if out == first and first.lower() not in IRREGULAR:
            out = "do " + (base_verb(first[:-3]) or first)
        return keep_case(first, out) + " you"
    text = RE_VERB_THOU.sub(verb_thou, text)
    # "thou knowest" -> "you know"
    def thou_verb(m):
        v = m.group(2)
        low = v.lower()
        if low in IRREGULAR or (low.endswith("est") and len(v) > 4):
            repl = verb_est(v)
            if repl != v:
                return keep_case(m.group(1), "you") + " " + repl
        if low in AUX:
            return keep_case(m.group(1), "you") + " " + keep_case(v, AUX[low])
        if low == "art":
            return keep_case(m.group(1), "you") + " " + keep_case(v, "are")
        return m.group(0)
    text = RE_THOU_VERB.sub(thou_verb, text)
    # third-person -eth, then second-person -est (only in a second-person verse)
    text = RE_VERB_ETH.sub(lambda m: verb_eth(m.group(0)), text)
    allow_est = bool(RE_SECOND_PERSON.search(text))
    text = RE_VERB_EST.sub(lambda m: verb_est(m.group(0), allow_est), text)
    for a, b in WORDS.items():
        text = re.sub(r"\b" + a + r"\b", lambda m, b=b: keep_case(m.group(0), b), text,
                      flags=re.IGNORECASE)
    text = RE_THINE.sub(lambda m: keep_case(m.group(1), "your"), text)
    text = RE_THINE_END.sub(lambda m: keep_case(m.group(1), "yours"), text)
    for a, b in (("thou", "you"), ("thee", "you"), ("thy", "your"), ("ye", "you"),
                 ("thyself", "yourself")):
        text = re.sub(r"\b" + a + r"\b", lambda m, b=b: keep_case(m.group(0), b), text,
                      flags=re.IGNORECASE)
    text = re.sub(r"\bshall you\b", lambda m: keep_case(m.group(0), "will you"), text)
    text = re.sub(r"\byou art\b", lambda m: keep_case(m.group(0), "you are"), text)
    text = re.sub(r"\byou wast\b", lambda m: keep_case(m.group(0), "you were"), text)
    return text


def load_corpus():
    """Every word in every bundled translation, so rare verbs can be checked."""
    paths = glob.glob(os.path.join(ROOT, "data", "bible", "*.json"))
    if DATA_DIR != "bible":
        paths += glob.glob(os.path.join(OUT, "*.json"))
    for path in paths:
        try:
            d = json.load(open(path, encoding="utf-8"))
        except ValueError:
            continue
        if not isinstance(d, dict) or "chapters" not in d:
            continue          # books.json / translations.json
        for verses in d["chapters"].values():
            for t in verses.values():
                CORPUS.update(w.lower() for w in re.findall(r"[A-Za-z]+", t))


def main():
    global SRC, DEST, REPORT, OUT, DATA_DIR
    if len(sys.argv) >= 3:
        SRC, DEST = sys.argv[1], sys.argv[2]
        if len(sys.argv) >= 4:
            DATA_DIR = sys.argv[3]
            OUT = os.path.join(ROOT, "data", DATA_DIR)
        REPORT = os.path.join(ROOT, "scripts", ".cache", f"{DEST.lower()}-pairs.txt")
    load_corpus()
    written = 0
    for path in sorted(glob.glob(os.path.join(OUT, f"*.{SRC}.json"))):
        d = json.load(open(path, encoding="utf-8"))
        chapters = {c: {v: modernize(t) for v, t in verses.items()}
                    for c, verses in d["chapters"].items()}
        out = {"book": d["book"], "slug": d["slug"], "translation": DEST, "chapters": chapters}
        with open(os.path.join(OUT, f"{d['slug']}.{DEST}.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        written += 1
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, "w", encoding="utf-8") as f:
        for (a, b), n in sorted(PAIRS.items(), key=lambda x: -x[1]):
            f.write(f"{n:6d}  {a}  ->  {b}\n")
    print(f"  {written} books written to data/{DATA_DIR}/*.{DEST}.json")
    print(f"  {len(PAIRS)} distinct replacements recorded in {os.path.relpath(REPORT, ROOT)}")


if __name__ == "__main__":
    main()
