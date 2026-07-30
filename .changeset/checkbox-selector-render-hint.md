---
"@lowdefy/modules-mongodb-plugins": patch
---

A `checkbox_selector` field now uses the `selector` renderer on read-only surfaces, like every other selector. It was the one options-taking selector missing from the `DataDescriptions` component hints, so its stored slugs fell through to the generic string renderer. That path already rendered them as tags, so the visible fix is enum resolution: an enum-backed checkbox list showed "Weekly" (the slug, title-cased) instead of the entry's title "Weekly review", and dropped the entry's colour and icon.
