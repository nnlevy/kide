// One place that decides whether a browser test can run.
//
// This existed three times, subtly differently, and each copy checked only
// whether the playwright MODULE was importable. That is the wrong question. On
// a machine where the package is installed but the browser's system libraries
// are missing, the module imports fine and the launch throws -- so all three
// files crashed, `npm test` exited non-zero before reaching the end, and the
// suite could not be run end to end at all.
//
// The right question is whether a browser actually LAUNCHES. Ask it once, here.
//
// A browser test that cannot launch a browser is a SKIP. Never a pass -- that
// would be pretending to have coverage we do not have. Never a crash -- that
// takes the rest of the suite down with it. The message is loud, and it says
// exactly what to run to fix it.

let cached;

export async function browserOrSkip(name) {
  if (cached !== undefined) return cached;

  let chromium;
  for (const mod of ['playwright', 'playwright-core']) {
    try { ({ chromium } = await import(mod)); break; } catch { /* try the next */ }
  }
  if (!chromium) {
    console.log(`\n(SKIPPED ${name}: playwright is not installed)`);
    console.log('  npm i -D playwright && npx playwright install --with-deps chromium\n');
    process.exit(0);
  }

  try {
    const b = await chromium.launch({
      ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}),
      args: ['--no-sandbox'],
    });
    await b.close();
  } catch (e) {
    const why = String(e.message).split('\n').find((l) => /error while loading|ENOENT|not found/i.test(l))
      || String(e.message).split('\n')[0];
    console.log(`\n(SKIPPED ${name}: chromium will not launch here)`);
    console.log(`  ${why.trim()}`);
    console.log('  npx playwright install --with-deps chromium   (needs root)\n');
    process.exit(0);
  }

  cached = chromium;
  return chromium;
}
