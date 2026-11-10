// Generate the sitemap and robots from what is ACTUALLY on disk.
//
// The sitemap was a hand-written string in the worker. By the time anyone
// looked it was missing /parent, /clinician and every page added since — the
// exact silent drift that the voice manifest had, with the same cause (a list
// maintained by hand next to a thing that changes) and the same fix.
//
// It also listed nothing that should be hidden, which is luck rather than
// design. Private surfaces are now excluded by an explicit rule, so adding a
// new private page cannot accidentally publish it.
//
//   node tools/seo/build-sitemap.mjs

import { writeFileSync, readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ORIGIN = 'https://kide.us';
const ROOT = 'public';

/* Never index. Each of these has a reason, not a preference:
 *  - /parent, /clinician  a child's practice record. Indexing it would be a
 *                         privacy failure even though the data is local-only.
 *  - /bench, /engine      developer instrumentation. Ranking for it would
 *                         waste crawl budget and confuse a parent who lands on it.
 *  - /scene               an internal rig, not a page.
 *  - /account, /unlock    sign-in and the paid step. Thin, per-visitor pages a
 *                         stranger should reach through Pip, not from search.
 *  - /cast/app            a child's screen holding what a parent typed. The
 *                         public door is /cast.
 */
const PRIVATE = [/^\/parent/, /^\/clinician/, /^\/bench/, /^\/engine/, /^\/scene/, /^\/account/, /^\/unlock/, /^\/cast\/app/];

/* Priority reflects what we would most like a stranger to land on.
 * /sounds outranks the product pages deliberately: it is the surface that
 * answers a question someone is actively searching for, and the product is
 * what they find once they trust the answer. */
const PRIORITY = [
  [/^\/$/,          '1.0', 'weekly'],
  [/^\/sounds$/,    '0.9', 'weekly'],
  [/^\/sounds\//,   '0.8', 'monthly'],
  [/^\/words$/,     '0.9', 'weekly'],
  [/^\/play$/,      '0.8', 'weekly'],
  [/^\/guides$/,    '0.8', 'monthly'],
  [/^\/guides\//,   '0.7', 'monthly'],
  // The only page aimed at the customer who pays. Low volume, high intent --
  // one clinician is worth more here than a hundred parents, and there are far
  // fewer of them searching.
  [/^\/for-slps$/,  '0.9', 'monthly'],
  // Pip's Cast Club: answers a parent searching about a toddler in a cast.
  [/^\/cast$/,      '0.8', 'monthly'],
  [/^\/(privacy|terms)$/, '0.3', 'yearly'],
];

function routes(dir = ROOT, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (!statSync(p).isDirectory()) {
      if (entry === 'index.html' && prefix) out.push(prefix);
      continue;
    }
    out.push(...routes(p, `${prefix}/${entry}`));
  }
  return out;
}

const all = ['/', ...routes()].filter((r, i, a) => a.indexOf(r) === i).sort();
const pub = all.filter((r) => !PRIVATE.some((rx) => rx.test(r)));
const excluded = all.filter((r) => PRIVATE.some((rx) => rx.test(r)));

const meta = (r) => PRIORITY.find(([rx]) => rx.test(r)) || [null, '0.5', 'monthly'];

const xml = '<?xml version="1.0" encoding="UTF-8"?>'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  + pub.map((r) => {
      const [, priority, changefreq] = meta(r);
      return `<url><loc>${ORIGIN}${r === '/' ? '/' : r}</loc>`
        + `<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
    }).join('')
  + '</urlset>';

// robots.txt: the private surfaces are disallowed explicitly as well as being
// absent from the sitemap. Absence is not an instruction; Disallow is.
const robots = [
  'User-agent: *',
  'Allow: /',
  ...excluded.map((r) => `Disallow: ${r}/`),
  '',
  `Sitemap: ${ORIGIN}/sitemap.xml`,
  '',
].join('\n');

// llms.txt (llmstxt.org): the same public pages, each with its own <title> and meta description,
// so an assistant asked "how do I help my toddler say the R sound" can find and cite the right page.
// Built from the same list as the sitemap, so a private page can never appear here either.
const decode = (t) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const pageMeta = (r) => {
  const file = r === '/' ? 'index.html' : join(ROOT, r, 'index.html'); // the home page is the Vite entry at the repo root
  const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const title = decode((/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || r);
  const desc = decode((/<meta\s+name="description"\s+content="([^"]*)"/i.exec(html) || [])[1] || '');
  return { title, desc };
};
const line = (r) => { const { title, desc } = pageMeta(r); return `- [${title}](${ORIGIN}${r})${desc ? `: ${desc}` : ''}`; };
const START = ['/', '/play', '/sounds', '/words', '/for-slps'];
const llms = [
  '# Kide',
  '',
  `> ${pageMeta('/').desc || 'Pip the Sprout: a privacy-first learning game for children about 2 to 7, read aloud, with no ads.'}`,
  '',
  "No ads, and nothing a child says leaves the device. Not a substitute for a speech-language pathologist's assessment.",
  '',
  '## Start here',
  ...START.filter((r) => pub.includes(r)).map(line),
  '',
  '## Speech sounds, one page per sound',
  ...pub.filter((r) => r.startsWith('/sounds/')).map(line),
  '',
  '## Guides for parents',
  ...pub.filter((r) => r.startsWith('/guides')).map(line),
  '',
  '## More',
  ...pub.filter((r) => !START.includes(r) && !r.startsWith('/sounds/') && !r.startsWith('/guides') && !/^\/(privacy|terms)$/.test(r)).map(line),
  '',
].join('\n');

writeFileSync('src/worker/seo-generated.ts',
  '// GENERATED by tools/seo/build-sitemap.mjs -- do not hand-edit.\n'
  + '// The previous hand-written sitemap silently went stale and was missing five\n'
  + '// live pages. This one is derived from the pages that actually exist.\n\n'
  + `export const SITEMAP = ${JSON.stringify(xml)};\n\n`
  + `export const ROBOTS = ${JSON.stringify(robots)};\n\n`
  + `export const PUBLIC_ROUTES = ${JSON.stringify(pub)};\n\n`
  + `export const LLMS = ${JSON.stringify(llms)};\n`);

writeFileSync(`${ROOT}/robots.txt`, robots);
writeFileSync(`${ROOT}/sitemap.xml`, xml);
writeFileSync(`${ROOT}/llms.txt`, llms);

console.log(`sitemap: ${pub.length} public routes`);
console.log(`  excluded as private: ${excluded.join(', ') || 'none'}`);
if (existsSync(`${ROOT}/ads.txt`)) console.log('  WARNING: public/ads.txt still present');
