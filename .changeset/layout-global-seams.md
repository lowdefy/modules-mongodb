---
"@lowdefy/modules-mongodb-layout": minor
---

New app-wide seams on the `page` component: `global_events.onInit` / `global_events.onMountAsync` (actions spliced into every page — the module-level counterpart of the per-page `events` var), `global_blocks` (blocks appended after the page content, for floating widgets) and `global_requests` (requests declared on every page for those blocks). `global_events.onMountAsync` runs after the `header_extra` request fetches and before the page's own actions, so an app can hang an app-wide guard (e.g. an onboarding gate) there without touching each page. A page may also replace the module-wide header blocks via the `header_blocks` `_ref` var (`header_blocks: []` for a bare header).
