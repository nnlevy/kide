// scoring.js -- capability-tiered pronunciation scoring.
//
// The iPad benchmark (docs/BENCH.md) proved one configuration works: FP16
// weights on WebGPU, 117ms per utterance. This module generalises that result
// to every other device without ever weakening the promise that makes the
// product worth buying.
//
// THE ONE RULE, inherited from voice.js and not negotiable here either:
// if a device cannot score speech without sending a child's voice to a
// server, we do not open a microphone on it. There is no cloud tier in this
// file, no setting that enables one, and no code path that could be extended
// into one. A device that can't do it privately gets the tap-only experience,
// which is the original experience, not a degraded one.
//
// TIERS, best first:
//   gop-webgpu  phoneme-level GOP, our model on WebGPU.  MEASURED 117ms/iPad.
//   gop-wasm    same scoring, our model on WASM.         Admitted only if a
//                                                        live micro-benchmark
//                                                        clears budget.
//   native      on-device SpeechRecognition (Chrome 139+). Word-level only.
//   tap         no microphone. Always available, never fails.
//
// Two findings from the benchmark are encoded as behaviour rather than as
// comments someone has to remember:
//
//   1. PRECISION IS BACKEND-DEPENDENT. INT8 measured 4.9x SLOWER than FP16 on
//      WebGPU (572ms vs 117ms) because INT8 kernels are thin there -- but INT8
//      is the mature, fast path on WASM/CPU. So the model file is chosen by
//      the negotiated backend, not fixed at build time. Getting this backwards
//      is a 5x latency penalty, silently.
//
//   2. DON'T TRUST A BACKEND, MEASURE IT. WebGPU negotiating successfully told
//      us nothing about whether it was fast (a software-rendered WebGPU
//      session in CI created fine and then took 14 seconds). So the WASM tier
//      has to earn admission by actually running an inference against the
//      clock on this device, and demotes itself to `native`/`tap` if it can't
//      make the budget. Better a fast tap-only game than a game that thinks
//      three seconds is an acceptable wait for a two-year-old.

const ORT_VERSION = '1.27.0';
const ORT_BASE_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const SAMPLE_RATE = 16000;

/** Per-backend model choice. See finding (1) above. */
export const MODELS = {
  webgpu: { url: '/models/gruut-ctc-v1-fp16.onnx', label: 'FP16', approxMB: 189 },
  wasm:   { url: '/models/gruut-ctc-v1-int8.onnx', label: 'INT8', approxMB: 122 },
};

/** Budget for one utterance, end to end. The iPad WebGPU path lands at ~117ms
 *  against this. A tier that can't clear it doesn't get used. */
export const LATENCY_BUDGET_MS = 300;

/** How far over budget a self-benchmark may land before the tier is rejected.
 *  Slightly loose because the probe runs once, cold-ish, on an unknown device
 *  and we'd rather not reject a workable tier on one noisy sample. */
export const BUDGET_TOLERANCE = 1.15;

export const BLANK_ID = 42;

let ort = null;
async function loadOrt() {
  if (ort) return ort;
  ort = await import(/* webpackIgnore: true */ `${ORT_BASE_URL}ort.webgpu.min.mjs`);
  ort.env.wasm.wasmPaths = ORT_BASE_URL;
  ort.env.wasm.simd = true;
  return ort;
}

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/** Can this browser recognise speech on-device, without a server?
 *  Mirrors voice.js's check exactly, including reading the property back --
 *  on a browser without on-device support the assignment silently does
 *  nothing, and starting anyway would ship a child's audio to a server. */
export async function nativeOnDeviceAvailable() {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR || typeof SR.available !== 'function') return false;
  try {
    const state = await SR.available({ processLocally: true });
    return state === 'available';
  } catch {
    return false;
  }
}

export function webgpuPresent() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

// ---------------------------------------------------------------------------
// Audio preprocessing (shared by both GOP tiers)
// ---------------------------------------------------------------------------

export async function resampleTo16kMono(audioBuffer) {
  if (audioBuffer.sampleRate === SAMPLE_RATE && audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0).slice();
  }
  const frames = Math.ceil(audioBuffer.duration * SAMPLE_RATE);
  const offline = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Zero-mean, unit-variance -- the preprocessing this checkpoint was exported
 *  with. Verified against the Python reference (docs/BENCH.md). */
export function normalizePcm(pcm) {
  let mean = 0;
  for (let i = 0; i < pcm.length; i++) mean += pcm[i];
  mean /= pcm.length;
  let variance = 0;
  for (let i = 0; i < pcm.length; i++) { const d = pcm[i] - mean; variance += d * d; }
  const std = Math.sqrt(variance / pcm.length) + 1e-7;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = (pcm[i] - mean) / std;
  return out;
}

