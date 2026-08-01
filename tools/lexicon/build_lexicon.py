# -*- coding: utf-8 -*-
"""Builds public/engine/lexicon.js from a curated word list.

Every entry is validated three ways before it ships:
  1. gruut can phonemize it at all,
  2. every resulting IPA symbol exists in the acoustic model's vocab
     (so the GOP scorer can actually score the word -- a word we can't
     score is worse than no word),
  3. the claimed phoneme target actually appears at the claimed position.
Anything that fails is reported and excluded rather than silently shipped.
"""
import json, re, sys
from pathlib import Path
import gruut

REPO = Path(__file__).resolve().parent.parent.parent
VOCAB = json.load(open(REPO / "public/bench/data/vocab.json"))
STRESS = re.compile(r"[ˈˌ]")

# ph code -> the IPA symbol(s) that realize it in this model's vocab
PH_IPA = {
    "p": ["p"], "b": ["b"], "m": ["m"], "n": ["n"], "w": ["w"], "h": ["h"],
    "t": ["t"], "d": ["d"], "k": ["k"], "g": ["ɡ"], "f": ["f"], "v": ["v"],
    "s": ["s"], "z": ["z"], "l": ["l"], "r": ["ɹ"], "y": ["j"],
    "sh": ["ʃ"], "ch": ["t͡ʃ"], "j": ["d͡ʒ"], "th": ["θ", "ð"], "ng": ["ŋ"],
}

