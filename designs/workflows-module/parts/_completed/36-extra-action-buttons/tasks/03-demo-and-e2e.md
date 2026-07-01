# Task 3: Exercise the slot in the demo + assert it in the e2e spec

## Context

Part 36 needs one demo action exercising `buttons.extra` for e2e coverage. The cheapest exercise is an **Open Help** button on a form action's edit page — a `Link` action firing on `onClick`, no new endpoint or Lambda required.

Target action: `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` — a `kind: form` action that has **no `pages:` override today**, so this adds the block. The action's `access.demo` already emits `view` + `edit` pages, so the edit page (and its `floating-actions` bar) already exist.

This task depends on Task 1 (validator must accept the `buttons.extra`) and Task 2 (template must render it).

## Task

1. **Add the `pages.edit.buttons.extra` block to `qualify.yaml`.** Append a `pages:` block to the action (the file currently has `form:`, `hooks:`, `status_map:` — add `pages:` as a new top-level key on the action):

   ```yaml
   pages:
     edit:
       buttons:
         extra:
           - id: open_help
             title: Help
             type: link
             icon: QuestionCircleOutlined
             events:
               onClick:
                 - id: nav_help
                   type: Link
                   params:
                     url: https://docs.lowdefy.com
                     newTab: true
   ```

2. **Add the e2e assertion.** The spec `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` already drives the onboarding workflow whose `qualify` edit page now carries the Help button. Add an assertion that, on the qualify edit page, the **"Help"** button is visible in the floating-actions bar, and (if the spec's flow makes it practical) that clicking it navigates to / opens `https://docs.lowdefy.com` in a new tab. Keep the assertion minimal and consistent with the spec's existing locator/style conventions — read the surrounding test before adding.

## Acceptance Criteria

- `qualify.yaml` carries the `pages.edit.buttons.extra` block above.
- `pnpm ldf:b` from `apps/demo` compiles cleanly (the validator accepts the demo's `buttons.extra`, and the template renders it).
- The e2e spec asserts the "Help" button is visible in the qualify edit page's floating bar (and, where practical, that clicking it targets the configured URL).

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` — modify — add the `pages.edit.buttons.extra` block.
- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — modify — add the Help-button assertion.

## Notes

- The emitted edit page id is `{workflow_type}-{action_type}-{verb}` → `onboarding-qualify-edit`, scoped under the `workflows` module entry (`makeActionPages.js:64`). The demo URL is roughly `/workflows/onboarding-qualify-edit?action_id=...`.
- The bar renders the template's primary `Submit` button (rightmost) plus the author's "Help" button (to its left). Clicking Help opens the external docs link in a new tab — no engine call.
- Per the design, that e2e spec still carries a deferred-verification `NOTE:` header and Part 56 will retarget its check-row navigation; whether the spec is actively green end-to-end is a demo-suite concern outside this part. The live verification for this part is the `ldf:b` build check plus the demo rendering the button. Do not attempt to fix unrelated pre-existing spec breakage as part of this task.
- A second demo exercise covering the modal pattern is explicitly deferred (it needs a real target API) — do not add one here.
