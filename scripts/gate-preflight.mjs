// Money path: visit → tool use → signup → paid step → Stripe.
// Visitor-facing onboarding copy, and the first phone screen's main button.
// Prints one JSON object. Exit 0 when findings is empty.

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const PROMISE = "Parent accounts only. Kids never sign in. We store only answer timing.";

const PAGES = [
  { id: "home", file: "index.html", hrefs: ['href="/play"'] },
  { id: "play", file: "public/play/index.html", hrefs: ['href="/account/"', 'href="/unlock/"'] },
  { id: "parent", file: "public/parent/index.html", hrefs: ['href="/play/"', 'href="/account/"', 'href="/unlock/"'] },
  { id: "account", file: "public/account/index.html", hrefs: ['href="/play"', 'href="/unlock/"'] },
  { id: "unlock", file: "public/unlock/index.html", hrefs: ['href="/account/"', 'href="/play/"'] },
  { id: "privacy", file: "public/privacy/index.html", hrefs: [] },
  { id: "gift", file: "src/worker/index.ts", hrefs: [] },
];

const BANNED = [
  { id: "no-accounts", re: /no accounts/i },
  { id: "nothing-leaves-the-device", re: /nothing leaves (?:the|this|your) device/i },
  { id: "child-voice-leaves", re: /nothing (?:a |your )?child says(?: ever)? leaves/i },
  { id: "optional-parent-account", re: /parent account is optional/i },
];

const FOLD = [
  { id: "home", path: "/", cta: ".hero a.cta" },
  { id: "play", path: "/play/", cta: '[data-act="letsplay"]' },
  { id: "parent", path: "/parent/", cta: '.journey a[href="/unlock/"]' },
  { id: "account", path: "/account/", cta: "#sendCode" },
  { id: "unlock", path: "/unlock/", cta: "#check" },
];

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "390x844", width: 390, height: 844 },
];

function stripJsComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      out += " ";
      continue;
    }
    if (c === "/" && d === "/") {
      const end = src.indexOf("\n", i + 2);
      i = end === -1 ? src.length : end;
      out += " ";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] || "");
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function visibleText(file, raw) {
  if (file.endsWith(".ts") || file.endsWith(".js")) return stripJsComments(raw);
  const withoutHtmlComments = raw.replace(/<!--[\s\S]*?-->/g, " ");
  let out = "";
  let last = 0;
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(withoutHtmlComments))) {
    out += withoutHtmlComments.slice(last, match.index);
    out += stripJsComments(match[1]);
    last = match.index + match[0].length;
  }
  out += withoutHtmlComments.slice(last);
  return out;
}

function excerpt(text, index, length) {
  return text.slice(Math.max(0, index - 36), index + length + 36).replace(/\s+/g, " ").trim();
}

const findings = [];
const pages = [];

for (const page of PAGES) {
  const raw = readFileSync(page.file, "utf8");
  const visible = visibleText(page.file, raw);
  const report = { id: page.id, file: page.file, promise: visible.includes(PROMISE), hrefs: {} };
  if (!report.promise) {
    findings.push({ page: page.id, rule: "promise", detail: "missing the parent-account sentence" });
  }
  for (const rule of BANNED) {
    const found = visible.match(rule.re);
    if (found) {
      findings.push({
        page: page.id,
        rule: rule.id,
        detail: excerpt(visible, found.index || 0, found[0].length),
      });
    }
  }
  for (const href of page.hrefs) {
    const ok = raw.includes(href);
    report.hrefs[href] = ok;
    if (!ok) findings.push({ page: page.id, rule: "journey", detail: `missing ${href}` });
  }
  pages.push(report);
}

function contentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
  return types[extname(file)] || "application/octet-stream";
}

function resolvePublic(urlPath) {
  let path = decodeURIComponent((urlPath || "/").split("?")[0]);
  if (path === "/" || path === "/index.html") return resolve("index.html");
  if (path.endsWith("/")) path += "index.html";
  const rel = path.replace(/^\/+/, "");
  const fromPublic = resolve("public", rel);
  const root = resolve("public");
  const candidate = fromPublic.startsWith(root + sep) && existsSync(fromPublic) ? fromPublic : null;
  const picked = candidate || (existsSync(resolve(rel)) ? resolve(rel) : null);
  if (!picked) return null;
  if (statSync(picked).isDirectory()) {
    const index = join(picked, "index.html");
    return existsSync(index) ? index : null;
  }
  return picked;
}

