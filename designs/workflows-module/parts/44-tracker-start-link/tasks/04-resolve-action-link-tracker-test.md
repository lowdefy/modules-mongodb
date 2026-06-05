# Task 4: Tracker-row case in `resolve_action_link` read-side tests

## Context

Part 44 needs **no read-API change**: `planActionTransition` persists the per-verb `{slug}.links` map, and Part 42's shared stage `modules/shared/workflow/resolve_action_link.yaml` — already adopted by all three read APIs (`get-entity-workflows.yaml`, `get-workflow-overview.yaml`, `get-action-group-overview.yaml`) — does the generic priority pick (edit > review > error > view) over non-null link cells ∩ `visible_verbs`. For a pre-child tracker the start link is the only link the engine emits, so the generic pick surfaces it.

Part 44's read-side contribution per the design is a **tracker-row case in `resolve_action_link`'s tests**. Reality check: Part 42 shipped the YAML stage with **no test file** (`git log` confirms; nothing matches `resolve_action_link` under `**/*.test.js`). So this task creates the test file with the tracker-row coverage, following the established resolved-MQL pattern of `modules/workflows/api/stages/visible_verbs_filter.test.js`: the YAML carries build-time Lowdefy operators (`_var` / `_module.var` for `app_name`), so the test mirrors the **resolved** MQL — `app_name` collapsed to a literal — and runs it through `mongodb-memory-server` via the shared `inMemoryMongo` helper.

The stage under test (read it first — `modules/shared/workflow/resolve_action_link.yaml`): a single `$addFields` that sets `link` via `$let` (`app_links` = `$ROOT[app_name].links`, `verbs` = `$visible_verbs`) and a `$switch` prioritizing edit > review > error > view, each case requiring the verb true in `$visible_verbs` AND the cell non-null.

## Task

Create `modules/shared/workflow/resolve_action_link.test.js`:

1. Header comment in the `visible_verbs_filter.test.js` style: states that the test mirrors the RESOLVED MQL of `resolve_action_link.yaml` (`app_name` → literal), why (build-time operators), and that it must run after a `visible_verbs` compute — here supplied as a literal `$addFields` so each case controls the verb booleans directly.
2. A `pipeline(visibleVerbs)` helper returning `[ { $addFields: { visible_verbs: visibleVerbs } }, <resolved resolve_action_link $addFields> ]` — the second stage a faithful JS transcription of the YAML with the `_var`/`_module.var` `app_name` lookup collapsed to `'demo'`.
3. Test cases — the tracker rows Part 44 cares about:
   - **Pre-child tracker, user has `edit`**: action doc with `demo.links = { view: null, edit: { pageId: 'ticket-new', urlQuery: { action_id: 'a1', entity_id: 'ent-1', source: 'onboarding' } }, review: null, error: null }` (the exact shape task 2's arm persists); `visible_verbs = { view: true, edit: true, review: false, error: false }`. Expect `link` to equal the start link — the edit cell wins as the only non-null cell.
   - **Pre-child tracker, view-only user**: same doc, `visible_verbs.edit: false` (`view: true`). Expect `link: null` — the view cell is null pre-child, so a viewer sees the row with no navigation (design worked example step 2).
   - **Started tracker**: `demo.links = { view: { pageId: 'workflows/workflow-overview', urlQuery: { workflow_id: 'w-child' } }, edit: null, ... }`, `visible_verbs.view: true`. Expect the child-overview view link — the post-start replacement behaves.
4. Use `inMemoryMongo` from `../../../plugins/modules-mongodb-plugins/src/connections/shared/inMemoryMongo.js` with the same `beforeAll` / `afterAll` shape as `visible_verbs_filter.test.js`.

## Acceptance Criteria

- The transcribed stage matches `resolve_action_link.yaml` operator-for-operator (same `$getField` nesting, same `$switch` branch order) apart from the resolved `app_name`.
- The three tracker cases pass against `mongodb-memory-server`.
- `npx jest resolve_action_link` passes from repo root (root `jest.config.js` matches `**/*.test.js`, so the new location is picked up).

## Files

- `modules/shared/workflow/resolve_action_link.test.js` — create — resolved-MQL test with tracker-row cases.

## Notes

- **Deviation from the design's assumption, flagged**: the design says "Part 44 adds a tracker-row case to its tests", assuming Part 42 left a test file. None exists, so this task creates it. Keep scope to the tracker rows above — exhaustive verb-priority matrices are Part 42 territory if ever needed; don't backfill them here.
- No changes to any YAML under `modules/` — this task is test-only.
- Depends on task 2 only for the emitted link shape mirrored in the fixtures; it can land in parallel with task 3.
