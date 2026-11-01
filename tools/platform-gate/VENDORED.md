# Vendored platform gate
Byte-identical copy of `tools/platform-gate/` from private `nnlevy/scripts` at the commit in `VERSION`
(minus the upstream `node_modules` symlink). `UPSTREAM.sha256` lists every upstream file's hash; do not edit them here.
Local-only additions: `VERSION`, `UPSTREAM.sha256`, `VENDORED.md`, `preflight.mjs`, `.gitignore`, `runtime/` (pinned
Playwright 1.62.1 + @axe-core/playwright 4.14.0, same as Ozer's deploy runtime).
Run from repo root: `npm run gate:preflight`. Verify: `cd tools/platform-gate && sha256sum -c UPSTREAM.sha256`.
Updates come only from upstream (re-vendor at a new SHA); drift check: `/workspace/platform/gate-preflight/sync-vendored.sh` on the box.
