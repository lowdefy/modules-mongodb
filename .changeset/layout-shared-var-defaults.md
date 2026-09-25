---
"@lowdefy/modules-mongodb-layout": patch
---

fix(layout): Make the page, card and auth-page components build under the v7 strict checks.

The strict missing-`_var` check makes a `_var` read that no caller supplies a build error
unless the read declares a default, and it evaluates every read — including those inside an
untaken `_build.if` branch. Five reads in the layout module's page, card and auth-page
components were optional by construction but read bare, so any page or card that omitted
them failed the build. Each now takes the explicit `{ key, default: null }` form; behaviour
is unchanged, since a missing var already resolved to null under the lax check.

Two block-schema defects in auth-page are fixed alongside:

- `Card`'s `bodyPadding` theme token is a number of px, not a CSS shorthand. The
  `"28px 32px 28px 32px"` string is rejected and collapses to `28` — a cosmetic
  regression of 4px horizontal padding, as there is no separate inline-padding token.
- `Img`'s `properties.width` is a number of px, so the `100%` CSS length moves to `style`.
