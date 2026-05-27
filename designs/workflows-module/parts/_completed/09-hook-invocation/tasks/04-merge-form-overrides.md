# Task 4: `mergeFormOverrides.js` — field-path level form-overrides merge

## Context

Part 6's step 6 writes form data via per-field `$set` ops on the workflow doc ([handleSubmit.js:274–301](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js)):

```js
const formMerged = {
  ...(context.params.form ?? {}),
  ...(context.params.form_review ?? {}),
};
```

then for each `field` in `formMerged`, `setOps[\`form_data.{action_type}[.{key}].${field}\`] = value`.

Part 9 adds a third source: the pre-hook return's `form_overrides`. Per design: the merge is at the **field-path level** (matching Part 6's per-field `$set` posture), not a document-level replace. A pre-hook `form_overrides: { a: 1 }` plus a user `form: { b: 2 }` results in `$set` ops for **both** `a` and `b`. Pre-hook overrides win on field collision.

## Task

1. Create `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeFormOverrides.js`. Export default function with the signature:

   ```js
   mergeFormOverrides({
     form,           // params.form — flat key/value bag, may be undefined
     formReview,     // params.form_review — flat key/value bag, may be undefined
     preHookOverrides, // pre-hook return `form_overrides` — flat key/value bag, may be undefined
   }) → Object  // flat key/value bag of all fields to $set
   ```

2. Implementation: merge in order `form` → `form_review` → `preHookOverrides` (last wins on collision). Empty / undefined sources contribute nothing.

3. Colocated `mergeFormOverrides.test.js` covers:
   - All three empty → returns `{}`.
   - `form: { a: 1 }`, no `form_review`, no `preHookOverrides` → `{ a: 1 }` (identical to today's behaviour without pre-hook).
   - `form: { a: 1 }`, `form_review: { b: 2 }` → `{ a: 1, b: 2 }`.
   - `form: { a: 1 }`, `preHookOverrides: { b: 2 }` → `{ a: 1, b: 2 }` (the explicit design example — field-path merge, not replace).
   - `form: { a: 1 }`, `preHookOverrides: { a: 99 }` → `{ a: 99 }` (pre-hook wins on field collision).
   - `form_review: { a: 1 }`, `preHookOverrides: { a: 99 }` → `{ a: 99 }`.
   - `form: { a: 1, b: 2 }`, `form_review: { b: 'review' }`, `preHookOverrides: { c: 3 }` → `{ a: 1, b: 'review', c: 3 }`.

## Acceptance Criteria

- `mergeFormOverrides.js` exists; pure function.
- `mergeFormOverrides.test.js` exists with the cases above; all pass.
- Output is shape-compatible with the downstream `setOps` builder in step 6.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeFormOverrides.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/mergeFormOverrides.test.js` — create.

## Notes

- The function intentionally does not build the dotted `form_data.{type}[.{key}].{field}` keys — that prefix construction stays in step 6's handler code, and the merge is purely about which fields to write. Keeping the util's output flat (`{ field: value }`) lets the handler add the prefix exactly once at the call site.
- Empty pre-hook overrides (`{}`) should behave identically to undefined.
