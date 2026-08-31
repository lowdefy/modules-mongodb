---
"@lowdefy/modules-mongodb-layout": patch
---

fix(layout): Declare defaults for the optional `title`, `title_block` and `header_buttons` vars.

The strict missing-`_var` check makes a `_var` read that no caller supplies a build
error unless the read declares a default. Four reads in the layout module's page and
card components were optional by construction — `title` and `title_block` are only
rendered behind presence tests, and `header_buttons` behind an explicit `null` test —
but read bare, so any page or card that omitted them failed the build.

Give each the explicit `{ key, default: null }` form. Behaviour is unchanged: a missing
var already resolved to null under the lax check.
