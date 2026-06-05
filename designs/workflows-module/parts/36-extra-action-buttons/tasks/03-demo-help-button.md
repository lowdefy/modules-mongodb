# Task 3: Demo exercise — "Help" extra button on the qualify edit page

## Context

Tasks 1 and 2 shipped the `buttons.extra` slot (validator + template wiring). One demo action must exercise it so `pnpm build` materialises the `_build.array.concat` merge against real config and e2e coverage (task 6) has a target.

The cheapest exercise is an **Open Help** button — a `Link` action firing on `onClick`, no new endpoint or Lambda required. The design picks `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml`: it's a form action with an `edit` page (`installation/install-step.yaml` is `kind: simple` with no `pages.edit` slot; `installation/installation.yaml` is the workflow file, not an action).

`qualify.yaml` currently has:

```yaml
pages:
  edit:
    title: Qualify Lead
  view:
    title: Qualify Lead
```

Note the demo config is due for reshaping by Parts 38/45 — this task only adds the `buttons.extra` block under the existing `pages.edit` and must not depend on (or rework) the file's surrounding shape.

## Task

Extend `pages.edit` in `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml`:

```yaml
pages:
  edit:
    title: Qualify Lead
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
  view:
    title: Qualify Lead
```

Then run the demo build and verify it passes — `makeWorkflowsConfig` validates the entry and the edit template's concat consumes it.

## Acceptance Criteria

- `pnpm build` (demo app) passes — the validator accepts the entry and the build materialises the merged `actions:` array.
- Opening the qualify edit page in the running demo (`/workflows/{workflow_id}/...qualify-edit?action_id=...` — exact URL per the demo's page ids, `onboarding-qualify-edit`) shows the template's primary Submit button **plus** the "Help" button in the floating bar, with Help rendered left of the signal buttons.
- Clicking "Help" opens `https://docs.lowdefy.com` in a new tab — no engine call is made.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` — modify — add `pages.edit.buttons.extra` block.

## Notes

- A second demo exercise covering the button → modal pattern would be ideal but requires a real target API — explicitly deferred by the design to whichever demo addition needs an app-specific side-effect first. Do not add one here.
- If manual verification of the running demo isn't feasible in the implementation environment, the build pass plus task 6's e2e assertion cover it — note that in the PR.
