#!/usr/bin/env node
/* Renders the Kide voice pack from manifest.js.
 * Run once per pack version; the output is committed as static assets.
 *   OPENAI_API_KEY=... node generate.js [--force] [--voice coral]
 * Skips any clip that already exists unless --force, so re-running is cheap
 * and a single changed line costs one request instead of forty.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const M = require("./manifest");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

const force = process.argv.includes("--force");
const vIdx = process.argv.indexOf("--voice");
const voice = vIdx > -1 ? process.argv[vIdx + 1] : M.voice;
const outDir = path.join(__dirname, "out", M.packVersion);
fs.mkdirSync(outDir, { recursive: true });

const sig = (t) => crypto.createHash("sha1").update(voice + "|" + M.direction + "|" + t).digest("hex").slice(0, 12);
const sigPath = path.join(outDir, ".sigs.json");
const sigs = fs.existsSync(sigPath) ? JSON.parse(fs.readFileSync(sigPath, "utf8")) : {};

async function render(line) {
  const file = path.join(outDir, line.id + ".mp3");
  const want = sig(line.text);
  if (!force && fs.existsSync(file) && sigs[line.id] === want) return { id: line.id, skipped: true };

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: M.model, voice, input: line.text,
      instructions: M.direction, response_format: "mp3"
    })
  });
  if (!res.ok) throw new Error(`${line.id}: HTTP ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  sigs[line.id] = want;
  return { id: line.id, bytes: buf.length };
}

(async () => {
  let made = 0, skipped = 0, bytes = 0;
  // Small concurrency: fast enough, well under any rate limit.
  const queue = M.lines.slice();
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const line = queue.shift();
      const r = await render(line);
      if (r.skipped) { skipped++; }
      else { made++; bytes += r.bytes; process.stdout.write(`  ✓ ${r.id} (${(r.bytes / 1024).toFixed(0)}kb)\n`); }
    }
  });
  await Promise.all(workers);
  fs.writeFileSync(sigPath, JSON.stringify(sigs, null, 2));

  // The browser-side index: id -> relative file. Keeps voice.js free of a
  // hardcoded list, so adding a line is a manifest edit plus a regen.
  const index = { version: M.packVersion, voice, ids: M.lines.map((l) => l.id) };
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index));

  const chars = M.lines.reduce((n, l) => n + l.text.length, 0);
  console.log(`\n${made} rendered, ${skipped} unchanged · ${(bytes / 1024).toFixed(0)}kb new · ${chars} chars (~$${(chars / 1e6 * 0.6).toFixed(4)})`);
})().catch((e) => { console.error(e.message); process.exit(1); });
