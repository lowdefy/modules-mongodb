# Task 5: Map `comment_visibility` off the request payload on both endpoints

## Context

`modules/workflows/resolvers/makeWorkflowApis.js` builds the per-workflow API endpoints. Each endpoint maps request payload keys onto the engine handler's `properties`. Two endpoints carry a comment today:

- **Submit endpoint** (`emitSubmitEndpoint`, ~`:127`) — `comment: { _payload: "comment" }` in its `properties`.
- **Update-fields endpoint** (`emitFieldsEndpoint`, ~`:183`) — `comment: { _payload: "comment" }` in its `properties`.

Task 4 taught the handlers (`SubmitWorkflowAction` via `planSubmit`, `UpdateActionFields` via `planFieldsUpdate`) to read `params.comment_visibility`. This task makes the endpoints actually pass that key from the client payload, so the handler receives a value rather than always `undefined`.

## Task

In `modules/workflows/resolvers/makeWorkflowApis.js`:

1. In `emitSubmitEndpoint`'s `properties`, add `comment_visibility: { _payload: "comment_visibility" }` beside the existing `comment` mapping.
2. In `emitFieldsEndpoint`'s `properties`, add `comment_visibility: { _payload: "comment_visibility" }` beside the existing `comment` mapping.

No other change — the rest of each endpoint (id, routine, `:return`) is untouched.

## Acceptance Criteria

- Both the `{type}-submit` and `{type}-update-fields` endpoints map `comment_visibility` from the request payload onto the handler properties.
- A client posting `comment_visibility: "internal"` (or `"shared"`, or omitting it) has that value (or `undefined`) delivered to the handler `params`.
- `pnpm ldf:b` (from `apps/demo`) compiles — the generated endpoints are valid config.
- Existing `makeWorkflowApis` resolver tests (if any) still pass.

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — add `comment_visibility: { _payload: "comment_visibility" }` to both `emitSubmitEndpoint` and `emitFieldsEndpoint` properties.

## Notes

- The engine never trusts the client for _who_ sees what: `internal` is honoured only when the connection has `enable_internal_comments: true` (enforced in task 1's fold). Passing the raw payload key here is safe — a crafted `internal` from a flag-off app is coerced to `shared` server-side.
