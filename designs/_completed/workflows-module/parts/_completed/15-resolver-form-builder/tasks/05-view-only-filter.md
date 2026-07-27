# Task 5: Add the `viewOnly` per-field filter to `makeActionsForm`

## Context

Closes [review-2 finding 1](../review/review-2.md). v0's `makeActionsForm` filtered entries whose `viewOnly: true` flag was set on the edit-page render path, allowing authors to declare fields that show on view / review / error pages but suppress on edit. The reference v0 use case at [`dist/.../site-check.yaml:157-160`](../../../../dist/workflows-module/ui/example_workflow/device-installation/site-check.yaml) is a `Validated` timestamp label — meaningful only after approval, nonsensical on the edit page.

Part 15's design now commits to option 1 from the review: the resolver accepts a `mode: 'edit' | 'view' | 'review' | 'error'` var alongside `form:`, drops `viewOnly: true` entries when `mode === 'edit'`, and emits them (with the `viewOnly` key stripped) for the other three modes. Part 16's templates pass `mode` as a per-template literal at the `_ref: { resolver }` call site (see [part 15 design's "Contract to neighbours"](../design.md)).

### Why this is a follow-up task and not folded into task 1

Tasks 1–4 ship a working v1 baseline without this filter. The `viewOnly` capability is a v0 parity item surfaced by review 2 after the baseline implementation landed in the working tree (still uncommitted at the time of writing). Keeping it as a discrete task makes the v0 → v1 parity decision auditable in tasks.md and avoids re-litigating task 1's already-reviewed substitution algorithm.

### Scope boundary

`viewOnly` is the dedicated **edit-page suppressor** and nothing more. Field-level visibility for `view` / `review` / `error` renders remains the author's job via the runtime `visible:` operator. The `mode` var is **only** consumed by the `viewOnly` filter; the resolver does not branch on `mode` for any other purpose.

The metadata emitter (`makeActionFormConfigs`) is unaffected — `viewOnly` is a render-time concern, not a metadata-tree concern. Don't touch task 2's resolver.

## Task

Update three files:

### `modules/workflows/resolvers/makeActionsForm.js`

1. **Accept and validate `mode`.** Pull `mode` from the resolver's `vars` argument. Required when `vars.form` has any entries with `viewOnly: true` on it — fail fast with `makeActionsForm: 'mode' var is required when any form entry has viewOnly: true` so a misconfigured template doesn't silently emit view-only fields on the edit page. When `vars.form` is empty or no entry carries `viewOnly`, `mode` is optional (callers without a mode shouldn't pay the var-passing cost).

2. **Validate `mode` is in the allowed set.** When supplied, `mode` must be one of `'edit' | 'view' | 'review' | 'error'`. Anything else → `makeActionsForm: invalid mode '<value>' (expected one of: edit, view, review, error)`.

3. **Filter `viewOnly: true` entries on edit.** Before walking the form array, filter out entries where `entry.viewOnly === true` if `mode === 'edit'`. For the other three modes, keep the entries.

4. **Strip the `viewOnly` key before substitution.** `viewOnly` is resolver metadata, not a library-component var. Even on non-edit renders where the entry survives the filter, drop `viewOnly` from the entry before it flows into `substituteEntry`. Otherwise Lowdefy's `_ref` resolution sees an unknown `viewOnly` var on the library component and either errors (for strict resolvers) or wastes the substitution slot. Implement as a destructure in the pre-walk step: `const { viewOnly: _v, ...rest } = entry`.

5. **Filter ordering vs. id-collision check.** The id-collision walk runs **after** the filter — collisions between an edit-only field and a `viewOnly: true` field that share an id should not fail the edit-page build, since the `viewOnly` entry isn't in the emitted tree on that page. Run the filter, then `walk(filtered)`, then `checkIdCollisions(substituted)` — the existing ordering in [`makeActionsForm.js:114-118`](../../../../modules/workflows/resolvers/makeActionsForm.js) needs an extra step between `vars.form` and `walk(...)`.

Suggested shape after the change:

```js
const VALID_MODES = ["edit", "view", "review", "error"];

function applyViewOnlyFilter(formArray, mode) {
  const hasViewOnly = formArray.some((entry) => entry?.viewOnly === true);
  if (hasViewOnly && !mode) {
    fail(`'mode' var is required when any form entry has viewOnly: true`);
  }
  if (mode && !VALID_MODES.includes(mode)) {
    fail(`invalid mode '${mode}' (expected one of: edit, view, review, error)`);
  }
  return formArray
    .filter((entry) => !(mode === "edit" && entry?.viewOnly === true))
    .map(({ viewOnly: _v, ...rest }) => rest);
}

function makeActionsForm(_, vars) {
  if (!vars?.form) return [];
  const filtered = applyViewOnlyFilter(vars.form, vars.mode);
  const substituted = walk(filtered);
  checkIdCollisions(substituted);
  return substituted;
}
```

### `modules/workflows/resolvers/makeActionsForm.test.js`

Add four cases (mirror the existing test style — `test('description', () => { ... })`, plain `expect` assertions):

- **`viewOnly: true` drops on `mode: 'edit'`.** Two-entry form, one with `viewOnly: true`. Resolver called with `{ form, mode: 'edit' }` returns one-entry output.
- **`viewOnly: true` survives on `mode: 'view'`** (and `review`, `error`). Same fixture, called with `{ form, mode: 'view' }` — both entries in output, `viewOnly` stripped from the emitted entry's vars.
- **`viewOnly` without `mode` throws.** A form with `[{ viewOnly: true, ... }]` and no `mode` var fails with the precise message.
- **Invalid mode throws.** `{ form, mode: 'bogus' }` fails with the precise message.

Don't add a "no entries are `viewOnly` and `mode` is absent" case — the existing flat-form test already covers that path implicitly.

### `modules/workflows/resolvers/README.md`

Add a section under `makeActionsForm`'s "Inputs" / contract documenting:

- The `mode` var, its allowed values, when it's required.
- The `viewOnly` per-field flag — semantics ("drop on edit, keep on view/review/error"), the production v0 example pattern (read-only timestamp/status label), and the v0 parity link if the README references v0 elsewhere.

Keep it tight — three or four sentences of prose plus a small worked example. The README is reference, not a tutorial.

## Acceptance Criteria

- `makeActionsForm.js` reads `vars.mode` and applies the `viewOnly` filter on `mode === 'edit'`.
- `viewOnly` keys are stripped from every emitted entry regardless of mode.
- The filter runs before `walk` and `checkIdCollisions` so `viewOnly` entries don't trigger id-collision failures on the edit-page render.
- A form containing `viewOnly: true` entries fails the build when `mode` is absent.
- An invalid `mode` value fails the build with the allowed-set message.
- All four new test cases pass under `pnpm test`.
- `resolvers/README.md` documents the `mode` var and the `viewOnly` flag.
- Tasks 1, 2, 3, 4 remain unmodified — this task is strictly additive on top of the v1 baseline.

## Files

- `modules/workflows/resolvers/makeActionsForm.js` — edit — add the filter and `mode` validation.
- `modules/workflows/resolvers/makeActionsForm.test.js` — edit — add four new test cases.
- `modules/workflows/resolvers/README.md` — edit — document `mode` and `viewOnly`.

## Notes

- **Do not extend `mode` to other behaviour.** It's a render-mode signal only the `viewOnly` filter consumes. Any future per-mode branching belongs in the templates (part 16) or in a separate, deliberately-scoped task.
- **Do not touch `makeActionFormConfigs`.** The metadata tree is mode-agnostic — task 2 stays as shipped.
- **Part 16 will pass `mode` as a literal.** Templates write `_ref: { resolver: makeActionsForm.js, vars: { form: action_config.form, mode: edit } }` — the value is a string literal in the Nunjucks body, not an operator. Part 16 owns that wiring; this task just makes the resolver consume it.
