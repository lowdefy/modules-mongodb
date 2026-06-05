# Task 6: Resolver validation + emitted-id naming (Part 34)

## Context

Part 34's access model lands here. This is build-time resolver work, **independent of the load-plan-commit write path** (per the design's D16 tasking note — task it as its own block, not interleaved with the rebuild core). It validates the new `access` shape, validates status-map cell shapes (Part 30 D9), and fixes the emitted-id naming so the `workflow-*` glob space belongs to the module's fixed pages only.

The `access.{app_name}` shape is a verb→gate map: `view`/`edit`/`review`/`error` → `true | [roles]`. `notification_roles` lives at the action **root**, not under `access`.

## Task

**`modules/workflows/resolvers/makeWorkflowsConfig.js`** — add validators:

- `entity_ref_key` is **required** on every workflow config (sibling of `entity_collection`; non-empty string, e.g. `lead_ids`) — hard-error when absent. It names the event-references key for the workflow's entity (design "Event references"; it replaces the deleted `deriveEntityRefKey` derivation, whose collection-name-plural output contradicted the repo's singular `lead_ids`/`contact_ids` convention).

- `validateActionAccess` (Part 34 D4):
  - Accept the verb→gate map: keys in `{ view, edit, review, error }`, gate values `true | [roles]`.
  - **Hard-error** on: unknown verb keys; the empty-list `[]`; the old shorthand list form (`access.{app}: [view, edit]`); the removed action-wide `access.roles`; any unknown top-level `access` key.
  - **Lint-warn** (not error) when an app block declares `edit`/`review`/`error` without `view`.
  - `notification_roles` at the action root is valid; under `access` it is not.
- `validateStatusMapCells` (Part 30 D9): built-in kinds reject `link:`; `kind: custom` accepts `{ message?, link? }`; no cell-coverage requirement.

**`modules/workflows/resolvers/makeActionPages.js`:**

- Read declared verbs from the `access.{app}` **map keys** (not the old verb array).
- Emitted page ids stay `{workflow_type}-{action_type}-{verb}` — **no `workflow-` prefix** (entry-id scoping handles glob slicing; Part 34 D10).

**`modules/workflows/resolvers/makeWorkflowApis.js`:**

- Emitted Api ids stay `{workflow_type}-{action_type}-{...}` — no `workflow-` prefix.
- Reject a workflow type named `workflow` (reserved — its derived ids would collide with the fixed-page `workflow-*` space; Part 34 D10).

(Note: `makeWorkflowApis` also gets a **payload-mapping** change in task 19 — `signal`/drop-`force`. Keep this task's edits scoped to id naming + reserved-name rejection; task 19 builds on top.)

## Acceptance Criteria

- `validateActionAccess` accepts the verb→gate map and rejects empty-list, shorthand array, action-wide `access.roles`, and unknown top-level keys with clear messages; lint-warns on `edit`/`review`/`error` without `view`.
- `validateStatusMapCells` enforces the Part 30 D9 shape rules.
- `makeActionPages` emits pages from the `access.{app}` map keys, ids unprefixed.
- `makeWorkflowApis` emits unprefixed ids and rejects the reserved `workflow` type.
- Tests (`makeWorkflowsConfig.test.js`, `makeActionPages.test.js`, `makeWorkflowApis.test.js`) cover accept/reject cases and the reserved-name rejection.
- `validateActionAccess`'s role-gate validation is consistent with the shared `gates.fixtures.js` semantics (task 5) — the validator validates *shape*, but where it evaluates gate membership it must agree with the oracle.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify (add `validateActionAccess`, `validateStatusMapCells`)
- `modules/workflows/resolvers/makeActionPages.js` — modify (read verbs from access map keys; unprefixed ids)
- `modules/workflows/resolvers/makeWorkflowApis.js` — modify (unprefixed ids; reject reserved `workflow` type)
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify
- `modules/workflows/resolvers/makeActionPages.test.js` — modify
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify

## Notes

- Part 34 owns the full rationale; D16 records the concrete surfaces. This task is the build-time half of the access cluster.
- The `workflow-` prefix is added to the module's **fixed** pages in task 18 — this task only ensures derived ids stay unprefixed and the reserved name is rejected.
