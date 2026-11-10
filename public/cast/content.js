// Money path: visit (/cast) → tool use (Pip's Cast Club) → paid step (the
// existing $15 family unlock at /unlock/) → Stripe through the billing hub.
//
// Everything Pip says in the Cast Club lives here, as plain data, so
// test-cast.mjs can read every line a parent or child will see and fail the
// build if any of it drifts into medical advice.
//
// THE ONE RULE: Pip is for comfort and routine, never medical care. No line in
// this file tells anyone how to treat, move, medicate or time an injury. Every
// medical question is handed to the child's own doctor, in so many words.

export const KINDS = {
  cast: { label: "Cast", thing: "cast" },
  boot: { label: "Boot", thing: "boot" },
  splint: { label: "Splint", thing: "splint" },
  sling: { label: "Sling", thing: "sling" },
};

export const WHERE = {
  leg: { label: "Leg or foot", part: "leg" },
  arm: { label: "Arm or wrist", part: "arm" },
};

// Cast colours a clinic commonly offers, plus white. Names a child can say.
export const COLORS = [
  { id: "blue", label: "Blue", hex: "#4EA8DE" },
  { id: "pink", label: "Pink", hex: "#FF8FA8" },
  { id: "green", label: "Green", hex: "#6FD08C" },
  { id: "purple", label: "Purple", hex: "#B497D6" },
  { id: "orange", label: "Orange", hex: "#FF9F5B" },
  { id: "yellow", label: "Yellow", hex: "#FFD166" },
  { id: "red", label: "Red", hex: "#F16E55" },
  { id: "white", label: "White", hex: "#F4F1EA" },
];

export const STICKERS = [
  { id: "rest", emoji: "🌙", label: "Rested" },
  { id: "brave", emoji: "🦁", label: "Brave at the doctor" },
  { id: "turns", emoji: "🤝", label: "Took turns" },
  { id: "helper", emoji: "🌟", label: "Was a helper" },
];

// What a parent can pick for tonight's story. Closed lists: the story request
// carries ids from these lists and nothing a person typed.
export const TODAY = [
  { id: "rested", label: "Rested a lot" },
  { id: "doctor", label: "Went to the doctor" },
  { id: "xray", label: "Had an x-ray" },
  { id: "newcast", label: "Got a new cast" },
  { id: "crutches", label: "Tried crutches" },
  { id: "friends", label: "Friends visited" },
  { id: "sad", label: "Felt sad or grumpy" },
  { id: "itchy", label: "It felt itchy" },
  { id: "brave", label: "Was very brave" },
  { id: "games", label: "Played sitting games" },
];

export const LIKES = [
  { id: "dinosaurs", label: "Dinosaurs" },
  { id: "space", label: "Space" },
  { id: "ocean", label: "The ocean" },
  { id: "trains", label: "Trains" },
  { id: "puppies", label: "Puppies" },
  { id: "bugs", label: "Bugs" },
  { id: "music", label: "Music" },
  { id: "flowers", label: "Flowers" },
];

export const DOCTOR_NOTE =
  "Pip is for comfort and routine, not medical care. For pain, itching, swelling, " +
  "how much to move, bathing, or when the cast comes off, ask your child's doctor. " +
  "If something seems wrong, call the doctor.";

/** Words for this child's set-up. Every string falls back gracefully. */
export function words(setup = {}) {
  const kind = KINDS[setup.kind] ? setup.kind : "cast";
  const where = kind === "sling" ? "arm" : kind === "boot" ? "leg" : WHERE[setup.where] ? setup.where : "leg";
  const color = COLORS.find((c) => c.id === setup.color) || COLORS[0];
  const name = cleanName(setup.name);
  return {
    kind,
    where,
    thing: KINDS[kind].thing,
    part: WHERE[where].part,
    color: color.label.toLowerCase(),
    Color: color.label,
    name,
    friend: name || "you",
    Friend: name || "You",
  };
}

