# Task 11: Re-point client call sites to the per-workflow endpoint ids

## Context

Tasks 8–9 changed every write-endpoint id: per-action `{type}-{action}-submit` → per-workflow `{type}-submit`, and the generic `start-workflow`/`cancel-workflow`/`close-workflow` → `{type}-start/cancel/close`. Every client that hits a write endpoint must re-point. The known call sites (verified by grep):

| Caller                                                                                                                                     | Today                                                                                                            | Re-point to                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form-page templates `modules/workflows/templates/{edit,review,view,error}.yaml.njk` (e.g. `edit.yaml.njk:249–252`, `:295–298`, `:353–354`) | stale legacy `update-action-{…}` ids built with `_string.concat` (pre-Part-38 rename — these are already broken) | `{workflow_type}-submit`, using the template's workflow-type var (templates have it in vars — confirm the var name in the template header)                                                                          |
| Legacy simple pages `modules/workflows/pages/workflow-action-edit.yaml` (`:199–202`) and `workflow-action-review.yaml`                     | same stale `/update-action-` concat                                                                              | build `{workflow_type}-submit` at runtime from the loaded action/workflow's `workflow_type` (e.g. `_string.concat: [{ _state: …workflow_type }, '-submit']` — match how the page already accesses the workflow doc) |
| `apps/demo/api/leads-create.yaml:48`                                                                                                       | generic `start-workflow` with `workflow_type: onboarding` in payload                                             | `id: onboarding-start` (drop `workflow_type` from the payload — the endpoint sets it statically)                                                                                                                    |
| `apps/demo/modules/companies/vars.yaml:34`                                                                                                 | generic `start-workflow` with `workflow_type: company-setup`                                                     | `id: company-setup-start` (drop `workflow_type` from the payload)                                                                                                                                                   |

Generic `cancel-workflow`/`close-workflow` have no in-repo callers — nothing to re-point (downstream consumer breakage is D5's accepted regression, flagged in task 9).

**Coordination note (from the design's sequencing section):** Parts 39/40 own the submit-button rework on these templates/pages; Part 40 is active. The design wants the submit id to change **once** — coordinate the re-point target (`{type}-submit`) with Part 40's work so this task doesn't churn against it. If Part 40 has already restructured the buttons, re-point whatever its current call shape is; the target id is the same either way.

## Task

1. Re-point every call site in the table. For the `.njk` templates, the endpoint ref shape stays `_module.endpointId` with `_string.concat` (or a direct interpolated id if the workflow type is a template var — prefer the simpler form the template allows); only the id composition changes from `update-action-{…}` to `{workflow_type}-submit`.
2. For the two demo start callers, keep the rest of the payload (`entity_id`, `entity_collection`, `parent_action_id`, `references`) unchanged; remove only `workflow_type`.
3. Grep sweep to catch stragglers: `grep -rn "update-action\|start-workflow\|cancel-workflow\|close-workflow" modules/ apps/ --include="*.yaml" --include="*.njk"` must return no live call-site hits afterwards (resolver test fixtures referencing old ids should have been updated in tasks 8–9).

## Acceptance Criteria

- The demo app builds cleanly (no dangling `_module.endpointId` refs).
- Lead create (demo) starts the `onboarding` workflow via `onboarding-start`; company create starts `company-setup` via `company-setup-start` with the tracker parent link intact (`parent_action_id` from `url_query.action_id`).
- Submitting a form action from the action-edit page hits `{type}-submit` and succeeds end-to-end (status_map renders, hooks fire for hooked actions).
- The grep sweep returns no hits.

## Files

- `modules/workflows/templates/edit.yaml.njk` — modify — submit endpoint id.
- `modules/workflows/templates/review.yaml.njk` — modify — submit endpoint id.
- `modules/workflows/templates/view.yaml.njk` — modify — submit endpoint id.
- `modules/workflows/templates/error.yaml.njk` — modify — submit endpoint id.
- `modules/workflows/pages/workflow-action-edit.yaml` — modify — runtime-built submit id.
- `modules/workflows/pages/workflow-action-review.yaml` — modify — runtime-built submit id.
- `apps/demo/api/leads-create.yaml` — modify — `onboarding-start`.
- `apps/demo/modules/companies/vars.yaml` — modify — `company-setup-start`.

## Notes

- If the demo build hard-fails on the dangling `start-workflow` refs the moment task 9 deletes the generic yamls, land this task in the same change set as task 9.
- The submit payload shape is unchanged (`action_id`, `signal`, …) — the endpoint identifies the action from `action_id`; only the endpoint id moves from per-action to per-workflow.
