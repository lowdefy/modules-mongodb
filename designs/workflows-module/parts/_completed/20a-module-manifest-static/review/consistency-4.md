# Consistency Review 4

## Summary

User-initiated principle clarification: module exports go through `exports.components` and the `components:` block, not the `global:` register. The principle was already partially in effect on disk (the two enums declared as components) but three drift points remained: the on-disk manifest's `global: action_form_configs`, the shipped pages' `_global:` consumer reads, and the concept spec's `global:` block. All three folded into 20a's scope per user direction ("20a should also update the code through a task").

## Files reviewed

- **Design:** `designs/workflows-module/parts/20a-module-manifest-static/design.md`
- **Reviews:** `review/review-1.md`, `review/consistency-2.md`, `review/consistency-3.md`
- **Tasks:** `tasks/tasks.md` + `tasks/01..08-*.md`
- **Cross-referenced sources:** `designs/workflows-module-concept/module-surface/spec.md`, the on-disk `modules/workflows/module.lowdefy.yaml`, the six shipped consumer files under `modules/workflows/{pages,components}/`.

## Inconsistencies found

### 1. Module exposed `action_form_configs` via `global:` instead of `components:`

**Type:** Internal contradiction with the module's own exports principle.
**Source of truth:** Project convention (modules expose addressable surfaces via `_ref: { module, component }`; the `global:` register is app-level state, not a module export channel) + the on-disk manifest's own correct treatment of `action_statuses` / `workflow_lifecycle_stages` as components.
**Files affected:** `modules/workflows/module.lowdefy.yaml` lines 123–130; `designs/workflows-module-concept/module-surface/spec.md` lines 113–117 (which still describes the enums under `global:` too).
**Resolution:** Added a new "Convert `global:` exports to `components:`" section to `design.md`; expanded "Proposed change" with steps 7 (manifest+spec migration) and 8 (consumer-page rewrites); created `tasks/09-migrate-global-to-components.md` and `tasks/10-rewrite-global-consumer-sites.md`. The Goal section was updated to call out the conversion. Task 3 (README) was amended to list `action_form_configs` under Components.

### 2. Shipped pages consumed enums via `_global:` even though manifest declared them as components

**Type:** On-disk drift between declaration and consumption.
**Source of truth:** The principle (components are read via `_ref: { module, component }`) + the on-disk manifest (declares enums under `components:`).
**Files affected:** `modules/workflows/pages/task-edit.yaml`, `pages/task-view.yaml`, `pages/task-review.yaml`, `pages/workflow-overview.yaml`, `pages/group-overview.yaml`, `components/workflow-header.yaml` — 19 total `_global:` read sites across six files.
**Resolution:** Task 10 enumerates every site and specifies the rewrite. Two patterns identified:
- **Pattern 1 (clean swap):** `_global: <enum-name>` used as a `_js` param — drops in as `_ref: { module: workflows, component: <enum-name> }`. One site (`task-edit.yaml:146`).
- **Pattern 2 (runtime indexed access):** `_global: { _string.concat: [<enum>., <runtime-key>, .<field>] }` — rewrite to a `_js` block with two params (the resolved component object + the runtime key) that does the indexing inside the body. 18 sites across the other five files.

The pairing of task 9 (declaration) and task 10 (consumers) was made explicit in `tasks.md`'s ordering rationale: never ship 9 without 10 close behind, or runtime reads collapse to `undefined`.

### 3. Concept spec describes enums under `global:`

**Type:** Concept-spec drift behind on-disk reality.
**Source of truth:** The on-disk manifest (correct) + the principle.
**Files affected:** `designs/workflows-module-concept/module-surface/spec.md` lines 113–117 + the static `exports.components` block earlier in the same file.
**Resolution:** Folded into task 9. The task spec calls out the two edits — move the enums from `global:` to `components:` in the inline manifest example, and add their IDs to the static `exports.components` list. Delete the now-empty `global:` block.

## No issues found in

- The `dependencies` block resolution from consistency-3 (`[layout, events]`) — unchanged by this expansion.
- The connection-ID alignment from consistency-3 (`leads-collection` everywhere) — unchanged.
- The Part 27 retirement from consistency-2 — unchanged.
- The README authoring brief (task 3) — minor update to list `action_form_configs` under Components, but the section structure and other content are intact.
- Tasks 1, 2, 4, 5, 6, 7, 8 — no changes needed; task 8's e2e spec relies on rendered page state which is preserved (tasks 9+10 are behavioural no-ops for read-only consumption).

## Notes

- The `apps/demo/.lowdefy/server/lowdefy-build/tailwind/*.html` artefacts carry stale `action_statuses.` / `workflow_lifecycle_stages.null.*` strings. These are build outputs, not source; they regenerate on the next `pnpm ldf:b`. Task 10 explicitly notes not to hand-edit them.
- The pattern-2 rewrite is the only meaningful work in task 10 — pattern 1 is a one-line drop-in. The pattern-2 rewrite preserves runtime behaviour exactly: same enum data, same indexing, same output. The only difference is build-time vs runtime resolution of the enum object's identity.
- Historical references to `_global: action_*` inside `_completed/{17,18,25}/tasks/` were not edited (per the "Review changes touching implemented parts" memory — historical records of what those parts shipped at the time).
