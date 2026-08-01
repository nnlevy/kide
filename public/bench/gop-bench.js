// gop-bench.js — on-device pronunciation-scoring benchmark harness
//
// What this proves out, per kide-us-content-engine-spec.md section 0-1:
//   "A PWA on iPad cannot keep the child's voice on the device using platform
//    APIs... ship our own model in JavaScript — ONNX Runtime Web on WebGPU
//    with a WASM fallback... no published iPad-specific latency benchmark for
//    short audio clips exists. Benchmark on target hardware before this
//    becomes load-bearing."
//
// This file: loads a phoneme-level CTC acoustic model via ONNX Runtime Web
// (WebGPU EP, falling back to WASM), records or synthesizes a 1-2s clip,
// scores it against a known target word with a segmentation-free GOP (no
// forced alignment — see computeGopSF below), and instruments cold-start,
// model payload size, and per-utterance latency so the numbers in the
// "Decision required" table in the spec stop being guesses.
//
// Zero build step, zero dependencies except ONNX Runtime Web itself (loaded
// from jsdelivr, pinned by version) — matches the rest of this repo (see
// public/voice.js). Everything here runs client-side; the only server-side
// piece is the /models/* route in src/worker/index.ts that proxies the
// (too-large-for-git) model weights out of R2.

const ORT_VERSION = "1.27.0";
const ORT_BASE_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const SAMPLE_RATE = 16000;

// ---------------------------------------------------------------------------
// ONNX Runtime Web loading (dynamic import so the harness page still renders
// — with a clear error — if the CDN is unreachable, instead of a blank page)
// ---------------------------------------------------------------------------

let ort = null;
async function loadOrt() {
  if (ort) return ort;
  ort = await import(/* webpackIgnore: true */ `${ORT_BASE_URL}ort.webgpu.min.mjs`);
  ort.env.wasm.wasmPaths = ORT_BASE_URL;
  // SIMD + whatever thread count the browser allows; no COOP/COEP is set on
  // this page (see public/_headers), so WASM runs single-threaded — that's a
  // real ceiling on the WASM-fallback numbers below, not a bug. Enabling
  // cross-origin isolation to unlock threads is the obvious next lever if
  // the WASM path is the one that ships.
  ort.env.wasm.simd = true;
  return ort;
}

// ---------------------------------------------------------------------------
// Console capture — an iPad has no easy devtools, so anything ORT logs needs
// to end up in the page itself, not just the console, or it's unreadable on
// the one device that actually matters here.
//
// `SessionOptions.enableProfiling` looked like the right tool for "which EP
// actually ran each op" but onnxruntime-common's own .d.ts documents it as
// "a placeholder for a future use" as of 1.27.0 — it does nothing. The
// env-level `debug`/`logLevel` flags below are the ones that actually print
// kernel/EP diagnostics (e.g. an op falling back off WebGPU), so that's what
// this captures instead.
// ---------------------------------------------------------------------------

const consoleLog = [];
const MAX_LOG_LINES = 1500;
let captureInstalled = false;

function installConsoleCapture() {
  if (captureInstalled) return;
  captureInstalled = true;
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const orig = console[level] ? console[level].bind(console) : () => {};
    console[level] = (...args) => {
      try {
        const line = `[${new Date().toISOString().slice(11, 23)}] [${level}] ${args
          .map((a) => (typeof a === "string" ? a : safeStringify(a)))
          .join(" ")}`;
        consoleLog.push(line);
        if (consoleLog.length > MAX_LOG_LINES) consoleLog.shift();
      } catch {
        /* capture must never break the page */
      }
      orig(...args);
    };
  }
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function getConsoleLog() {
  return consoleLog.slice();
}

function clearConsoleLog() {
  consoleLog.length = 0;
}

/** Verbose ORT logging is expensive and, past session-creation + the first
 *  inference, unlikely to reveal anything new (kernel/EP placement is
 *  decided once, not per-run) — so it's only switched on for cold start and
 *  switched back to the default before the 20-rep timing loop, to avoid
 *  logging overhead contaminating the latency numbers. */
function setVerboseOrtLogging(on) {
  if (!ort) return;
  ort.env.debug = on;
  ort.env.logLevel = on ? "verbose" : "warning";
}

