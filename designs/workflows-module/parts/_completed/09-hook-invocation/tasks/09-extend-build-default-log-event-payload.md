# Task 9: Extend `buildDefaultLogEventPayload` to accept `comment`

## Context

Part 13's resolver bakes the runtime `comment` field onto every emitted endpoint as `comment: { _payload: 'comment' }` ([makeWorkflowApis.js](../../../../modules/workflows/resolvers/makeWorkflowApis.js), per [Part 13 § Comment mapping](../../13-resolver-apis/design.md#comment-mapping)). The handler side is **not yet wired**: `params.comment` arrives at `handleSubmit.js` but nothing reads it, and the shipped [`buildDefaultLogEventPayload`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js) signature has no `comment` parameter.

Per Part 9's design, layer 3 (runtime `comment`) is folded **into** layer 1 — `buildDefaultLogEventPayload` accepts `comment` and returns layers 1 + 3 already composed; Part 9's `mergeEventOverrides.js` (Task 3) applies layer 2 (YAML) and layer 4 (pre-hook) on top. Without this fold-in the four-layer merge has a silent hole — Task 3's regression test for "YAML cannot clobber `metadata.comment`" fails by default, and a user-supplied comment never reaches the event doc unless an author manually mentions it in YAML or a pre-hook.

This task ships the layer-1+3 fold-in as a Part 9 prerequisite. It supersedes [Part 13 § Pending handler work (part 6 follow-up) step 2](../../13-resolver-apis/design.md#pending-handler-work-part-6-follow-up) — that section's steps 1, 2, 3 are absorbed here and into Task 7 (wiring).

## Task

1. Extend `buildDefaultLogEventPayload` in [`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js) to accept a `comment` parameter:

   ```js
   export function buildDefaultLogEventPayload({
     workflow, action, actionConfig,
     interaction, current_key,
     status_before, status_after,
     appName,
     comment,    // ← new
   }) { ... }
   ```

2. Inject into `metadata.comment` when `comment` is a non-empty string. Drop the key when `comment` is `null`, `undefined`, or `""` (falsy). The comment merge sits in the bottom layer so:
   - **Above** Part 9's layer 2 (YAML `event_overrides[interaction].metadata`) — a YAML-defined `metadata.comment` cannot clobber the user-supplied comment. (Layer 2 overrides land on top of the default payload; the layer-1 `metadata.comment` survives unless layer 2 explicitly sets `metadata.comment`, which the test in Task 3 locks down as the regression case.)
   - **Below** Part 9's layer 4 (pre-hook `event_overrides`) — a pre-hook can still rewrite the comment (e.g. PII scrubbing).

3. Update the function's JSDoc to document the layer-1+3 ordering so future readers / Task 3 implementer keep it correct. Note explicitly: do not re-inject `comment` in `mergeEventOverrides.js`.

4. `dispatchLogEvent` (the wrapper) passes `comment: context.params.comment ?? null` through to `buildDefaultLogEventPayload`. (Task 7 also extends `logEventInputBag` with `comment: params.comment ?? null` — same source, threaded through `dispatchLogEvent` per its existing input-bag convention.)

5. Colocated `dispatchLogEvent.test.js` covers:
   - `comment: 'hello'` → `metadata.comment === 'hello'`.
   - `comment: null` → no `metadata.comment` key on the payload.
   - `comment: ''` → no `metadata.comment` key.
   - `comment: undefined` → no `metadata.comment` key.

## Acceptance Criteria

- `buildDefaultLogEventPayload` accepts `comment`; injects into `metadata.comment` iff non-empty string.
- `dispatchLogEvent` reads `context.params.comment ?? null` and threads it through.
- `dispatchLogEvent.test.js` exercises the four cases above.
- JSDoc names the layer-1+3 fold-in and points at the layer-ordering invariant.
- No double-injection: Task 3's `mergeEventOverrides.js` does not also handle `comment`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js` — extend (create if absent).

## Notes

- Pre-existing parameters on `buildDefaultLogEventPayload` keep their semantics. Only `comment` is new.
- This task is a Part 9 prerequisite (blocks Tasks 3 and 7). Logically it could ship as its own PR before the four-layer merge lands, since `dispatchLogEvent` continues to work without a caller passing `comment` (defaulting to `null`).
- After this task lands, Part 13's "Pending handler work (part 6 follow-up)" section is fully superseded — annotate that section to point at Part 9 Task 9.
