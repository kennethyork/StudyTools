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
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = "bible"
OUT = os.path.join(ROOT, "data", DATA_DIR)
REPORT = os.path.join(ROOT, "scripts", ".cache", "rvm-pairs.txt")

SRC, DEST = "RV", "RVM"   # overridden by argv

CORPUS = set()
FREQ = Counter()
# The texts this script writes. See load_corpus().
WRITTEN_HERE = {"RVM", "JPSM", "DRCM", "ASVM", "YLTM"}
# Words the corpus uses as verbs — those it puts after "to", "shall", "can" and
# the like. -est has to be stripped back to one of these: "hatest" reduces to
# "hat" as readily as to "hate", and only the corpus can say which is a verb.
VERBS = set()
PAIRS = {}
# No "not" here: "and hid not his face" would put the past tense "hid" in the
# verb list, and "hideth" would then be modernized to "hids".
VERB_FRAME = re.compile(
    r"\b(?:to|shall|shalt|will|wilt|would|wouldest|should|shouldest|can|canst|could|may|"
    r"mayest|might|must|do|dost|does|doth|did|didst|let)\s+([A-Za-z]+)", re.IGNORECASE)

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
       "wouldest": "would",
       # the same auxiliaries with the shorter -st ending the older texts also use
       "mayst": "may", "mightst": "might", "couldst": "could", "shouldst": "should",
       "wouldst": "would"}

IRREGULAR = {"seest": "see", "sawest": "saw", "gavest": "gave", "camest": "came",
             "madest": "made", "saidst": "said", "knewest": "knew", "wentest": "went",
             "gottest": "got", "sattest": "sat", "heardest": "heard", "tookest": "took",
             "spakest": "spoke", "toldest": "told", "foundest": "found", "leftest": "left",
             "keptest": "kept", "sentest": "sent", "slewest": "slew", "drewest": "drew",
             "thoughtest": "thought", "broughtest": "brought", "bearest": "bear",
             "fleest": "flee", "brokest": "broke"}

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
            "tashheth", "azmaveth", "basshebeth", "zoheth", "hareseth",
            # The ordinals. "Twentieth" was protected, but its siblings were not,
            # and the rule that only verbs take -eth turned "the thirtieth year"
            # into "the thirties year" in Ezekiel, Kings, Chronicles and more.
            "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth",
            "eightieth", "ninetieth"}