function silentPcm(durationS = 1.2) {
  return new Float32Array(Math.round(durationS * SAMPLE_RATE));
}

// ---------------------------------------------------------------------------
// Segmentation-free GOP (CTC forward algorithm, no forced alignment)
// Mechanism per Cao, Fan, Svendsen & Salvi, arXiv:2507.16838 (IEEE TASLPRO
// 2026). Marginalises over every alignment of the canonical phoneme sequence
// against the acoustic frames, so no phone boundaries are needed.
// ---------------------------------------------------------------------------

function logSoftmaxRow(logits, base, V, out) {
  let max = -Infinity;
  for (let v = 0; v < V; v++) if (logits[base + v] > max) max = logits[base + v];
  let sum = 0;
  for (let v = 0; v < V; v++) sum += Math.exp(logits[base + v] - max);
  const logZ = Math.log(sum) + max;
  for (let v = 0; v < V; v++) out[v] = logits[base + v] - logZ;
}

function logSumExp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = a > b ? a : b;
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

export function computeGop(logitsFlat, T, V, labelIds, blankId = BLANK_ID) {
  const lp = new Float32Array(T * V);
  const row = new Float32Array(V);
  let freeSum = 0;
  for (let t = 0; t < T; t++) {
    logSoftmaxRow(logitsFlat, t * V, V, row);
    let best = -Infinity;
    for (let v = 0; v < V; v++) { lp[t * V + v] = row[v]; if (row[v] > best) best = row[v]; }
    freeSum += best;
  }

  const ext = [];
  for (const id of labelIds) { ext.push(blankId); ext.push(id); }
  ext.push(blankId);
  const S = ext.length;
  if (T < Math.ceil(S / 2)) {
    return { totalLogProb: -Infinity, perPhonemeLogProb: -Infinity, confidence: 0, tooShort: true };
  }

  let prev = new Float64Array(S).fill(-Infinity);
  let curr = new Float64Array(S).fill(-Infinity);
  prev[0] = lp[ext[0]];
  if (S > 1) prev[1] = lp[ext[1]];
  for (let t = 1; t < T; t++) {
    curr.fill(-Infinity);
    const base = t * V;
    for (let s = 0; s < S; s++) {
      let a = prev[s];
      if (s > 0) a = logSumExp(a, prev[s - 1]);
      if (s > 1 && ext[s] !== blankId && ext[s] !== ext[s - 2]) a = logSumExp(a, prev[s - 2]);
      curr[s] = a + lp[base + ext[s]];
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  let total = prev[S - 1];
  if (S > 1) total = logSumExp(total, prev[S - 2]);

  const perPhoneme = total / labelIds.length;
  const freeAvg = freeSum / T;
  return {
    totalLogProb: total,
    perPhonemeLogProb: perPhoneme,
    freeDecodeFrameAvg: freeAvg,
    normalizedScore: perPhoneme - freeAvg,
    tooShort: false,
  };
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

/** Uniform outcome, whatever tier produced it, so scenes never branch on
 *  device capability. `verdict` is deliberately three-valued: there is no
 *  boolean pass/fail anywhere in this system.
 *
 *  verdict: 'clear'   -- confidently matched the target
 *           'unsure'  -- treat as a near-miss; the companion models the sound
 *                        and re-invites, warmth unchanged (spec Rule 1)
 *           'no-input'-- nothing usable was heard at all
 */
function outcome(verdict, { tier, score = null, confidence = 0, detail = '', ms = 0 }) {
  return { verdict, tier, score, confidence, detail, ms };
}

export class Scorer {
  constructor() {
    this.tier = 'tap';
    this.session = null;
    this.backend = null;
    this.model = null;
    this.probeMs = null;
    this.notes = [];
  }

  /** Negotiate the best tier this device can honestly support.
   *  `allowMic` is the parent's consent -- without it we never get past 'tap',
   *  regardless of what the hardware could do. */
  async init({ allowMic = false, onProgress = null } = {}) {
    const note = (s) => { this.notes.push(s); onProgress?.(s); };

    if (!allowMic) {
      this.tier = 'tap';
      note('Microphone not enabled by a grown-up -- tap-only.');
      return this.describe();
    }

    // Tier 1: WebGPU + FP16. The measured-good path.
    if (webgpuPresent()) {
      const ok = await this._trySession('webgpu', note);
      if (ok) { this.tier = 'gop-webgpu'; return this.describe(); }
    } else {
      note('No WebGPU on this device.');
    }

    // Tier 2: WASM + INT8, but only if it can prove it's fast enough here.
    const wasmOk = await this._trySession('wasm', note);
    if (wasmOk) {
      const budget = LATENCY_BUDGET_MS * BUDGET_TOLERANCE;
      if (this.probeMs !== null && this.probeMs <= budget) {
        this.tier = 'gop-wasm';
        note(`WASM probe ${Math.round(this.probeMs)}ms -- within budget, admitted.`);
        return this.describe();
      }
      note(`WASM probe ${Math.round(this.probeMs)}ms exceeds ${Math.round(budget)}ms budget -- rejected.`);
      this.session = null;
      this.backend = null;
    }

    // Tier 3: the browser's own on-device recogniser, word-level.
    if (await nativeOnDeviceAvailable()) {
      this.tier = 'native';
      note('Using the browser\'s on-device speech recognition (word-level).');
      return this.describe();
    }

    this.tier = 'tap';
    note('No private on-device scoring available -- tap-only, and that is fine.');
    return this.describe();
  }

  async _trySession(backend, note) {
    const model = MODELS[backend];
    try {
      const ortMod = await loadOrt();
      note(`Loading ${model.label} model (~${model.approxMB}MB) for ${backend}...`);
      const t0 = performance.now();
      this.session = await ortMod.InferenceSession.create(model.url, {
        executionProviders: [backend],
      });
      this.backend = backend;
      this.model = model;
      note(`${backend} session ready in ${Math.round(performance.now() - t0)}ms; probing speed...`);
      // Warm once (first inference pays lazy shader/kernel compile), then time.
      await this._infer(silentPcm());
      const t1 = performance.now();
      await this._infer(silentPcm());
      this.probeMs = performance.now() - t1;
      return true;
    } catch (err) {
      note(`${backend} unavailable: ${err?.message || err}`);
      this.session = null;
      this.backend = null;
      return false;
    }
  }

  async _infer(pcm) {
    const ortMod = await loadOrt();
    const normalized = normalizePcm(pcm);
    const tensor = new ortMod.Tensor('float32', normalized, [1, normalized.length]);
    const res = await this.session.run({ input_values: tensor });
    return res.logits;
  }

  describe() {
    return {
      tier: this.tier,
      backend: this.backend,
      model: this.model?.label ?? null,
      probeMs: this.probeMs,
      phonemeLevel: this.tier === 'gop-webgpu' || this.tier === 'gop-wasm',
      micUsed: this.tier !== 'tap',
      notes: this.notes.slice(),
    };
  }

  /** Score a clip against a lexicon entry.
   *
   *  Thresholds are tier-aware because the tiers measure different things: a
   *  GOP tier judges the phoneme sequence, the native tier only knows whether
   *  a word matched. Both must yield the same three-valued verdict so the
   *  scene above doesn't care which ran.
   *
   *  The thresholds themselves are PROVISIONAL -- see docs/BENCH.md. They have
   *  not been calibrated against labelled child speech, and the product is
   *  deliberately built so that being wrong about them costs little: an
   *  'unsure' is a warm re-invite, and the third attempt resolves the scene
   *  regardless of any score. */
  async score(pcm, entry, { unsureBelow = -1.2, clearAbove = -0.55 } = {}) {
    const t0 = performance.now();
    if (this.tier === 'tap') {
      return outcome('no-input', { tier: this.tier, detail: 'tap-only device' });
    }
    if (!this.session) {
      return outcome('unsure', { tier: this.tier, detail: 'no scoring session' });
    }
    if (!pcm || pcm.length < SAMPLE_RATE * 0.2) {
      return outcome('no-input', { tier: this.tier, detail: 'clip too short', ms: performance.now() - t0 });
    }

    const logits = await this._infer(pcm);
    const [, T, V] = logits.dims;
    const gop = computeGop(logits.data, T, V, entry.ids, BLANK_ID);
    const ms = performance.now() - t0;

    if (gop.tooShort) {
      return outcome('no-input', { tier: this.tier, detail: 'clip shorter than target', ms });
    }
    const s = gop.normalizedScore;
    const verdict = s >= clearAbove ? 'clear' : s >= unsureBelow ? 'unsure' : 'unsure';
    // Note: below `unsureBelow` is STILL 'unsure', never a failure. The band is
    // kept as a confidence signal for the parent trend only -- the child-facing
    // system has two states, and neither of them is "wrong".
    const confidence = Math.max(0, Math.min(1, (s - unsureBelow) / (clearAbove - unsureBelow)));
    return outcome(verdict, { tier: this.tier, score: s, confidence, ms, detail: entry.w });
  }
}

/** Convenience: the tier a device would get, without loading a ~122-189MB
 *  model to find out. For the parent-facing capability copy on the handoff
 *  screen, which has to be honest before anything is downloaded. */
export async function previewTier({ allowMic = true } = {}) {
  if (!allowMic) return 'tap';
  if (webgpuPresent()) return 'gop-webgpu';
  if (await nativeOnDeviceAvailable()) return 'native';
  return 'gop-wasm-or-tap';
}
