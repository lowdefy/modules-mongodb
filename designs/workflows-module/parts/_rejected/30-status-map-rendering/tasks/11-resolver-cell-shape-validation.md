# Task 11: Resolver cell-shape validation

## Context

`modules/workflows/resolvers/makeWorkflowsConfig.js` already validates that `status_map` keys are valid `ACTION_STATUSES` (lines 154-163). It does **not** validate the shape of cell values — built-in-kind cells can illegally declare `link:` today and nothing catches it. This task adds per-cell shape validation per design D9.

Three rules:

1. **Cell-stage key** must be a valid `ACTION_STATUS` (existing rule, unchanged).
2. **Per-slug value shape**:
   - `kind: task | form | tracker`: `{ message?: string }` only. `link:` rejected with the message: `"link is engine-managed for kind: ${kind}; remove it from status_map.${stage}.${slug}. To restrict navigation per slug, edit access.{slug}.verbs instead."`.
   - `kind: custom`: `{ message?: string, link?: { pageId: string, urlQuery?: object, input?: object } }`.
3. **Reserved key**: `status_title` value must be string or null.

**No coverage requirement.** Cells are optional per stage; sticky display fills the gap. A workflow with no `status_map` at all is valid.

The resolver also currently emits a `status_map_app_slugs` field. Drop it — engine doesn't need it (per design D3).

## Task

1. **`modules/workflows/resolvers/makeWorkflowsConfig.js`**:
   - Add a new function `validateStatusMapCells(workflow, action)` that walks `action.status_map` (if present) and applies the three rules above. Reject with descriptive errors.
   - Call it from the existing action-validation loop, alongside the current status-key check.
   - Remove any code that emits `status_map_app_slugs` onto resolver output.

2. **Tests** — extend `makeWorkflowsConfig.test.js`:
   - Built-in-kind cell with `link:` in a slug throws with the prescribed message.
   - Built-in-kind cell with only `message` passes.
   - `kind: custom` cell with `{ message, link: { pageId, urlQuery } }` passes.
   - `kind: custom` cell with `link.pageId` missing or non-string throws.
   - `status_title: 123` (non-string, non-null) throws.
   - Workflow with no `status_map` at all passes.
   - Workflow with `status_map` covering only a subset of reachable stages passes (no coverage requirement).
   - Resolver output no longer carries `status_map_app_slugs`.

## Acceptance Criteria

- Validator rejects authored `link:` for built-in kinds with the prescribed message.
- Validator accepts the custom-kind shape.
- No coverage validation.
- `status_map_app_slugs` is gone from resolver output.
- All new test cases pass; existing tests continue to pass.
- Demo build (`pnpm ldf:b`) succeeds — confirms Task 10 cleaned the demo configs sufficiently.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify or extend.

## Notes

Tracker actions cannot reach `error` in v1, but with cells optional that doesn't translate into a validator rule. An author who writes `status_map.error.{slug}.message` for a tracker gets dead config but no validation error — accepted cost per D9.
