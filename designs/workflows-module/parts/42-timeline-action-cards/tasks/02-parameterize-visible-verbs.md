# Task 2: Parameterize the shared `visible_verbs.yaml` stage by `_var: app_name`

## Context

Part 38 shipped the shared compute stage `modules/shared/workflow/visible_verbs.yaml`
— a single `$addFields` that projects a four-key `visible_verbs: { view, edit, review, error }`
bag onto each action doc by resolving `$access.<app_name>.<verb>` against
`_user.apps.<app_name>.roles`. **As shipped it reads the app name via
`_module.var: app_name`** (≈4 occurrences inside the stage).

Part 42 (D5) needs this same stage reused by the **events module's** timeline
fragment. The events module is dependency-free and has **no `app_name` var** (it
has `display_key`), so `_module.var: app_name` cannot resolve there. The design
states both shared stages "take the same `app_name` var" and the timeline fragment
"passes it through" — i.e. the stage must be parameterized by a **local
ref-level** `_var: app_name`, supplied by whichever consumer `_ref`s it.

> **Deviation from the design's Files table:** it lists `visible_verbs.yaml` as
> **New**. It already exists (Part 38). This task *converts* it, not creates it.

The three existing callers `_ref` it bare (no `vars:`), relying on `_module.var`:
- `modules/workflows/api/get-entity-workflows.yaml` (`_ref: ../shared/workflow/visible_verbs.yaml`)
- `modules/workflows/api/get-workflow-overview.yaml`
- `modules/workflows/api/get-action-group-overview.yaml`

Each is immediately followed by `_ref: api/stages/visible_verbs_filter.yaml`
(the `$match` drop — unaffected, it references no `app_name`).

## Task

1. **In `modules/shared/workflow/visible_verbs.yaml`**, replace every
   `_module.var: app_name` with `_var: app_name`. There are four (one per verb
   block: `view`, `edit`, `review`, `error`), each inside both the `gate`
   `$getField` (`field: { _module.var: app_name }`) and the `user_roles`
   `_string.concat` (`'apps.'`, `_module.var: app_name`, `'.roles'`). Update the
   header comment that explains `_module.var: app_name` to describe the new
   `_var: app_name` parameter (supplied by each consumer's `_ref` `vars:`).

2. **In all three API files**, change each bare `_ref` of `visible_verbs.yaml` to
   pass the var explicitly:

   ```yaml
   - _ref:
       path: ../shared/workflow/visible_verbs.yaml
       vars:
         app_name:
           _module.var: app_name
   ```

   Leave the following `_ref: api/stages/visible_verbs_filter.yaml` line unchanged.

## Acceptance Criteria

- `modules/shared/workflow/visible_verbs.yaml` contains no `_module.var:` and uses
  `_var: app_name` throughout (4 verb blocks).
- All three APIs `_ref` `visible_verbs.yaml` with `vars: { app_name: { _module.var: app_name } }`.
- The Lowdefy build succeeds and the three read APIs still project a correct
  `visible_verbs` bag (no behaviour change vs. before — this is a pure refactor;
  `_module.var: app_name` evaluated in the workflows module resolves to the same
  app name as before, now threaded through the var).
- `modules/workflows/api/stages/visible_verbs_filter.yaml` is untouched.

## Files

- `modules/shared/workflow/visible_verbs.yaml` — modify — `_module.var` → `_var` (×4 blocks) + comment.
- `modules/workflows/api/get-entity-workflows.yaml` — modify — pass `app_name` var to the `visible_verbs` ref.
- `modules/workflows/api/get-workflow-overview.yaml` — modify — same.
- `modules/workflows/api/get-action-group-overview.yaml` — modify — same.

## Notes

- This task changes only **how** `app_name` reaches the stage, not the resolution
  logic. The output `visible_verbs` shape and values are identical for the
  workflows APIs.
- Task 4 (link adoption) and Task 5 (fragment) both build on the `_var`-parameterized
  form. Keep this task self-contained so the build stays green after it lands alone.
