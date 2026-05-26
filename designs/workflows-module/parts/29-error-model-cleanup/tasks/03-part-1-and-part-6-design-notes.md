# Task 3: Part 1 deviation note + Part 6 § Failure shape rewrite

## Context

Two already-completed part designs need amendments. Per the workflows-module convention, shipped parts aren't reopened wholesale — Part 29 amends them in place (same posture as Part 21 amending shipped Parts 3/4/14, Part 23 reusing shipped Part 5).

- **Part 1** describes a `CallApiResult: { success, response, error? }` envelope and "never throws." Shipped `callApi` (`callRequestResolver.js:29` in the Lowdefy repo) actually throws on `:reject`/`:throw` and returns the raw response on success. Part 29 commits to the shipped throw-on-error contract (the upstream PR in Task 1 extends `runRoutine.js` to classify caught throws by `error.isReject`). Re-specifying `callApi` to honour the never-throws shape is explicitly out of scope.

- **Part 6** § Failure shape describes the catch-converter that synthesises an `error` transition with `{ reason, error_message, error_metadata }` on mid-write failures. Part 29 removes that branch entirely — failures throw, status entries are uniform `{ stage, created, event_id }`.

## Task

### Part 1 — `designs/workflows-module/parts/_completed/01-call-api-primitive/design.md`

Add a "Deviation note" block at the top of the design (after the title / source-rationale line, before § In scope), as a clearly-marked aside. Preserve the original spec text below it as-written.

Suggested content:

```markdown
> **Deviation note (Part 29).** Shipped `callApi` (`packages/api/src/routes/request/callRequestResolver.js` in the Lowdefy repo) throws on `:reject` / `:throw` and returns raw response on success — the `{ success, response, error }` envelope described below was never built. Part 29's [§ D5](../../29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently) operates against the shipped throw-on-error contract via `error.isReject` (see [Part 29 § Upstream dependency](../../29-error-model-cleanup/design.md#upstream-dependency)). Re-specifying `callApi` to the never-throws shape is out of scope — the change would radiate across every existing routine step. The original Part 1 spec text below is preserved as-written; this note flags the divergence for future readers.
```

### Part 6 — `designs/workflows-module/parts/_completed/06-submit-action-writes/design.md`

Rewrite § Failure shape (find the section by heading). The new content:

- Status entries are uniform `{ stage, created, event_id }` — no polymorphic `{ reason, error_message, error_metadata }` fields. (This matches what shipped `shared/updateAction.js` already writes; Part 29 collapses the documented contract to the shipped reality.)
- The submit-pipeline does **not** synthesise an `error` transition on mid-write failure. Sub-step throws propagate to `CallApi` per [Part 29 § D1](../../29-error-model-cleanup/design.md#d1-why-throwing-is-safer-than-force-writing-error). The priority-rule self-exception keeps retries safe under partial writes.
- The handler return shape carries no `error_transition` field. There is no failure-return shape; failures throw.
- Cross-reference Part 29's partial-write retry table (the step-by-step "what's visible after a throw" table in D1) instead of restating it here.

Add a one-liner at the top of the rewritten section: "Amended by Part 29. See [Part 29 § D2a](../../29-error-model-cleanup/design.md#d2a-status-entry-shape-simplification-docstypesreturn-field-cleanup)."

## Acceptance Criteria

- Part 1 design carries a deviation note at the top citing Part 29 and the upstream `callApi` throw contract; the rest of Part 1's text is unchanged.
- Part 6 § Failure shape no longer describes a catch-converter, no longer mentions polymorphic status-entry fields, and no longer documents an `error_transition` return field. It references Part 29 for the new failure semantics.
- Both files remain in their `_completed/` directories.

## Files

- `designs/workflows-module/parts/_completed/01-call-api-primitive/design.md` — modify (add deviation note).
- `designs/workflows-module/parts/_completed/06-submit-action-writes/design.md` — modify (rewrite § Failure shape).

## Notes

- These are doc-only edits; no code or test changes belong in this task.
- Do not move files out of `_completed/`. Both parts stay archived; they are amended in place.
