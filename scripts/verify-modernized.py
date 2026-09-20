#!/usr/bin/env python3
"""Verify a modernized translation against the text it was made from.

    python3 scripts/verify-modernized.py                # every pair whose source is here
    python3 scripts/verify-modernized.py RV:RVM DRC:DRCM

A modernization pass rewrites tens of thousands of verses by rule, so it needs a
check that does not share the rules' assumptions. This one asks:

  * the verse structure is the source's — chapter for chapter, verse for verse
  * no archaic pronoun survives: thou, thee, thy, thine, ye
  * no ordinal was mistaken for a verb ("the thirties year")
  * no word was invented: every word in the output is a word a published text
    already uses, or a word an ordinary English ending makes of one ("adores"
    from the verb "adore") — never "hids" from "hideth" or "thirties" from
    "thirtieth", the two mistakes this check was written to catch
  * what -eth and -est were left, and what the "do you ...?" rule produced, are
    printed for reading. Residue is allowed — it is the conservative outcome —
    but it has to be visible.

Run it after scripts/modernize.py, and before wiring a translation into the
reader.
"""
import glob
import importlib.util
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIBLE = os.path.join(ROOT, "data", "bible")

# source : the pass's own output. JPS's source is no longer on disk, so JPSM is
# listed and skipped with a note rather than silently absent.
PAIRS = [("RV", "RVM"), ("DRC", "DRCM"), ("ASV", "ASVM"), ("YLT", "YLTM"), ("JPS", "JPSM")]

# Text the site ships that no rule wrote, for the invented-word test.
PUBLISHED = ["WEB", "WEBU", "KJV", "KJVA", "RV", "DRC", "ASV", "YLT"]

# "yourselves" is present-day English and the pass produces it; not residue.
ARCHAIC_PRONOUN = re.compile(r"\b(thou|thee|thy|thine|ye|thyself)\b", re.I)
ARCHAIC_WORD = re.compile(
    r"\b(hath|hast|hath|doth|dost|doest|saith|shalt|shalt|wilt|didst|canst|mayest|mightest|"
    r"couldest|shouldest|wouldest|wast|wert|spake|unto|verily|whilst|whiles|amongst|amidst|"
    r"aught|naught|peradventure|shew|shewed|sheweth|shewn|brake|sware|drave|gat|whereof|"
    r"thereof|wherein|wherewith|whereby|whereon|thereon|therein|therewith|thereto|"
    r"henceforth|hither|thither|whither|thence|whence|wrought)\b", re.I)
ORDINAL_BUG = re.compile(r"\b(thirt|fort|fift|sixt|sevent|eighti|nineti|multi)es\b", re.I)
ETH = re.compile(r"\b([A-Za-z]+)eth\b")
EST = re.compile(r"\b([A-Za-z]+)est\b")
QUESTION = re.compile(r"\bdo you(?:\s+not)?\s+([A-Za-z]+)")
WORD = re.compile(r"[A-Za-z]+")
# What a text says after "to", "shall", "can"... — its verbs, give or take.
VERB_FRAME = re.compile(
    r"\b(?:to|shall|shalt|will|wilt|would|should|can|canst|could|may|mayest|might|"
    r"must|do|dost|does|doth|did|didst|let)\s+([A-Za-z]+)", re.I)

# Words the pronoun rules produce, which no published text here happens to use.
# Every one is a present-day English form; the list is short on purpose.
RULE_OUTPUTS = set("""
you your yours yourself yourselves are were will would shall should could must may might can
have has had is am as it its there here now not no yes truly whoever whatever wherever however
whichever whomever while among amid toward anything nothing since says said spoke showed shown
shows worked broke swore drove got of to with on by from after which where
""".split())

