# Task 7: Verify Part 13 emits no trailing `:if` / `:reject` control step on per-action endpoints

## Context

Part 29's `:reject` propagation depends on **no engine-side discrimination** — once the upstream `runRoutine.js` tweak (Task 1) lands, a `:reject` from a workflows pre-hook propagates transparently as a `UserError(isReject: true)` throw and is classified at the wrapping per-action endpoint's `runRoutine`.

That means Part 13 (the resolver that builds per-action API endpoints) **must not** emit a trailing `:if` / `:reject` control step at the end of per-action endpoints. Earlier drafts of the engine spec contemplated this; Part 29's D5 explicitly removes it.

Part 13 is in-flight on this branch. Verify the design and any draft implementation do not emit such a step.

## Task

### Design verification — `designs/workflows-module/parts/13-resolver-apis/design.md`

- Search the design for any reference to a trailing `:if` / `:reject` step on per-action endpoints, or to engine-side reject discrimination after the pre-hook call:

  ```bash
  rg -nE ':reject|:if|trailing.*step|reject.*step' designs/workflows-module/parts/13-resolver-apis/design.md
  ```

- If any such reference exists, remove it and add a short note that reject propagates transparently per Part 29's upstream tweak. Cite [Part 29 § D5](../design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently).

- If no such reference exists, add a single line to Part 13's "Contract to neighbours" / "Depends on" / equivalent section confirming the no-trailing-step posture:

  > Per Part 29 § D5, per-action endpoints emit no trailing `:if`/`:reject` control step. Pre-hook rejects propagate transparently as a `UserError(isReject: true)` throw and are classified at the wrapping endpoint's `runRoutine`.

### Implementation verification — `plugins/modules-mongodb-plugins/src/resolvers/` (or wherever Part 13's `makeWorkflowApis` lives)

- Find the resolver that emits per-action endpoints (Part 13 § Hook emission). Read it.
- Confirm it constructs each endpoint's `routine` as: `[validate?, pre-hook callApi, plugin-invocation step, post-hook callApi]` — **without** a trailing `:if` / `:reject` step.
- If a draft emits such a step, remove it. Otherwise, leave the file as-is.

### Tests

- If Part 13 has implementation tests (`makeWorkflowApis.test.js` or similar), confirm none assert the presence of a trailing `:if` / `:reject` step on the emitted endpoint shape. If any do, remove those assertions and add a comment referencing Part 29's reject-propagation contract.

## Acceptance Criteria

- Part 13 design has no surviving reference to a trailing `:if` / `:reject` step on per-action endpoints; or, if no such reference existed, the no-trailing-step posture is stated once explicitly.
- Any Part 13 draft implementation emits endpoints without a trailing `:reject` step.
- Part 13 tests (if present) do not assert on a trailing reject step.

## Files

- `designs/workflows-module/parts/13-resolver-apis/design.md` — modify if needed.
- `plugins/modules-mongodb-plugins/src/resolvers/makeWorkflowApis.js` (or equivalent) — modify if needed.
- `plugins/modules-mongodb-plugins/src/resolvers/makeWorkflowApis.test.js` (or equivalent) — modify if needed.

## Notes

- This is a small verification task. Most of the work may be reading and confirming. If everything is already aligned, write a one-line confirmation note in the design and stop.
- Coordinate with whoever owns Part 13's in-flight implementation. If they're mid-flight, leave a comment on their PR / issue rather than editing the file directly.
