---
"@lowdefy/modules-mongodb-layout": patch
"@lowdefy/modules-mongodb-user-admin": patch
"@lowdefy/modules-mongodb-companies": patch
---

Follow-on to the title-block eyebrow/status-pill work: wire two modules the first pass missed, fix a title-bar layout bug, and relocate the user record stamp.

- **layout** — the title bar's change-stamp subtitle now **wraps** instead of being a single `nowrap`/ellipsis line. The previous styling gave the title column a min-content width equal to the full subtitle, which on narrower bars pushed the page actions (e.g. the Edit button) onto a new row. The title column is now `flex: 1 1 0` and the page-actions block `flex: 0 0 auto`, so the actions always hold the right edge and the subtitle wraps within the remaining width. (Verified in a headless-browser render of the exact DOM.)
- **user-admin** gains a status pill on the view and edit pages. A new `modules/user-admin/enums/user_statuses.yaml` enum (active / open invite / disabled) backs it, and `get_user` now emits a `status` slug derived the same way as the list table's `active` column (disabled > open invite > active). The enum uses the antd preset green / blue / red colour families so the title pill matches the existing AgGrid Tag in the list — the table tag mechanism is unchanged. The view page no longer renders the created/modified stamp as a title subtitle; that audit info moves into the **Access** sidebar card (next to "Signed up"), and the Access card's status Tag is removed since the title pill now shows status.
- **companies** view / edit / new pages are migrated to the eyebrow + title shape (entity type moved out of the hand-concatenated `"{label}: {name}"` heading into the `type` eyebrow; `loading` added on the request-backed view page). These pages used the title bar before the redesign but were not migrated with the other modules.
