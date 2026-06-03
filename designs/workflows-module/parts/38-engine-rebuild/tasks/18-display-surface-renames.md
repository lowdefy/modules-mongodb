# Task 18: Display surface renames + projection fixes

## Context

Part 34 D10 reserves the `workflow-*` glob space for the module's **fixed** pages (so `{entry_id}/workflow-*` slices module infrastructure, disjoint from per-type derived endpoints). This means renaming the module's fixed pages to carry the `workflow-` prefix and updating every `_module.pageId` reference. Derived per-type page ids stay unprefixed (handled in task 6).

## Task

**Rename fixed module pages** (page `id` gains the `workflow-` prefix; the shared simple-kind pages also swap the kind word for the domain noun — `simple` → `action` — so no kind name ever appears in a route; review-14 #1 pulled this forward from Part 43, which shrinks to the `simple` → `check` kind sweep):

- `modules/workflows/pages/group-overview.yaml` → `workflow-group-overview.yaml` (id `group-overview` → `workflow-group-overview`). Page-side reads are unchanged — the page already reads `actions_list.$.message` and renders the singular `actions_list.$.link` (shipped in the May 26 overview rework); the single link is resolved server-side by the shared `resolve_action_link.yaml` stage adopted by `get-action-group-overview` (Part 42 D5), not in the UI.
- `modules/workflows/pages/simple-view.yaml` → `workflow-action-view.yaml`
- `modules/workflows/pages/simple-edit.yaml` → `workflow-action-edit.yaml`
- `modules/workflows/pages/simple-review.yaml` → `workflow-action-review.yaml`
- `workflow-overview.yaml` is already conformant — no rename.

**Update all references to the renamed ids:**

- Every `_module.pageId: simple-*` reference — inside `simple-edit`/`simple-review` themselves, and in `computeEngineLinks`'s simple-kind link table (task 3) → `workflow-action-*`.
- While flipping the link table, fix the simple-kind `error`-verb target (review-14 #4): there is no error page for the simple kind (Part 40 D4 — recovery is a `resolve_error` button on the view page), so the `error` verb links to **`workflow-action-view`**, not a nonexistent `workflow-action-error`. Update `computeEngineLinks.test.js` (currently asserts the nonexistent page). Form kind unchanged — generated `{workflow_type}-{action_type}-error` pages exist.
- The `_module.pageId: group-overview` references → `workflow-group-overview`.
- The `pages:` `_ref` paths in `modules/workflows/module.lowdefy.yaml` → the renamed files.
- The `exports.pages` ids in `module.lowdefy.yaml` (if listed).

## Acceptance Criteria

- Fixed pages renamed to `workflow-group-overview`, `workflow-action-view/edit/review`; `workflow-overview` unchanged.
- No dangling `_module.pageId: simple-*` or `group-overview` references remain in the module tree (`modules/workflows/` + `plugins/`; grep clean). The demo's stale refs (`apps/demo/.../onboarding/schedule-followup.yaml` link cells) are accepted-by-design until Part 45 deletes and re-authors the config.
- `module.lowdefy.yaml` `pages:` `_ref` paths + export ids point at the renamed files.
- `workflow-group-overview` page-side reads are unchanged (`.message` + singular `.link`); the API-side link projection is replaced by Part 42 D5's `resolve_action_link.yaml` (owned by Part 42, not this task).
- `computeEngineLinks`' fixed-page link targets use `workflow-action-{verb}`, except the simple-kind `error` verb, which targets `workflow-action-view` (no error page exists — Part 40 D4 / review-14 #4); tests updated to match.
- The module builds; the demo (rebuilt by Part 45) resolves these pages.

## Files

- `modules/workflows/pages/group-overview.yaml` → rename to `workflow-group-overview.yaml` (rename + reference updates only; page reads unchanged)
- `modules/workflows/components/actions-on-entity.yaml` — modify (`_module.pageId: group-overview` at line 78 → `workflow-group-overview`)
- `modules/workflows/pages/simple-view.yaml` → rename to `workflow-action-view.yaml`
- `modules/workflows/pages/simple-edit.yaml` → rename to `workflow-action-edit.yaml` (+ update internal `_module.pageId` refs)
- `modules/workflows/pages/simple-review.yaml` → rename to `workflow-action-review.yaml` (+ update internal refs)
- `modules/workflows/module.lowdefy.yaml` — modify (`pages:` `_ref` paths + export ids)
- `plugins/.../shared/render/computeEngineLinks.js` — modify (the simple-kind link table hardcodes `workflow-simple-${verb}` at line 86 and the header comment at line 16; flip to `workflow-action-${verb}`, with the `error` verb → `workflow-action-view` per review-14 #4)
- `plugins/.../shared/render/computeEngineLinks.test.js` — modify (asserts `workflows/workflow-simple-*` incl. the nonexistent `workflow-simple-error` at line 76)
- `plugins/.../shared/phases/planners/planActionTransition.test.js` — modify (fixtures assert `workflows/workflow-simple-edit` links at lines 155, 247, 251 — task 10's implemented output)
- `modules/workflows/components/universal-fields/universal-fields.yaml` — modify (header comment names the `simple-*` pages)
- `modules/workflows/README.md` — modify (Pages table rows for `simple-edit` / `simple-view` / `simple-review`)

## Notes

- Depends on task 4 (`entry_id` wiring) and task 6 (id-naming model + derived-page ids staying unprefixed). `computeEngineLinks` (task 3) must target the final renamed ids — coordinate the link-table strings.
- **Catch-up scope.** Tasks 1–16 were implemented before review-14 settled the final `workflow-action-*` ids, so this task is the catch-up for every implemented surface carrying the interim `workflow-simple-*` strings: the task-3 link table + its test, and task 10's `planActionTransition.test.js` link fixtures. The Files list above enumerates the exact sites; after this task, `grep -r "workflow-simple\|simple-view\|simple-edit\|simple-review"` over `plugins/` + `modules/workflows/` must come back empty (the demo tree is exempt per acceptance criterion 2).
- `workflow-action-*` are the **final** ids (review-14 #1): the `workflow-` prefix keeps the shared pages inside Part 34 D10's fixed-page glob (`{entry_id}/workflow-*`), and `action` as the domain noun keeps kind names out of routes permanently — Part 43's kind rename (`simple` → `check`) no longer touches any page id.
- `workflow` is a reserved workflow-type name (task 6 rejects it) precisely so these fixed-page ids don't collide with derived endpoints. No additional reserved name is needed — `workflow-action-*` lives inside the already-reserved `workflow-*` space.
- Interim breakage (accepted): between Part 38 (the engine stops writing the singular `link` cell) and Part 42 (the API adopts `resolve_action_link.yaml`), `get-action-group-overview`'s `link:` projection reads a field that no longer exists, so group-overview link buttons render nothing in that window. Accepted by the landing chain — the demo, the only in-tree exercise of the page, lands at Part 45 after Part 42.
