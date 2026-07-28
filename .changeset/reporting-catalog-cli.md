---
"@lowdefy/modules-mongodb-plugins": minor
---

Ship the reporting catalog bootstrap tool as a bin: `lowdefy-reporting-catalog`.

It previously lived at `scripts/gen-reporting-catalog.mjs` in the repo, which consumers had no way to run without copying it out. It is now part of this package — which every app using the `reporting` module already installs — so `pnpm exec lowdefy-reporting-catalog` drafts a collections catalog from a live database. Adds `js-yaml` as a dependency; `mongodb` was already a peer.

See `docs/reporting/how-to/bootstrap-catalog.md`.
