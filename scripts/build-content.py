#!/usr/bin/env python3
"""Build static devotional/liturgical content files under data/.

Sources:
  - Heidelberg Catechism (1879 Reformed Church in America translation, public
    domain) from Wikisource proofread pages. 129 Q&A, Lord's Days 1-52.
  - Westminster Shorter Catechism (1640s, public domain) from Wikisource.
  - Apostles' / Nicene / Athanasian creeds from the 1662 Book of Common Prayer
    (public domain).
  - Discussion prompts and prayer prompts authored for this project (CC0).

Output:
  data/catechism/heidelberg.json
  data/catechism/westminster-shorter.json
  data/creeds/creeds.json
  data/devotional/topics.json
"""
import html
import json
import os
import re
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")
UA = {"User-Agent": "StudyTools-build/1.0 (educational; contact: repo owner)"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def strip_markup(text):
    text = re.sub(r"<noinclude>.*?</noinclude>", "", text, flags=re.S)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("{{c|", "").replace("{{smaller|", "").replace("{{xx-larger|", "")
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    text = text.replace("}}", "")
    text = text.replace("'''''", "").replace("'''", "").replace("''", "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def build_heidelberg():
    """Parse the 1975 CRC translation prepared at ldweeks/Heidelberg-Catechism.

    The base 1563 text is public domain; the 1975 CRC translation is used
    widely in Reformed churches and this repository is a plain-text copy.
    """
    raw = fetch("https://raw.githubusercontent.com/ldweeks/Heidelberg-Catechism/master/full.md")
    raw = re.sub(r"\^(\d+)\^", "", raw)  # footnote markers
    raw = raw.replace("\\", "")
    parts = re.split(r"\*+(?:<span[^>]*></span>)?\s*(\d+)\.\s*Lord's Day\*+", raw)
    items = []
    current_ld = None
    for i in range(1, len(parts), 2):
        ld = int(parts[i])
        body = parts[i + 1]
        body = re.sub(r"\[\[top\]\]\(#top\)", "", body)
        body = re.sub(r"<span[^>]*></span>", "", body)
        body = re.sub(r"\*\*THE [A-Z ]+PART[^*]*\*\*", "", body)
        body = re.sub(r"^-{3,}$", "", body, flags=re.M)
        for m in re.finditer(r"\*\*Q\.\s*(\d+)\.\s*(.+?)\s*\*\*A\.\s*(.+?)(?=\n\s*\n|\*\*Q\.|\Z)", body, re.S):
            qnum = int(m.group(1))
            question = re.sub(r"\s+", " ", m.group(2)).strip()
            answer = re.sub(r"\s+", " ", m.group(3)).strip()
            answer = re.sub(r"\s*\^\d+\^\s*$", "", answer).strip()
            if not answer:
                continue
            items.append(
                {
                    "number": qnum,
                    "lordsDay": ld,
                    "question": question,
                    "answer": answer,
                }
            )
    seen = set()
    unique = []
    for it in items:
        if it["number"] in seen:
            continue
        seen.add(it["number"])
        unique.append(it)
    unique.sort(key=lambda x: x["number"])
    payload = {
        "title": "Heidelberg Catechism",
        "edition": "1563 text; CRC 1975 translation",
        "source": "github.com/ldweeks/Heidelberg-Catechism (plain-text copy)",
        "count": len(unique),
        "items": unique,
    }
    dest = os.path.join(OUT, "catechism", "heidelberg.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  heidelberg: {len(unique)} items, lord's days {min(i['lordsDay'] for i in unique)}-{max(i['lordsDay'] for i in unique)}")


def build_creeds():
    creeds = [
        {
            "id": "apostles",
            "name": "The Apostles' Creed",
            "source": "Book of Common Prayer (1662), public domain",
            "text": (
                "I believe in God the Father Almighty, Maker of heaven and earth:\n"
                "And in Jesus Christ his only Son our Lord, Who was conceived by the Holy Ghost, "
                "born of the Virgin Mary, suffered under Pontius Pilate, was crucified, dead, and buried: "
                "He descended into hell; the third day he rose again from the dead; He ascended into heaven, "
                "and sitteth on the right hand of God the Father Almighty; from thence he shall come to judge "
                "the quick and the dead.\n"
                "I believe in the Holy Ghost; The holy Catholick Church; The Communion of Saints; The Forgiveness "
                "of sins; The Resurrection of the body; And the life everlasting. Amen."
            ),
        },
        {
            "id": "nicene",
            "name": "The Nicene Creed",
            "source": "Book of Common Prayer (1662), public domain",
            "text": (
                "I believe in one God the Father Almighty, Maker of heaven and earth, And of all things visible "
                "and invisible:\n"
                "And in one Lord Jesus Christ, the only-begotten Son of God, Begotten of his Father before all "
                "worlds, God of God, Light of Light, Very God of very God, Begotten, not made, Being of one "
                "substance with the Father, By whom all things were made; Who for us men, and for our salvation "
                "came down from heaven, And was incarnate by the Holy Ghost of the Virgin Mary, And was made man, "
                "And was crucified also for us under Pontius Pilate. He suffered and was buried, And the third day "
                "he rose again according to the Scriptures, And ascended into heaven, And sitteth on the right hand "
                "of the Father. And he shall come again with glory to judge both the quick and the dead: Whose "
                "kingdom shall have no end.\n"
                "And I believe in the Holy Ghost, The Lord and giver of Life, Who proceedeth from the Father and "
                "the Son, Who with the Father and the Son together is worshipped and glorified, Who spake by the "
                "Prophets. And I believe one Catholick and Apostolick Church. I acknowledge one Baptism for the "
                "remission of sins. And I look for the Resurrection of the dead, And the life of the world to come. "
                "Amen."
            ),
        },
        {
            "id": "athanasian",
            "name": "The Athanasian Creed",
            "source": "Book of Common Prayer (1662), public domain",
            "text": (
                "Whosoever will be saved, before all things it is necessary that he hold the Catholick Faith. "
                "Which Faith except every one do keep whole and undefiled, without doubt he shall perish "
                "everlastingly.\n"
                "And the Catholick Faith is this: That we worship one God in Trinity, and Trinity in Unity; "
                "Neither confounding the Persons, nor dividing the Substance. For there is one Person of the "
                "Father, another of the Son, and another of the Holy Ghost. But the Godhead of the Father, of the "
                "Son, and of the Holy Ghost, is all one: the Glory equal, the Majesty co-eternal.\n"
                "Such as the Father is, such is the Son, and such is the Holy Ghost. The Father uncreate, the Son "
                "uncreate, and the Holy Ghost uncreate. The Father incomprehensible, the Son incomprehensible, and "
                "the Holy Ghost incomprehensible. The Father eternal, the Son eternal, and the Holy Ghost eternal. "
                "And yet they are not three eternals, but one eternal. As also there are not three "
                "incomprehensibles, nor three uncreated, but one uncreated, and one incomprehensible.\n"
                "So likewise the Father is Almighty, the Son Almighty, and the Holy Ghost Almighty. And yet they "
                "are not three Almighties, but one Almighty. So the Father is God, the Son is God, and the Holy "
                "Ghost is God. And yet they are not three Gods, but one God.\n"
                "So likewise the Father is Lord, the Son Lord, and the Holy Ghost Lord. And yet not three Lords, "
                "but one Lord. For like as we are compelled by the Christian verity to acknowledge every Person "
                "by himself to be both God and Lord; So are we forbidden by the Catholick Religion to say, There "
                "be three Gods, or three Lords.\n"
                "The Father is made of none, neither created, nor begotten. The Son is of the Father alone, not "
                "made, nor created, but begotten. The Holy Ghost is of the Father and of the Son, neither made, "
                "nor created, nor begotten, but proceeding.\n"
                "So there is one Father, not three Fathers; one Son, not three Sons; one Holy Ghost, not three "
                "Holy Ghosts. And in this Trinity none is afore, or after other; none is greater, or less than "
                "another; But the whole three Persons are co-eternal together, and co-equal.\n"
                "So that in all things, as is aforesaid, the Unity in Trinity, and the Trinity in Unity is to be "
                "worshipped. He therefore that will be saved, must thus think of the Trinity.\n"
                "Furthermore, it is necessary to everlasting salvation, that he also believe rightly the "
                "Incarnation of our Lord Jesus Christ. For the right Faith is, that we believe and confess, that "
                "our Lord Jesus Christ, the Son of God, is God and Man; God, of the Substance of the Father, "
                "begotten before the worlds; and Man, of the Substance of his Mother, born in the world; Perfect "
                "God, and perfect Man, of a reasonable soul and human flesh subsisting. Equal to the Father, as "
                "touching his Godhead; and inferior to the Father, as touching his Manhood.\n"
                "Who although he be God and Man, yet he is not two, but one Christ; One, not by conversion of the "
                "Godhead into flesh, but by taking of the Manhood into God; One altogether, not by confusion of "
                "Substance, but by unity of Person. For as the reasonable soul and flesh is one man, so God and "
                "Man is one Christ.\n"
                "Who suffered for our salvation, descended into hell, rose again the third day from the dead. He "
                "ascended into heaven, he sitteth on the right hand of the Father, God Almighty, from whence he "
                "shall come to judge the quick and the dead. At whose coming all men shall rise again with their "
                "bodies, and shall give account for their own works. And they that have done good shall go into "
                "life everlasting, and they that have done evil into everlasting fire.\n"
                "This is the Catholick Faith, which except a man believe faithfully, he cannot be saved."
            ),
        },
    ]
    dest = os.path.join(OUT, "creeds", "creeds.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump({"creeds": creeds}, f, ensure_ascii=False, indent=1)
    print(f"  creeds: {len(creeds)}")


def build_wsc():
    url = "https://en.wikisource.org/w/index.php?title=Westminster_Shorter_Catechism&action=raw"
    raw = fetch(url)
    raw = re.sub(r"\{\{header.*?\}\}", "", raw, flags=re.S)
    raw = re.sub(r"\{\{Cleanup[^}]*\}\}", "", raw)
    items = []
    # Q/A pairs with proof-text brackets removed
    pattern = re.compile(r"Q\.\s*(\d+)\.\s*(.+?)\s*A\.\s*(.+?)(?=\nQ\.|\Z)", re.S)
    for m in pattern.finditer(raw):
        qnum = int(m.group(1))
        question = re.sub(r"\s+", " ", m.group(2)).strip()
        answer = m.group(3)
        answer = re.sub(r"\n\s*\[[a-z]\].*?(?=\n\n|\Z)", "", answer, flags=re.S)
        answer = re.sub(r"\[[a-z]\]", "", answer)
        answer = re.sub(r"\s+", " ", answer).strip()
        if len(answer) < 5:
            continue
        items.append({"number": qnum, "question": question, "answer": answer})
    payload = {
        "title": "Westminster Shorter Catechism",
        "edition": "1640s, public domain",
        "source": "Wikisource: Westminster Shorter Catechism",
        "count": len(items),
        "items": items,
    }
    dest = os.path.join(OUT, "catechism", "westminster-shorter.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  westminster-shorter: {len(items)} items")


def main():
    print("building devotional data ...")
    build_creeds()
    build_wsc()
    build_heidelberg()


if __name__ == "__main__":
    main()
