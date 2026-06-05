# Task 1: Validator — `buttons.extra` structural checks and reserved-id guard

## Context

`modules/workflows/resolvers/makeWorkflowsConfig.js` validates the raw workflow YAML at build time. `validateAction` (called per action from `validateWorkflow`) already runs structural checks for `access`, `status_map`, `hooks`, and `event`. The raw action object still carries `pages` at validation time (it's only excluded from the *normalized output* via `ACTION_FIELDS`), so per-verb page config is reachable as `action.pages?.[verb]`.

Part 36 introduces a new authoring slot, `pages.{verb}.buttons.extra: [...]` — an array of author-composed Lowdefy `Button` blocks that the verb templates concatenate into the `floating-actions` bar (task 2). The validator must check the slot's structure and keep author ids from colliding with the template-shipped signal-button block ids.

The reserved set uses the **post-Part-39** button ids. Part 39 renames `button_submit_edit` → `button_submit` and adds `button_progress` (Save Draft); if Part 39 hasn't landed yet, the constant still uses the post-39 names — it guards author config, not template state (see tasks.md "Cross-part sequencing").

This is a build-time cleanliness check, not an engine boundary: extras may do anything Lowdefy blocks can do, including calling the per-action endpoint. Don't type-check what `events.onClick` does — structural validation only (design Decision 3).

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

1. Add a module-level constant near the other vocab constants (`ACCESS_VERBS`, `ACTION_STATUSES`):

   ```js
   // Block ids of the template-shipped signal buttons (post-Part 39 names).
   // Hand-maintained alongside the hardcoded `id:` values in the verb
   // templates — each new signal-button part touches both (Part 36 item 3).
   const RESERVED_BUTTON_IDS = [
     'button_submit',
     'button_progress',
     'button_not_required',
     'button_approve',
     'button_request_changes',
     'button_resolve_error',
   ];

   // Verbs whose form-action templates offer the `buttons.extra` slot.
   // `view` has a bar (Part 39 D4) but extras on view are deferred (Part 36
   // "Out of scope") — declaring the slot there is a build error.
   const EXTRA_BUTTON_VERBS = ['edit', 'review', 'error'];
   ```

2. Add a `validateButtonsExtra(workflow, action)` function and call it from `validateAction` **for `kind: form` actions only** (the slot only exists on form-action pages; simple-action pages share one experience per verb). Behaviour:

   - For each verb in `['edit', 'review', 'error', 'view']`, read `action.pages?.[verb]?.buttons?.extra`. Skip if absent (`undefined`).
   - If the verb is `view` and the slot is present → `fail(...)` with a message saying extras are not offered on `view` pages (deferred to a follow-on).
   - For the three bar verbs, if present:
     - Must be an array — else `fail` with the offending verb and the received value (`JSON.stringify`), matching the error style of the existing validators.
     - Each entry must be a non-null object with a string `id` — else `fail` naming the verb and index.
     - Each entry must have `events.onClick` as an array — else `fail`. Do not validate the actions inside the array.
     - Entry `id` must not be in `RESERVED_BUTTON_IDS` — else `fail` naming the colliding id and explaining it is a template-shipped signal-button id.

   Follow the existing `fail(workflow.type, \`${where} ...\`)` message convention (`where` = `action "${action.type}"`).

3. In `modules/workflows/resolvers/makeWorkflowsConfig.test.js`, add unit cases (use the existing `validWorkflow` spread pattern; the fixture action needs `kind: 'form'` + a `form:` block to pass the kind check):

   - (a) valid `buttons.extra` array on `pages.edit` passes (and on `review` / `error`).
   - (b) non-array `buttons.extra` (e.g. an object) rejected.
   - (c) entry missing `id` rejected.
   - (d) entry missing `events.onClick` (or with non-array `onClick`) rejected.
   - (e) entry with `id: button_submit` on `edit` rejected.
   - (e2) entry with `id: button_progress` on `edit` rejected.
   - (f) entry with `id: button_resolve_error` on `error` rejected.
   - (g) any `buttons.extra` on `pages.view` rejected.

   A minimal valid entry for fixtures:

   ```js
   { id: 'open_help', title: 'Help', events: { onClick: [{ id: 'nav', type: 'Link', params: {} }] } }
   ```

## Acceptance Criteria

- `validateAction` rejects every malformed shape above with a message naming the workflow type, action type, and verb.
- A form action with no `pages`, no `buttons`, or no `extra` key validates exactly as before (no behaviour change when the slot is absent).
- Simple/tracker actions with stray `pages.*.buttons.extra` are not checked (form kind only — matches the design's "form kind only" scope; simple actions have no `pages` slot anyway).
- All existing tests in `makeWorkflowsConfig.test.js` still pass: `pnpm --filter @lowdefy-modules/workflows test` (or the repo's equivalent test invocation for `modules/workflows`).

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add `RESERVED_BUTTON_IDS`, `EXTRA_BUTTON_VERBS`, `validateButtonsExtra`, call from `validateAction`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add cases (a)–(g).

## Notes

- The reserved set is deliberately duplicated against the hardcoded `id:` values in the verb templates — collapsing it into a single source was considered and rejected as heavier than the duplication is worth (design item 3). Keep the comment on the constant pointing at this tradeoff.
- The check is *not* a security boundary; the error message for reserved-id collisions should say it prevents duplicate block ids in the bar, not that it protects the engine.
