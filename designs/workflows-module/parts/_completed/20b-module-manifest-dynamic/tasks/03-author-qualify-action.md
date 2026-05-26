# Task 3: Author `qualify` action + pre-submit hook routine

## Context

`qualify` is the first action in the new `onboarding` workflow's worked example — `kind: form`, in group `g1`, the starting action of the workflow. When the user clicks it on lead-view they get routed to the resolver-emitted `onboarding-qualify-edit` page; submitting fires `update-action-qualify` which transitions the action to `done`, fires side effects (log event + notifications via part 8), and runs the pre-hook (once part 9 ships).

The `makeWorkflowApis` resolver ([modules/workflows/resolvers/makeWorkflowApis.js](makeWorkflowApis.js)) reads inline `hooks.{interaction}.{phase}.routine` off the action and emits the Lowdefy Api at build time with id `update-action-{type}-{interaction}-{phase}`. The author writes the routine inline; to keep the action file readable, the routine *content* lives in a sibling YAML and is pulled in via `_ref`.

This task creates the two files. `onboarding.yaml` doesn't yet reference this action — task 8 wires it into the workflow's `actions[]`.

## Task

1. **Create `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml`** — a `kind: form` action declaring:
   - `type: qualify`
   - `kind: form`
   - `action_group: g1`
   - `sort_order: 10`
   - `description: Confirm the lead's contact details and capture qualification notes.`
   - `access.demo: [edit, view]`, `access.roles: [admin]` (matches the demo's role convention from 20a's tracker actions).
   - `form:` block with a couple of fields exercising the form-components library from `modules/workflows/components/fields/` — e.g. `text_input` `contact_name` (required), `text_area` `notes`.
   - `interactions.submit_edit.status: done` so the engine transitions straight to terminal on submit.
   - `hooks.submit_edit.pre.routine: { _ref: modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml }` — pulls in the routine file from step 2. App `_ref` paths resolve relative to `apps/demo/lowdefy.yaml` (the app root), so the full path from app root is required — see the existing `onboarding.yaml`'s action refs for the precedent.
   - `status_map` with entries for `action-required`, `in-progress`, `done`. The `action-required` and `in-progress` entries carry `message` + `link` blocks; `done` carries `message` only.
     - `action-required.demo.link.pageId: { _module.pageId: { id: onboarding-qualify-edit, module: workflows } }`, `urlQuery: { action_id: true }`.
     - `in-progress.demo.link.pageId: { _module.pageId: { id: onboarding-qualify-view, module: workflows } }`, `urlQuery: { action_id: true }`.
     - `done.demo.message: Lead qualified.` (no `link:` — terminal status).

   See the worked example in [design.md § Onboarding actions](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#onboarding-actions-replaces-the-three-trackers) lines 97–123 for the canonical shape.

2. **Create `apps/demo/modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml`** — the pre-hook routine for `qualify.submit_edit`. The file is a YAML array (the value of `routine:`), not a Lowdefy Api descriptor.

   Author a minimal routine that demonstrates the pre-hook return contract — at least one step plus a `:return:` block that surfaces `event_overrides.display` so the engine-emitted log event shows the hook ran:

   ```yaml
   - id: derive_display
     type: Set    # or any operator-style step; minimal placeholder is fine
     params:
       display: Lead qualified by demo pre-hook.
   - :return:
       event_overrides:
         display:
           _step: derive_display.display
   ```

   The exact step types aren't load-bearing — the file ships dormant until part 9 lights up hook dispatch. The point is to demonstrate the *shape* an author would write.

## Acceptance Criteria

- Both files exist and are valid YAML.
- `qualify.yaml`'s `hooks.submit_edit.pre.routine` is a `_ref` to `modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml`.
- `qualify.yaml`'s `status_map` has at minimum `action-required`, `in-progress`, and `done` entries with the documented `link` shape.
- `apps/demo` builds without errors — the `_ref` to `modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml` resolves; the action file is valid against the part-4 `makeWorkflowsConfig` validator schema. (It's not yet referenced from `onboarding.yaml` `actions[]`, so the resolver won't emit a per-action endpoint for it yet — that lands in task 8.)

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` — create.
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/qualify-pre-submit.yaml` — create.

## Notes

- The routine file's actual steps are demo placeholders — the focus is on shape, not behavior. Real apps would put MongoDB queries, validations, or transformations here.
- The `roles:` value `[admin]` mirrors what 20a's `track-step-*` files use. If the demo grows finer-grained roles later, this is the natural place to update.
- The `form:` block contents are flexible — pick two simple fields that exercise the components library. Don't worry about being exhaustive.
