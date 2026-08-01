# -*- coding: utf-8 -*-
"""Calibrate the GOP scoring thresholds against real audio.

WHAT THIS IS
  The `clearAbove` / `unsureBelow` thresholds in public/engine/scoring.js were
  invented. This measures them instead.

  POSITIVES: a real speech clip scored against the phoneme sequence it
             actually contains.
  NEGATIVES: the same clip scored against a DIFFERENT word's sequence.
  A usable threshold is one that separates those two distributions.

WHAT THIS IS NOT, stated plainly because it would be easy to oversell:
  * The eval audio is adult rendered speech (this repo's own voice pack), not
    children. Children 4-6 are the actual users and are markedly harder.
  * "Wrong word" is not the same failure mode as "right word, mispronounced" --
    the real clinical case. A mispronounced /r/ scores somewhere BETWEEN these
    two distributions, and this harness cannot see where.
  So: these thresholds are a principled starting point and a repeatable
  harness, not a validated calibration. Numbers move once real child speech
  exists. The product is deliberately built so being wrong here costs little --
  an 'unsure' is a warm re-invite, and the third attempt resolves regardless.

ALSO TESTED HERE
  This checkpoint emits "|" between nearly every phoneme, not just between
  words. The GOP forward algorithm only permits the blank symbol between
  labels, so the model's own preferred output path is penalised by a target
  sequence with no "|" in it. This script measures whether treating "|" as a
  second skippable symbol improves separation.

Run: python3 tools/calibrate/calibrate.py
"""
import json, re, subprocess, wave, itertools, statistics
from pathlib import Path
import numpy as np
import onnxruntime as ort
import gruut

REPO = Path(__file__).resolve().parent.parent.parent
VOICE = REPO / "public/voice/v1"
MODEL = REPO / "r2-upload/gruut-ctc-v1-fp16.onnx"
VOCAB = json.load(open(REPO / "public/bench/data/vocab.json"))
ID2SYM = {v: k for k, v in VOCAB.items()}
BLANK = VOCAB["[PAD]"]
SEP = VOCAB["|"]
STRESS = re.compile(r"[ˈˌ]")

TEXT = {
 "answer-1":"One","answer-2":"Two","answer-3":"Three","answer-4":"Four","answer-5":"Five",
 "affirm-1":"Yes","affirm-4":"Great eyes","affirm-5":"Wonderful","affirm-6":"That's it",
 "prompt-shape-circle":"Find the circle","prompt-shape-square":"Find the square",
 "prompt-shape-triangle":"Find the triangle","prompt-color-red":"Find something red",
 "prompt-color-blue":"Find something blue","prompt-color-green":"Find something green",
 "prompt-color-yellow":"Find something yellow","prompt-color-purple":"Find something purple",
 "prompt-color-orange":"Find something orange","retry-3":"Keep looking","retry-4":"So close",
 "prompt-count":"How many do you see","hint-1":"This one Can you find it",
}

def phonemize(t):
    """Returns vocab IDS, not symbols -- the scorer wants ids."""
    out=[]
    for s in gruut.sentences(t, lang="en-us"):
        for w in s:
            if w.phonemes:
                out.extend(int(VOCAB[p]) for p in (STRESS.sub("",x) for x in w.phonemes) if p in VOCAB)
    return out

def load(mp3):
    tmp="/tmp/_cal.wav"
    subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(mp3),"-ar","16000","-ac","1",tmp],check=True)
    w=wave.open(tmp,'rb'); raw=w.readframes(w.getnframes()); w.close()
    a=np.frombuffer(raw,dtype=np.int16).astype(np.float32)/32768.0
    return (a-a.mean())/(a.std()+1e-7)

def log_softmax(x):
    m=x.max(-1,keepdims=True); e=np.exp(x-m)
    return x-m-np.log(e.sum(-1,keepdims=True))

def gop(lp, labels, skippable):
    """CTC forward over all alignments. `skippable` = symbols allowed to appear
    between labels (always includes blank)."""
    T,V = lp.shape
    ext=[]
    for l in labels: ext += [int(BLANK), int(l)]
    ext.append(int(BLANK))
    S=len(ext)
    if T < (S+1)//2: return None
    NEG=-1e30
    prev=np.full(S,NEG); prev[0]=lp[0,ext[0]]
    if S>1: prev[1]=lp[0,ext[1]]
    # extra skippable mass folded into every blank slot
    for t in range(1,T):
        cur=np.full(S,NEG)
        for s in range(S):
            a=prev[s]
            if s>0: a=np.logaddexp(a,prev[s-1])
            if s>1 and ext[s]!=BLANK and ext[s]!=ext[s-2]: a=np.logaddexp(a,prev[s-2])
            emit = lp[t,ext[s]]
            if ext[s]==BLANK and skippable:
                for sym in skippable:
                    emit = np.logaddexp(emit, lp[t,sym])
            cur[s]=a+emit
        prev=cur
    tot=prev[S-1]
    if S>1: tot=np.logaddexp(tot,prev[S-2])
    per=tot/len(labels)
    free=lp.max(-1).mean()
    return per-free