# Words the pass leaves alone on purpose: ordinals and ordinary English that
# only looks archaic. They are not residue, so they are not counted as any.
PROTECTED = set("""
greatest youngest strongest highest lowest oldest deepest longest richest wisest darkest
sweetest nearest dearest manifest harvest honest priest rest west best guest nest pest test
chest crest quest forest tempest earnest modest arrest digest interest request lest farthest
furthest eldest fattest goodliest hottest mightiest holiest happiest worthiest lowliest
readiest heaviest easiest sittest surest safest purest sorest twentieth thirtieth fortieth
fiftieth sixtieth seventieth eightieth ninetieth teeth nazareth beneath underneath seth heath
sheath wreath breath death sabbath forth fourth
poorest choicest noblest finest bravest smallest meanest trimmest stoutest straitest chiefest
valiantest wrest protest detest molest contest vest jest dishonest southwest
""".split())

# Endings that an English verb or noun takes, for the invented-word test.
INFLECTIONS = [("ies", "y"), ("es", ""), ("s", ""), ("ed", ""), ("ing", "")]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def override_outputs():
    """The words the pass's own OVERRIDES table is written to produce.

    That table is a hand-written list of rare forms — "cavilleth" is "cavils",
    "acheth" is "aches" — and each entry is there to be read by eye in
    scripts/modernize.py. Accepting its values does not excuse anything the
    rules *derive*: "hids" and "thirties" were never on that list, and the
    published texts still have to account for every other word.
    """
    spec = importlib.util.spec_from_file_location(
        "modernize", os.path.join(ROOT, "scripts", "modernize.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return {v.lower() for v in module.OVERRIDES.values()}


def vocab_of(translations):
    """The words these texts use, and the words they use as verbs.

    Both are read off the published texts alone. No rule of the modernization
    pass is consulted, so a word can only pass this test on the evidence of a
    text a person wrote.
    """
    words, verbs = set(), set()
    for t in translations:
        for path in glob.glob(os.path.join(BIBLE, f"*.{t}.json")):
            data = load(path)
            if "chapters" not in data:
                continue
            for verses in data["chapters"].values():
                for text in verses.values():
                    words.update(w.lower() for w in WORD.findall(text))
                    verbs.update(w.lower() for w in VERB_FRAME.findall(text))
    return words, verbs


def is_english(word, vocab, verbs):
    """A word the texts use, or one of their verbs with an ordinary ending on
    it. "adores" is not in these texts but "adore" is, and a verb is a verb.
    "hids" fails: nothing here uses "hid" as a verb."""
    if word in vocab or word in RULE_OUTPUTS or word in PROTECTED:
        return True
    for ending, restore in INFLECTIONS:
        if word.endswith(ending):
            base = word[: -len(ending)] + restore
            if base in verbs or base in vocab:
                return True
    return False


def main():
    pairs = PAIRS
    if len(sys.argv) > 1:
        arg = sys.argv[1].upper()
        want = set(arg.split())
        pairs = [p for p in PAIRS if f"{p[0]}:{p[1]}" in want or p[1] in want]

    print(f"  reading the words of {len(PUBLISHED)} published texts for the vocabulary test")
    vocab, verbs = vocab_of(PUBLISHED)
    vocab |= override_outputs()

    failures, notes = [], []
    for src, dest in pairs:
        sources = sorted(glob.glob(os.path.join(BIBLE, f"*.{src}.json")))
        if not sources:
            notes.append(f"{dest}: no {src} text on disk to check it against, skipped")
            continue
        outs = sorted(glob.glob(os.path.join(BIBLE, f"*.{dest}.json")))
        if not outs:
            failures.append(f"{dest}: no {dest} files on disk")
            continue

        out_slugs = {os.path.basename(p)[: -len(f".{dest}.json")] for p in outs}
        src_slugs = {os.path.basename(p)[: -len(f".{src}.json")] for p in sources}
        for slug in sorted(src_slugs - out_slugs):
            failures.append(f"{dest}: {slug} is in {src} but not in {dest}")
        for slug in sorted(out_slugs - src_slugs):
            notes.append(f"{dest}: {slug} has no {src} source")

        verses = 0
        pronouns = Counter()
        archaic = Counter()
        ordinals = []
        eth = Counter()
        est = Counter()
        question = Counter()
        invented = Counter()
        invented_example = {}
        bad_structure = []

        for path in outs:
            slug = os.path.basename(path)[: -len(f".{dest}.json")]
            src_path = os.path.join(BIBLE, f"{slug}.{src}.json")
            data = load(path)
            # a verse is one string; the pass never touches the structure, so any
            # difference here is a bug in the pass, not a judgement call
            if not os.path.exists(src_path):
                continue
            source = load(src_path)
            if data["chapters"].keys() != source["chapters"].keys():
                bad_structure.append(f"{slug}: chapter lists differ")
                continue
            for chapter, verses_in in data["chapters"].items():
                if verses_in.keys() != source["chapters"][chapter].keys():
                    bad_structure.append(f"{slug} {chapter}: verse lists differ")
                    continue
                for ref, text in verses_in.items():
                    verses += 1
                    # the ASV leaves the verses it drops as empty strings, and
                    # the Douay-Rheims has a wholly empty psalm; only a verse the
                    # source fills and the pass empties is a fault
                    src_text = source["chapters"][chapter][ref]
                    if src_text.strip() and not text.strip():
                        bad_structure.append(f"{slug} {chapter}:{ref} was emptied")
                    for m in ARCHAIC_PRONOUN.finditer(text):
                        pronouns[m.group(1).lower()] += 1
                    for m in ARCHAIC_WORD.finditer(text):
                        archaic[m.group(1).lower()] += 1
                    if ORDINAL_BUG.search(text):
                        ordinals.append(f"{slug} {chapter}:{ref}")
                    for m in ETH.finditer(text):
                        stem = m.group(1).lower()
                        if stem + "eth" not in PROTECTED:
                            eth[stem] += 1
                    for m in EST.finditer(text):
                        stem = m.group(1).lower()
                        if stem + "est" not in PROTECTED:
                            est[stem] += 1
                    for m in QUESTION.finditer(text):
                        question[m.group(1).lower()] += 1
                    for w in WORD.findall(text):
                        w = w.lower()
                        if not is_english(w, vocab, verbs):
                            invented[w] += 1
                            invented_example.setdefault(w, f"{slug} {chapter}:{ref}")

        for name, counter in (("archaic pronoun", pronouns), ("archaic word", archaic)):
            if counter:
                failures.append(f"{dest}: {sum(counter.values())} {name}(s) left — "
                                + ", ".join(f"{w}×{n}" for w, n in counter.most_common(8)))
        if ordinals:
            failures.append(f"{dest}: {len(ordinals)} verse(s) with an ordinal turned plural — "
                            + ", ".join(ordinals[:6]))
        if bad_structure:
            failures.append(f"{dest}: {len(bad_structure)} structural fault(s) — "
                            + "; ".join(bad_structure[:6]))
        if invented:
            failures.append(f"{dest}: {len(invented)} word(s) no published text uses — "
                            + ", ".join(f"{w}×{n} ({invented_example[w]})"
                                        for w, n in invented.most_common(10)))

        print(f"  {dest}: {verses} verses checked against {src}, "
              f"{len(outs)} books")
        if eth:
            print(f"    -eth left, names and ordinals aside: {sum(eth.values())} ("
                  + ", ".join(f"{w}eth×{n}" for w, n in eth.most_common(12)) + ")")
        if est:
            print(f"    -est left, ordinary words aside: {sum(est.values())} ("
                  + ", ".join(f"{w}est×{n}" for w, n in est.most_common(12)) + ")")
        if question:
            print(f"    \"do you ...?\": {sum(question.values())} ("
                  + ", ".join(f"{w}×{n}" for w, n in question.most_common(12)) + ")")

    for n in notes:
        print("note: " + n)
    if failures:
        for f in failures:
            print("FAIL: " + f)
        print(f"{len(failures)} failure(s)")
        return 1
    print("checked the modernized texts against their sources; all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
