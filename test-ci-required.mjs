// Failure propagation for the CI guards.
//
// A missing build or a missing ffprobe must fail when CI is set, and must
// stay a local skip when it is not. The workflow must keep a produced gate
// receipt without continue-on-error, and must not grant actions: write.
// The three sibling catalog checks are not covered here: they stay skips.

import { mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert';

const root = process.cwd();
let pass = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exit(1); }
};

const yml = readFileSync('.github/workflows/ci.yml', 'utf8');

ok('workflow does not continue on error', () => {
  assert.doesNotMatch(yml, /^\s*continue-on-error:/m);
});
ok('GITHUB_TOKEN is contents read and not actions write', () => {
  assert.match(yml, /contents: read/);
  assert.doesNotMatch(yml, /^\s*actions:\s*(read|write)\s*$/m);
});
ok('gate upload keeps a failed run\'s files and rejects a missing receipt', () => {
  assert.match(yml, /if:\s*always\(\) && !cancelled\(\)/);
  assert.match(yml, /if-no-files-found:\s*error/);
  assert.match(yml, /uses:\s*actions\/upload-artifact@v4/);
  assert.match(yml, /npm run gate:preflight/);
});
ok('CI installs ffprobe', () => {
  assert.match(yml, /apt-get install -y ffmpeg/);
  assert.match(yml, /command -v ffprobe/);
});

function run(file, env, cwd = root) {
  const r = spawnSync(process.execPath, [join(root, file)], { cwd, env, encoding: 'utf8' });
  return r;
}
function withCI(extra = {}) {
  return { ...process.env, ...extra, CI: 'true' };
}
function withoutCI(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.CI;
  return env;
}

const empty = mkdtempSync(join(tmpdir(), 'kide-nodist-'));
const barePath = mkdtempSync(join(tmpdir(), 'kide-nopath-'));

for (const file of ['test-mobile.mjs', 'test-words-browser.mjs']) {
  ok(`${file} missing dist fails in CI`, () => {
    const r = run(file, withCI(), empty);
    assert.notEqual(r.status, 0, `exit ${r.status}\n${r.stdout}`);
  });
  ok(`${file} missing dist stays a local skip`, () => {
    const r = run(file, withoutCI(), empty);
    assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  });
}

for (const file of ['test-voice-pack.mjs', 'test-voice-game.mjs', 'test-speech.mjs']) {
  ok(`${file} missing ffprobe fails in CI`, () => {
    const r = run(file, withCI({ PATH: barePath }));
    assert.notEqual(r.status, 0, `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  });
  ok(`${file} missing ffprobe stays a local skip`, () => {
    const r = run(file, withoutCI({ PATH: barePath }));
    assert.equal(r.status, 0, `exit ${r.status}\n${r.stdout}\n${r.stderr}`);
  });
}

console.log(`\n${pass} passed, 0 failed\n`);
