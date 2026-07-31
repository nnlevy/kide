# On-device pronunciation scoring — benchmark harness

Answers the "Decision required" in `kide-us-content-engine-spec.md` §0-1 and
executes Build order step 1: *"Benchmark the scoring model on a real iPad.
Everything downstream depends on the answer, and the answer isn't published
anywhere. Do this first, before any art is commissioned."*

**Live at:** `/bench/` once deployed (see "Shipping this" below — one command
still needed from a machine with real Cloudflare credentials).

**Open it on the actual iPad, in Safari, on wifi and then on LTE.** Everything
below this line is either (a) real numbers from a Python reference run, which
validate the model and math are correct, or (b) real numbers from a headless
Linux sandbox, which validate the browser code path doesn't crash but say
nothing about iPad performance because there's no GPU and no Apple Silicon in
that sandbox. Neither substitutes for the on-device number.

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

**4-bit was not attempted successfully:** `onnxruntime.quantization.matmul_4bits_quantizer`
isn't present in this environment's `onnxruntime==1.23.2` build. That, or a
smaller/distilled architecture, is the concrete next lever if 122MB turns out
to be too large a cold download in practice — the spec's own cost estimate
for approach A was 20–60MB, and this build is above that range.

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

**Not yet known, and the actual point of this exercise:** real WebGPU numbers
on Apple Silicon. That only exists on the iPad.

## Known gaps / next levers

- **WASM runs single-threaded.** No `Cross-Origin-Opener-Policy` /
  `Cross-Origin-Embedder-Policy` header is set on `/bench/*` yet (that's what
  unlocks `SharedArrayBuffer` and multi-threaded WASM). Skipped for this pass
  to avoid a real risk of breaking page load over a secondary optimization —
  worth adding if the WASM-fallback number is the one that ships.
- **122MB is above the spec's 20–60MB estimate.** Next lever: 4-bit/block
  quantization, or a smaller/distilled architecture.
- **GOP-SF normalization is our approximation, not the paper's exact formula**
  (see Scoring section above).

## Shipping this

Everything except two commands is done:

```bash
# 1. one-time: push the model into R2 (bucket "kide-models" already exists)
cd ~/.openclaw/workspace/kide
npx wrangler r2 object put kide-models/gruut-ctc-v1-int8.onnx \
  --file=r2-upload/gruut-ctc-v1-int8.onnx --content-type=application/octet-stream

# 2. normal deploy — ships public/bench/* and the new /models/* worker route
python3 ~/.openclaw/workspace/tools/portfolio_deploy_controller.py --domain kide \
  --push-deploy --message "add on-device pronunciation-scoring benchmark harness (/bench/)"
```

`wrangler.json` gained an `r2_buckets` binding (`MODELS` → `kide-models`) and
`src/worker/index.ts` gained a `/models/*` route that streams from R2
same-origin (avoids CORS entirely) with Range support and a year-long
immutable cache, following the same versioned-filename convention as
`/voice/v1/*`. Neither could be live-tested here — this sandbox's `wrangler`
can't run at all (`node_modules/workerd` is the macOS binary; this container
is Linux) — so the Worker route follows Cloudflare's documented R2-proxy
pattern closely but wants one real request checked after deploy.
