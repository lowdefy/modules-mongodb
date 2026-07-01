# Task 12: Step 6 — Merge `form` + `form_review` into one flat bag, `$set` per-field at `form_data.{action_type}[.{key}].{field}`

## Context

[design.md § Lifecycle scaffold step 6](../design.md#lifecycle-scaffold):

> Write `form_data` — merge `form` and `form_review` from the endpoint payload into one flat bag (per [engine/spec.md § Form data layout](../../../../workflows-module-concept/engine/spec.md#form-data-layout) — no `.review` sub-key), then `$set` per-field at `form_data.{action_type}[.{key}].{field}`. Field collisions are author error; engine doesn't disambiguate. Part 9's `form_overrides` merge layers on top of this in the same write.

[engine/spec.md § Form data layout](../../../../workflows-module-concept/engine/spec.md#form-data-layout) commits the path rules:

- Non-keyed: `form_data.{action_type}.{field}`.
- Keyed: `form_data.{action_type}.{key}.{field}`.
- No `.review` / `.error` namespace — submitter (`form:`) and reviewer (`form_review:`) values share the action-type tree.

[engine/spec.md § Form data layout — Write semantics](../../../../workflows-module-concept/engine/spec.md#form-data-layout):

> per-field `$set` on dot-notation paths. Field-level granularity so concurrent edits on different fields don't clobber. Submitter (`form:`) and reviewer (`form_review:`) payloads are merged into one bag before write; the engine doesn't disambiguate.

V0 reference: v0 wrote `form_data` differently (full-object replacement on the workflow doc). The new design's per-field dot-notation `$set` is intentional — protects against concurrent edits on different fields and avoids losing data when two browsers post the same action concurrently.

Part 9's `form_overrides` merge defers to [part 9](../../09-hook-invocation/design.md). v1 just merges `form` + `form_review`.

## Task

Replace the `// Step 6 — Write form_data` TODO in `handleSubmit.js` with:

```js
// Step 6 — Write form_data (merge form + form_review, $set per-field).
const formMerged = {
  ...(context.params.form ?? {}),
  ...(context.params.form_review ?? {}),
};

// PART 9 EXTENSION: part 9's pre-hook `form_overrides` merges on top of formMerged here.
// Pre-hook overrides win on field collision; skipped entirely when hook_error is set.

if (Object.keys(formMerged).length > 0) {
  const formDataPathPrefix = context.params.current_key
    ? `form_data.${context.action.type}.${context.params.current_key}`
    : `form_data.${context.action.type}`;

  const setOps = {
    updated: context.changeStamp,
  };
  for (const [field, value] of Object.entries(formMerged)) {
    setOps[`${formDataPathPrefix}.${field}`] = value;
  }

  await context.mongoDBConnection("workflows").MongoDBUpdateOne({
    filter: { _id: context.workflow._id },
    update: { $set: setOps },
  });
}
```

Key behaviour:

- Merge order: spread `form` first, then `form_review`. On field collision, `form_review` wins. Per the design, "field collisions are author error" — but a deterministic merge order is still needed; `form_review` overriding matches v0 and is the safer default (reviewers' edits supersede submitters').
- Per-field `$set` keys use dot-notation: `form_data.qualify.contractor_name` for non-keyed; `form_data.proof-of-installation.serial-A1.contractor_name` for keyed.
- Skip the write entirely if `formMerged` is empty (`not_required` / `approve` / `request_changes` interactions often carry no form payload — avoiding an empty `MongoDBUpdateOne` round-trip).
- `updated: context.changeStamp` is set alongside the form-data paths so the workflow doc's `updated` reflects this step.

## Acceptance Criteria

- Step 6's TODO marker in `handleSubmit.js` is replaced with the body above.
- `form` and `form_review` from `context.params` are merged via spread; later spread wins (`form_review` overrides `form` on collision).
- Empty merged bag → no Mongo call (early-return-style guard).
- Dot-notation `$set` paths:
  - Non-keyed: `form_data.{action_type}.{field}`.
  - Keyed (when `params.current_key` is set): `form_data.{action_type}.{current_key}.{field}`.
- One `MongoDBUpdateOne` call against the workflows collection per call, `$set` covers all fields + `updated`.
- Inline comment names part 9 as the `form_overrides` extension owner.
- `handleSubmit.test.js` extended with cases (using `inMemoryMongo`):
  - Form submit with `form: { contractor: 'ACME' }` on non-keyed action `qualify`: workflow doc has `form_data.qualify.contractor === 'ACME'`.
  - Review submit with `form: { score: 5 }` and `form_review: { reviewer_notes: 'ok' }` on non-keyed `qualify`: workflow doc has both fields under `form_data.qualify`.
  - Keyed action submit with `form: { serial: 'A1' }`, `current_key: 'device-1'`, action type `proof-of-installation`: workflow doc has `form_data.proof-of-installation.device-1.serial === 'A1'`.
  - Field collision: `form: { x: 1 }` + `form_review: { x: 2 }` → workflow doc has `form_data.{type}.x === 2` (form_review wins).
  - `not_required` interaction with no `form` / `form_review`: no Mongo call fires (workflow doc `form_data` unchanged from pre-state).
  - Two concurrent submits to different fields of the same action: both succeed without clobbering (assert against an `inMemoryMongo` parallel-write fixture if reasonable; otherwise, document as e2e-only coverage in [part 22](../../22-workflows-e2e-suite/design.md)).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — fill in step 6 body.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.test.js` — modify — add the six cases above.

## Notes

- **The "no `.error` namespace" rule.** Error context lives on the action doc's `status[0]` entry (per [engine/spec.md § Action `error` transition](../../../../workflows-module-concept/engine/spec.md#action-error-transition)), not on the workflow's `form_data`. Step 6 never writes to a `.error` sub-key. The mid-write error wrapper (task 13) writes to the action doc's status array via `updateAction(...force: true)`; this step is purely the form-data merge.
- **`form_review` wins on collision.** This is a deterministic merge order; the design says collisions are "author error" but doesn't commit a precedence direction. The choice here matches the practical reality that review fields are written after the original form fields chronologically (review action follows the submit action in the workflow), so the reviewer's value is the more recent intent.
- **`updated` on the workflow doc.** Both step 5 (summary) and step 6 (form_data) set `updated: context.changeStamp`. The two writes are independent; the second one no-ops on `updated` since the same value lands twice. That's fine — same `changeStamp` value, idempotent.
- **No write for empty payload is a real path.** `not_required` / `approve` / `request_changes` interactions on form actions that don't carry data through these buttons hit this case. Avoiding the round-trip keeps the lifecycle cheap for those interactions.