WORDS = {"unto": "to", "yea": "yes", "nay": "no", "verily": "truly", "spake": "spoke",
         "brake": "broke", "sware": "swore", "drave": "drove", "gat": "got",
         "shew": "show", "shewed": "showed", "shewest": "show", "sheweth": "shows",
         "shews": "shows", "shewn": "shown", "peradventure": "perhaps", "whosoever": "whoever",
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
# "knowest thou", "saidst thou", "commandedst thou" — all three ask a
# question with do-support in present-day English.
RE_VERB_THOU = re.compile(r"\b([A-Za-z]+?)(est|edst|dst)\s+(thou|thee)(\s+not)?\b")
# The second-person past, where it is not the beginning of a question:
# "thou lovedst me" -> "you loved me", "thou saidst" -> "you said".
# "O God, who deliverest Israel": a relative clause with a second person verb
# in it. Present-day English keeps the third person there — "who delivers" —
# because "who" is the subject and the reader is not being addressed.
RE_RELATIVE_EST = re.compile(r"\b(who|which|that|where)\s+([A-Za-z]+?)est\b",
                             re.IGNORECASE)
# The same construction with a third person pronoun the text has left archaic:
# "in some other place where he liest" is "where he lies".
RE_THIRD_EST = re.compile(r"\b(he|she|it)\s+([A-Za-z]+?)est\b", re.IGNORECASE)
RE_EDST = re.compile(r"\b([A-Za-z]+)edst\b")
RE_DST = re.compile(r"\b([A-Za-z]+)dst\b")
# "midst" is present-day English; nothing else that ends in -dst is.
KEEP_DST = {"midst"}

# for the verb-first question, the base form to put after "do you". Keyed by the
# stem as it appears before -est, because that is what the pattern captures.
BASE_OF = {"saw": "see", "see": "see", "gave": "give", "came": "come", "made": "make",
           "said": "say", "saidst": "say", "knew": "know", "went": "go", "sat": "sit",
           "heard": "hear", "took": "take", "spoke": "speak", "told": "tell",
           "found": "find", "left": "leave", "kept": "keep", "sent": "send",
           "drew": "draw", "got": "get", "knewest": "know"}

# "thine" is "your" before a noun ("thine eyes") but "yours" when it stands
# as the predicate ("for thine is the kingdom", "the kingdom is thine").
RE_THINE_YOURS_BEFORE = re.compile(
    r"\b(is|are|was|were|be|been|being|art)(\s+)(Thine|thine)\b", re.IGNORECASE)
RE_THINE_YOURS = re.compile(
    r"\b(Thine|thine)\b(?=\s+(?:is|are|was|were|be|been|being|art)\b)")
# "mine eyes" is "my eyes", but "the kingdom is mine" is already today's
# English, so a following verb of being has to stay out of it.
RE_MINE = re.compile(
    r"\b(Mine|mine)\b(?=\s+[A-Za-z])(?!\s+(?:is|are|was|were|be|been|being)\b)",
    re.IGNORECASE)
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
    # Left over in the Douay-Rheims and Young's Literal, which put a second
    # person verb in a verse with no second person pronoun to announce it: the
    # "only in a second-person verse" guard cannot see these, so they are named.
    "causest": "cause", "compassest": "compass", "hidest": "hide",
    "inspectest": "inspect", "trampest": "tramp", "lovest": "love",
    "suffocatest": "suffocates", "earneth": "earns", "exerteth": "exerts",
    # Rare verbs whose base form these texts never use on its own, so the corpus
    # cannot resolve them and this table has to say so instead. Each was read in
    # its verse before being listed. The names that also end in -eth — Mephibo-
    # sheth, Jetheth, Ashtoreth, Koheleth, Topheth — are deliberately absent:
    # leaving them alone is the point.
    "abateth": "abates", "allayeth": "allays", "attributeth": "attributes",
    "backbiteth": "backbites", "beckoneth": "beckons", "beheadeth": "beheads",
    "beseigeth": "besieges", "bubbleth": "bubbles", "caresseth": "caresses",
    "carveth": "carves", "comitteth": "commits", "condoleth": "condoles",
    "conveneth": "convenes", "creaketh": "creaks", "cumbereth": "cumbers",
    "defineth": "defines", "depastureth": "depastures", "disposeth": "disposes",
    "divulgeth": "divulges", "enhanceth": "enhances", "escheweth": "eschews",
    "flaunteth": "flaunts", "flingeth": "flings", "freezeth": "freezes",
    "glanceth": "glances", "hoppeth": "hops", "impelleth": "impels",
    "inebriateth": "inebriates", "inebreateth": "inebriates", "inspireth": "inspires",
    "listeth": "lists", "pranceth": "prances", "pricketh": "pricks",
    "prieth": "pries", "puffeth": "puffs", "rattleth": "rattles", "raveth": "raves",
    "rinseth": "rinses", "screaketh": "screaks", "scribbleth": "scribbles",
    "shrieketh": "shrieks", "sneezeth": "sneezes", "snorteth": "snorts",
    "sparkleth": "sparkles", "squeezeth": "squeezes", "streweth": "strews",
    "supplicateth": "supplicates", "suppresseth": "suppresses", "thrasheth": "thrashes",
    "tracketh": "tracks", "voucheth": "vouches", "weaneth": "weans",
    "wieldeth": "wields",
}

# A base form the texts use less often than this is a name, not a verb:
# "Jetheth" and "Sophereth" reduce to "Jeth" and "Sopher", one use each.
MIN_BASE_FREQ = 3


def record(before, after):
    if before != after:
        PAIRS[(before, after)] = PAIRS.get((before, after), 0) + 1


def keep_case(src, out):
    out = out[:1].upper() + out[1:] if src[:1].isupper() else out
    record(src, out)
    return out


def base_of_past(past):
    """The verb behind a past tense, for "commandedst thou" -> "did you
    command". The irregulars are in BASE_OF already; the regulars come apart
    readily enough."""
    low = past.lower()
    if low in BASE_OF:
        return BASE_OF[low]
    cands = []
    if low.endswith("ied"):
        cands.append(low[:-3] + "y")      # carried -> carry
    if low.endswith("ed"):
        cands += [low[:-1], low[:-2]]      # loved -> love, called -> call
    elif low.endswith("d"):
        cands.append(low[:-1])             # said -> sai
    cands.append(low)
    for cand in cands:
        if cand in VERBS:
            return WORDS.get(cand, cand)
    known_cands = [c for c in cands if c in CORPUS or c in SEED]
    if known_cands:
        best = max(known_cands, key=lambda c: FREQ[c])
        return WORDS.get(best, best)
    return None