# word, phoneme target, position, complexity level, affordances
# Admission criteria (spec section 4): imageable as a single object; in a
# 2-7 year-old's receptive vocabulary; animatable inside >=1 affordance;
# nothing that needs to be red (banned palette).
LEX = [
    # ---- GAP: something to cross with -------------------------------
    ("board",   "b",  "initial", 2, ["GAP"]),
    ("log",     "l",  "initial", 2, ["GAP"]),
    ("rope",    "r",  "initial", 2, ["GAP", "REACH", "CLOSED"]),
    ("rock",    "r",  "initial", 2, ["GAP"]),
    ("mat",     "m",  "initial", 2, ["GAP"]),
    ("path",    "p",  "initial", 2, ["GAP", "HIDDEN"]),
    ("boat",    "b",  "initial", 2, ["GAP", "CARRY"]),
    ("net",     "n",  "initial", 2, ["GAP", "REACH", "CARRY"]),
    ("door",    "d",  "initial", 2, ["GAP", "CLOSED"]),
    ("wood",    "w",  "initial", 2, ["GAP"]),
    ("bridge",  "b",  "initial", 4, ["GAP"]),
    ("stone",   "s",  "initial", 4, ["GAP"]),
    ("plank",   "p",  "initial", 4, ["GAP"]),
    ("stick",   "s",  "initial", 4, ["GAP", "REACH", "HIDDEN"]),
    ("big log", "l",  "initial", 5, ["GAP"]),
    ("long rope","r", "initial", 5, ["GAP"]),

    # ---- REACH: something too high ----------------------------------
    ("ball",    "b",  "initial", 2, ["REACH", "CARRY"]),
    ("basket",  "b",  "initial", 2, ["REACH", "CARRY"]),
    ("ribbon",  "r",  "initial", 2, ["REACH"]),
    ("ladder",  "l",  "initial", 2, ["REACH"]),
    ("kite",    "k",  "initial", 2, ["REACH", "HIDDEN"]),
    ("hat",     "h",  "initial", 2, ["REACH"]),
    ("pole",    "p",  "initial", 2, ["REACH", "CLOSED"]),
    ("bell",    "b",  "initial", 2, ["REACH", "CLOSED", "HIDDEN"]),
    ("nest",    "n",  "initial", 2, ["REACH", "HIDDEN"]),
    ("moth",    "m",  "initial", 2, ["REACH", "HIDDEN"]),
    ("apple",   "p",  "medial",  3, ["REACH", "CARRY"]),
    ("basket up","b", "initial", 5, ["REACH"]),
    ("rope up", "r",  "initial", 5, ["REACH"]),

    # ---- DARK: a light to bring -------------------------------------
    ("lamp",    "l",  "initial", 2, ["DARK"]),
    ("light",   "l",  "initial", 2, ["DARK"]),
    ("moon",    "m",  "initial", 2, ["DARK"]),
    ("match",   "m",  "initial", 2, ["DARK"]),
    ("sun",     "s",  "initial", 2, ["DARK"]),
    ("candle",  "k",  "initial", 2, ["DARK", "CARRY"]),
    ("torch",   "t",  "initial", 2, ["DARK", "CARRY"]),
    ("window",  "w",  "initial", 2, ["DARK", "CLOSED"]),
    ("fire",    "f",  "initial", 2, ["DARK"]),
    ("lantern", "l",  "initial", 2, ["DARK", "CARRY"]),
    ("shine",   "sh", "initial", 2, ["DARK"]),
    ("star",    "s",  "initial", 4, ["DARK"]),
    ("glow",    "g",  "initial", 4, ["DARK"]),
    ("bright light","b","initial",5,["DARK"]),

    # ---- HIDDEN: a friend behind a hill -----------------------------
    ("bunny",   "b",  "initial", 2, ["HIDDEN"]),
    ("bird",    "b",  "initial", 2, ["HIDDEN"]),
    ("mouse",   "m",  "initial", 2, ["HIDDEN"]),
    ("duck",    "d",  "initial", 2, ["HIDDEN"]),
    ("frog",    "f",  "initial", 2, ["HIDDEN"]),
    ("fox",     "f",  "initial", 2, ["HIDDEN"]),
    ("deer",    "d",  "initial", 2, ["HIDDEN"]),
    ("hill",    "h",  "initial", 2, ["HIDDEN"]),
    ("bug",     "b",  "initial", 2, ["HIDDEN"]),
    ("cat",     "k",  "initial", 2, ["HIDDEN"]),
    ("dog",     "d",  "initial", 2, ["HIDDEN"]),
    ("goose",   "g",  "initial", 2, ["HIDDEN"]),
    ("sheep",   "sh", "initial", 2, ["HIDDEN"]),
    ("fish",    "sh", "final",   3, ["HIDDEN", "CARRY"]),
    ("chick",   "ch", "initial", 2, ["HIDDEN"]),
    ("whistle", "w",  "initial", 2, ["HIDDEN", "CLOSED"]),
    ("little mouse","m","initial",5,["HIDDEN"]),

    # ---- CLOSED: a door with no handle ------------------------------
    ("key",     "k",  "initial", 2, ["CLOSED"]),
    ("knob",    "n",  "initial", 2, ["CLOSED"]),
    ("handle",  "h",  "initial", 2, ["CLOSED"]),
    ("button",  "b",  "initial", 2, ["CLOSED"]),
    ("hook",    "h",  "initial", 2, ["CLOSED", "REACH"]),
    ("ring",    "r",  "initial", 2, ["CLOSED"]),
    ("latch",   "l",  "initial", 2, ["CLOSED"]),
    ("chain",   "ch", "initial", 2, ["CLOSED", "CARRY"]),
    ("gate",    "g",  "initial", 2, ["CLOSED"]),
    ("lock",    "l",  "initial", 2, ["CLOSED"]),
    ("magnet",  "m",  "initial", 2, ["CLOSED", "REACH"]),
    ("push",    "sh", "final",   3, ["CLOSED"]),
    ("golden key","k","initial", 5, ["CLOSED"]),

    # ---- CARRY: something too heavy ---------------------------------
    ("wagon",   "w",  "initial", 2, ["CARRY"]),
    ("cart",    "k",  "initial", 2, ["CARRY"]),
    ("wheel",   "w",  "initial", 2, ["CARRY"]),
    ("sled",    "s",  "initial", 4, ["CARRY"]),
    ("bag",     "b",  "initial", 2, ["CARRY"]),
    ("box",     "b",  "initial", 2, ["CARRY"]),
    ("tray",    "t",  "initial", 4, ["CARRY"]),
    ("pillow",  "p",  "initial", 2, ["CARRY"]),
    ("melon",   "m",  "initial", 2, ["CARRY"]),
    ("puppy",   "p",  "medial",  3, ["CARRY", "HIDDEN"]),
    ("lemon",   "m",  "medial",  3, ["CARRY"]),
    ("wagon up","w",  "initial", 5, ["CARRY"]),
]

