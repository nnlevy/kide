// lexicon.js -- the join table. GENERATED, do not hand-edit.
//
// Source of truth is tools/lexicon/build_lexicon.py; re-run it to regenerate.
// Every row was validated three ways at build time and anything failing was
// excluded rather than shipped:
//   1. gruut (en-us) can phonemize the word,
//   2. every IPA symbol exists in the acoustic model's vocab -- so the GOP
//      scorer can actually score it (an unscoreable word is worse than none),
//   3. the claimed phoneme target really does occur at the claimed position,
//      judged per-word so "big log" counts as word-initial /l/.
// That third check caught five mislabelled rows on the first run, including
// "sheep" tagged as final /sh/ when the sound is initial.
//
// Spec section 4: a word is admitted only if it is imageable as a single
// object, inside a 2-7 year-old's receptive vocabulary, animatable within at
// least one affordance, and free of the banned palette (nothing that must be
// red).
//
// Fields: w = display/spoken word; ph = phoneme target code; pos = position
// of that target; lvl = complexity ladder rung (see policy.js); aff =
// affordances this word can satisfy; ipa = gruut phoneme sequence, stress
// stripped; ids = ipa mapped to acoustic-model vocab ids, ready to hand
// straight to the CTC scorer with no lookup at runtime.

export const LEX = [
  {w:"board", ph:"b", pos:"initial", lvl:2, aff:["GAP"], ipa:["b","ɔ","ɹ","d"], ids:[3,28,35,4]},
  {w:"log", ph:"l", pos:"initial", lvl:2, aff:["GAP"], ipa:["l","ɔ","ɡ"], ids:[12,28,33]},
  {w:"rope", ph:"r", pos:"initial", lvl:2, aff:["GAP","REACH","CLOSED"], ipa:["ɹ","oʊ","p"], ids:[35,15,16]},
  {w:"rock", ph:"r", pos:"initial", lvl:2, aff:["GAP"], ipa:["ɹ","ɑ","k"], ids:[35,27,11]},
  {w:"mat", ph:"m", pos:"initial", lvl:2, aff:["GAP"], ipa:["m","æ","t"], ids:[13,24,18]},
  {w:"path", ph:"p", pos:"initial", lvl:2, aff:["GAP","HIDDEN"], ipa:["p","æ","θ"], ids:[16,24,40]},
  {w:"boat", ph:"b", pos:"initial", lvl:2, aff:["GAP","CARRY"], ipa:["b","oʊ","t"], ids:[3,15,18]},
  {w:"net", ph:"n", pos:"initial", lvl:2, aff:["GAP","REACH","CARRY"], ipa:["n","ɛ","t"], ids:[14,32,18]},
  {w:"door", ph:"d", pos:"initial", lvl:2, aff:["GAP","CLOSED"], ipa:["d","ɔ","ɹ"], ids:[4,28,35]},
  {w:"wood", ph:"w", pos:"initial", lvl:2, aff:["GAP"], ipa:["w","ʊ","d"], ids:[22,37,4]},
  {w:"bridge", ph:"b", pos:"initial", lvl:4, aff:["GAP"], ipa:["b","ɹ","ɪ","d͡ʒ"], ids:[3,35,34,5]},
  {w:"stone", ph:"s", pos:"initial", lvl:4, aff:["GAP"], ipa:["s","t","oʊ","n"], ids:[17,18,15,14]},
  {w:"plank", ph:"p", pos:"initial", lvl:4, aff:["GAP"], ipa:["p","l","æ","ŋ","k"], ids:[16,12,24,26,11]},
  {w:"stick", ph:"s", pos:"initial", lvl:4, aff:["GAP","REACH","HIDDEN"], ipa:["s","t","ɪ","k"], ids:[17,18,34,11]},
  {w:"big log", ph:"l", pos:"initial", lvl:5, aff:["GAP"], ipa:["b","ɪ","ɡ","l","ɔ","ɡ"], ids:[3,34,33,12,28,33]},
  {w:"long rope", ph:"r", pos:"initial", lvl:5, aff:["GAP"], ipa:["l","ɔ","ŋ","ɹ","oʊ","p"], ids:[12,28,26,35,15,16]},
  {w:"ball", ph:"b", pos:"initial", lvl:2, aff:["REACH","CARRY"], ipa:["b","ɔ","l"], ids:[3,28,12]},
  {w:"basket", ph:"b", pos:"initial", lvl:2, aff:["REACH","CARRY"], ipa:["b","æ","s","k","ə","t"], ids:[3,24,17,11,30,18]},
  {w:"ribbon", ph:"r", pos:"initial", lvl:2, aff:["REACH"], ipa:["ɹ","ɪ","b","ə","n"], ids:[35,34,3,30,14]},
  {w:"ladder", ph:"l", pos:"initial", lvl:2, aff:["REACH"], ipa:["l","æ","d","ɚ"], ids:[12,24,4,31]},
  {w:"kite", ph:"k", pos:"initial", lvl:2, aff:["REACH","HIDDEN"], ipa:["k","aɪ","t"], ids:[11,1,18]},
  {w:"hat", ph:"h", pos:"initial", lvl:2, aff:["REACH"], ipa:["h","æ","t"], ids:[8,24,18]},
  {w:"pole", ph:"p", pos:"initial", lvl:2, aff:["REACH","CLOSED"], ipa:["p","oʊ","l"], ids:[16,15,12]},
  {w:"bell", ph:"b", pos:"initial", lvl:2, aff:["REACH","CLOSED","HIDDEN"], ipa:["b","ɛ","l"], ids:[3,32,12]},
  {w:"nest", ph:"n", pos:"initial", lvl:2, aff:["REACH","HIDDEN"], ipa:["n","ɛ","s","t"], ids:[14,32,17,18]},
  {w:"moth", ph:"m", pos:"initial", lvl:2, aff:["REACH","HIDDEN"], ipa:["m","ɔ","θ"], ids:[13,28,40]},
  {w:"apple", ph:"p", pos:"medial", lvl:3, aff:["REACH","CARRY"], ipa:["æ","p","ə","l"], ids:[24,16,30,12]},
  {w:"basket up", ph:"b", pos:"initial", lvl:5, aff:["REACH"], ipa:["b","æ","s","k","ə","t","ʌ","p"], ids:[3,24,17,11,30,18,38,16]},
  {w:"rope up", ph:"r", pos:"initial", lvl:5, aff:["REACH"], ipa:["ɹ","oʊ","p","ʌ","p"], ids:[35,15,16,38,16]},
  {w:"lamp", ph:"l", pos:"initial", lvl:2, aff:["DARK"], ipa:["l","æ","m","p"], ids:[12,24,13,16]},
  {w:"light", ph:"l", pos:"initial", lvl:2, aff:["DARK"], ipa:["l","aɪ","t"], ids:[12,1,18]},
  {w:"moon", ph:"m", pos:"initial", lvl:2, aff:["DARK"], ipa:["m","u","n"], ids:[13,20,14]},
  {w:"match", ph:"m", pos:"initial", lvl:2, aff:["DARK"], ipa:["m","æ","t͡ʃ"], ids:[13,24,19]},
  {w:"sun", ph:"s", pos:"initial", lvl:2, aff:["DARK"], ipa:["s","ʌ","n"], ids:[17,38,14]},
  {w:"candle", ph:"k", pos:"initial", lvl:2, aff:["DARK","CARRY"], ipa:["k","æ","n","d","ə","l"], ids:[11,24,14,4,30,12]},
  {w:"torch", ph:"t", pos:"initial", lvl:2, aff:["DARK","CARRY"], ipa:["t","ɔ","ɹ","t͡ʃ"], ids:[18,28,35,19]},
  {w:"window", ph:"w", pos:"initial", lvl:2, aff:["DARK","CLOSED"], ipa:["w","ɪ","n","d","oʊ"], ids:[22,34,14,4,15]},
  {w:"fire", ph:"f", pos:"initial", lvl:2, aff:["DARK"], ipa:["f","aɪ","ɚ"], ids:[7,1,31]},
  {w:"lantern", ph:"l", pos:"initial", lvl:2, aff:["DARK","CARRY"], ipa:["l","æ","n","t","ɚ","n"], ids:[12,24,14,18,31,14]},
  {w:"shine", ph:"sh", pos:"initial", lvl:2, aff:["DARK"], ipa:["ʃ","aɪ","n"], ids:[36,1,14]},
  {w:"star", ph:"s", pos:"initial", lvl:4, aff:["DARK"], ipa:["s","t","ɑ","ɹ"], ids:[17,18,27,35]},
  {w:"glow", ph:"g", pos:"initial", lvl:4, aff:["DARK"], ipa:["ɡ","l","oʊ"], ids:[33,12,15]},
  {w:"bright light", ph:"b", pos:"initial", lvl:5, aff:["DARK"], ipa:["b","ɹ","aɪ","t","l","aɪ","t"], ids:[3,35,1,18,12,1,18]},
  {w:"bunny", ph:"b", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["b","ʌ","n","i"], ids:[3,38,14,9]},
  {w:"bird", ph:"b", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["b","ɚ","d"], ids:[3,31,4]},
  {w:"mouse", ph:"m", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["m","aʊ","s"], ids:[13,2,17]},
  {w:"duck", ph:"d", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["d","ʌ","k"], ids:[4,38,11]},
  {w:"frog", ph:"f", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["f","ɹ","ɑ","ɡ"], ids:[7,35,27,33]},
  {w:"fox", ph:"f", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["f","ɑ","k","s"], ids:[7,27,11,17]},
  {w:"deer", ph:"d", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["d","ɪ","ɹ"], ids:[4,34,35]},
  {w:"hill", ph:"h", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["h","ɪ","l"], ids:[8,34,12]},
  {w:"bug", ph:"b", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["b","ʌ","ɡ"], ids:[3,38,33]},
  {w:"cat", ph:"k", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["k","æ","t"], ids:[11,24,18]},
  {w:"dog", ph:"d", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["d","ɔ","ɡ"], ids:[4,28,33]},
  {w:"goose", ph:"g", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["ɡ","u","s"], ids:[33,20,17]},
  {w:"sheep", ph:"sh", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["ʃ","i","p"], ids:[36,9,16]},
  {w:"fish", ph:"sh", pos:"final", lvl:3, aff:["HIDDEN","CARRY"], ipa:["f","ɪ","ʃ"], ids:[7,34,36]},
  {w:"chick", ph:"ch", pos:"initial", lvl:2, aff:["HIDDEN"], ipa:["t͡ʃ","ɪ","k"], ids:[19,34,11]},
  {w:"whistle", ph:"w", pos:"initial", lvl:2, aff:["HIDDEN","CLOSED"], ipa:["w","ɪ","s","ə","l"], ids:[22,34,17,30,12]},
  {w:"little mouse", ph:"m", pos:"initial", lvl:5, aff:["HIDDEN"], ipa:["l","ɪ","t","ə","l","m","aʊ","s"], ids:[12,34,18,30,12,13,2,17]},
  {w:"key", ph:"k", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["k","i"], ids:[11,9]},
  {w:"knob", ph:"n", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["n","ɑ","b"], ids:[14,27,3]},
  {w:"handle", ph:"h", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["h","æ","n","d","ə","l"], ids:[8,24,14,4,30,12]},
  {w:"button", ph:"b", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["b","ʌ","t","ə","n"], ids:[3,38,18,30,14]},
  {w:"hook", ph:"h", pos:"initial", lvl:2, aff:["CLOSED","REACH"], ipa:["h","ʊ","k"], ids:[8,37,11]},
  {w:"ring", ph:"r", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["ɹ","ɪ","ŋ"], ids:[35,34,26]},
  {w:"latch", ph:"l", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["l","æ","t͡ʃ"], ids:[12,24,19]},
  {w:"chain", ph:"ch", pos:"initial", lvl:2, aff:["CLOSED","CARRY"], ipa:["t͡ʃ","eɪ","n"], ids:[19,6,14]},
  {w:"gate", ph:"g", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["ɡ","eɪ","t"], ids:[33,6,18]},
  {w:"lock", ph:"l", pos:"initial", lvl:2, aff:["CLOSED"], ipa:["l","ɑ","k"], ids:[12,27,11]},
  {w:"magnet", ph:"m", pos:"initial", lvl:2, aff:["CLOSED","REACH"], ipa:["m","æ","ɡ","n","ɪ","t"], ids:[13,24,33,14,34,18]},
  {w:"push", ph:"sh", pos:"final", lvl:3, aff:["CLOSED"], ipa:["p","ʊ","ʃ"], ids:[16,37,36]},
  {w:"golden key", ph:"k", pos:"initial", lvl:5, aff:["CLOSED"], ipa:["ɡ","oʊ","l","d","ə","n","k","i"], ids:[33,15,12,4,30,14,11,9]},
  {w:"wagon", ph:"w", pos:"initial", lvl:2, aff:["CARRY"], ipa:["w","æ","ɡ","ə","n"], ids:[22,24,33,30,14]},
  {w:"cart", ph:"k", pos:"initial", lvl:2, aff:["CARRY"], ipa:["k","ɑ","ɹ","t"], ids:[11,27,35,18]},
  {w:"wheel", ph:"w", pos:"initial", lvl:2, aff:["CARRY"], ipa:["w","i","l"], ids:[22,9,12]},
  {w:"sled", ph:"s", pos:"initial", lvl:4, aff:["CARRY"], ipa:["s","l","ɛ","d"], ids:[17,12,32,4]},
  {w:"bag", ph:"b", pos:"initial", lvl:2, aff:["CARRY"], ipa:["b","æ","ɡ"], ids:[3,24,33]},
  {w:"box", ph:"b", pos:"initial", lvl:2, aff:["CARRY"], ipa:["b","ɑ","k","s"], ids:[3,27,11,17]},
  {w:"tray", ph:"t", pos:"initial", lvl:4, aff:["CARRY"], ipa:["t","ɹ","eɪ"], ids:[18,35,6]},
  {w:"pillow", ph:"p", pos:"initial", lvl:2, aff:["CARRY"], ipa:["p","ɪ","l","oʊ"], ids:[16,34,12,15]},
  {w:"melon", ph:"m", pos:"initial", lvl:2, aff:["CARRY"], ipa:["m","ɛ","l","ə","n"], ids:[13,32,12,30,14]},
  {w:"puppy", ph:"p", pos:"medial", lvl:3, aff:["CARRY","HIDDEN"], ipa:["p","ʌ","p","i"], ids:[16,38,16,9]},
  {w:"lemon", ph:"m", pos:"medial", lvl:3, aff:["CARRY"], ipa:["l","ɛ","m","ə","n"], ids:[12,32,13,30,14]},
  {w:"wagon up", ph:"w", pos:"initial", lvl:5, aff:["CARRY"], ipa:["w","æ","ɡ","ə","n","ʌ","p"], ids:[22,24,33,30,14,38,16]},
];

