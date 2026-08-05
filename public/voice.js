/* =====================================================================
   kide-voice.js — v1
   A drop-in voice layer for kids' web games. Zero dependencies, no build
   step, one file. Two halves:

     SPEAKING  Pre-rendered neural clips served as static, edge-cached
               audio. Every line a game says is deterministic, so the whole
               voice track is rendered once at build time instead of
               streamed per play: premium quality, $0 marginal cost at any
               scale, no runtime latency, no API key in the browser, and it
               keeps working offline. Falls back to the browser's built-in
               speechSynthesis if a clip is ever missing.

     LISTENING On-device speech recognition ONLY. If the browser cannot
               recognise speech without shipping a child's audio to a
               server, this module reports the mic as unsupported and the
               game stays tap-only. Audio is never recorded, stored, or
               transmitted; a transcript lives in a local variable for a
               few milliseconds and is discarded.

   Portable on purpose — the config block below is the only thing that
   changes between sites.
   ===================================================================== */
(function (global) {
  "use strict";

  var REGISTRY = global.KideVoiceRegistry;
  if (!REGISTRY || !REGISTRY.packVersion || !REGISTRY.lines) {
    throw new Error("Kide voice registry did not load before voice.js");
  }
  var VERSION = REGISTRY.packVersion;
  var CONSENT_KEY = "kide_voice_consent_v1";
  var PREFS_KEY = "kide_voice_prefs_v1";
  var CONSENT_VERSION = 1; // bump to force parents to re-consent

  /* ------------------------------------------------------------------
     Clip text. Mirrors the generator manifest. Present so the module can
     fall back to browser speech for any line whose audio fails to load,
     and so a new line can ship before the pack is regenerated.
  ------------------------------------------------------------------ */
  var TEXT = REGISTRY.lines;

  /* Clips needed inside the first few seconds. Warmed on the handoff tap;
     everything else is fetched lazily and then cached at idle. */
  var PRIORITY = [
    "handoff-hello", "home-greet", "garden-intro",
    "affirm-1", "affirm-2", "affirm-6", "retry-1", "retry-3",
    "listen-color", "listen-count", "listen-shape", "listen-again", "listen-garden"
  ];

  /* ------------------------------------------------------------------
     Toddler pronunciation table.

     Two- and three-year-olds do not say "yellow", they say "lello", and a
     recogniser hearing "lello" often emits "hello". Rather than fight
     that, we accept the shapes it actually produces. This is safe because
     a transcript is only ever matched against the two-to-four options
     currently on screen — "people" only counts as "purple" in a question
     where purple is an option at all.
  ------------------------------------------------------------------ */
  var ALIASES = {
    red: ["red", "wed", "wead", "rad", "redd", "red one", "bread", "ready", "wred"],
    blue: ["blue", "bloo", "boo", "blew", "bue", "blu", "below", "blueberry"],
    yellow: ["yellow", "yelo", "yello", "lello", "yeyo", "yewo", "jello", "hello", "mellow", "yellowe"],
    green: ["green", "gween", "geen", "grin", "greene", "queen", "greem"],
    purple: ["purple", "purpo", "puhpo", "pupple", "puple", "people", "perple", "purpu", "porple"],
    orange: ["orange", "ornj", "orang", "awange", "oange", "orinj", "orangey", "arrange"],
    circle: ["circle", "circo", "sirko", "circal", "sercle", "circa", "circus", "cirkle", "surkle", "circles", "round"],
    square: ["square", "squar", "sqair", "squeer", "swear", "scare", "squares", "squaw"],
    triangle: ["triangle", "tryangle", "triangel", "triangular", "triangles", "tangle", "try angle"],
    "1": ["one", "won", "1", "wun"],
    "2": ["two", "to", "too", "2", "tu", "tew"],
    "3": ["three", "free", "tree", "3", "thee", "trees"],
    "4": ["four", "for", "fore", "4", "faw", "foh"],
    "5": ["five", "5", "fife", "hive"],

    /* Navigating by voice, not just answering by it. Without these the very
       first screen — choosing a game — still demands reading, which would make
       "a child who can't read can play alone" untrue at exactly the moment it
       matters most. */
    colors: ["colors", "color", "colour", "colours", "cullers", "cars"],
    counting: ["counting", "count", "countin", "numbers", "number", "cowntin"],
    shapes: ["shapes", "shape", "shaves", "apes", "shapeys"],
    yes: ["yes", "yeah", "yep", "yup", "ya", "yeh", "uh huh", "okay", "ok", "sure", "goodnight", "good night"],
    no: ["no", "nope", "nah", "not yet", "more"]
  };

  var CFG = {
    base: "/voice/" + VERSION + "/",
    lang: "en-US",
    listenTimeoutMs: 7000,
    fallbackRate: 0.85,   // browser-speech fallback: slow for toddlers
    fallbackPitch: 1.15
  };

  /* ================================ state ============================ */
  var audioEl = null;          // ONE element, blessed once — see unlock()
  var unlocked = false;
  var currentPlay = null;      // {id, resolve} of the in-flight clip
  var prefs = readJSON(PREFS_KEY, { muted: false, listen: false });
  var warmed = {};
  var listening = false;
  var rec = null;
  var listenCtx = null;        // {vocab, onMatch, onNoMatch, timer}

  function readJSON(k, dflt) {
    try { var r = localStorage.getItem(k); return r ? Object.assign({}, dflt, JSON.parse(r)) : Object.assign({}, dflt); }
    catch (e) { return Object.assign({}, dflt); }
  }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function urlFor(id) { return CFG.base + id + ".mp3"; }

  /* ============================== SPEAKING =========================== */

  /* iOS will only start audio from inside a user gesture, and it blesses
     the specific element that was played. Using a single element and
     swapping its src means one gesture unlocks every line for the whole
     session — which is why the parent→child handoff tap does double duty
     as the audio unlock. */
  function unlock() {
    if (unlocked) return Promise.resolve(true);
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.setAttribute("playsinline", "");
      audioEl.preload = "auto";
      audioEl.addEventListener("ended", onClipEnd);
      audioEl.addEventListener("error", onClipEnd);
      document.body.appendChild(audioEl);
    }
    // A 100ms silent MP3: enough to satisfy the gesture requirement.
    audioEl.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7uf/////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYbdyBb/AAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";
    var p = audioEl.play();
    return Promise.resolve(p).then(function () {
      audioEl.pause(); unlocked = true; warm(PRIORITY); warmRestAtIdle(); return true;
    }).catch(function () { unlocked = true; return false; });
  }

  /* Warming is a plain fetch, not an <audio preload>, so the clips land in
     the HTTP cache AND (where supported) the Cache API — the second visit
     is fully offline. One element + cached bytes beats 38 audio elements. */
  function warm(ids) {
    ids.forEach(function (id) {
      if (warmed[id]) return;
      warmed[id] = true;
      fetch(urlFor(id), { cache: "force-cache" }).catch(function () { warmed[id] = false; });
    });
    if (global.caches && global.caches.open) {
      global.caches.open("kide-voice-" + VERSION).then(function (c) {
        return c.addAll(ids.map(urlFor));
      }).catch(function () {});
    }
  }
  function warmRestAtIdle() {
    var rest = Object.keys(TEXT).filter(function (id) { return PRIORITY.indexOf(id) < 0; });
    var go = function () { warm(rest); };
    if (global.requestIdleCallback) global.requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 2500);
  }

  function onClipEnd() {
    if (currentPlay) { var r = currentPlay.resolve; currentPlay = null; r(); }
  }

  /* speak(id) resolves when the line finishes, so callers can await it before
     starting the mic — otherwise Pip hears himself.

     It resolves TRUE only if the line played to its end, and FALSE if it was
     cut short by a newer line or a screen change. Callers must check: without
     it, a superseded line's continuation would open the microphone against a
     question that is no longer on screen, right as the new prompt starts
     playing — Pip talking over himself into his own mic. */
  var speakEpoch = 0;
  function speak(id, opts) {
    opts = opts || {};
    if (prefs.muted || !TEXT[id]) return Promise.resolve(!prefs.muted && !!TEXT[id]);
    stopSpeaking();
    var epoch = ++speakEpoch;
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(epoch === speakEpoch); } };
      currentPlay = { id: id, resolve: finish };
      if (!audioEl) { fallbackSpeak(id, finish); return; }
      warm([id]);
      audioEl.src = urlFor(id);
      audioEl.currentTime = 0;
      var p = audioEl.play();
      if (p && p.catch) {
        p.catch(function () { currentPlay = null; fallbackSpeak(id, finish); });
      }
      // Belt and braces: never leave a caller hanging on a stalled element.
      setTimeout(finish, (opts.maxMs || 9000));
    });
  }

  /* Only reached if a clip is missing or blocked. Deliberately still
     on-device — speechSynthesis never leaves the machine for local voices. */
  function fallbackSpeak(id, done) {
    try {
      if (!global.speechSynthesis) return done();
      var u = new SpeechSynthesisUtterance(TEXT[id]);
      u.lang = CFG.lang; u.rate = CFG.fallbackRate; u.pitch = CFG.fallbackPitch;
      var v = pickLocalVoice();
      if (v) u.voice = v;
      u.onend = done; u.onerror = done;
      global.speechSynthesis.cancel();
      global.speechSynthesis.speak(u);
      setTimeout(done, 9000);
    } catch (e) { done(); }
  }
  var _voice = null;
  function pickLocalVoice() {
    if (_voice) return _voice;
    if (!global.speechSynthesis || !global.speechSynthesis.getVoices) return null;
    var vs = global.speechSynthesis.getVoices() || [];
    var pref = ["samantha", "karen", "moira", "google us english", "aria", "jenny", "zira"];
    var best = null, bestScore = -1;
    vs.forEach(function (v) {
      var s = 0;
      if ((v.lang || "").toLowerCase().indexOf("en") === 0) s += 4;
      if (v.localService) s += 3;                       // stays on the device
      var n = (v.name || "").toLowerCase();
      for (var i = 0; i < pref.length; i++) if (n.indexOf(pref[i]) > -1) { s += (pref.length - i); break; }
      if (s > bestScore) { bestScore = s; best = v; }
    });
    _voice = best; return best;
  }
  if (global.speechSynthesis) {
    global.speechSynthesis.addEventListener &&
      global.speechSynthesis.addEventListener("voiceschanged", function () { _voice = null; });
  }

  function stopSpeaking() {
    speakEpoch++;                        // invalidates any in-flight continuation
    if (audioEl) { try { audioEl.pause(); audioEl.currentTime = 0; } catch (e) {} }
    if (global.speechSynthesis) { try { global.speechSynthesis.cancel(); } catch (e) {} }
    if (currentPlay) { var r = currentPlay.resolve; currentPlay = null; r(); }
  }

  /* ============================== LISTENING ========================== */

  function SR() { return global.SpeechRecognition || global.webkitSpeechRecognition || null; }

  /* The whole policy lives here. We require the on-device availability API
     AND an affirmative on-device answer. A browser that can only recognise
     speech in the cloud reports "unsupported" and never shows a mic.

     The result is cached because listen() enforces the policy itself rather
     than trusting its caller — this module is meant to be dropped into other
     sites, and a host that forgets to check must still not be able to open a
     cloud microphone on a child by accident. */
  var supportCache = "unknown";
  function micSupport() {
    var S = SR();
    if (!S || typeof S.available !== "function") {
      supportCache = "unsupported";
      return Promise.resolve("unsupported");
    }
    try {
      return S.available({ langs: [CFG.lang], processLocally: true, quality: "command" })
        .then(function (r) { supportCache = (r === "unavailable" ? "unsupported" : r); return supportCache; })
        .catch(function () { supportCache = "unsupported"; return supportCache; });
    } catch (e) { supportCache = "unsupported"; return Promise.resolve("unsupported"); }
  }

  /* Parent-initiated only — never auto-download a language pack onto
     someone's phone plan. */
  function micInstall() {
    var S = SR();
    if (!S || typeof S.install !== "function") return Promise.resolve(false);
    try {
      return S.install({ langs: [CFG.lang], processLocally: true, quality: "command" })
        .then(function (r) { return !!r; }).catch(function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  }

  function normalize(s) {
    return String(s || "").toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ").trim();
  }

  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = new Array(n + 1), cur = new Array(n + 1), i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }

  function tolerance(w) { return w.length >= 5 ? 2 : (w.length >= 4 ? 1 : 0); }

  /* Scores every transcript alternative against ONLY the options currently
     on screen, then demands a unique winner. Exact/alias hits beat fuzzy
     hits; a tie is treated as "didn't hear it" rather than a coin flip —
     guessing wrong at a toddler is worse than asking again. */
  function matchVocab(alts, vocab) {
    var best = null, bestScore = 0, tiedWith = null;
    vocab.forEach(function (v) {
      var forms = (ALIASES[v.key] || [String(v.key)]).slice();
      if (v.extra) forms = forms.concat(v.extra);
      var score = 0;
      alts.forEach(function (alt, ai) {
        var conf = 1 - (ai * 0.08); // earlier alternatives are likelier
        var text = normalize(alt);
        if (!text) return;
        var words = text.split(" ");
        forms.forEach(function (f) {
          f = normalize(f);
          if (!f) return;
          if (text === f) { score = Math.max(score, 100 * conf); return; }
          if (words.indexOf(f) > -1) { score = Math.max(score, 90 * conf); return; }
          if (f.indexOf(" ") > -1 && text.indexOf(f) > -1) { score = Math.max(score, 85 * conf); return; }
          words.forEach(function (w) {
            // Plurals and diminutives — "circley", "greeny", "reds". Capped at
            // two extra characters so a stray "tomato" can never register as
            // "two".
            if (f.length >= 3 && w.length > f.length && w.length - f.length <= 2 && w.indexOf(f) === 0) {
              score = Math.max(score, 80 * conf);
              return;
            }
            var tol = tolerance(f);
            if (tol > 0 && Math.abs(w.length - f.length) <= tol && lev(w, f) <= tol) {
              score = Math.max(score, (60 - lev(w, f) * 8) * conf);
            }
          });
        });
      });
      if (score > bestScore) { tiedWith = null; bestScore = score; best = v; }
      else if (score > 0 && score === bestScore) { tiedWith = v; }
    });
    // Deliberately biased towards missing rather than guessing. A wrong
    // auto-answer confuses a two-year-old and teaches them the wrong word;
    // a miss just means Pip says "I didn't quite hear that" and they tap.
    if (!best || bestScore < 40 || tiedWith) return null;
    return best;
  }

  /* vocab: [{key:"red", value:"red"}, ...] — key selects the pronunciation
     set, value is handed back to the game. */
  function listen(o) {
    var S = SR();
    if (!S || listening) return false;
    // Policy enforced here, not in the caller: no consent, or no confirmed
    // on-device recognition, means no microphone. Ever.
    if (supportCache !== "available") return false;
    if (!getConsent()) return false;
    var vocab = o.vocab || [];
    try {
      rec = new S();
      rec.lang = CFG.lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 5;
      rec.processLocally = true;
      // If the property did not take, this browser has no on-device mode and
      // starting would ship a child's audio to a server. Refuse instead.
      if (rec.processLocally !== true) { rec = null; return false; }
      // Phrase biasing, where the browser has it: tells the recogniser
      // which handful of words to expect. Large accuracy win on small kids.
      try {
        if (global.SpeechRecognitionPhrase && "phrases" in rec) {
          rec.phrases = vocab.map(function (v) {
            return new global.SpeechRecognitionPhrase(String(v.key), 4.0);
          });
        }
      } catch (e) {}
    } catch (e) { return false; }

    listening = true;
    listenCtx = o;
    var settled = false;

    var finish = function (match) {
      if (settled) return;
      settled = true;
      clearTimeout(listenCtx && listenCtx.timer);
      listening = false;
      try { rec.abort(); } catch (e) {}
      rec = null;
      if (o.onState) o.onState("idle");
      if (match && o.onMatch) o.onMatch(match.value, match.key);
      else if (!match && o.onNoMatch) o.onNoMatch();
    };

    rec.onstart = function () { if (o.onState) o.onState("listening"); };
    rec.onspeechstart = function () { if (o.onState) o.onState("hearing"); };
    rec.onresult = function (ev) {
      var alts = [];
      // Transcripts live here and nowhere else. No recording, no upload,
      // no persistence — this array is garbage a few lines from now.
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        for (var j = 0; j < r.length; j++) alts.push(r[j].transcript);
      }
      finish(matchVocab(alts, vocab));
    };
    rec.onnomatch = function () { finish(null); };
    rec.onerror = function (e) {
      if (o.onError) o.onError(e && e.error);
      finish(null);
    };
    rec.onend = function () { if (!settled) finish(null); };

    try { rec.start(); } catch (e) { listening = false; return false; }
    listenCtx.timer = setTimeout(function () { finish(null); }, o.timeoutMs || CFG.listenTimeoutMs);
    return true;
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    if (listenCtx && listenCtx.timer) clearTimeout(listenCtx.timer);
    try { if (rec) rec.abort(); } catch (e) {}
    rec = null;
  }

  /* ============================== CONSENT ============================ */

  function getConsent() {
    var c = readJSON(CONSENT_KEY, null);
    if (!c || !c.granted) return null;
    if (c.version !== CONSENT_VERSION) return null; // policy changed → ask again
    return c;
  }
  function grantConsent(mode) {
    var c = { granted: true, version: CONSENT_VERSION, mode: mode || "ondevice", at: Date.now() };
    writeJSON(CONSENT_KEY, c);
    return c;
  }
  function revokeConsent() {
    try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
    prefs.listen = false; writeJSON(PREFS_KEY, prefs);
    stopListening();
  }

  /* Asking for the mic permission itself, separately from our own consent
     screen, so the parent has already read plain English before the
     browser's own dialog appears. */
  function requestMicPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      // We only wanted the grant — release the hardware immediately.
      stream.getTracks().forEach(function (t) { t.stop(); });
      return true;
    }).catch(function () { return false; });
  }

  /* ============================ mic indicator ======================== */

  var indicator = null;
  function injectCSS() {
    if (document.getElementById("kide-voice-css")) return;
    var s = document.createElement("style");
    s.id = "kide-voice-css";
    s.textContent =
      ".kv-mic{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:60;display:none;" +
      "align-items:center;gap:10px;background:#fff;border-radius:999px;padding:10px 20px 10px 14px;" +
      "box-shadow:0 8px 26px rgba(0,0,0,.16);font:700 16px/1 -apple-system,BlinkMacSystemFont,'SF Pro Rounded','Segoe UI',Roboto,sans-serif;color:#2E3A3F}" +
      ".kv-mic.on{display:flex;animation:kvPop .3s ease}" +
      // A host that puts something else at the bottom of the screen adds
      // `kv-raise` to <body> and the indicator gets out of its way. Kide's
      // sleepy-invite banner sits at bottom:14px; without this the mic pill
      // lands squarely on top of its text.
      "body.kv-raise .kv-mic{bottom:calc(104px + env(safe-area-inset-bottom,0px))}" +
      "@keyframes kvPop{from{transform:translateX(-50%) scale(.8);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}" +
      ".kv-dot{position:relative;width:34px;height:34px;border-radius:50%;background:#6FD08C;flex-shrink:0;" +
      "display:flex;align-items:center;justify-content:center;font-size:17px}" +
      ".kv-dot::after{content:'';position:absolute;inset:0;border-radius:50%;border:3px solid #6FD08C;" +
      "animation:kvRing 1.6s ease-out infinite}" +
      ".kv-mic.hearing .kv-dot{background:#FF8A73}.kv-mic.hearing .kv-dot::after{border-color:#FF8A73;animation-duration:.7s}" +
      "@keyframes kvRing{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.9);opacity:0}}" +
      "@media(prefers-reduced-motion:reduce){.kv-dot::after{animation:none;opacity:0}.kv-mic.on{animation:none}}";
    document.head.appendChild(s);
  }
  function showMic(state) {
    injectCSS();
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.className = "kv-mic";
      indicator.setAttribute("role", "status");
      indicator.setAttribute("aria-live", "polite");
      indicator.innerHTML = '<span class="kv-dot" aria-hidden="true">🎤</span><span class="kv-label">Listening…</span>';
      document.body.appendChild(indicator);
    }
    if (state === "idle") { indicator.className = "kv-mic"; return; }
    indicator.className = "kv-mic on" + (state === "hearing" ? " hearing" : "");
    indicator.querySelector(".kv-label").textContent = state === "hearing" ? "I hear you!" : "Listening…";
  }

  /* =============================== API =============================== */
  /* The point of this file is that it drops into the next site unchanged. The
     three things that differ per game — what it says, how those words get
     mispronounced, and where the clips live — are injectable rather than
     forked. Merges rather than replaces, so a site can add two lines without
     restating the other thirty-eight. */
  function configure(o) {
    o = o || {};
    if (o.text) Object.keys(o.text).forEach(function (k) { TEXT[k] = o.text[k]; });
    if (o.aliases) Object.keys(o.aliases).forEach(function (k) { ALIASES[k] = o.aliases[k]; });
    if (o.priority) PRIORITY = o.priority.slice();
    ["base", "lang", "listenTimeoutMs", "fallbackRate", "fallbackPitch"].forEach(function (k) {
      if (o[k] !== undefined) CFG[k] = o[k];
    });
    if (o.version) { VERSION = o.version; if (!o.base) CFG.base = "/voice/" + VERSION + "/"; }
    return API;
  }

  var API = {
    version: VERSION,
    text: TEXT,
    aliases: ALIASES,
    config: CFG,
    configure: configure,

    unlock: unlock,
    isUnlocked: function () { return unlocked; },
    speak: speak,
    stop: stopSpeaking,
    warm: warm,

    muted: function () { return !!prefs.muted; },
    setMuted: function (m) { prefs.muted = !!m; writeJSON(PREFS_KEY, prefs); if (m) stopSpeaking(); },

    // "Enabled" means the parent said yes AND this device can do it locally.
    // A stored preference alone is never enough to open a microphone.
    listenEnabled: function () { return !!prefs.listen && !!getConsent() && supportCache === "available"; },
    listenPreferred: function () { return !!prefs.listen && !!getConsent(); },
    setListenEnabled: function (v) { prefs.listen = !!v; writeJSON(PREFS_KEY, prefs); if (!v) stopListening(); },

    mic: {
      support: micSupport,
      install: micInstall,
      permission: requestMicPermission,
      listen: listen,
      stop: stopListening,
      isListening: function () { return listening; },
      indicator: showMic
    },

    consent: { get: getConsent, grant: grantConsent, revoke: revokeConsent },

    /* Exposed so the pronunciation matcher — the part most likely to quietly
       regress — can be tested directly rather than only through the UI. */
    _match: matchVocab
  };

  global.KideVoice = API;
})(window);
