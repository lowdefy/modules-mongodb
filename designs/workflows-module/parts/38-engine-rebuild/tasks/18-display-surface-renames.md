# Task 18: Display surface renames + projection fixes

## Context

Part 34 D10 reserves the `workflow-*` glob space for the module's **fixed** pages (so `{entry_id}/workflow-*` slices module infrastructure, disjoint from per-type derived endpoints). This means renaming the module's fixed pages to carry the `workflow-` prefix, updating every `_module.pageId` reference, and the Part 30 display-surface fixes (`workflow-group-overview` reads `actions_list.$.message` / `.links`). Derived per-type page ids stay unprefixed (handled in task 6).

## Task

**Rename fixed module pages** (page `id` gains `workflow-` prefix):

- `modules/workflows/pages/group-overview.yaml` → `workflow-group-overview.yaml` (id `group-overview` → `workflow-group-overview`). Switch it to read `actions_list.$.message` / `.links` (the per-verb map). The single rendered link is resolved server-side by the shared `resolve_action_link.yaml` stage (Part 42 D5), not in the UI.
- `modules/workflows/pages/simple-view.yaml` → `workflow-simple-view.yaml`
- `modules/workflows/pages/simple-edit.yaml` → `workflow-simple-edit.yaml`
- `modules/workflows/pages/simple-review.yaml` → `workflow-simple-review.yaml`
- `workflow-overview.yaml` is already conformant — no rename.

**Update all references to the renamed ids:**

- Every `_module.pageId: simple-*` reference — inside `simple-edit`/`simple-review` themselves, and in `computeEngineLinks`'s simple-kind link table (task 3) → `workflow-simple-*`.
- The `_module.pageId: group-overview` references → `workflow-group-overview`.
- The `pages:` `_ref` paths in `modules/workflows/module.lowdefy.yaml` → the renamed files.
- The `exports.pages` ids in `module.lowdefy.yaml` (if listed).

## Acceptance Criteria

- Fixed pages renamed to `workflow-group-overview`, `workflow-simple-view/edit/review`; `workflow-overview` unchanged.
- No dangling `_module.pageId: simple-*` or `group-overview` references remain (grep clean).
- `module.lowdefy.yaml` `pages:` `_ref` paths + export ids point at the renamed files.
- `workflow-group-overview` reads `actions_list.$.message` / `.links`.
- `computeEngineLinks`' fixed-page link targets use `workflow-simple-{verb}`.
- The module builds; the demo (task 20) resolves these pages.

## Files

- `modules/workflows/pages/group-overview.yaml` → rename to `workflow-group-overview.yaml` + message/links read
- `modules/workflows/pages/simple-view.yaml` → rename to `workflow-simple-view.yaml`
- `modules/workflows/pages/simple-edit.yaml` → rename to `workflow-simple-edit.yaml` (+ update internal `_module.pageId` refs)
- `modules/workflows/pages/simple-review.yaml` → rename to `workflow-simple-review.yaml` (+ update internal refs)
- `modules/workflows/module.lowdefy.yaml` — modify (`pages:` `_ref` paths + export ids)
- `plugins/.../shared/render/computeEngineLinks.js` — modify if its simple-kind link table hardcodes the old ids (coordinate with task 3)

## Notes

- Depends on task 4 (`entry_id` wiring) and task 6 (id-naming model + derived-page ids staying unprefixed). `computeEngineLinks` (task 3) must target the final renamed ids — coordinate the link-table strings.
- `workflow` is a reserved workflow-type name (task 6 rejects it) precisely so these fixed-page ids don't collide with derived endpoints.