# gruut mis-reduces some compounds/rare words as one token; phonemize these
# from an explicit spelling instead.
G2P_OVERRIDE = {}


def phonemize(text):
    out = []
    for sentence in gruut.sentences(G2P_OVERRIDE.get(text, text), lang="en-us"):
        for wd in sentence:
            if wd.phonemes:
                out.extend(STRESS.sub("", p) for p in wd.phonemes)
    return out


def position_ok(ipa, target_syms, pos, per_word):
    """Is the target phoneme where we claim it is?

    Position is judged PER WORD, not across the whole phrase: in "big log"
    the /l/ target is word-initial in "log" even though it sits at index 3
    of the phrase. Judging phrase-globally rejected every level-5 entry."""
    idx = [i for i, p in enumerate(ipa) if p in target_syms]
    if not idx:
        return False, "target phoneme absent"
    if pos == "initial":
        hits = [w[0] in target_syms for w in per_word if w]
        return any(hits), f"word-initial in {sum(hits)} of {len(per_word)} word(s)"
    if pos == "final":
        hits = [w[-1] in target_syms for w in per_word if w]
        return any(hits), f"word-final in {sum(hits)} of {len(per_word)} word(s)"
    if pos == "medial":
        return any(0 < i < len(ipa) - 1 for i in idx), f"occurrences at {idx}"
    if pos == "__cluster_unused__":
        # a cluster means the target is adjacent to another consonant
        vowels = set("iɪeɛæaɑɔoʊuʌəɚ") | {"aɪ", "aʊ", "eɪ", "oʊ", "ɔɪ"}
        for i in idx:
            for j in (i - 1, i + 1):
                if 0 <= j < len(ipa) and ipa[j] not in vowels:
                    return True, f"cluster at {i}"
        return False, f"no adjacent consonant, occurrences at {idx}"
    return False, "unknown position"


rows, problems = [], []
for word, ph, pos, lvl, aff in LEX:
    target_syms = PH_IPA[ph]
    try:
        ipa = phonemize(word)
    except Exception as e:
        problems.append((word, f"gruut failed: {e!r}"))
        continue
    if not ipa:
        problems.append((word, "gruut produced no phonemes"))
        continue
    missing = [p for p in ipa if p not in VOCAB]
    if missing:
        problems.append((word, f"IPA not in model vocab: {missing} (full: {ipa})"))
        continue
    per_word = [phonemize(w) for w in word.split()]
    ok, why = position_ok(ipa, target_syms, pos, per_word)
    if not ok:
        problems.append((word, f"position '{pos}' for /{ph}/ unverified: {why} (ipa: {ipa})"))
        continue
    rows.append({
        "w": word, "ph": ph, "pos": pos, "lvl": lvl, "aff": aff,
        "ipa": ipa, "ids": [VOCAB[p] for p in ipa],
    })

print(f"ACCEPTED {len(rows)} / {len(LEX)}")
if problems:
    print(f"\nREJECTED {len(problems)}:")
    for w, why in problems:
        print(f"  {w}: {why}")

json.dump(rows, open(Path(__file__).parent / "lexicon_rows.json", "w"), ensure_ascii=False, indent=1)
