# Task 4: Thread `comment: params.comment` into `planSubmit`'s event-dispatch call

## Context

After task 3, `planEventDispatch` accepts a `comment` parameter and folds it into the rendered `display.{app_name}.description`. The submit pipeline doesn't pass it yet.

The wire path already exists end-to-end up to the planner: the pages post `comment: { _state: comment }` (the whole TipTap value), `makeWorkflowApis` maps `comment: { _payload: 'comment' }` onto the handler properties (`modules/workflows/resolvers/makeWorkflowApis.js:74`, with a test pinning it for every form/simple endpoint), `handleSubmit` passes `params` whole into `planSubmit`, and `buildHookPayload` already passes `comment: params.comment ?? null` through to hooks. The single missing link is `planSubmit`'s step-7 `planEventDispatch` call (`plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js:188-202`), where `params` is already in scope.

## Task

1. In `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js`, add `comment: params.comment` to the step-7 `planEventDispatch({...})` argument object (alongside `yamlEventOverrides` / `preHookEventOverrides`).
2. In `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js`, add an end-to-end planner assertion using the existing submit fixture:
   - submit with `params.comment = { html: '<p>Looks wrong</p>', text: 'Looks wrong' }` → the planned event doc has `display.{app_name}.description === '<p>Looks wrong</p>'` and `metadata.comment === undefined`;
   - submit without `params.comment` → no `description` key under the app bucket (unless a fixture override sets one).

## Acceptance Criteria

- `planSubmit` passes `params.comment` into `planEventDispatch`.
- The two new assertions pass; the existing `planSubmit` suite stays green: `pnpm test planSubmit` from the repo root.
- Full plugin suite green: `pnpm test` from the repo root.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.js` — modify — one line in the step-7 call.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planSubmit.test.js` — modify — comment-through-the-pipeline assertions.

## Notes

- No change to `handleSubmit.js`, `makeWorkflowApis.js`, or the page payloads — they already carry the comment (design D5 pins the contract: pages keep sending the whole rich-text value; the engine reads `.html`).
- The Start/Cancel/Close handlers don't pass `comment` — correct; lifecycle events carry no comment.