def known(form):
    """Is this the base of a verb the corpus actually uses? A base it has never
    seen is a sign that the rule has misread a name or an ordinal — Jetheth,
    Sophereth, the thirtieth — and inventing "Jeths" from them is worse than
    leaving an -eth in place. The conjugated form is not asked for: "adores"
    and "abides" are English whether or not these texts happen to contain them.
    """
    return form.lower() in CORPUS or form.lower() in SEED


def base_verb(stem):
    low = stem.lower()
    cands = [low, low + "e", low + "y"]
    if low.endswith("i"):
        cands.insert(0, low[:-1] + "y")      # glori -> glory, cri -> cry
    if len(low) > 3 and low[-1] == low[-2]:
        cands.append(low[:-1])            # abhorr -> abhor, sitt -> sit
    # Take the candidate the texts use most. For "adoreth" that is "adore",
    # which they use 112 times, and not "Ador", a name they use once; for
    # "Jetheth" the only candidate at all is "Jeth", once, which is a name and
    # not a verb, so there is no base to be had.
    known_cands = [c for c in cands if c in VERBS or c in CORPUS or c in SEED]
    if not known_cands:
        return None
    verb_cands = [c for c in known_cands if c in VERBS]
    best = max(verb_cands or known_cands, key=lambda c: FREQ[c])
    return best if FREQ[best] >= MIN_BASE_FREQ or best in SEED else None


def add_s(base):
    """Third person singular of a base form: abide -> abides, do -> does."""
    if base.endswith("y") and len(base) > 1 and base[-2] not in "aeiou":
        return base[:-1] + "ies"
    if base.endswith(("s", "x", "z", "ch", "sh")) or base in ("do", "go"):
        return base + "es"
    return base + "s"


def verb_eth(word):
    if word.lower() in KEEP_ETH:
        return word
    base = base_verb(word[:-3])
    if not base:
        return word
    return keep_case(word, add_s(base)) if known(base) else word


def verb_est(word, allow=True):
    low = word.lower()
    if low in IRREGULAR:
        return keep_case(word, IRREGULAR[low])
    if low in KEEP_EST or not allow:
        return word
    if low.endswith("est") and len(word) > 4:
        base = base_verb(word[:-3])
        if base:
            return keep_case(word, base) if known(base) else word
    return word