// Scenes expose affordances, not lessons (spec section 3). A scene knows it
// has a gap; it knows nothing about phonemes. `ask` is the invitation the
// companion issues -- n = companion name, w = the target word.
export const STATIONS = {
  GAP:    { id:'GAP',    name:'the broken bridge', ask:(n,w)=>`${n} needs a ${w} to cross. Can you say ${w}?` },
  REACH:  { id:'REACH',  name:'the apple tree',    ask:(n,w)=>`${n} wants the ${w}, but it's too high. Can you say ${w}?` },
  DARK:   { id:'DARK',   name:'the dark hollow',   ask:(n,w)=>`It's dark in there. ${n} needs a ${w}. Can you say ${w}?` },
  HIDDEN: { id:'HIDDEN', name:'the little hill',   ask:(n,w)=>`Someone's hiding behind the hill! Is it a ${w}? Can you say ${w}?` },
  CLOSED: { id:'CLOSED', name:'the door',          ask:(n,w)=>`This door has no handle. ${n} needs a ${w}. Can you say ${w}?` },
  CARRY:  { id:'CARRY',  name:'the heavy stone',   ask:(n,w)=>`It's too heavy for ${n} to lift. A ${w} would help! Can you say ${w}?` },
};

export const AFFORDANCES = Object.keys(STATIONS);

/** Target key. Sharing one key across every level of a phoneme target is what
 *  makes the complexity ladder actually gate: `rope` (L2) and `rope up` (L5)
 *  both live under r_initial, so the phrase is unreachable until the target is
 *  promoted. Giving them separate keys was audit defect #1 -- it meant the
 *  ladder gated nothing and clusters were selectable from beat one. */
export const keyOf = (x) => x.ph + '_' + x.pos;
