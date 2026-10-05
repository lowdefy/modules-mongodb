---
"@lowdefy/modules-mongodb-layout": minor
---

layout: a per-page header logo

- New `logo` var on the `page` component sets that page's header logo, passed to the page block's `logo` property (`{ src, srcMobile, alt }`, plus `breakpoint` or `style` depending on the page type). Pages that leave it unset keep the public-folder logo.
