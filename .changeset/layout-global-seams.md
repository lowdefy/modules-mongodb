---
"@lowdefy/modules-mongodb-layout": minor
---

**App-wide seams on the layout `page` component.** New module vars apply to every page that uses the `page` component, so an app wires a widget or a style once on its `layout` entry instead of on each page:

- `global_blocks`: blocks appended after the page content, for floating widgets such as a help button or an assistant launcher.
- `global_requests`: requests declared on every page for those blocks. They are not fired on mount.
- `global_subscriptions`: websocket subscriptions declared on every page, such as a widget's live channel. The `page` component also takes a `subscriptions` var for a page's own; a page that subscribes to a websocket `global_subscriptions` also names keeps its own, so it holds one channel.
- `global_events.onInit` / `global_events.onMountAsync`: actions spliced into every page, the module-level counterpart of the per-page `events` var. `onMountAsync` runs after the `header_extra` request fetches and before the page's own actions, so an app can hang an app-wide guard, such as an onboarding gate, there.
- `content_style`: the content area style for every page, such as a different gutter (`padding: 0 24px 24px 24px`). A page's own `content_style` applies over it key by key, and a `full_bleed` page keeps zero padding.

A page can also replace the module-wide header blocks with the `header_blocks` var (`header_blocks: []` for a bare header).
