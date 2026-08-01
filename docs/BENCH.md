# On-device pronunciation scoring — benchmark harness

Answers the "Decision required" in `kide-us-content-engine-spec.md` §0-1 and
executes Build order step 1: *"Benchmark the scoring model on a real iPad.
Everything downstream depends on the answer, and the answer isn't published
anywhere. Do this first, before any art is commissioned."*

**Live at:** [kide.us/bench/](https://kide.us/bench/)

---

## VERDICT (2026-08-01, real iPad, Safari, WebGPU)

**PASS — 116.75ms mean per utterance against a 300ms budget. 2.6x headroom.**

| Build | Backend | Mean | Median | p95 | Range | vs. budget |
|---|---|---|---|---|---|---|
| **FP16** | WebGPU | **116.75ms** | 117ms | 121ms | 113–121ms | **PASS, 2.6x headroom** |
| INT8 | WebGPU | 572.4ms | 566ms | 631ms | 540–631ms | FAIL, 1.9x over |

20 reps after 3 warmup reps, 1.5s clip, tight variance in both cases — these
are steady-state numbers, not cold-start artifacts or noise. Preprocessing is
~0.05ms and GOP-SF compute is ~1ms; effectively all of it is inference.

**The headline finding is that INT8 quantization was actively hurting, by
4.9x, on the exact hardware and backend that matters.** Same checkpoint, same
harness, same clip — only the weight precision differs. INT8 kernel paths are
mature on WASM/CPU (where INT8 is a real win) but thin on current WebGPU
backends, so the quantized model was paying dequantize overhead and/or partial
CPU fallback on every matmul. The conventional "quantize it for mobile"
instinct is exactly backwards here.

This resolves the §0 "Decision required": **approach A (PWA shipping its own
model via ORT Web) is viable on per-utterance latency.** The brand promise —
*"your child's voice never leaves this device"* — is deliverable in a browser
on a base-model iPad, without a native wrapper, at least on this axis.

### What this does NOT resolve

1. **Payload is 189MB**, against the spec's own 20–60MB estimate for approach A.
   Cached immutably after first load, but the first visit is a 189MB download.
   This is now the binding constraint, not speed.
2. **Cold start is ~7.3s** (session create 7.2s + first inference 185ms once
   shaders are cached; the first-ever inference was 711ms). Plausibly hideable
   behind the naming/intro flow in §2, but it is not free.
3. **Scoring accuracy is still unvalidated.** These runs used a synthetic clip,
   so the GOP numbers in them are meaningless by construction. Everything in §1
   about automated scoring of child speech being unreliable still stands
   untouched — this benchmark answered "fast enough?", not "accurate enough?".
4. **The WASM fallback path is unmeasured on-device.** INT8 is very likely the
   right build there (mature CPU kernels) even though it's wrong for WebGPU —
   so the two paths may want different model files. Not yet tested.

### Diagnostic notes from the on-device run

ORT logged `VerifyEachNodeIsAssignedToAnEp` — some nodes fall back off the
preferred EP. Its own message hedges ("may or may not have a negative impact...
e.g. ORT explicitly assigns shape related ops to CPU to improve perf"), and
since FP16 hits 117ms with the same warning present, this is the benign
shape-op case, not a smoking gun. Naming the specific nodes would require
building ORT Web from source — the CDN build is minimal and omits that detail.
Not worth the detour given the number came in fine.

Also logged: a `ReduceL2` constant-folding miss on the pos_conv_embed
weight-norm node. Same warning appears in the Python reference run; benign.

---

Everything below this line is the build/validation record that got us here.
It includes numbers from a headless Linux sandbox, which validate that the
browser code path doesn't crash but say nothing about iPad performance —
there's no GPU and no Apple Silicon in that sandbox.

## What's being measured

1. **Cold start** — execution-provider negotiation + model fetch/compile +
   first inference (WebGPU pays lazy shader-compile cost on the *first*
   inference, not on session creation, so the two are timed separately).
2. **Model size** — bytes actually transferred for the model file, read from
   the browser's own Resource Timing entry (post-compression if any).
3. **Per-utterance latency** — preprocess + inference, mean/median/p95 over
   20 reps after 3 warmup reps, on a 1–2s clip. Budget: **< 300ms**.
4. **Segmentation-free GOP** against a known target word (see "Scoring" below).

## Model

[`bookbot/wav2vec2-ljspeech-gruut`](https://huggingface.co/bookbot/wav2vec2-ljspeech-gruut)
— wav2vec2-base (94.4M params) fine-tuned for IPA phoneme CTC output (gruut
phonemizer convention, no stress marks). Card reports PER 0.99% / CER 0.58% on
the LJSpeech phoneme test set. This is the smallest credible *phoneme-output*
CTC checkpoint found; the standard phoneme model referenced throughout the
GOP/MDD literature (`facebook/wav2vec2-lv-60-espeak-cv-ft`) is wav2vec2-**large**
(~317M params, ~3x the size) and was not a serious candidate for a 300ms
mobile budget.

**Export:** `optimum.exporters.onnx.main_export(task="automatic-speech-recognition")`.
Input contract: `input_values`, float32 `[1, num_samples]`, raw 16kHz mono PCM,
zero-mean/unit-variance normalized per utterance (no mel-spectrogram — this
architecture consumes raw waveform). Output: `logits`, float32 `[1, T, 45]`,
`T ≈ num_samples / 320` (7-layer conv front end downsamples ~20.3ms/frame).
Blank/pad id `42`. Vocab: 41 IPA phoneme symbols (diphthongs and affricates
are atomic tokens — `aɪ`, `d͡ʒ`, etc.) + `|` (word boundary) + `[UNK]`/`[PAD]`.

**Quantization:** dynamic INT8 (`onnxruntime.quantization.quantize_dynamic`,
`QUInt8`, restricted to `MatMul`/`Gemm` ops). FP32 source was 377.8MB → INT8
build is **121.9MB (32%)**. The 7-layer conv feature extractor and the
positional conv embedding stayed FP32: the positional conv uses weight-norm
reparameterization (a `Mul` feeding the `Conv`), which isn't a constant
initializer the quantizer recognizes, and it throws rather than skip it
silently. Excluding conv from quantization is standard practice here — the
large majority of parameters and FLOPs live in the 12 transformer layers'
matmuls, not the conv front end.

**FP16 (added 2026-08-01, and now the shipping build for WebGPU):**
`onnxconverter_common.float16.convert_float_to_float16` with
`keep_io_types=True`, so `input_values` and `logits` stay FP32 and the harness
needed no changes at all — only the model file. 377.8MB → **189.1MB (50%)**.
Chosen over plain FP32 for two reasons: FP16 is the precision GPUs are
generally best optimized for (a fairer comparison than FP32 for a WebGPU
question), and FP32 at 377.8MB exceeds wrangler's 300MiB `r2 object put`
ceiling, so it could not be uploaded at all.

**On quantization strategy, post-measurement:** see the verdict at the top —
INT8 measured 4.9x *slower* than FP16 on iPad WebGPU. Any further compression
work must be re-measured on-device rather than assumed to help. 4-bit was not
attempted (`onnxruntime.quantization.matmul_4bits_quantizer` isn't present in
this environment's `onnxruntime==1.23.2`), and given the INT8 result there is
now good reason to expect aggressive integer quantization to hurt on this
backend too. **A smaller or distilled architecture is the better lever for the
189MB payload problem than lower precision on this one.**

## Scoring: segmentation-free GOP

Mechanism: the CTC forward algorithm computes `log P(canonical phoneme
sequence | audio)`, marginalized over *every* alignment of that sequence
against the T acoustic frames. No forced alignment, no phone boundaries — any
segmentation is accounted for automatically, which is the "segmentation-free"
property. This is the GOP-SF mechanism described in Cao, Fan, Svendsen &
Salvi, ["Segmentation-free Goodness of Pronunciation"](https://arxiv.org/abs/2507.16838)
(accepted IEEE TASLPRO 2026), built on their GOP-SA formulation for
CTC-trained acoustic models.

**Caveat, stated plainly:** the paper defines a specific normalization for
comparing scores across acoustic models of different "peakiness." The full
paper text exceeded the tool budget while building this (arXiv's HTML render
is 1.7MB), so `gop-bench.js`'s `normalizedScore` (per-phoneme log-probability
minus a free-decode confidence baseline) is our own stand-in, not a
reproduction of their exact formula. The forward-algorithm mechanism
(`perPhonemeLogProb`) is the part verified correct; treat absolute score
thresholds as unvalidated until checked against labeled recordings.

## Lexicon (via `gruut` 2.4.0, `en-us`, stress markers stripped)

| Word | Phonemes | Source |
|---|---|---|
| rope | ɹ oʊ p | matches the spec's own §4 lexicon example |
| lamp | l æ m p | matches the spec's own §4 lexicon example |
| stone | s t oʊ n | matches the spec's own §4 lexicon example |
| butterbean | b ʌ t ɚ b i n | phonemized as "butter bean" (two words) — "Butterbean" as one token makes gruut mis-reduce "bean" to /bən/; the flagship companion name (§2) |
| cat | k æ t | control word |
| dog | d ɔ ɡ | control word |

## Correctness validation

**Python (export/quantization sanity):** the INT8 ONNX model, run through
`onnxruntime`'s CPU EP against real speech clips already shipping in
`public/voice/v1/` (OpenAI TTS, not synthetic), decodes correctly:
`affirm-1.mp3` → **"yes"** (`j ɛ s`), `answer-1.mp3` → **"one"** (`w ʌ n`),
`prompt-shape-circle.mp3` → **"find a circle"** (`f aɪ n d | ə | s s ɚ k ə l`,
one spurious `s`). Inference-only latency on the sandbox's ARM64 CPU: 34–140ms
for 0.67–3.17s clips.

**Browser, headless (functional only — see disclaimer above):** this
sandbox's container blocks `sudo`/`apt-get install` outright (hardened,
no-new-privileges), which also blocks Playwright's normal Chromium
dependency install. Worked around by fetching the one missing shared library
userspace-only (`apt-get download libxdamage1` doesn't need root; extracted
with `dpkg-deb -x`; pointed at via `LD_LIBRARY_PATH`) to get a real headless
Chromium running.

- **Forced-WASM, real recorded audio** (Chromium's fake-audio-capture feeding
  `answer-1.mp3`, exercised through the actual `getUserMedia` →
  `MediaRecorder` → `decodeAudioData` → `OfflineAudioContext` resample →
  normalize → inference path): decoded `w | w ʌ n | w ʌ n | w ʌ n |` — the
  same "one," matching the Python reference exactly. Strong end-to-end
  cross-validation of the JS port.
- **Forced-WASM cold start** (single-threaded — no COOP/COEP is set yet, see
  below): session create 1375ms, first inference 844ms, **total 2219ms**.
- **Forced-WASM latency**, 20 reps / synthetic 1.5s clip: mean **480ms**,
  median 465ms, p95 633ms. *Over* the 300ms budget — expected: single-threaded
  WASM, on a generic server ARM64 core, is explicitly the fallback path, not
  the one the budget is aimed at.
- **Auto EP** (tries WebGPU first): a WebGPU session was created successfully
  — proves the negotiation/fallback code doesn't crash — but cold start was
  14 seconds, almost certainly software/SwiftShader rendering (no real GPU in
  this container). Not a benchmark result, a code-path smoke test.
- Zero console/page errors across every run.

*(The iPad numbers that superseded all of the above are in the verdict at the
top of this file.)*

## The payload problem, and how it was actually solved

Two things were tried and measured before settling.

**Wire compression: dead end.** FP16 weights compress at 1.085x (8%). Not
worth the CPU, and Cloudflare correctly isn't doing it.

**Encoder layer truncation: measured, and it fails.** wav2vec2-base holds ~85M
of its 94M parameters in 12 transformer layers, so truncating looked like the
obvious lever. It is not — the CTC head is tightly coupled to layer-12 output
and chopping layers destroys the model. Measured on 38 real clips with known
transcripts (this repo's own voice pack), phoneme error rate against gruut's
phonemization of the true text:

| Encoder depth | PER | Params | FP16 size |
|---|---|---|---|
| **12 (full)** | **6.3%** | 94.4M | 188.8MB |
| 10 | 239.5% | 80.2M | 160.5MB |
| 8 | 313.4% | 66.1M | 132.1MB |
| 6 | 337.7% | 51.9M | 103.8MB |
| 4 | 403.6% | 37.7M | 75.4MB |

Removing even two layers is catastrophic. **Do not retry this without
fine-tuning the CTC head on the truncated encoder.**

*(Getting an honest PER out of this took two harness fixes. The first run
reported 91.6% at full depth, which is impossible for a model that decodes
"yes" and "one" correctly — the tell that the harness was broken, not the
weights. This checkpoint emits `|` between nearly every phoneme, and the
reference transcription didn't, so every one counted as an error.)*

**So the payload was solved as a product problem instead.** The model can't
shrink, but it doesn't have to be in the way:

- the child starts on the **tap tier immediately, at zero bytes**, and the tap
  tier is a complete experience rather than a crippled one;
- the model downloads **in the background** while they play
  (`startScoringInBackground` in `public/engine/scoring.js`);
- voice lights up mid-session, next session, or never on a bad connection —
  and in all three cases the game was already working;
- weights are cached in **Cache Storage**, not just the HTTP cache, so a family
  downloads them once ever rather than once per eviction. 189MB is exactly the
  size a browser is happy to evict.

A two-year-old will not wait through a progress bar and neither will a parent
evaluating a free trial. Verified in a headless browser: beats advance while
the model is still downloading, and a *failed* download degrades to tap-only
rather than to a broken game.

## Open levers, in priority order

1. **A genuinely smaller phoneme CTC model**, if one exists — truncation is
   ruled out, and lower precision is the wrong lever (INT8 measured 4.9x
   *slower* on WebGPU). Any candidate must be re-measured on-device rather
   than assumed.
2. **Hide or shrink the ~7.3s cold start.** Session creation dominates. The
   naming/intro flow in §2 is a natural cover for it; measure whether Safari
   persists compiled WebGPU pipelines across page loads, since that would make
   only the true first-ever launch expensive.
3. **Measure the WASM fallback on-device, with the INT8 build.** INT8 is wrong
   for WebGPU but is probably right for WASM/CPU. If so, the two paths ship
   different model files, and the loader picks by negotiated backend.
4. **WASM runs single-threaded** — no `Cross-Origin-Opener-Policy` /
   `Cross-Origin-Embedder-Policy` on `/bench/*` yet, which is what unlocks
   `SharedArrayBuffer` and multi-threaded WASM. Only worth doing if the
   fallback path turns out to matter.
5. **Re-calibrate against labelled CHILD speech.** Thresholds are now measured
   rather than invented (`npm run calibrate`, see below), but the calibration
   set is adult rendered speech and the negatives are wrong-words rather than
   mispronunciations. That is the remaining gap, and it is the harder problem —
   see §1 of the spec.

## Scoring calibration (2026-08-01)

`tools/calibrate/calibrate.py` · `npm run calibrate`

Thresholds in `public/engine/scoring.js` were invented; they're now measured.
Positives are real clips scored against the sequence they contain; negatives
are the same audio scored against a different word's sequence.

**This surfaced a genuine scoring bug, not just a number.** This checkpoint
emits `|` between nearly every phoneme, and standard CTC forward only permits
the *blank* symbol between labels — so the correct target had no legal path
through the model's own preferred output, and correct speech scored around
−90 instead of −0.3:

| CTC forward | AUC | TPR | TNR |
|---|---|---|---|
| blank only (what shipped) | 0.681 | 73% | 57% |
| **blank + `|` skippable** | **1.000** | **100%** | **100%** |

0.681 is barely better than a coin flip. Fixed in both `public/engine/scoring.js`
and `public/bench/gop-bench.js`, and regression-pinned in `test-engine.mjs`.

Thresholds sit in the **centre of the empty gap** between the distributions
(−1.65 worst positive, −3.12 99th-pct negative → `clearAbove = -2.385`, margin
±0.73). An earlier cut used the 10th percentile of positives, which by
construction mis-flags 10% of correct speech — and testing the shipping JS
against real audio duly produced a false "unsure" for a clean clip, by 0.007.
Maximum margin is also the right call given children will spread both
distributions wider than this adult calibration set does.

**What this does not establish**, stated plainly because AUC 1.000 is easy to
over-read: the eval audio is adult rendered speech, not children (4–6 year-olds
are markedly harder), and *wrong word* is not *right word, mispronounced* —
the actual clinical case. A mispronounced /r/ lands somewhere between these two
distributions and this harness cannot see where. These are a defensible
starting point and a repeatable harness, not a validated calibration. The
product is deliberately built so being wrong here costs little: an `unsure` is
a warm re-invite, and the third attempt resolves the scene regardless.

## Deploy notes

Model files live in the `kide-models` R2 bucket, proxied same-origin by the
`/models/*` route in `src/worker/index.ts` (avoids CORS; Range support;
year-long immutable cache; versioned filenames, same convention as
`/voice/v1/*`). `wrangler.json` carries the `MODELS` binding.

```bash
# adding a new model build
cd ~/.openclaw/workspace/kide
npx wrangler r2 object put kide-models/<name>.onnx \
  --file=r2-upload/<name>.onnx --content-type=application/octet-stream
# then register it in public/bench/data/models.json and deploy normally
```

**`wrangler r2 object put` caps at 300MiB** — this is why the FP32 build
(377.8MB) could never be uploaded and FP16 was used for the precision
comparison instead. Larger files would need multipart upload or the S3 API.
