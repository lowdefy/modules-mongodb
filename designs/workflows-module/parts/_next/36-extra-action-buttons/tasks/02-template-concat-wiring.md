# Task 2: Template wiring — concat `buttons.extra` into the floating-actions bar

## Context

Each form-action verb template renders a sticky button bar via `_ref: { module: layout, component: floating-actions }`, passing a **static** `actions:` array of template-shipped signal-button blocks. The layout component (`modules/shared/layout/floating-actions.yaml`) renders `actions` as card blocks with `direction: row-reverse`, so the _first_ array entry sits visually rightmost (primary position).

Current bar contents (pre-Part-39 names shown; Part 39 renames/adds buttons but does not change the bar structure):

- `edit.yaml.njk` (~line 194): `button_submit_edit` (→ `button_submit` post-39, plus `button_progress`), `button_not_required`.
- `review.yaml.njk` (~line 187): `button_edit` (navigation), `button_request_changes`, `button_approve`.
- `error.yaml.njk` (~line 224): `button_resolve_error`.

Part 36 makes the bar's _composition_ (not the signal vocabulary) extensible: authored `pages.{verb}.buttons.extra` entries — already forwarded verbatim to templates as the `page_config` var by `makeActionPages.js` (`page_config: action.pages?.[verb] ?? {}`) — are appended after the template buttons. Appending means extras render leftmost under `row-reverse`; signal buttons keep the primary visual position (design Decision 1).

`view.yaml.njk` is **unchanged** by this part — extras on view are deferred (design "Out of scope").

## Task

1. In each of `modules/workflows/templates/edit.yaml.njk`, `review.yaml.njk`, and `error.yaml.njk`, wrap the floating-actions `actions:` value in `_build.array.concat:` with the existing button array as the first operand and the authored extras as the trailing operand:

   ```yaml
   - _ref:
       module: layout
       component: floating-actions
       vars:
         actions:
           _build.array.concat:
             - # existing template button blocks, unchanged, as one array literal
               - id: button_submit ... # (whatever the template currently ships)
               - id: button_not_required ...
             - _var:
                 key: page_config.buttons.extra
                 default: []
   ```

   Do **not** change any existing button definition, its `visible` / `disabled` `_var` knobs, or its `buttons.{signal}.modal` confirm-modal wiring — only the wrapping. The existing buttons move one indent level deeper (they become the first operand array of the concat).

   No new modal-slot wiring: author modals go in `pages.{verb}.formFooter` (an existing slot in all three templates) and overlay at render time regardless of declaration position.

2. In `modules/workflows/resolvers/makeActionPages.test.js`, add a round-trip case: a fixture workflow whose form action sets `pages.edit.buttons.extra` to a small array (e.g. the `open_help` entry from the design), then assert the emitted edit page's `_ref.vars.page_config.buttons.extra` deep-equals the author's array. `makeActionPages` only forwards `page_config` — the `_build.array.concat` merge happens later inside Lowdefy's build-time YAML processing, so the resolver-level test can only assert the round-trip; merged-bar behaviour is covered by the demo build in task 3.

## Acceptance Criteria

- All three templates produce identical rendered output to before when `page_config.buttons.extra` is unset (`default: []` concats nothing).
- Authored entries land **after** the template buttons in the `actions` array (leftmost in the bar).
- `view.yaml.njk` untouched.
- New `makeActionPages.test.js` case passes; all existing resolver tests pass.
- `pnpm build` (demo app) still succeeds with no `buttons.extra` configured anywhere — confirms the concat wiring is valid Lowdefy build YAML in all three templates.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — wrap `actions:` in `_build.array.concat` + append `page_config.buttons.extra`.
- `modules/workflows/templates/review.yaml.njk` — modify — same wrap.
- `modules/workflows/templates/error.yaml.njk` — modify — same wrap.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — add `buttons.extra` round-trip fixture case.

## Notes

- **Part 39 interaction:** Part 39's template tasks rewrite these same button blocks (signal payloads, renames, the new `progress` button). The concat wrapper is name-agnostic and composes with that rewrite in either order — but whichever part lands second must preserve the other's change. If Part 39 has already landed, the edit bar carries three buttons (`button_submit`, `button_progress`, `button_not_required`); wrap whatever array is there.
- These are `.njk` files but the bar region is plain YAML (no nunjucks interpolation in the `actions:` block today) — the change is a pure YAML re-indent + wrap.
- Entries follow standard Lowdefy `Button` block shape; the template applies **no transformation** — no per-entry wrap, no resolver magic (design "YAML shape").
