// Bring the hand-written pages up to the standard the generated ones set.
//
// /sounds is generated, so it carries the full portfolio head block by
// construction. /guides, /privacy, /terms and the homepage were written by hand
// at different times and drifted apart -- one had no og:image at all, none had
// the Organization/WebSite @graph, and only the generated pages carried the
// portfolio cross-link.
//
// This is idempotent and additive: it never overwrites a tag that is already
// there, so hand-tuned copy survives. Run it from the build.
//
//   node tools/seo/upgrade-pages.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const ORIGIN = 'https://kide.us';

// Child-FACING is not the same as private. /words and /play are the pages a
// parent sends to another parent, so they need a social card and a canonical
// like any other public page -- they just must never carry measurement. The
// two rules are separate and are enforced separately.
const PAGES = [
  ['index.html', '/', 'Kide'],
  ['public/words/index.html', '/words', 'Kide'],
  ['public/play/index.html', '/play', 'Kide'],
  ['public/guides/index.html', '/guides', 'Guides'],
  ['public/privacy/index.html', '/privacy', 'Privacy'],
  ['public/terms/index.html', '/terms', 'Terms'],
  ...readdirSync('public/guides', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => [`public/guides/${d.name}/index.html`, `/guides/${d.name}`, 'Guide']),
];

const grab = (html, re, fallback = '') => (html.match(re) || [, fallback])[1];
const ogUrl = (title, path) =>
  `https://www.growth.business/api/og?domain=kide.us&amp;title=${encodeURIComponent(title)}`
  + `&amp;template=page&amp;path=${encodeURIComponent(path)}`;

let changed = 0;
for (const [file, path, kind] of PAGES) {
  if (!existsSync(file)) continue;
  let html = readFileSync(file, 'utf8');
  const before = html;

  const title = grab(html, /<title>([^<]*)<\/title>/, 'Kide');
  const desc = grab(html, /<meta name="description" content="([^"]*)"/, '');
  const url = ORIGIN + path;

  const add = (test, tag) => {
    if (test.test(html)) return;
    html = html.replace('</head>', `${tag}\n</head>`);
  };

  add(/rel="canonical"/, `<link rel="canonical" href="${url}">`);
  add(/name="robots"/, '<meta name="robots" content="index,follow,max-image-preview:large">');
  add(/rel="manifest"/, '<link rel="manifest" href="/site.webmanifest">');
  add(/property="og:site_name"/, '<meta property="og:site_name" content="Kide">');
  add(/property="og:url"/, `<meta property="og:url" content="${url}">`);
  add(/property="og:image"/,
    `<meta property="og:image" content="${ogUrl(title, path)}">\n`
    + '<meta property="og:image:type" content="image/png">\n'
    + '<meta property="og:image:width" content="1200">\n'
    + '<meta property="og:image:height" content="630">');
  add(/name="twitter:card"/, '<meta name="twitter:card" content="summary_large_image">');
  add(/name="twitter:image"/, `<meta name="twitter:image" content="${ogUrl(title, path)}">`);

  // The @graph every page in the portfolio carries. Only added when the page
  // has no JSON-LD at all -- a page that already declares its own richer types
  // (the homepage does) is left alone rather than given a competing block.
  if (!/application\/ld\+json/.test(html)) {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Kide', url: ORIGIN, logo: `${ORIGIN}/favicon.ico`,
          parentOrganization: { '@type': 'Organization', name: 'Quizbiz LLC' } },
        { '@type': 'WebSite', name: 'Kide', url: ORIGIN, description: desc },
        { '@type': kind === 'Guide' ? 'Article' : 'WebPage',
          ...(kind === 'Guide'
            ? { headline: title, author: { '@type': 'Organization', name: 'Kide', url: ORIGIN },
                publisher: { '@type': 'Organization', name: 'Kide', url: ORIGIN },
                mainEntityOfPage: url }
            : { name: title }),
          url, description: desc },
        { '@type': 'BreadcrumbList', itemListElement:
          (path === '/' ? [['Home', '/']]
            : path.split('/').filter(Boolean).map((seg, i, a) =>
                [seg.replace(/-/g, ' '), '/' + a.slice(0, i + 1).join('/')]))
          .map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: ORIGIN + it[1] })) },
      ],
    };
    html = html.replace('</head>',
      `<script type="application/ld+json">${JSON.stringify(graph)}</script>\n</head>`);
  }

  // The portfolio cross-link, with the ?from= attribution the other sites use.
  if (!/growth\.business/.test(html) && /<\/footer>/.test(html)) {
    html = html.replace('</footer>',
      '  <div class="links" style="margin-top:8px">Part of the portfolio network ·\n'
      + '    <a href="https://growth.business/?from=kide.us">growth.business</a></div>\n</footer>');
  }

  if (html !== before) { writeFileSync(file, html); changed++; }
}

console.log(`pages upgraded: ${changed}`);
