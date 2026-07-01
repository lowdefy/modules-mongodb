# Task 2: Register `kind: custom` and reject kind-shape blocks

## Context

Build-time action validation lives in
`modules/workflows/resolvers/makeWorkflowsConfig.js`. The legal kinds are declared
in `ACTION_KINDS` (line 81):

```js
const ACTION_KINDS = ["form", "check", "tracker"];
```

`validateAction` (line 519) rejects unknown kinds with the message
`expected form, check, or tracker` (line 525) and enforces the kind-shape rules —
notably (line 535):

```js
if (action.kind === "check" && (action.form || action.tracker)) {
  fail(
    workflow.type,
    `${where} has kind "check" but defines form: or tracker:.`,
  );
}
```

`custom` is a `check`-clone: it accepts everything check accepts (`key`, `hooks`,
`event`, `status_map`, `access`, `action_group`, `blocked_by`,
`required_after_close`, `allow_not_required`, `universal_fields`, the universal
fields) and rejects the kind-shape blocks `form:` and `tracker:`. `kind` already
flows into the runtime `workflowsConfig` via the existing `ACTION_FIELDS` pick — so
this is a new enum value only, no schema-shape change.

Note: `validateStatusMapCells` already has an `isCustom = action.kind === "custom"`
branch, but it is unreachable until `custom` is in `ACTION_KINDS`. The
cell-validation work (the `view_link:` permit + shared validator) is **task 3** —
do not do it here.

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

1. Add `"custom"` to `ACTION_KINDS`.
2. Update the unknown-kind error message (line 525) to list `custom` —
   e.g. `expected form, check, custom, or tracker`.
3. Extend the kind-shape guard (line 535) so `kind: custom` rejects `form:` /
   `tracker:` exactly as `check` does:

   ```js
   if (
     (action.kind === "check" || action.kind === "custom") &&
     (action.form || action.tracker)
   ) {
     fail(
       workflow.type,
       `${where} has kind "${action.kind}" but defines form: or tracker:.`,
     );
   }
   ```

   (Adjust the message to interpolate the kind so it stays accurate for both.)

No other validators need changes here — `validateHooks`, `validateEvent`,
`validateActionAccess`, `validateUniversalFields`, `validateActionAccess` all apply
to custom on the same terms as check (no custom-specific rules beyond kind-shape
rejection). Per the design's re-alignment note, `hooks:` and `event:` are
**accepted** for custom.

In `modules/workflows/resolvers/makeWorkflowsConfig.test.js`, add cases:

- A `kind: custom` action with valid `access`/`status_map` validates (no throw).
- `kind: custom` with a `form:` block hard-errors.
- `kind: custom` with a `tracker:` block hard-errors.
- `kind: custom` carries `kind` through into the resulting `workflowsConfig`
  (the `ACTION_FIELDS` pick).

## Acceptance Criteria

- `ACTION_KINDS` includes `"custom"`; unknown-kind message lists it.
- `kind: custom` + `form:`/`tracker:` throws via the extended guard.
- A well-formed `kind: custom` action passes validation and appears in
  `workflowsConfig` with `kind: "custom"`.
- New `makeWorkflowsConfig.test.js` cases pass; existing tests still pass.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — `ACTION_KINDS`, unknown-kind message, kind-shape guard.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add `kind: custom` validation cases.

## Notes

Do **not** touch `validateStatusMapCells` here beyond what already exists — the
`view_link:` permit and shared link-shape validator are task 3, which depends on
this task having made `custom` a live kind.