sess=ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])
name=sess.get_inputs()[0].name

clips=[]
for cid,txt in TEXT.items():
    p=VOICE/f"{cid}.mp3"
    if not p.exists(): continue
    audio=load(p); ref=phonemize(txt)
    if len(ref)<2: continue
    lg=sess.run(None,{name:audio.reshape(1,-1).astype(np.float32)})[0][0]
    clips.append({"id":cid,"text":txt,"ref":ref,"lp":log_softmax(lg)})
print(f"clips: {len(clips)}")

def evaluate(skippable, label):
    pos=[]; neg=[]
    for c in clips:
        s=gop(c["lp"], c["ref"], skippable)
        if s is not None: pos.append(s)
        for o in clips:
            if o["id"]==c["id"]: continue
            # length-matched-ish negatives so length isn't the discriminator
            if not (0.6 <= len(o["ref"])/len(c["ref"]) <= 1.6): continue
            s=gop(c["lp"], o["ref"], skippable)
            if s is not None: neg.append(s)
    pos=np.array(pos); neg=np.array(neg)
    # best separating threshold + how well it separates
    cand=np.linspace(min(pos.min(),neg.min()), max(pos.max(),neg.max()), 400)
    best=max(cand, key=lambda t: (pos>=t).mean()*0.5 + (neg<t).mean()*0.5)
    tpr=(pos>=best).mean(); tnr=(neg<best).mean()
    # AUC via rank statistic
    allv=np.concatenate([pos,neg]); order=allv.argsort()
    ranks=np.empty_like(order,dtype=float); ranks[order]=np.arange(1,len(allv)+1)
    auc=(ranks[:len(pos)].sum()-len(pos)*(len(pos)+1)/2)/(len(pos)*len(neg))
    print(f"\n{label}")
    print(f"  positives n={len(pos)}  mean {pos.mean():+.3f}  p10 {np.percentile(pos,10):+.3f}")
    print(f"  negatives n={len(neg)}  mean {neg.mean():+.3f}  p90 {np.percentile(neg,90):+.3f}")
    print(f"  AUC {auc:.3f}   best threshold {best:+.3f}  (TPR {tpr:.0%}, TNR {tnr:.0%})")
    return {"auc":float(auc),"best":float(best),"pos":pos,"neg":neg}

plain = evaluate([], "WITHOUT '|' as skippable (current scoring.js behaviour)")
withsep = evaluate([SEP], "WITH '|' treated as a second skippable symbol")

chosen = withsep if withsep["auc"] > plain["auc"] else plain
tag = "with-sep" if chosen is withsep else "plain"
pos, neg = chosen["pos"], chosen["neg"]

# Threshold choice. An earlier version used the 10th percentile of positives,
# which BY CONSTRUCTION mis-flags 10% of correct speech -- and testing the
# shipping JS against real audio duly produced a false 'unsure' for a clean
# clip, missing by 0.007. That is a self-inflicted wound: the distributions
# here are cleanly separated, so there is no need to give up any true
# positives at all.
#
# Instead: sit in the MIDDLE of the empty gap between the two distributions.
# That maximises margin on both sides, which is what you want when the real
# population (children) is known to be harder than the calibration set
# (adult rendered speech) and will spread both distributions wider.
pos_floor = float(pos.min())
neg_ceiling = float(np.percentile(neg, 99))
if pos_floor > neg_ceiling:
    clear_above = (pos_floor + neg_ceiling) / 2.0          # dead centre of the gap
    margin = (pos_floor - neg_ceiling) / 2.0
else:
    clear_above = float(best)                              # distributions overlap; fall back to the sweep
    margin = 0.0
unsure_below = float(np.percentile(neg,50))
print(f"\n=== RECOMMENDED ({tag}) ===")
print(f"  worst true positive  {pos_floor:+.3f}")
print(f"  99th pct negative    {neg_ceiling:+.3f}")
print(f"  clearAbove   {clear_above:+.3f}   (centre of the gap; margin +/-{margin:.2f})")
print(f"  unsureBelow  {unsure_below:+.3f}   (median negative; confidence signal only, never a failure)")
print(f"  separation AUC {chosen['auc']:.3f}")
print(f"  true positives that would be missed: {(pos < clear_above).sum()} / {len(pos)}")
print(f"  negatives that would pass:           {(neg >= clear_above).sum()} / {len(neg)}")
json.dump({"clearAbove":round(clear_above,3),"unsureBelow":round(unsure_below,3),"auc":chosen["auc"],"margin":round(margin,3),
           "useSeparatorAsSkippable":chosen is withsep,
           "n_pos":len(pos),"n_neg":len(neg)},
          open(Path(__file__).parent/"thresholds.json","w"),indent=1)
