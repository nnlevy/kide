# -*- coding: utf-8 -*-
"""Maps the /play game's spoken vocabulary onto speech targets.

WHY THIS EXISTS. The colours/counting/shapes game already asks a child to SAY
words -- "red", "three", "circle" -- and the browser's on-device recogniser
already tells us whether it heard them. That is real speech practice that has
been happening and going unrecorded. Mapping each answer word to the phoneme
target it carries turns the existing game into a source of clinical evidence
without changing a single thing a child experiences.

Validated exactly like the main lexicon: gruut must phonemize it, every symbol
must exist in the acoustic model's vocab, and the claimed target must actually
occur at the claimed position. Anything failing is reported and excluded.
"""
import json, re
from pathlib import Path
import gruut

REPO = Path(__file__).resolve().parent.parent.parent
VOCAB = json.load(open(REPO / "public/bench/data/vocab.json"))
STRESS = re.compile(r"[ˈˌ]")

PH_IPA = {
    "p": ["p"], "b": ["b"], "m": ["m"], "n": ["n"], "w": ["w"], "h": ["h"],
    "t": ["t"], "d": ["d"], "k": ["k"], "g": ["ɡ"], "f": ["f"], "v": ["v"],
    "s": ["s"], "z": ["z"], "l": ["l"], "r": ["ɹ"], "y": ["j"],
    "sh": ["ʃ"], "ch": ["t͡ʃ"], "j": ["d͡ʒ"], "th": ["θ", "ð"],
}

# The exact strings the game accepts as spoken answers, and the sound each
# carries. Position is the position of THAT sound in THAT word.
PLAY_VOCAB = [
    # colours
    ("red",      "r",  "initial"),
    ("blue",     "b",  "initial"),
    ("yellow",   "y",  "initial"),
    ("green",    "g",  "initial"),
    ("purple",   "p",  "initial"),
    ("orange",   "r",  "medial"),
    # counting
    ("one",      "w",  "initial"),
    ("two",      "t",  "initial"),
    ("three",    "th", "initial"),
    ("four",     "f",  "initial"),
    ("five",     "f",  "initial"),
    # shapes
    ("circle",   "s",  "initial"),
    ("square",   "s",  "initial"),
    ("triangle", "t",  "initial"),
]

def phonemize(t):
    out = []
    for s in gruut.sentences(t, lang="en-us"):
        for w in s:
            if w.phonemes:
                out.extend(STRESS.sub("", p) for p in w.phonemes)
    return out

def position_ok(ipa, syms, pos):
    idx = [i for i, p in enumerate(ipa) if p in syms]
    if not idx:
        return False, "target phoneme absent"
    if pos == "initial":
        return ipa[0] in syms, f"first phoneme is {ipa[0]!r}"
    if pos == "final":
        return ipa[-1] in syms, f"last phoneme is {ipa[-1]!r}"
    if pos == "medial":
        return any(0 < i < len(ipa) - 1 for i in idx), f"occurrences at {idx}"
    return False, "unknown position"

rows, problems = [], []
for word, ph, pos in PLAY_VOCAB:
    ipa = phonemize(word)
    missing = [p for p in ipa if p not in VOCAB]
    if missing:
        problems.append((word, f"IPA outside model vocab: {missing} ({ipa})")); continue
    ok, why = position_ok(ipa, PH_IPA[ph], pos)
    if not ok:
        problems.append((word, f"/{ph}/ {pos} unverified: {why} ({ipa})")); continue
    rows.append({"w": word, "target": f"{ph}_{pos}", "ipa": ipa,
                 "ids": [VOCAB[p] for p in ipa]})

print(f"ACCEPTED {len(rows)} / {len(PLAY_VOCAB)}")
for w, why in problems:
    print(f"  REJECTED {w}: {why}")

out = REPO / "public/data/play-targets.json"
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({w["w"]: w for w in rows}, ensure_ascii=False, separators=(",", ":")),
               encoding="utf-8")
print("wrote", out.relative_to(REPO))