function listen() {
  const server = createServer((req, res) => {
    try {
      const file = resolvePublic(new URL(req.url || "/", "http://127.0.0.1").pathname);
      if (!file) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end("missing");
    }
  });
  return new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => done(server));
  });
}

async function measure(page, selector) {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return null;
  return locator.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const de = document.documentElement;
    return {
      top: Math.round(b.top),
      bottom: Math.round(b.bottom),
      width: Math.round(b.width),
      height: Math.round(b.height),
      overflow: de.scrollWidth - de.clientWidth,
      vh: window.innerHeight,
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
    };
  });
}

function judge(id, viewport, box) {
  if (!box) {
    findings.push({ page: id, rule: "first-fold", viewport, detail: "primary control is missing" });
    return;
  }
  if (box.overflow > 1) {
    findings.push({ page: id, rule: "overflow", viewport, detail: `${box.overflow}px horizontal` });
  }
  if (box.width < 44 || box.height < 44) {
    findings.push({ page: id, rule: "tap-target", viewport, detail: `${box.text} is ${box.width}x${box.height}` });
  }
  if (box.top < 0 || box.bottom > box.vh + 1) {
    findings.push({
      page: id,
      rule: "first-fold",
      viewport,
      detail: `${box.text} sits at ${box.top}–${box.bottom} inside ${box.vh}px`,
    });
  }
}

async function foldCheck() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { ran: false, reason: "playwright is not installed" };
  }
  const chrome = ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
    .find((path) => existsSync(path));
  if (!chrome) return { ran: false, reason: "system chrome is not installed" };

  const server = await listen();
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  let browser;
  const shots = [];
  try {
    browser = await chromium.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      for (const item of FOLD) {
        await page.goto(base + item.path, { waitUntil: "domcontentloaded", timeout: 15000 });
        if (item.id === "play") {
          await page.waitForSelector(item.cta, { timeout: 8000 });
        }
        if (item.id === "unlock") {
          await page.waitForFunction(() => /What is \d+ \+ \d+\?/.test(document.getElementById("prompt")?.textContent || ""), { timeout: 8000 });
        }
        await page.waitForTimeout(200);
        const box = await measure(page, item.cta);
        shots.push({ page: item.id, viewport: viewport.name, box });
        judge(item.id, viewport.name, box);
      }
      await context.close();
    }

    const context = await browser.newContext({
      viewport: { width: 320, height: 568 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.locator(".hero a.cta").click();
    await page.waitForSelector('[data-act="letsplay"]', { timeout: 8000 });
    await page.locator('[data-act="letsplay"]').click();
    await page.waitForSelector(".handoff-card", { timeout: 8000 });
    await page.locator('[data-act="parents"]').click();
    await page.waitForSelector(".gate-q", { timeout: 8000 });
    const question = await page.locator(".gate-q").innerText();
    const parts = question.match(/(\d+)\s*\+\s*(\d+)/);
    if (!parts) {
      findings.push({ page: "play", rule: "parent-gate", detail: "the grown-up question did not show two numbers" });
    } else {
      const sum = Number(parts[1]) + Number(parts[2]);
      const options = page.locator(".gate-opt");
      const count = await options.count();
      for (let i = 0; i < count; i += 1) {
        const text = (await options.nth(i).innerText()).trim();
        if (Number(text) !== sum) {
          await options.nth(i).click();
          break;
        }
      }
      await page.locator(".gate-opt", { hasText: new RegExp(`^${sum}$`) }).click();
      await page.waitForSelector('a[href="/account/"]', { timeout: 8000 });
      const join = await measure(page, 'a[href="/account/"]');
      shots.push({ page: "play-gate", viewport: "320x568", box: join });
      judge("play-gate", "320x568", join);
    }
    await context.close();
  } catch (error) {
    findings.push({ page: "fold", rule: "browser", detail: String(error && error.message || error).split("\n")[0] });
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
  return { ran: true, chrome, shots };
}

const fold = await foldCheck();
const report = {
  gate: "preflight",
  moneyPath: "visit → tool use → signup → paid step → Stripe",
  promise: PROMISE,
  ok: findings.length === 0,
  findings,
  pages,
  fold: { ran: fold.ran, reason: fold.reason || null, shots: fold.shots || [] },
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
process.exit(findings.length === 0 ? 0 : 1);
