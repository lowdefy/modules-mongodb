---
"@lowdefy/modules-mongodb-layout": minor
"@lowdefy/modules-mongodb-workflows": patch
"@lowdefy/modules-mongodb-contacts": patch
"@lowdefy/modules-mongodb-activities": patch
"@lowdefy/modules-mongodb-user-admin": patch
---

The shared page title bar (`modules/shared/layout/title-block.yaml`, threaded through the `layout` `page` component) gains three capabilities:

- **`type` eyebrow** — a small uppercase entity-type label rendered directly above the title (e.g. `COMPANY`, `EDIT COMPANY`, `INVITE ACME USER`). The `title` prop now holds just the entity name; pages stop hand-concatenating `"{type}: {name}"` into the heading. The eyebrow renders immediately and is never skeletoned.
- **`status` + `status_enum` pill** — the caller passes a status slug (runtime) and a status-enum map (build-time `_ref`); the title block resolves the label and the three-colour contract (`color`→fill, `borderColor`→border, `titleColor`→text) internally and renders a chunky, vertically-centred pill. Status resolution lives in the component now, not in each caller.
- **opt-in `loading` skeleton** — when `loading` is truthy, the title, subtitle, and status pill render as shimmer skeletons (via Lowdefy's native `loading:`/`skeleton:` pair). Defaults to `false`, so static list/index titles are untouched.

**Breaking:** the raw `badge_text` / `badge_color` props are **removed** (replaced by `status` + `status_enum`). Any external/consumer title-bar override that passed `badge_*` silently loses its badge and must migrate to a status enum with the standard `{ color, borderColor, titleColor, title }` entry shape. The wholesale `title_block` override path is unaffected — it replaces the block entirely and never used these props.

All in-repo callers are migrated: workflow overview and group overview (badge → status pill), and contacts / activities / user-admin view, edit, and new pages (entity type split out of the title into the eyebrow; `loading` added on the request-backed view pages). A new `modules/workflows/enums/action_group_statuses.yaml` enum backs the group-overview rollup status (done / in-progress / blocked), preserving its previous green / blue / grey colours. The title-bar prop interface is now documented in the layout module README.
