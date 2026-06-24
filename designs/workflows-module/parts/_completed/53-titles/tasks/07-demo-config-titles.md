# Task 7: Update demo configs to exercise the title defaults and overrides

## Context

With tasks 1–4 in place, the workflows module derives good default titles from slugs (`send-quote` → "Send Quote", `upload-po` → "Upload PO"). The demo app's workflow configs likely carry hand-written `title:` fields that are now redundant (equal to the derived default) and may carry slugs that humanize *wrong* (acronyms, custom phrasing) that should stay as explicit overrides.

This task updates the demo to (a) drop now-redundant titles so the demo demonstrates the derive path, and (b) keep or add explicit `title:` only where the slug humanizes wrong, exercising the override path. Per the repo's "demo is not a census" rule, this is about demonstrating both code paths cleanly — not proving anything about production.

Demo configs live under `apps/demo/modules/workflows/workflow_config/`:
- `workflows.yaml` (the top-level array, `_ref`'d as the module entry's `workflows_config`)
- `company-setup/` and `onboarding/` subfolders with per-action and per-workflow files (e.g. `send-quote.yaml`, `upload-po.yaml`, `kickoff-call.yaml`, `assign-account-manager.yaml`, `company-setup.yaml`, `onboarding.yaml`).

The module entry's vars are in `apps/demo/modules/workflows/vars.yaml` — where `title_acronyms` would be set if the demo needs a domain acronym to exercise that path.

## Task

1. **Audit existing titles.** For each workflow `type`, action `type`, and `action_groups[].id` in the demo configs, compute what `humanizeSlug` (with the base acronym set from task 1) would derive, and compare to any hand-written `title:`.

2. **Drop redundant titles.** Where an explicit `title:` exactly equals the derived default (e.g. `title: Send Quote` beside `type: send-quote`), remove the `title:` line so the demo relies on the derived default.

3. **Keep / add overrides where the slug humanizes wrong.** Where the derived default would be wrong — acronyms not in the base set, custom phrasing, or a label that reads better differently — keep (or add) an explicit `title:`. Aim to leave at least one clear example each of:
   - a derived workflow title, a derived action title, and a derived group title (no `title:`);
   - an explicit override on each of those (workflow, action, group) where the default is wrong.

4. **Exercise `title_acronyms` if useful.** If the demo has a slug with a domain acronym not in the base set (e.g. something like `BOM`/`SKU`), set `title_acronyms` on the demo module entry in `apps/demo/modules/workflows/vars.yaml` to demonstrate the extension path instead of hard-coding a `title:` override. Only do this if a natural example exists — don't invent one.

5. **Action page titles.** Confirm any per-verb `pages[verb].title` in the demo that merely restated the action title can be dropped (task 3 now defaults it).

## Acceptance Criteria

- `pnpm ldf:b` (from `apps/demo`) compiles with no new errors after the edits.
- The demo no longer carries `title:` values that exactly equal the derived default.
- At least one derived and one overridden example exists for workflow, action, and group titles.
- If `title_acronyms` is used, it appears on the demo module entry vars and the corresponding slug derives correctly.

## Files

- `apps/demo/modules/workflows/workflow_config/**/*.yaml` — modify — drop redundant `title:`; keep/add overrides where the slug humanizes wrong.
- `apps/demo/modules/workflows/vars.yaml` — modify (only if exercising `title_acronyms`) — add the demo's domain acronyms.

## Notes

- Don't add titles for the sake of coverage where the derived default is already correct — the point is that the default is good enough that overrides are the exception.
- This is a build-config task: verify with `pnpm ldf:b`; no server needed.
