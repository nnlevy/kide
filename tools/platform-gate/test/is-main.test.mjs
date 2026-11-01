import { test } from "node:test"; import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, cpSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
import { isMain } from "../is-main.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
test("isMain matches through a symlinked dir (macOS /tmp -> /private/tmp)", () => {
  const d = mkdtempSync(join(tmpdir(), "ismain-")); writeFileSync(join(d, "x.mjs"), ""); symlinkSync(d, d + "-link");
  assert.equal(isMain(pathToFileURL(join(d, "x.mjs")).href, join(d + "-link", "x.mjs")), true);
  assert.equal(isMain(pathToFileURL(join(d, "x.mjs")).href, join(d, "y.mjs")), false);
  assert.equal(isMain(pathToFileURL(join(d, "x.mjs")).href, undefined), false);
});
test("discover-pages CLI prints pages when run via a symlinked path", () => {
  const d = mkdtempSync(join(tmpdir(), "dp-")); cpSync(join(HERE, ".."), join(d, "pg"), { recursive: true, filter: (s) => !s.includes("node_modules") });
  symlinkSync(d, d + "-link"); const k = join(d, "keys"); writeFileSync(k, "/ /pricing\n");
  const r = spawnSync(process.execPath, [join(d + "-link", "pg", "discover-pages.mjs"), "https://a.example/", "--domain", "a.example", "--keyurls", k, "--no-render"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(r.stdout.trim().split("\n"), ["/", "/pricing"]);
});
