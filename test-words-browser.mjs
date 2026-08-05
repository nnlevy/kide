// The real pre-reader journey in /words, driven through the browser. Static
// copy checks cannot prove that a replay button plays or that a choice advances.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { browserOrSkip } from './test-browser.mjs';

if (!existsSync('dist/words/index.html')) {
  console.log('\n(skipped test-words-browser: run `npm run build` first)\n');
  process.exit(0);
}

const PORT = Number(process.env.WORDS_TEST_PORT || 8794);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'dist'], { stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 700));

let pass = 0, fail = 0;
const ok = (condition, label) => {
  if (condition) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

const chromium = await browserOrSkip('test-words-browser');
const browser = await chromium.launch({
  ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
  args: ['--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [], audio = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.url().includes('/voice/words/v1/') && response.url().endsWith('.mp3')) {
      audio.push(response.url().split('/').pop());
    }
  });

  await page.goto(`http://127.0.0.1:${PORT}/words/`, { waitUntil: 'networkidle' });
  ok(await page.getByRole('heading', { name: 'Pick a friend.' }).isVisible(), 'first action is “Pick a friend.”');
  ok(await page.locator('#stepWho .pick').count() >= 3, 'friend choices are large pictures');
  ok(await page.locator('.topbar').count() === 0, 'navigation does not compete above the child action');

  const firstPrompt = page.waitForResponse(
    (response) => response.url().endsWith('/voice/words/v1/chrome-who.mp3'),
    { timeout: 5000 },
  ).catch(() => null);
  await page.locator('#hearWho').click();
  ok(!!(await firstPrompt), 'first replay speaks the instruction');

  audio.length = 0;
  await page.locator('#stepWho .pick').first().click();
  await page.waitForTimeout(500);
  ok(await page.getByRole('heading', { name: 'Pick a name.' }).isVisible(), 'friend tap advances to “Pick a name.”');
  ok(audio.includes('chrome-name.mp3'), 'the next instruction speaks automatically');

  await page.locator('#stepName .name-btn').first().click();
  await page.locator('#stepPlay').waitFor({ state: 'visible', timeout: 12000 });
  ok(await page.getByRole('heading', { name: 'Tap the big button.' }).isVisible(), 'name tap advances without a second continue button');
  ok(await page.locator('#sayRow .big-btn').count() === 1, 'only one primary action is offered');

  await page.locator('#sayRow .big-btn').click();
  await page.getByRole('heading', { name: 'Tap a picture.' }).waitFor({ state: 'visible', timeout: 15000 });
  ok(await page.locator('#choices .sc-obj').count() >= 2, 'picture choices appear after the prompt');

  audio.length = 0;
  await page.locator('#hearPlay').click();
  await page.waitForTimeout(400);
  ok(audio.includes('chrome-where.mp3'), 'play replay restarts “Tap a picture.”');
  ok(await page.locator('#grownupZone').evaluate((el) => el.getBoundingClientRect().top > document.querySelector('#stepPlay').getBoundingClientRect().top),
    'grown-up controls stay below the child journey');
  ok(errors.length === 0, `no browser errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
