---
"@lowdefy/modules-mongodb-layout": minor
"@lowdefy/modules-mongodb-reporting": patch
---

layout: add a `full_bleed` var to the `page` component; reporting: fix the chat page under a header-bar `page_type`

The chat page pinned its workspace to `100dvh`, which is only the height of the
content area under `PageSidebarLayout` — the one page block with no header bar
above the content. Under `PageHeaderMenu` or `PageSiderMenu` the workspace was
taller than the space it had by the header's height, so the chat composer sat
below the fold and the page gained a scrollbar. `header-menu` is the layout
module's default `page_type`, so this was the default case.

`layout`'s `page` component now takes `full_bleed: true` for a page whose content
is the whole content area. It zeroes the content padding, applies the top offset
the selected page type actually reserves, and publishes the remaining height as
the CSS custom property `--layout-content-height`. Custom properties inherit, so
content nested any depth down can size off it:

```yaml
_ref:
  module: layout
  component: page
  vars:
    full_bleed: true
    hide_title: true
    hide_footer: true
```

```yaml
style:
  height: var(--layout-content-height, 100dvh)
```

`full_bleed` is applied under `content_style`, so a page can still add its own
background or override an offset, and the two remain independent.

All three page blocks reserve the same band above the content (the breadcrumb, or
an empty spacer in its place), so the pull-up over it applies to all three.

For `page_type: sidebar` the published values are `100dvh` and `marginTop: -40px`
— what the chat page hard-coded before — so a sidebar host sees no change.
