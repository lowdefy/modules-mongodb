---
"@lowdefy/modules-mongodb-layout": minor
---

layout: add a `content_style` module var, the content area style for every page that uses the `page` component. An app that wants a different gutter on every page now sets it once on its `layout` module entry instead of on each page:

```yaml
- id: layout
  vars:
    content_style:
      padding: 0 24px 24px 24px
```

A page's own `content_style` var still applies over it key by key, and a `full_bleed` page keeps zero padding. With the var unset, pages render as before.
