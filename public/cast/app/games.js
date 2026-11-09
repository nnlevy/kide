// Sitting-still games. Nothing here asks a child to move an injured limb, and
// nothing here makes a network request. Every game ends on its own and hands
// back to Pip's sleepy invite, so stopping is Pip's idea.

const $ = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const shuffle = (a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const GAME_RUNNERS = { breathe, ladybug, paint, pairs };

function breathe(root, _setup, done) {
  const ROUNDS = 5;
  const el = $(`<div class="g-breathe">
    <p class="g-say" aria-live="polite">Let's take flower breaths with Pip.</p>
    <div class="g-flower" aria-hidden="true"><span>🌼</span></div>
    <div class="g-dots" aria-hidden="true">${"<i></i>".repeat(ROUNDS)}</div>
    <button class="btn btn-primary btn-big" type="button">Start</button>
  </div>`);
  root.replaceChildren(el);
  const say = el.querySelector(".g-say");
  const flower = el.querySelector(".g-flower");
  const dots = [...el.querySelectorAll(".g-dots i")];
  const btn = el.querySelector("button");
  let round = 0;
  let timer = null;
  const step = () => {
    if (round >= ROUNDS) {
      say.textContent = "Ahh. Pip feels calm and cozy.";
      flower.classList.remove("in", "out");
      timer = setTimeout(done, 1400);
      return;
    }
    say.textContent = "Smell the flower...";
    flower.classList.remove("out");
    flower.classList.add("in");
    timer = setTimeout(() => {
      say.textContent = "Blow out the candle...";
      flower.classList.remove("in");
      flower.classList.add("out");
      timer = setTimeout(() => {
        dots[round].classList.add("on");
        round++;
        step();
      }, reduced() ? 2500 : 4000);
    }, reduced() ? 2500 : 4000);
  };
  btn.addEventListener("click", () => { btn.hidden = true; step(); });
  return () => clearTimeout(timer);
}

function ladybug(root, _setup, done) {
  const ROUNDS = 5;
  const el = $(`<div class="g-ladybug">
    <p class="g-say" aria-live="polite">The ladybug is hiding. Tap a leaf to peek!</p>
    <div class="g-leaves"></div>
    <div class="g-dots" aria-hidden="true">${"<i></i>".repeat(ROUNDS)}</div>
  </div>`);
  root.replaceChildren(el);
  const say = el.querySelector(".g-say");
  const grid = el.querySelector(".g-leaves");
  const dots = [...el.querySelectorAll(".g-dots i")];
  let round = 0;
  let timer = null;
  const deal = () => {
    const bug = Math.floor(Math.random() * 6);
    grid.replaceChildren();
    for (let i = 0; i < 6; i++) {
      const b = $(`<button class="g-leaf" type="button" aria-label="Leaf ${i + 1}"><span>🍃</span></button>`);
      b.addEventListener("click", () => {
        if (b.disabled) return;
        b.disabled = true;
        if (i === bug) {
          b.querySelector("span").textContent = "🐞";
          b.classList.add("found");
          dots[round].classList.add("on");
          round++;
          say.textContent = round >= ROUNDS ? "You found them all! Pip is so happy." : "Found it! Let's hide again...";
          grid.querySelectorAll("button").forEach((x) => { x.disabled = true; });
          timer = setTimeout(round >= ROUNDS ? done : deal, 1300);
        } else {
          b.querySelector("span").textContent = "🌱";
          say.textContent = "Not there... try another leaf!";
        }
      });
      grid.appendChild(b);
    }
    if (round > 0) say.textContent = "Where did the ladybug go?";
  };
  deal();
  return () => clearTimeout(timer);
}

function paint(root, setup, done) {
  const PALETTE = ["#4EA8DE", "#FF8FA8", "#6FD08C", "#B497D6", "#FF9F5B", "#FFD166"];
  const NAMES = ["blue", "pink", "green", "purple", "orange", "yellow"];
  const el = $(`<div class="g-paint">
    <p class="g-say" aria-live="polite">Pick a color, then tap Pip's cast to paint it.</p>
    <div class="g-cast" role="group" aria-label="Pip's cast">${[0, 1, 2, 3, 4].map((i) => `<button type="button" class="g-stripe" aria-label="Stripe ${i + 1}"></button>`).join("")}</div>
    <div class="g-palette" role="group" aria-label="Colors">${PALETTE.map((c, i) => `<button type="button" class="g-swatch${i === 0 ? " on" : ""}" style="background:${c}" aria-label="${NAMES[i]}" aria-pressed="${i === 0}"></button>`).join("")}</div>
    <button type="button" class="btn btn-primary btn-big g-done">All done</button>
  </div>`);
  root.replaceChildren(el);
  let color = PALETTE[0];
  const say = el.querySelector(".g-say");
  el.querySelectorAll(".g-swatch").forEach((s, i) => s.addEventListener("click", () => {
    color = PALETTE[i];
    el.querySelectorAll(".g-swatch").forEach((x) => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
    s.classList.add("on");
    s.setAttribute("aria-pressed", "true");
    say.textContent = `Now tap the cast to paint it ${NAMES[i]}.`;
  }));
  const painted = new Set();
  el.querySelectorAll(".g-stripe").forEach((s, i) => s.addEventListener("click", () => {
    s.style.background = color;
    painted.add(i);
    say.textContent = painted.size >= 5 ? "Beautiful! Pip loves it." : "Ooh, pretty! Keep painting.";
  }));
  el.querySelector(".g-done").addEventListener("click", done);
  void setup;
  return () => {};
}

function pairs(root, _setup, done) {
  const FACES = ["🐞", "🌼", "🍓"];
  const deck = shuffle(FACES.concat(FACES));
  const el = $(`<div class="g-pairs">
    <p class="g-say" aria-live="polite">Find two that match!</p>
    <div class="g-cards"></div>
  </div>`);
  root.replaceChildren(el);
  const say = el.querySelector(".g-say");
  const grid = el.querySelector(".g-cards");
  let open = [];
  let matched = 0;
  let lock = false;
  let timer = null;
  deck.forEach((face, i) => {
    const b = $(`<button type="button" class="g-card" aria-label="Card ${i + 1}"><span>❔</span></button>`);
    b.addEventListener("click", () => {
      if (lock || b.classList.contains("up")) return;
      b.classList.add("up");
      b.querySelector("span").textContent = face;
      open.push({ b, face });
      if (open.length < 2) return;
      lock = true;
      const [x, y] = open;
      open = [];
      if (x.face === y.face) {
        matched++;
        x.b.classList.add("match");
        y.b.classList.add("match");
        say.textContent = matched >= FACES.length ? "All matched! Clever you." : "A match!";
        lock = false;
        if (matched >= FACES.length) timer = setTimeout(done, 1300);
      } else {
        say.textContent = "Not a match. Look again!";
        timer = setTimeout(() => {
          for (const c of [x, y]) { c.b.classList.remove("up"); c.b.querySelector("span").textContent = "❔"; }
          lock = false;
        }, 900);
      }
    });
    grid.appendChild(b);
  });
  return () => clearTimeout(timer);
}
