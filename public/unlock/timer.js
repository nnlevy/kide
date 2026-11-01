// Money path: visit → tool use (Pip play) → signup → paid step → Stripe.
// Kid-facing countdown. No price. A grown-up leaves this overlay for /unlock/.
(function () {
  if (window.__kideGrownup) return;
  window.__kideGrownup = true;

  var COUNT_FALLBACK = 10;
  var ROOT_ID = "kide-grownup";

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function ensureStyle() {
    if (document.getElementById("kide-grownup-style")) return;
    var style = document.createElement("style");
    style.id = "kide-grownup-style";
    style.textContent = [
      "#kide-grownup{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center;",
      "padding:16px 16px calc(20px + env(safe-area-inset-bottom,0px));",
      "background:linear-gradient(180deg,#56C6E6,#BDEBFF);",
      "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Rounded','Segoe UI',Roboto,sans-serif;color:#2E3A3F;}",
      "#kide-grownup *{box-sizing:border-box;}",
      "#kide-grownup .kg-sky{position:absolute;inset:0;overflow:hidden;pointer-events:none;}",
      "#kide-grownup .kg-leaf{position:absolute;width:18px;height:12px;background:linear-gradient(160deg,#8CE3A9,#4FB874);",
      "border-radius:0 100% 0 100%;opacity:.85;animation:kg-fall 7s linear infinite;}",
      "#kide-grownup .kg-leaf.a{left:12%;animation-duration:8.5s;}",
      "#kide-grownup .kg-leaf.b{left:48%;animation-duration:6.5s;animation-delay:-2s;}",
      "#kide-grownup .kg-leaf.c{left:76%;animation-duration:9s;animation-delay:-4s;}",
      "@keyframes kg-fall{0%{transform:translateY(-20px) rotate(0deg);opacity:0;}12%{opacity:.9;}100%{transform:translateY(110vh) rotate(40deg);opacity:.2;}}",
      "#kide-grownup .kg-card{position:relative;width:min(420px,100%);background:#fff;border-radius:28px;",
      "padding:22px 18px 18px;box-shadow:0 10px 0 rgba(0,0,0,.08);text-align:center;animation:kg-rise .45s ease both;}",
      "@keyframes kg-rise{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}",
      "#kide-grownup .kg-pip{width:120px;height:120px;margin:0 auto 6px;position:relative;}",
      "#kide-grownup .kg-bob{width:100%;height:100%;animation:kg-bob 3.4s ease-in-out infinite;transform-origin:bottom center;}",
      "@keyframes kg-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}",
      "#kide-grownup .kg-body{position:absolute;left:8%;right:8%;bottom:4%;top:18%;",
      "background:linear-gradient(160deg,#6FD08C,#4FB874);border-radius:48% 48% 46% 46% / 58% 58% 42% 42%;",
      "box-shadow:inset 0 -10px 18px rgba(0,0,0,.10),inset 0 8px 14px rgba(255,255,255,.35);}",
      "#kide-grownup .kg-eye{position:absolute;width:18%;height:8%;background:#fff;border-radius:50%;top:42%;}",
      "#kide-grownup .kg-eye.l{left:24%;}#kide-grownup .kg-eye.r{right:24%;}",
      "#kide-grownup .kg-cheek{position:absolute;width:12%;height:7%;background:#FF8FA8;opacity:.55;border-radius:50%;top:56%;}",
      "#kide-grownup .kg-cheek.l{left:16%;}#kide-grownup .kg-cheek.r{right:16%;}",
      "#kide-grownup .kg-mouth{position:absolute;left:34%;right:34%;top:62%;height:12%;}",
      "#kide-grownup .kg-sprout{position:absolute;top:0;left:50%;transform:translateX(-50%);width:36%;height:28%;}",
      "#kide-grownup .kg-stem{position:absolute;bottom:0;left:50%;width:8%;height:70%;background:#3D9C63;transform:translateX(-50%);border-radius:3px;}",
      "#kide-grownup .kg-leafmark{position:absolute;width:46%;height:34%;background:linear-gradient(160deg,#8CE3A9,#4FB874);border-radius:0 100% 0 100%;bottom:30%;}",
      "#kide-grownup .kg-leafmark.n1{left:0;transform:rotate(-18deg);}#kide-grownup .kg-leafmark.n2{right:0;transform:rotate(18deg) scaleX(-1);bottom:46%;}",
      "#kide-grownup h2{font-size:28px;line-height:1.15;margin:8px 0 6px;font-weight:800;}",
      "#kide-grownup p{font-size:18px;line-height:1.35;margin:0 auto 14px;max-width:320px;color:#2E3A3F;}",
      "#kide-grownup .kg-ringwrap{width:112px;height:112px;margin:0 auto 16px;position:relative;}",
      "#kide-grownup svg{width:112px;height:112px;display:block;}",
      "#kide-grownup .kg-track{fill:none;stroke:#E7F6EE;stroke-width:10;}",
      "#kide-grownup .kg-prog{fill:none;stroke:#FFD166;stroke-width:10;stroke-linecap:round;",
      "transform:rotate(-90deg);transform-origin:60px 60px;stroke-dasharray:327;stroke-dashoffset:0;}",
      "#kide-grownup .kg-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;",
      "font-size:32px;font-weight:800;font-variant-numeric:tabular-nums;}",
      "#kide-grownup button{appearance:none;width:100%;min-height:48px;border:none;border-radius:999px;",
      "padding:14px 18px;font:inherit;font-size:18px;font-weight:800;color:#2E3A3F;cursor:pointer;",
      "background:linear-gradient(180deg,#FF8A73,#F16E55);box-shadow:0 5px 0 rgba(0,0,0,.12);}",
      "#kide-grownup button:focus-visible{outline:3px solid #2E3A3F;outline-offset:3px;}",
      "@media (prefers-reduced-motion: reduce){",
      "#kide-grownup .kg-leaf,#kide-grownup .kg-bob,#kide-grownup .kg-card{animation:none;}",
      "#kide-grownup .kg-prog{stroke-dashoffset:160;}}",
    ].join("");
    document.head.appendChild(style);
  }

  function pip() {
    return '<div class="kg-pip" aria-hidden="true"><div class="kg-bob">' +
      '<div class="kg-sprout"><div class="kg-stem"></div><div class="kg-leafmark n1"></div><div class="kg-leafmark n2"></div></div>' +
      '<div class="kg-body"><div class="kg-cheek l"></div><div class="kg-cheek r"></div>' +
      '<div class="kg-eye l"></div><div class="kg-eye r"></div>' +
      '<div class="kg-mouth"><svg viewBox="0 0 40 20" width="100%" height="100%" aria-hidden="true"><path d="M4,6 Q20,18 36,6" stroke="#2E3A3F" stroke-width="4" fill="none" stroke-linecap="round"/></svg></div>' +
      "</div></div></div>";
  }

  function ring() {
    return '<div class="kg-ringwrap"><svg viewBox="0 0 120 120" aria-hidden="true">' +
      '<circle class="kg-track" cx="60" cy="60" r="52"></circle>' +
      '<circle class="kg-prog" cx="60" cy="60" r="52"></circle></svg>' +
      '<div class="kg-count" id="kide-grownup-count">10</div></div>';
  }

  var shown = false;
  var timer = 0;
  var poll = 0;

  function hush() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (window.KideVoice) {
        window.KideVoice.stop();
        if (window.KideVoice.mic) window.KideVoice.mic.stop();
      }
    } catch (e) { /* the overlay still covers the game */ }
    var app = document.getElementById("app");
    if (app) app.setAttribute("inert", "");
  }

  function show(seconds) {
    if (shown) return;
    shown = true;
    if (poll) clearInterval(poll);
    ensureStyle();
    hush();
    var total = seconds >= 1 && seconds <= 30 ? seconds : COUNT_FALLBACK;
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "kide-grownup-title");
    root.innerHTML =
      '<div class="kg-sky" aria-hidden="true"><i class="kg-leaf a"></i><i class="kg-leaf b"></i><i class="kg-leaf c"></i></div>' +
      '<div class="kg-card">' + pip() +
      '<h2 id="kide-grownup-title">Pip needs a grown-up</h2>' +
      "<p>Someone big can help Pip keep playing.</p>" +
      ring() +
      '<button type="button" id="kide-grownup-go">A grown-up is here</button></div>';
    document.body.appendChild(root);
    var count = document.getElementById("kide-grownup-count");
    var prog = root.querySelector(".kg-prog");
    count.textContent = String(total);
    if (prog && !reducedMotion()) {
      prog.style.animation = "kg-drain " + total + "s linear forwards";
      var drain = document.createElement("style");
      drain.textContent = "@keyframes kg-drain{to{stroke-dashoffset:327}}";
      document.head.appendChild(drain);
    }
    var left = total;
    timer = setInterval(function () {
      left -= 1;
      if (left < 0) left = 0;
      count.textContent = String(left);
      if (left === 0) go();
    }, 1000);
    document.getElementById("kide-grownup-go").addEventListener("click", go);
    document.getElementById("kide-grownup-go").focus();
  }

  function go() {
    if (timer) clearInterval(timer);
    location.href = "/unlock/";
  }

  function apply(data) {
    if (!data || data.ok !== true || data.unlocked === true) return;
    if (data.gated === true) show(Number(data.countdownSeconds));
  }

  function post(path, body) {
    return fetch(path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) { return res.json(); }).catch(function () { return null; });
  }

  function beat() {
    if (document.hidden || shown) return;
    post("/api/unlock/tick", {}).then(apply);
  }

  function start() {
    post("/api/unlock/status").then(function (data) {
      apply(data);
      if (!shown) poll = setInterval(beat, 15000);
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) beat();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
