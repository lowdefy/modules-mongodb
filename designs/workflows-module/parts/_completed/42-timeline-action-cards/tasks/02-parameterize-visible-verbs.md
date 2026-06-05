# Task 2: Parameterize `visible_verbs.yaml` via `_var: app_name` with a `_module.var` default

## Context

Part 38 shipped the shared compute stage `modules/shared/workflow/visible_verbs.yaml`
— a single `$addFields` that projects a four-key `visible_verbs: { view, edit, review, error }`
bag onto each action doc by resolving `$access.<app_name>.<verb>` against
`_user.apps.<app_name>.roles`. **As shipped it reads the app name via
`_module.var: app_name`** at **8 sites** — 4 verb blocks × 2 sites each: the gate
`$getField` (`field: { _module.var: app_name }`) and the `user_roles`
`_string.concat` (`'apps.'`, `_module.var: app_name`, `'.roles'`)
(`visible_verbs.yaml:33,42,67,76,101,110,135,144`).

Part 42 (D5) needs this same stage reused by the **events module's** timeline
fragment. The events module is dependency-free and has **no `app_name` var** (it
has `display_key`), so `_module.var: app_name` cannot resolve there — the stage
must accept a ref-level `_var: app_name` from the fragment.

**Call graph (corrected — earlier drafts of this task got it wrong):** the
**only** `_ref` to `visible_verbs.yaml` in the repo is
`modules/workflows/api/stages/visible_verbs_filter.yaml:16` (bare). The three
read APIs (`get-entity-workflows.yaml`, `get-workflow-overview.yaml`,
`get-action-group-overview.yaml`) do **not** ref the compute stage directly —
each refs only the **bundle** `api/stages/visible_verbs_filter.yaml`, bare,
inside `_build.array.concat`.

**Approach: default-fallback, zero caller churn.** Each site converts to the
object `_var` form with a `_module.var` default — the exact pattern
`events-timeline.yaml:27-30` already uses for `display_key`. Existing callers
(the filter bundle, and through it the three APIs) keep resolving via the
default, evaluated in the workflows module's build scope exactly as today; the
events fragment passes `app_name` explicitly via `_ref` `vars:` and the default
is never evaluated there. A bare `_var: app_name` (no default) would instead
silently resolve to `null` in every existing caller — each `_ref` opens a fresh
var scope, there is no build error — and break every access gate at request time.

> **Deviation from the design's Files table:** it lists `visible_verbs.yaml` as
> **New**. It already exists (Part 38). This task *converts* it, not creates it.

## Task

1. **In `modules/shared/workflow/visible_verbs.yaml`**, replace every
   `_module.var: app_name` (8 sites) with:

   ```yaml
   _var:
     key: app_name
     default:
       _module.var: app_name
   ```

2. **Update the header comment** that explains `_module.var: app_name` to
   describe the new parameterization: `app_name` may be supplied by the
   consumer's `_ref` `vars:` (the events timeline fragment does); when absent it
   defaults to the consuming module's `app_name` module var (the workflows-side
   callers rely on this).

No other files change — `visible_verbs_filter.yaml` and the three read APIs are
untouched.

## Acceptance Criteria

- `modules/shared/workflow/visible_verbs.yaml` has all 8 sites converted to the
  `_var: { key: app_name, default: { _module.var: app_name } }` form; no bare
  `_module.var: app_name` remains outside a `default:`.
- `modules/workflows/api/stages/visible_verbs_filter.yaml` and the three read
  APIs are **untouched** (`git diff` shows only `visible_verbs.yaml`).
- The Lowdefy build succeeds and the three read APIs still project a correct
  `visible_verbs` bag — no behaviour change; the default path resolves to the
  same app name as before.

## Files

- `modules/shared/workflow/visible_verbs.yaml` — modify — `_module.var: app_name`
  → `_var` object form with `_module.var` default (×8 sites) + header comment.

## Notes

- The `_var` object form `{ key, default }` is supported by the build
  (`walker.js:255-257`); the default is used only when the key is absent from the
  ref's var scope. Object-valued ref vars are resolved in the *parent's* var
  context before the child resolves, so the events fragment can pass
  `app_name: { _var: { key: display_key, default: ... } }` through.
- Task 3 applies the **same pattern** to `resolve_action_link.yaml`, which lets
  Task 4 insert that stage into the three APIs as a *bare* ref.
- Considered and rejected: threading `app_name` explicitly (stage `_var` +
  filter passes it down + the three APIs pass `_module.var: app_name` into the
  filter ref). Works (var chaining is supported), but touches 5 files and makes
  every future workflows-side caller responsible for remembering the var; the
  default form keeps in-module callers zero-config.
- This task changes only **how** `app_name` reaches the stage, not the resolution
  logic. Keep it self-contained so the build stays green after it lands alone.
