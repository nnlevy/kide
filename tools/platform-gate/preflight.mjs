#!/usr/bin/env node
// Vendored-gate runner (not upstream). `npm run gate:preflight` -> build, serve dist/ locally, run the exact
// nnlevy/scripts tools/platform-gate/gate.mjs (commit in VERSION) with --strict, write gate JSON, exit non-zero on any finding.
// Env: GATE_DOMAIN (default: package.json "gateDomain"), GATE_DIST (default dist), GATE_PORT (8787),
//      GATE_PATHS="/,/pricing" (default: discover-pages.mjs), GATE_URL (skip build+serve, gate a running server),
//      GATE_SKIP_BUILD=1, GATE_OUT (default gate-preflight-out).
import { spawnSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync, symlinkSync, lstatSync, createReadStream } from "node:fs";
import { dirname, join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const DOMAIN = process.env.GATE_DOMAIN || pkg.gateDomain; if (!DOMAIN) { console.error("set GATE_DOMAIN or package.json gateDomain"); process.exit(2); }
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { stdio: "inherit", ...o }).status ?? 1;
// async spawn while our own static server is up (spawnSync would block it)
const runAsync = (cmd, args, o = {}) => new Promise((r) => { let out = ""; const c = spawn(cmd, args, { stdio: ["ignore", o.capture ? "pipe" : "inherit", "inherit"] }); if (o.capture) c.stdout.on("data", (b) => (out += b)); c.on("close", (code) => r({ status: code ?? 1, stdout: out })); });
const RT = join(HERE, "runtime");
if (!existsSync(join(RT, "node_modules", "playwright"))) {
  if (run("npm", ["ci", "--silent"], { cwd: RT })) process.exit(3);
  if (run("npx", ["playwright", "install", "--with-deps", "chromium", "webkit"], { cwd: RT })) run("npx", ["playwright", "install", "chromium", "webkit"], { cwd: RT });
}
try { lstatSync(join(HERE, "node_modules")); } catch { symlinkSync("runtime/node_modules", join(HERE, "node_modules")); }
let base = process.env.GATE_URL, server;
if (!base) {
  if (!process.env.GATE_SKIP_BUILD && pkg.scripts?.build && run("npm", ["run", "build"])) { console.error("build failed"); process.exit(4); }
  const DIST = resolve(ROOT, process.env.GATE_DIST || "dist"); const PORT = Number(process.env.GATE_PORT || 8787);
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".wasm": "application/wasm" };
  server = createServer((req, res) => { // static, Cloudflare-assets-like: /x -> x, x.html, x/index.html; real 404 (no SPA fallback)
    const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    for (const c of [p, p + ".html", join(p, "index.html")]) { const f = join(DIST, c);
      if (f.startsWith(DIST) && existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" }); return createReadStream(f).pipe(res); } }
    res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r)); base = `http://127.0.0.1:${PORT}/`;
  console.log(`serving ${DIST} at ${base}`);
}
base = base.replace(/\/?$/, "/");
let paths = (process.env.GATE_PATHS || "").split(",").map((s) => s.trim()).filter(Boolean);
if (!paths.length) { const d = await runAsync(process.execPath, [join(HERE, "discover-pages.mjs"), base, "--domain", DOMAIN], { capture: true });
  paths = (d.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean); if (!paths.length) paths = ["/"]; }
const urls = [...new Set(paths.map((p) => new URL(p, base).href))];
const OUT = resolve(ROOT, process.env.GATE_OUT || "gate-preflight-out");
console.log(`gate ${readFileSync(join(HERE, "VERSION"), "utf8").trim()} --domain ${DOMAIN} on ${urls.length} page(s)`);
const rc = (await runAsync(process.execPath, [join(HERE, "gate.mjs"), ...urls, "--domain", DOMAIN, "--strict", "--out", OUT])).status;
server?.close();
console.log(`gate JSON: ${join(OUT, "gate.json")} (exit ${rc}${rc ? " = findings, do not open the PR" : " = 0 findings"})`);
process.exit(rc);
