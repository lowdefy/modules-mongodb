# Task 1: Validate `pages.{verb}.buttons.extra` in `makeWorkflowsConfig.js`

## Context

Part 36 adds an authoring slot — `pages.{verb}.buttons.extra:` — that lets app authors place app-specific buttons into the workflows `floating-actions` bar alongside the template-shipped signal buttons. The build-time validator `modules/workflows/resolvers/makeWorkflowsConfig.js` must enforce the slot's shape so misconfigured config fails the build instead of silently rendering nothing.

Today `validateAction` (in `makeWorkflowsConfig.js`) performs **no `pages` structure validation at all** — unknown keys under `pages` pass through silently. Without an explicit check, a `buttons.extra` on a non-form action (which emits no verb pages — `makeActionPages.js:54` returns `[]` for non-form kinds) would be silently dropped and the author would never see their button. Silent ignore is exactly the drift the validator exists to prevent.

Note: `pages` is build-time-only and is **not** carried onto the runtime config (it is excluded from `ACTION_FIELDS`). Validation still runs against the raw authored action object inside `validateAction`, so reading `action.pages` there is correct.

The seven reserved block ids are the signal/nav buttons Part 39 ships into the bars (verified against the current templates):

- `button_submit`, `button_progress` (Save Draft), `button_not_required` — edit bar
- `button_approve`, `button_request_changes`, `button_edit` — review bar (`button_edit` is the Edit-nav `Button`)
- `button_resolve_error` — error bar
- `button_request_changes` and `button_edit` **also** appear on the view bar — which is exactly why reservation is **global** (any reserved id rejected on every verb), not per-page.

## Task

In `modules/workflows/resolvers/makeWorkflowsConfig.js`:

1. **Add a `RESERVED_BUTTON_IDS` constant** (a `Set` or array) near the other module-level constants (e.g. alongside `ACCESS_VERBS` / `UNIVERSAL_FIELDS`), holding exactly the seven ids:

   ```js
   const RESERVED_BUTTON_IDS = [
     "button_submit",
     "button_progress",
     "button_not_required",
     "button_approve",
     "button_request_changes",
     "button_resolve_error",
     "button_edit",
   ];
   ```

   Add a short comment explaining: these mirror the hardcoded `id:` values in the verb templates; the duplication is acknowledged (each new signal-button part touches both the template button block and this constant); reservation is global.

2. **Add a `validatePagesExtraButtons(workflow, action)` function** following the existing validator-helper style (use the `fail(workflow.type, message)` helper and a `where = \`action "${action.type}"\``prefix). The four bar verbs are`edit`, `view`, `review`, `error`. Logic:

   - If `action.pages` is absent, return.
   - **Non-form actions** (`action.kind !== "form"`): if **any** verb's `pages.{verb}.buttons.extra` is present (`!== undefined`), `fail` with a message explaining the slot is form-action only — `check` / `tracker` actions emit no verb pages so the slot would never render. Name the offending verb.
   - **Form actions**: for each of the four bar verbs, if `pages.{verb}.buttons.extra` is present:
     - It must be an array — else `fail`.
     - Each entry must be a plain object with a **string** `id` — else `fail` (name the verb and entry index).
     - Each entry's `id` must **not** be in `RESERVED_BUTTON_IDS` — else `fail` (message naming the reserved id and that it collides with a template-shipped button; reservation is global so reject on every verb).
     - Each entry must have `events.onClick` that is an **array** — else `fail`.
     - Do **not** type-check what `onClick` does (structural only — Decision 3 in the design). An extra may legitimately call any endpoint.

3. **Wire it into `validateAction`** — add a `validatePagesExtraButtons(workflow, action)` call alongside the other `validate*` calls at the end of `validateAction`.

## Acceptance Criteria

- `RESERVED_BUTTON_IDS` constant present with exactly the seven ids listed above.
- `validateAction` rejects, for a **form** action: a non-array `buttons.extra`; an entry missing `id` (or non-string `id`); an entry whose `id` is any of the seven reserved ids (on any verb, including a reserved id on a page that doesn't ship that button); an entry missing `events.onClick` or whose `events.onClick` is not an array.
- `validateAction` accepts a valid `buttons.extra` array on any of `edit`/`view`/`review`/`error` of a form action.
- `validateAction` rejects a present `buttons.extra` on a `check` action and on a `tracker` action.
- Error messages follow the existing `makeWorkflowsConfig: workflow "<type>": action "<type>" ...` format.
- New unit cases added to `makeWorkflowsConfig.test.js` (see below) all pass; run `pnpm --filter @lowdefy/workflows test` (or the repo's vitest/jest runner for this module) and the existing suite stays green.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — add `RESERVED_BUTTON_IDS` constant, add `validatePagesExtraButtons`, call it from `validateAction`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add the cases below.

## Unit test cases (per design Verification)

Add to `makeWorkflowsConfig.test.js`. Use the existing `validWorkflow` fixture shape (a workflow with `entity` block + `actions`). For form-action cases, the action needs `kind: "form"` and a `form:` block (a non-empty `form` array, e.g. `[{ id: "x", type: "TextInput" }]`) so the kind-form guard passes. Build the action's `pages` object inline per case.

- (a) valid `buttons.extra` array on `pages.edit` passes (`.not.toThrow()`).
- (b) non-array `buttons.extra` (e.g. `"nope"`) rejected.
- (c) entry missing `id` rejected.
- (d) entry missing `events.onClick` rejected.
- (e) `id: button_submit` in `pages.edit.buttons.extra` rejected.
- (e2) `id: button_progress` in `pages.edit.buttons.extra` rejected.
- (f) `id: button_resolve_error` in `pages.error.buttons.extra` rejected.
- (f2) `id: button_edit` in `pages.review.buttons.extra` rejected (nav buttons reserve their ids too).
- (f3) `id: button_approve` in `pages.edit.buttons.extra` rejected — even though the edit bar ships no approve button (pins global, not per-page, reservation).
- (g) valid `buttons.extra` on `pages.view` of a form action passes.
- (h) `pages.edit.buttons.extra` on a `check` (non-form) action rejected.
- (h2) `pages.edit.buttons.extra` on a `tracker` action rejected.

## Notes

- A valid `buttons.extra` entry for the passing cases looks like: `{ id: "open_help", title: "Help", events: { onClick: [{ id: "nav", type: "Link", params: { url: "https://x" } }] } }`.
- `view` **is** a supported bar verb here — earlier draft scoping that excluded it is superseded; the slot works uniformly across all four form verb pages.
- Keep the validation structural only — do not validate `title`, `type`, `icon`, `visible`, or `disabled` shapes, and do not inspect the contents of `onClick` actions.