def modernize(text):
    # Whether the verse addresses someone. It has to be read off the text as it
    # arrived: by the time the -est rule runs, "thou" has already become "you"
    # and "thou lovest me, and keepest my commandments" would keep "keepest".
    second_person = bool(RE_SECOND_PERSON.search(text))
    # A form that a "...est thou?" question follows is left for the question
    # rule: turning "Knowest thou" into "Know thou" here would leave a
    # verb-first question nobody says any more, and the question rule can only
    # recognise "Knowest". The -eth entries are not skipped — "What aileth
    # thee?" has to become "What ails you?", and no rule below would touch it.
    for a, b in OVERRIDES.items():
        guard = r"(?!\s+(?:thou|thee)\b)" if a.endswith("est") else ""
        text = re.sub(r"\b" + a + r"\b" + guard,
                      lambda m, b=b: keep_case(m.group(0), b), text,
                      flags=re.IGNORECASE)
    text = re.sub(r"\bHoly Ghost\b", "Holy Spirit", text)
    # "save" as a conjunction ("there is none save God") cannot be told from the
    # verb ("he shall save his people") by the word that follows, and both are
    # followed by a noun or a pronoun. Turning the verb into "except" corrupted
    # real verses — "he shall except his people" — so the rule is gone and the
    # conjunction is left as it is: archaic, and understood.
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
        """\"knowest thou not\" is a question with do-support in present-day
        English: \"do you not know\". The verb keeps its base form. "Art thou"
        and the auxiliaries have already been dealt with above."""
        stem, ending, negate = m.group(1), m.group(2), m.group(4)
        full = (stem + ending).lower()
        if ending == "est" and full in KEEP_EST:
            return m.group(0)          # "harvest thou", "lest thou": not verbs
        if ending == "est":
            past = IRREGULAR.get(full)     # "sawest", "gavest", "madest"
            if past:
                # a past in a question comes back as "did you see"
                base = BASE_OF.get(past.lower()) or base_of_past(past) or base_verb(stem)
                aux = "did"
            else:
                # BASE_OF is keyed by the stem and knows the past forms that
                # have to go back to a present base -- "saw" is "see".
                base = BASE_OF.get(stem.lower()) or OVERRIDES.get(full) or base_verb(stem)
                aux = "do"
            if base and not known(base):
                base = None
        else:
            base = base_of_past(stem + ("ed" if ending == "edst" else "d"))
            aux = "did"                        # "saidst thou" asks "did you say"
        if not base:
            # nothing safe to put after "do you"; the plain -edst/-dst rule
            # below will at least turn the word into a past tense
            return m.group(0)
        return (keep_case(stem, aux) + " you" + (" not" if negate else "")
                + " " + WORDS.get(base.lower(), base))
    text = RE_VERB_THOU.sub(verb_thou, text)
    text = RE_EDST.sub(lambda m: keep_case(m.group(0), m.group(1) + "ed"), text)
    text = RE_DST.sub(lambda m: m.group(0) if m.group(0).lower() in KEEP_DST
                      else keep_case(m.group(0), m.group(1) + "d"), text)
    # "thou knowest" -> "you know"
    def thou_verb(m):
        v = m.group(2)
        low = v.lower()
        if low.endswith("edst") or (low.endswith("dst") and low not in AUX):
            return keep_case(m.group(1), "you") + " " + v[:-2]   # lovedst -> loved
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
    # "O God, who deliverest Israel" -> "O God, who delivers Israel"
    def third_person(subject, stem):
        """"who deliverest" -> "who delivers". None when the word is not a
        verb this pass knows how to inflect, so the caller can leave it."""
        full = (stem + "est").lower()
        if full in KEEP_EST:
            return None
        if full in IRREGULAR:
            return subject + " " + keep_case(stem + "est", IRREGULAR[full])
        base = base_verb(stem)
        if not base or not known(base):
            return None
        return subject + " " + keep_case(stem + "est", add_s(base))

    text = RE_RELATIVE_EST.sub(
        lambda m: third_person(m.group(1), m.group(2)) or m.group(0), text)
    text = RE_THIRD_EST.sub(
        lambda m: third_person(m.group(1), m.group(2)) or m.group(0), text)
    # third-person -eth, then second-person -est (only in a second-person verse)
    text = RE_VERB_ETH.sub(lambda m: verb_eth(m.group(0)), text)

    def fix_est(m):
        """A verse with no second person in it. The verb is usually the second
        person carried on from an earlier verse — "and lovest her" — so the base
        form is right. But after a relative clause the subject is the relative
        pronoun, and the verb stays third person: "God who gives me revenge, and
        bringest down people" is "... and brings down people"."""
        word = m.group(0)
        if second_person:
            return verb_est(word, True)
        before = text[:m.start()].lower()
        if (re.search(r"\b(and|but)\s+$", before)
                and re.search(r"\b(who|which|that|where)\b", before)
                and word.lower() not in KEEP_EST):
            if word.lower() in IRREGULAR:
                return keep_case(word, IRREGULAR[word.lower()])   # brokest -> broke
            base = base_verb(word[:-3])
            if base and known(base):
                return keep_case(word, add_s(base))
        return verb_est(word, False)
    text = RE_VERB_EST.sub(fix_est, text)
    for a, b in WORDS.items():
        text = re.sub(r"\b" + a + r"\b", lambda m, b=b: keep_case(m.group(0), b), text,
                      flags=re.IGNORECASE)
    text = RE_MINE.sub(lambda m: keep_case(m.group(1), "my"), text)
    text = RE_THINE_YOURS_BEFORE.sub(
        lambda m: m.group(1) + m.group(2) + keep_case(m.group(3), "yours"), text)
    text = RE_THINE_YOURS.sub(lambda m: keep_case(m.group(1), "yours"), text)
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
    """Every word in every bundled translation, so rare verbs can be checked.

    The modernized texts are left out. They are this script's own output, and
    reading them back would make the pass judge its words by its words: an
    earlier run's mistake — "hids", "thirties" — would look like evidence that
    "hids" and "thirties" are English, and a fresh clone would build a
    different text from a working copy.
    """
    paths = glob.glob(os.path.join(ROOT, "data", "bible", "*.json"))
    if DATA_DIR != "bible":
        paths += glob.glob(os.path.join(OUT, "*.json"))
    for path in paths:
        name = os.path.basename(path)
        parts = name.split(".")
        if len(parts) == 3 and parts[1] in WRITTEN_HERE:
            continue
        try:
            d = json.load(open(path, encoding="utf-8"))
        except ValueError:
            continue
        if not isinstance(d, dict) or "chapters" not in d:
            continue          # books.json / translations.json
        for verses in d["chapters"].values():
            for t in verses.values():
                words = [w.lower() for w in re.findall(r"[A-Za-z]+", t)]
                CORPUS.update(words)
                for w in words:
                    FREQ[w] += 1
                VERBS.update(w.lower() for w in VERB_FRAME.findall(t))


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
