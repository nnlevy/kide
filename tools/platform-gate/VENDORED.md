# Vendored platform gate

Provenance on this branch: copied from kide `origin/cursor/vendor-platform-gate-97f9`
(`tools/platform-gate/`), itself a copy of private `nnlevy/scripts`
`tools/platform-gate/` at the commit in `VERSION`
(`ab09c0c14accfb5af23939de6c0c229c9c5bea68`).

Byte-identical with that vendor lane (minus a `node_modules` symlink).
`UPSTREAM.sha256` lists every upstream file's hash; do not edit those files here.
Local-only additions: `VERSION`, `UPSTREAM.sha256`, `VENDORED.md`, `preflight.mjs`,
`.gitignore`, `runtime/` (Playwright 1.62.1 + `@axe-core/playwright` 4.14.0).

Route coverage: `discover-pages.mjs` (sitemap + home links, cap 40) and optional
`GATE_PATHS`. Runtime: Chromium + WebKit, 15 mobile profiles, claims, `js_error`,
orphan tools, asset HTML fallback.

Run from repo root: `npm run gate:preflight`.
Verify: `cd tools/platform-gate && sha256sum -c UPSTREAM.sha256`.
Updates come only from upstream (re-vendor at a new SHA).