/** A first name or nickname only. Letters, spaces, hyphen, apostrophe. */
export function cleanName(raw) {
  return String(raw == null ? "" : raw)
    .normalize("NFC")
    .replace(/[^\p{L}\p{M} '\-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s'\-]+|[\s'\-]+$/g, "")
    .slice(0, 20)
    .trim();
}

const colored = (w) => (w.kind === "cast" || w.kind === "splint" ? `${w.color} ${w.thing}` : w.thing);

// Pip's story, in five short chapters. Chapter 1 is free; the family unlock
// opens the rest. Each page is short enough to read in one breath.
export const CHAPTERS = [
  {
    id: "tumble",
    title: "The Big Tumble",
    free: true,
    pages: (w) => [
      "One sunny morning, Pip was hopping across the garden. Hop, hop, hop... whoops! Pip slipped on a wet leaf and went bump.",
      `Pip's ${w.part} hurt a lot. Pip cried, and that was okay. A grown-up came right away and held Pip close.`,
      "\"Let's ask the doctor to look,\" said the grown-up. \"Doctors know all about bones.\"",
      "On the way, Pip held a leaf very tight. \"Will I be okay?\" Pip asked. \"We'll find out together,\" said the grown-up.",
      w.name
        ? `${w.name}, something like this happened to you too. That makes you and Pip a team.`
        : "Something like this happened to you too. That makes you and Pip a team.",
    ],
  },
  {
    id: "camera",
    title: "The Picture Camera",
    pages: (w) => [
      "At the doctor's, a helper showed Pip a big camera. \"This takes a picture of your bones,\" said the helper.",
      "\"Your job is to be a statue,\" said the helper. Pip held as still as a tiny tree. Click!",
      `On the screen, Pip saw the bones inside the ${w.part}. There was a tiny crack, thin as a hair.`,
      "\"Bones are good at mending,\" said the doctor. \"We'll help yours stay still while it does.\"",
      `"Like ${w.friend}!" said Pip.`,
    ],
  },
  {
    id: "colour",
    title: (w) => `Pip's ${w.Color} ${w.thing === "cast" ? "Cast" : w.thing === "boot" ? "Boot" : w.thing === "splint" ? "Splint" : "Sling"}`,
    pages: (w) => [
      w.kind === "cast" || w.kind === "splint"
        ? `"What color would you like?" asked the nurse. Pip thought and thought. "${w.Color}, please!"`
        : `The nurse brought Pip a ${w.thing}. "This will keep your ${w.part} cozy and still," said the nurse.`,
      `The ${colored(w)} felt snug, like a hug that holds on. A little heavy, a little strange.`,
      `"Hello, ${w.thing}," said Pip. "I guess we're friends now." The ${w.thing} didn't say anything. It just held on.`,
      `That night, Pip found a sleepy spot for the ${w.part}. "Goodnight, ${w.thing}," Pip whispered.`,
    ],
  },
  {
    id: "slow",
    title: "Slow Days",
    pages: (w) => [
      "Pip couldn't hop. Pip couldn't race. \"This is not fair!\" said Pip, and Pip felt grumpy.",
      "\"It's okay to feel grumpy,\" said the grown-up. \"Want a hug, or want to pick a game?\" Pip picked a hug first. Then a game.",
      "Pip played find-the-ladybug, and matching cards, and took big flower breaths. Sitting-down fun is still fun.",
      w.kind === "cast" || w.kind === "splint"
        ? `Friends came to visit. They drew stars and hearts all over Pip's ${colored(w)}. Pip giggled.`
        : `Friends came to visit. They brought drawings and stickers, and Pip giggled.`,
      `Every night, Pip counted one sleep closer to doctor day. ${w.Friend} can count too.`,
    ],
  },
  {
    id: "doctorday",
    title: "Doctor Day",
    pages: (w) => [
      `On doctor day, Pip squeezed the grown-up's hand. "Will it be scary?" "I'll be right here," said the grown-up.`,
      w.kind === "cast"
        ? "The nurse showed Pip a special tool. It buzzed loudly, like a vacuum. \"It's noisy,\" said the nurse, \"and I'll show you how it works first.\""
        : `The doctor took a gentle look at Pip's ${w.part}. "Let's see how you're doing," said the doctor.`,
      "Pip took big flower breaths. Smell the flower... blow the candle. Pip was brave, and brave can still be a little scared.",
      `Pip's ${w.part} felt wobbly and new. "The doctor will tell us what comes next," said the grown-up. "One step at a time."`,
      `Pip kept one sticker as a brave badge. "We did it," Pip said. "${w.Friend} and me."`,
    ],
  },
];

export function chapterTitle(ch, w) {
  return typeof ch.title === "function" ? ch.title(w) : ch.title;
}

// Things to say. Each has a line for the child and a note for the grown-up
// that is about feelings and routine, never treatment.
export const SCRIPTS = [
  {
    id: "what",
    free: true,
    title: "What is a cast?",
    say: (w) => `Your bone got a little crack. The ${w.thing} holds it still, like a big hug, while your body works on mending it.`,
    tip: "Keep it short and say it the same way every time. The same words, again and again, are calming.",
  },
  {
    id: "run",
    free: true,
    title: "Why can't I run and jump?",
    say: (w) => `Your ${w.part} is busy getting better right now. We'll do sitting-down fun for a while, and the doctor will tell us when it's time for running.`,
    tip: "Offer two sitting choices instead of a plain no: \"Puzzle or stickers?\"",
  },
  {
    id: "itchy",
    free: true,
    title: "It's itchy, or it feels funny",
    say: () => "Thank you for telling me. Let's ask the doctor, they know what helps.",
    tip: "Itching, pain, swelling, a smell, or anything new: call your child's doctor. Pip can't answer medical questions, and neither can we.",
  },
  {
    id: "visit",
    title: "Going to the doctor",
    say: (w) => `Tomorrow we're visiting the doctor. They'll look at your ${w.thing}, and they might take a picture of your bone. I'll be right there with you.`,
    tip: "Tell them the day before, so there's not a long wait to worry about. Bring one comfort thing from home.",
  },
  {
    id: "xray",
    title: "The picture camera (x-ray)",
    say: () => "It's a big camera that takes a picture of your bones. Your job is to be a statue, just for a moment.",
    tip: "Ask the team whether you can stay close by. Practising \"statue\" at home turns it into a game.",
  },
  {
    id: "off",
    title: "When the cast comes off",
    say: () => "The doctor has a special tool just for casts. It's noisy, like a vacuum. They can show it to you first, and you can squeeze my hand the whole time.",
    tip: "Ask the team to show your child the tool and its sound before they start. Your child's doctor can tell you what to expect after.",
  },
  {
    id: "sad",
    title: "I feel sad, or left out",
    say: () => "It's okay to feel sad. I'd feel grumpy too. Do you want a hug, or do you want to give Pip a sticker?",
    tip: "Name the feeling first, then offer one small choice. Feelings land before plans do.",
  },
  {
    id: "friends",
    title: "When friends ask",
    say: (w) => `You can say: "I hurt my ${w.part}, and this ${w.thing} helps it get better." Then you can show them Pip.`,
    tip: "Practise the line once at home, so it's ready when someone asks.",
  },
];

export const GAMES = [
  { id: "breathe", title: "Flower breaths", emoji: "🌼", free: true },
  { id: "ladybug", title: "Find the ladybug", emoji: "🐞" },
  { id: "paint", title: "Paint Pip's cast", emoji: "🎨" },
  { id: "pairs", title: "Matching cards", emoji: "🃏" },
];

/** Whole sleeps from today until a YYYY-MM-DD date, in local time. */
export function sleepsUntil(dateStr, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

export function dayKey(now = new Date()) {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Tonight's story without any network: built on the device from the same
 * closed lists the AI version uses. It is the floor, and it is always there.
 */
export function localStory(setup, today = [], like = "") {
  const w = words(setup);
  const likeLabel = (LIKES.find((l) => l.id === like) || {}).label;
  const lines = [];
  lines.push(`Tonight, Pip snuggled up next to ${w.friend}. "What a day," said Pip.`);
  const said = {
    rested: `"We rested a lot," said Pip. "Resting is how a ${w.part} gets busy mending."`,
    doctor: "\"We visited the doctor,\" said Pip. \"Doctors are bone helpers.\"",
    xray: "\"We were statues for the picture camera,\" said Pip. Click!",
    newcast: `"A brand new ${w.thing}!" said Pip. "It's like a fresh hug."`,
    crutches: "\"We tried crutches,\" said Pip. \"Step, swing, step. Slow and careful, with a grown-up close.\"",
    friends: "\"Friends came to see us,\" said Pip. \"That made my leaves feel warm.\"",
    sad: "\"Some of today felt grumpy,\" said Pip. \"That's okay. Grumpy feelings get tired too.\"",
    itchy: "\"It felt itchy,\" said Pip. \"We told a grown-up, and that was the right thing to do.\"",
    brave: "\"You were SO brave,\" said Pip. \"Brave can be a little bit scared, and still try.\"",
    games: "\"We played sitting-down games,\" said Pip. \"Sitting-down fun is still fun.\"",
  };
  for (const id of today.slice(0, 3)) if (said[id]) lines.push(said[id]);
  if (likeLabel) lines.push(`Pip closed both eyes and dreamed about ${likeLabel.toLowerCase()}, all floating by, slow and sleepy.`);
  lines.push(`"Goodnight, ${w.thing}," said Pip. "Goodnight, ${w.friend}. One more sleep closer."`);
  return { title: `Pip's story for tonight`, pages: lines, ai: false };
}

// Words that must never appear in anything Pip says or the AI writes. A hit in
// an AI story throws the AI version away and the local story is used instead.
export const BANNED = /\b(medicine|medication|meds|pills?|dos(e|es|age|ing)|mg|ml|ibuprofen|tylenol|motrin|advil|acetaminophen|paracetamol|painkillers?|exercises?|stretch(es|ing)?|physio|physical therapy|therapy|surgery|surgeon|operation|pins?|screws?|plates?|weight[- ]bearing|put weight|walk on it|ice it|icing|elevat(e|ion)|weeks?|months?|diagnos\w*|prescri\w*|emergency|hospital stay|infection|fever)\b/i;
