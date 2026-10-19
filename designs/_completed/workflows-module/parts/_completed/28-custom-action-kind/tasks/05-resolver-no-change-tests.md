# Task 5: Resolver coverage for custom (no code change)

## Context

(Depends on task 2, which registered `custom` as a valid kind.)

Two resolvers need **no code change** for custom — their existing guards already
do the right thing — but the design calls for tests that pin that behaviour:

- `modules/workflows/resolvers/makeActionPages.js` — `emitForAction` returns `[]`
  for any non-`form` kind (`if (action.kind !== "form") return [];`, line 54). So
  `kind: custom` emits **no** per-action module pages — the app supplies the
  working pages.

- `modules/workflows/resolvers/makeWorkflowApis.js` — the per-workflow loop skips
  only `kind: tracker` (`if (action.kind === "tracker") continue;`, line 325).
  `custom` falls through: it marks the workflow as having a submittable action, so
  the workflow gets its `{type}-submit` and `{type}-update-fields` endpoints plus
  `render_config` (which carries every action's `status_map`, including the custom
  action's link cells). `emitHooks` is gated on `action.hooks`, so a custom action
  with hooks emits its hook `InternalApi`s like check; one without emits none.

## Task

Add tests only:

1. In `modules/workflows/resolvers/makeActionPages.test.js`: a `kind: custom`
   action emits **no** pages.

2. In `modules/workflows/resolvers/makeWorkflowApis.test.js`: a workflow whose only
   submittable action is `kind: custom` is submittable — it emits the
   `{type}-submit` and `{type}-update-fields` endpoints, and the custom action's
   `status_map` appears in the endpoint `render_config`. (Optionally also assert a
   custom action with `hooks:` emits its hook InternalApi, mirroring the check
   behaviour — only if the existing test scaffolding makes this cheap.)

Do not change any resolver source.

## Acceptance Criteria

- `makeActionPages` test confirms `kind: custom` → no pages.
- `makeWorkflowApis` test confirms a custom-only workflow emits `{type}-submit` +
  `{type}-update-fields` and carries the custom `status_map` in `render_config`.
- No resolver source files are modified.
- Both test files pass; existing tests unaffected.

## Files

- `modules/workflows/resolvers/makeActionPages.test.js` — modify — add a `kind: custom` no-pages assertion.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — add a custom-submittable assertion.
