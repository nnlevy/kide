/* Kide voice pack manifest — the complete, finite set of things Pip ever says.
   Every utterance in the game is deterministic, so the whole voice track can be
   rendered once at build time and served as static, edge-cached audio:
   premium neural quality, $0 marginal cost per play, zero runtime latency,
   no API key in the browser, and no network dependency mid-game. */

module.exports = {
  packVersion: "v1",
  voice: "coral",
  model: "gpt-4o-mini-tts",

  // Direction given to the TTS model for every line. This is the single
  // biggest quality lever for a toddler audience — it is what separates
  // "a computer reading a label" from "a character talking to my kid".
  direction:
    "You are Pip, a tiny, gentle sprout who is a young child's patient learning companion. " +
    "Your listener is two or three years old. Speak SLOWLY, with clear separation between words, " +
    "and land the final keyword of a sentence distinctly. Warm, soft, smiling, endlessly encouraging — " +
    "never loud, never hurried, never sing-song to the point of being hard to parse. " +
    "Think of kneeling down to a toddler's eye level. Leave a beat of air before the last word.",

  lines: [
    /* ---- colors: one prompt per color ---- */
    { id: "prompt-color-red",    text: "Find something... red!" },
    { id: "prompt-color-blue",   text: "Find something... blue!" },
    { id: "prompt-color-yellow", text: "Find something... yellow!" },
    { id: "prompt-color-green",  text: "Find something... green!" },
    { id: "prompt-color-purple", text: "Find something... purple!" },
    { id: "prompt-color-orange", text: "Find something... orange!" },

    /* ---- counting ---- */
    { id: "prompt-count", text: "How many do you see?" },
    { id: "answer-1", text: "One!" },
    { id: "answer-2", text: "Two!" },
    { id: "answer-3", text: "Three!" },
    { id: "answer-4", text: "Four!" },
    { id: "answer-5", text: "Five!" },

    /* ---- shapes: pick ---- */
    { id: "prompt-shape-circle",   text: "Find the... circle!" },
    { id: "prompt-shape-square",   text: "Find the... square!" },
    { id: "prompt-shape-triangle", text: "Find the... triangle!" },

    /* ---- shapes: collect ---- */
    { id: "prompt-collect-circle",   text: "Help me collect the circles!" },
    { id: "prompt-collect-square",   text: "Help me collect the squares!" },
    { id: "prompt-collect-triangle", text: "Help me collect the triangles!" },

    /* ---- affirmations (must match AFFIRM_WORDS in the game) ---- */
    { id: "affirm-1", text: "Yes!" },
    { id: "affirm-2", text: "You found it!" },
    { id: "affirm-3", text: "Pip is so happy!" },
    { id: "affirm-4", text: "Great eyes!" },
    { id: "affirm-5", text: "Wonderful!" },
    { id: "affirm-6", text: "That's it!" },

    /* ---- gentle retries (must match RETRY_WORDS in the game) ---- */
    { id: "retry-1", text: "Let's look again!" },
    { id: "retry-2", text: "Almost... try another!" },
    { id: "retry-3", text: "Keep looking!" },
    { id: "retry-4", text: "So close!" },
    { id: "hint-1",  text: "This one! Can you find it?" },

    /* ---- screens ---- */
    { id: "home-greet",    text: "Hi! I'm Pip. Let's grow together!" },
    { id: "garden-intro",  text: "Pick a game! Colors... counting... or shapes?" },
    { id: "sleepy-invite", text: "I'm getting sleepy... should we say goodnight?" },
    { id: "goodbye",       text: "Nighty night! Great playing today. See you soon!" },

    /* ---- listening mode ---- */
    { id: "listen-color", text: "Say the color out loud... or tap it!" },
    { id: "listen-count", text: "Say the number out loud... or tap it!" },
    { id: "listen-shape", text: "Say the shape out loud... or tap it!" },
    { id: "listen-again", text: "I didn't quite hear that. Try again, or tap!" },
    { id: "listen-garden", text: "Say colors, counting, or shapes... or tap one!" },

    /* ---- the moment the grown-up hands the device over ---- */
    { id: "handoff-hello", text: "Hi there! Are you ready to play with me?" }
  ]
};
