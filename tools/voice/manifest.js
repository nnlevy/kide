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
    { id: "handoff-hello", text: "Hi there! Are you ready to play with me?" },

    /* ---- Pip's Turn: routine rehearsal (see docs/HABITS.md) ---- */
    { id: "r-potty-0", text: "Pip's tummy feels... wiggly." },
    { id: "r-potty-1", text: "Pip needs to go... potty!" },
    { id: "r-potty-2", text: "Here we go. Pants... down." },
    { id: "r-potty-3", text: "Sit down... Pip." },
    { id: "r-potty-4", text: "Now we wait. Let's hum a little... song." },
    { id: "r-went-0", text: "Pip did it! Right in the... potty." },
    { id: "r-went-1", text: "All clean. Pants back... up!" },
    { id: "r-went-2", text: "Now we... flush." },
    { id: "r-none-0", text: "Nothing this time. That's... okay!" },
    { id: "r-none-1", text: "We can try again... later." },
    { id: "r-acc-0", text: "Oh! Pip didn't make it in... time." },
    { id: "r-acc-1", text: "That's okay, Pip. Accidents... happen." },
    { id: "r-acc-2", text: "Let's find some dry... clothes." },
    { id: "r-acc-3", text: "All better. We'll try the potty... next time." },
    { id: "r-wash-0", text: "Time to wash our... hands!" },
    { id: "r-wash-1", text: "Now some... soap." },
    { id: "r-wash-2", text: "Scrub... scrub... scrub!" },
    { id: "r-wash-3", text: "Rinse them... off." },
    { id: "r-wash-4", text: "And... dry them." },
    { id: "r-done", text: "I did it! Thank you for helping... me." },
    { id: "r-handwash-0", text: "Pip's hands are all... mucky!" },

    /* ---- letters: one prompt per letter name (uppercase) ----
       Rendered and published. The pack is 48 kbps mono, which is not what the
       API returns -- see tools/voice/publish.mjs for why that step exists. */
    { id: "prompt-letter-a", text: "Find the letter... A!" },
    { id: "prompt-letter-b", text: "Find the letter... B!" },
    { id: "prompt-letter-c", text: "Find the letter... C!" },
    { id: "prompt-letter-d", text: "Find the letter... D!" },
    { id: "prompt-letter-e", text: "Find the letter... E!" },
    { id: "prompt-letter-f", text: "Find the letter... F!" },
    { id: "prompt-letter-g", text: "Find the letter... G!" },
    { id: "prompt-letter-h", text: "Find the letter... H!" },
    { id: "prompt-letter-i", text: "Find the letter... I!" },
    { id: "prompt-letter-j", text: "Find the letter... J!" },
    { id: "prompt-letter-k", text: "Find the letter... K!" },
    { id: "prompt-letter-l", text: "Find the letter... L!" },
    { id: "prompt-letter-m", text: "Find the letter... M!" },
    { id: "prompt-letter-n", text: "Find the letter... N!" },
    { id: "prompt-letter-o", text: "Find the letter... O!" },
    { id: "prompt-letter-p", text: "Find the letter... P!" },
    { id: "prompt-letter-q", text: "Find the letter... Q!" },
    { id: "prompt-letter-r", text: "Find the letter... R!" },
    { id: "prompt-letter-s", text: "Find the letter... S!" },
    { id: "prompt-letter-t", text: "Find the letter... T!" },
    { id: "prompt-letter-u", text: "Find the letter... U!" },
    { id: "prompt-letter-v", text: "Find the letter... V!" },
    { id: "prompt-letter-w", text: "Find the letter... W!" },
    { id: "prompt-letter-x", text: "Find the letter... X!" },
    { id: "prompt-letter-y", text: "Find the letter... Y!" },
    { id: "prompt-letter-z", text: "Find the letter... Z!" },
    { id: "listen-letter", text: "Say the letter out loud... or tap it!" },

    /* ---- feelings: the label, and the situations that carry it ----
       The situation IS the prompt: a child who cannot read has no other way to
       receive it, so a missing clip here is a silent question rather than a
       cosmetic gap. Kept word-for-word identical to FEELING_STORIES in
       public/play/index.html -- test-packs.mjs asserts the two match. */
    { id: "prompt-feeling-happy", text: "Who feels... happy?" },
    { id: "prompt-feeling-sad", text: "Who feels... sad?" },
    { id: "prompt-feeling-angry", text: "Who feels... angry?" },
    { id: "prompt-feeling-scared", text: "Who feels... scared?" },
    { id: "prompt-feeling-surprised", text: "Who feels... surprised?" },
    { id: "story-happy-1", text: "Someone got a big hug." },
    { id: "story-happy-2", text: "Someone's best friend came to play." },
    { id: "story-happy-3", text: "Someone blew out the candles on a cake." },
    { id: "story-sad-1", text: "Someone's ice cream fell on the ground." },
    { id: "story-sad-2", text: "Someone's friend had to go home." },
    { id: "story-sad-3", text: "Someone lost their favourite toy." },
    { id: "story-angry-1", text: "Someone knocked over the tower they just built." },
    { id: "story-angry-2", text: "Someone took the toy right out of their hands." },
    { id: "story-angry-3", text: "Someone had to stop playing before they were ready." },
    { id: "story-scared-1", text: "A very big dog barked, very loudly." },
    { id: "story-scared-2", text: "The lights went out and the room went dark." },
    { id: "story-scared-3", text: "There was a loud crash of thunder outside." },
    { id: "story-surprised-1", text: "Someone opened a box, and a puppy was inside!" },
    { id: "story-surprised-2", text: "Everyone jumped out and shouted, surprise!" },
    { id: "story-surprised-3", text: "Someone found a present they were not expecting." },
    { id: "listen-feeling", text: "Say how they feel... or tap a face!" },
  ]
};