// ---------------------------------------------------------------------------
// Data (vocab / lexicon / model registry) — fetched once at page load
// ---------------------------------------------------------------------------

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path} failed: ${res.status}`);
  return res.json();
}

async function loadData() {
  const [vocab, lexicon, modelsCfg] = await Promise.all([
    loadJson("./data/vocab.json"),
    loadJson("./data/lexicon.json"),
    loadJson("./data/models.json"),
  ]);
  const id2sym = {};
  for (const [sym, id] of Object.entries(vocab)) id2sym[id] = sym;
  const blankId = vocab["[PAD]"];
  return { vocab, id2sym, blankId, lexicon, models: modelsCfg.models };
}

// ---------------------------------------------------------------------------
// Audio: record from mic, or synthesize a fixed-shape clip for pure timing
// runs (latency is driven by tensor shape/compute graph, not by what's in
// the waveform — silence and speech of the same duration cost the same).
// ---------------------------------------------------------------------------

async function recordFromMic(durationMs, onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });

  // Live level meter so there's visual proof the mic is actually hot,
  // independent of anything the model later decides.
  let meterCtx, meterRaf;
  if (onLevel) {
    meterCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = meterCtx.createMediaStreamSource(stream);
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      onLevel(peak / 128);
      meterRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find(
    (t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)
  );
  const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => (rec.onstop = resolve));

  rec.start();
  await new Promise((r) => setTimeout(r, durationMs));
  rec.stop();
  await stopped;

  stream.getTracks().forEach((t) => t.stop());
  if (meterRaf) cancelAnimationFrame(meterRaf);
  if (meterCtx) await meterCtx.close();

  const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
  const arrayBuf = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await decodeCtx.decodeAudioData(arrayBuf);
  await decodeCtx.close();
  return audioBuffer;
}

async function resampleTo16kMono(audioBuffer) {
  if (audioBuffer.sampleRate === SAMPLE_RATE && audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0).slice();
  }
  const frames = Math.ceil(audioBuffer.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer; // OfflineAudioContext downmixes to the destination's channel count
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Deterministic low-level noise, fixed seed — same shape/cost as real speech
 *  for latency purposes, explicitly NOT meant to produce a meaningful GOP
 *  score. Used for repeatable cold-start/latency runs without a microphone. */
function makeSyntheticPcm(durationS = 1.5, sr = SAMPLE_RATE) {
  const n = Math.round(durationS * sr);
  const out = new Float32Array(n);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) * 2 - 1;
  };
  for (let i = 0; i < n; i++) out[i] = rand() * 0.01;
  return out;
}

/** Zero-mean, unit-variance normalization — the exact preprocessing this
 *  checkpoint was trained/exported with (verified against the Python
 *  reference during export: see docs/BENCH.md). */
function normalizePcm(pcm) {
  let mean = 0;
  for (let i = 0; i < pcm.length; i++) mean += pcm[i];
  mean /= pcm.length;
  let variance = 0;
  for (let i = 0; i < pcm.length; i++) { const d = pcm[i] - mean; variance += d * d; }
  variance /= pcm.length;
  const std = Math.sqrt(variance) + 1e-7;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] - mean) / std;
  return out;
}

// ---------------------------------------------------------------------------
// Segmentation-free GOP
//
// Mechanism: the CTC forward algorithm computes log P(canonical phoneme
// sequence | audio), summed over every alignment of that sequence against
// the T acoustic frames — i.e. every possible segmentation is marginalized
// out rather than requiring one fixed alignment up front. That is the
// "segmentation-free" property: no forced alignment, no phone boundaries,
// just "does this exact phoneme sequence fit somewhere in this audio, under
// any timing." This is the GOP-SF mechanism described in Cao, Fan, Svendsen
// & Salvi, "Segmentation-free Goodness of Pronunciation" (arXiv:2507.16838,
// accepted IEEE TASLPRO 2026), built on their GOP-SA formulation for
// CTC-trained acoustic models.
//
// Caveat, stated plainly: the paper also defines a specific normalization
// for comparing scores across acoustic models of different "peakiness." The
// full paper text wasn't available while building this (fetch exceeded the
// tool's size limit), so `normalizedScore` below is our own stand-in — a
// per-phoneme log-probability minus a free-decode confidence baseline — NOT
// a reproduction of their exact formula. Treat absolute thresholds as
// unvalidated until checked against labeled recordings; the forward-algorithm
// mechanism (perPhonemeLogProb) is the part we're confident is right.
// ---------------------------------------------------------------------------

function computeLogSoftmax(logits, T, V) {
  const out = new Float32Array(T * V);
  for (let t = 0; t < T; t++) {
    const base = t * V;
    let max = -Infinity;
    for (let v = 0; v < V; v++) if (logits[base + v] > max) max = logits[base + v];
    let sum = 0;
    for (let v = 0; v < V; v++) sum += Math.exp(logits[base + v] - max);
    const logZ = Math.log(sum) + max;
    for (let v = 0; v < V; v++) out[base + v] = logits[base + v] - logZ;
  }
  return out;
}

function logSumExp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

/** Standard CTC forward (alpha) recursion in log space over the extended
 *  label sequence [blank, l1, blank, l2, ..., lL, blank]. Returns natural-log
 *  P(labelIds | audio) marginalized over all alignments. O(T * 2L). */
function ctcForwardLogProb(logProbs, T, V, labelIds, blankId, skipSeparator = true) {
  const ext = [];
  for (let i = 0; i < labelIds.length; i++) { ext.push(blankId); ext.push(labelIds[i]); }
  ext.push(blankId);
  const S = ext.length;
  if (T < Math.ceil(S / 2)) return -Infinity; // not enough frames to fit the sequence at all

  let prev = new Float64Array(S).fill(-Infinity);
  let curr = new Float64Array(S).fill(-Infinity);
  const blankEmit = (base) =>
    skipSeparator ? logSumExp(logProbs[base + blankId], logProbs[base + SEPARATOR_ID])
                  : logProbs[base + blankId];
  prev[0] = blankEmit(0);
  if (S > 1) prev[1] = logProbs[ext[1]];

  for (let t = 1; t < T; t++) {
    curr.fill(-Infinity);
    const base = t * V;
    for (let s = 0; s < S; s++) {
      let a = prev[s];
      if (s > 0) a = logSumExp(a, prev[s - 1]);
      if (s > 1 && ext[s] !== blankId && ext[s] !== ext[s - 2]) a = logSumExp(a, prev[s - 2]);
      curr[s] = a + (ext[s] === blankId ? blankEmit(base) : logProbs[base + ext[s]]);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }

  let total = prev[S - 1];
  if (S > 1) total = logSumExp(total, prev[S - 2]);
  return total;
}

/** The word-separator symbol. This checkpoint emits `|` between nearly every
 *  phoneme, not just between words, and standard CTC forward only allows blank
 *  between labels -- so without treating `|` as a second skippable symbol the
 *  CORRECT target has no legal path through the model's preferred output.
 *  Measured on the repo's voice pack: AUC 0.681 without, 1.000 with.
 *  See tools/calibrate/calibrate.py and public/engine/scoring.js. */
const SEPARATOR_ID = 0;

function computeGopSF(logitsFlat, T, V, labelIds, blankId, skipSeparator = true) {
  const logProbs = computeLogSoftmax(logitsFlat, T, V);
  const totalLogProb = ctcForwardLogProb(logProbs, T, V, labelIds, blankId, skipSeparator);
  const perPhonemeLogProb = totalLogProb / labelIds.length;

  let maxSum = 0;
  for (let t = 0; t < T; t++) {
    const base = t * V;
    let m = -Infinity;
    for (let v = 0; v < V; v++) if (logProbs[base + v] > m) m = logProbs[base + v];
    maxSum += m;
  }
  const freeDecodeFrameAvg = maxSum / T;

  return {
    totalLogProb,
    perPhonemeLogProb,
    freeDecodeFrameAvg,
    normalizedScore: perPhonemeLogProb - freeDecodeFrameAvg,
  };
}

function greedyDecode(logitsFlat, T, V, blankId, id2sym) {
  const out = [];
  let prev = -1;
  for (let t = 0; t < T; t++) {
    const base = t * V;
    let best = 0, bestVal = -Infinity;
    for (let v = 0; v < V; v++) if (logitsFlat[base + v] > bestVal) { bestVal = logitsFlat[base + v]; best = v; }
    if (best !== prev && best !== blankId) out.push(id2sym[best] || `<${best}>`);
    prev = best;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inference + timing
// ---------------------------------------------------------------------------

async function createSession(modelUrl, epOrder) {
  const ortMod = await loadOrt();
  let lastErr = null;
  for (const ep of epOrder) {
    try {
      const session = await ortMod.InferenceSession.create(modelUrl, { executionProviders: [ep] });
      return { session, backend: ep };
    } catch (err) {
      console.warn(`[gop-bench] execution provider "${ep}" failed:`, err);
      lastErr = err;
    }
  }
  throw lastErr || new Error("no execution provider available");
}

async function runInference(session, pcm) {
  const ortMod = await loadOrt();
  const normalized = normalizePcm(pcm);
  const tensor = new ortMod.Tensor("float32", normalized, [1, normalized.length]);
  const t0 = performance.now();
  const results = await session.run({ input_values: tensor });
  const t1 = performance.now();
  const out = results.logits;
  return { logitsFlat: out.data, dims: out.dims, inferMs: t1 - t0 };
}

function summarizeMs(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { n: arr.length, mean, median: pct(0.5), p95: pct(0.95), min: sorted[0], max: sorted[sorted.length - 1] };
}

/** Cold start: EP negotiation + model fetch/compile + first inference
 *  (WebGPU in particular pays lazy shader-compilation cost on inference #1,
 *  not on session creation — both are timed separately so that cost is
 *  visible instead of hidden inside "session create"). */
async function benchmarkColdStart(modelUrl, epOrder, onProgress) {
  performance.clearResourceTimings();
  clearConsoleLog();
  setVerboseOrtLogging(true);
  const t0 = performance.now();
  onProgress?.("creating session / negotiating execution provider…");
  const { session, backend } = await createSession(modelUrl, epOrder);
  const t1 = performance.now();

  onProgress?.("running first inference (may include lazy compile)…");
  const warmupPcm = makeSyntheticPcm(1.5);
  const first = await runInference(session, warmupPcm);
  const t2 = performance.now();
  setVerboseOrtLogging(false); // back to quiet before the timing loop

  const entries = performance.getEntriesByName(modelUrl);
  const modelEntry = entries[entries.length - 1];

  return {
    backend,
    sessionCreateMs: t1 - t0,
    firstInferenceMs: t2 - t1,
    totalColdStartMs: t2 - t0,
    modelTransferBytes: modelEntry ? modelEntry.transferSize : null,
    modelDecodedBytes: modelEntry ? modelEntry.decodedBodySize : null,
    firstInferDims: first.dims,
    session,
  };
}

async function benchmarkLatency(session, pcm, { nWarmup = 3, nReps = 20 } = {}, onProgress) {
  for (let i = 0; i < nWarmup; i++) await runInference(session, pcm);

  const preprocessMs = [], inferMs = [];
  let lastLogits = null, lastDims = null;
  for (let i = 0; i < nReps; i++) {
    onProgress?.(`rep ${i + 1}/${nReps}…`);
    const tPre0 = performance.now();
    normalizePcm(pcm); // timed standalone; runInference() repeats this normalization internally
    const tPre1 = performance.now();
    const { logitsFlat, dims, inferMs: im } = await runInference(session, pcm);
    preprocessMs.push(tPre1 - tPre0);
    inferMs.push(im);
    lastLogits = logitsFlat; lastDims = dims;
  }

  // GOP-SF itself (computeGopSF, exported separately) runs in low tens of
  // microseconds at this T/vocab size — callers can time it trivially with
  // performance.now() around their computeGopSF call; not worth a dedicated
  // benchmark loop here.
  return {
    preprocess: summarizeMs(preprocessMs),
    inference: summarizeMs(inferMs),
    totalPerUtteranceMs: summarizeMs(preprocessMs.map((p, i) => p + inferMs[i])),
    lastLogits, lastDims,
  };
}

export {
  loadOrt, loadData, recordFromMic, resampleTo16kMono, makeSyntheticPcm, normalizePcm,
  computeGopSF, greedyDecode, createSession, runInference, benchmarkColdStart,
  benchmarkLatency, summarizeMs, SAMPLE_RATE,
  installConsoleCapture, getConsoleLog, clearConsoleLog,
};
