# Task 9: Make `actions-on-entity` render group display from the response

## Context

`modules/workflows/components/actions-on-entity.yaml` is embedded on **every
entity page** (demo: `apps/demo/pages/leads/lead-view.yaml`,
`apps/demo/modules/companies/vars.yaml`). It currently reads the **entire**
authored config twice:

- `entity_workflows.$.title` (lines 28–45) — `_get from: { _ref:
components/workflows_config.yaml }` keyed by `workflow_type` for the title.
- `entity_workflows.$.action_steps` `actionGroupConfig` (lines 67–99) — a `_js`
  block taking `_module.var: workflows_config` and building
  `{ [group_id]: { order, title, icon, link } }` for the entity's workflows.

After task 7, `GetEntityWorkflows` returns `workflow.title` and per-group
`{ id, order, title, icon, link }` (the group-overview link built server-side),
plus per-action cards carrying `_id` and `kind`. This component must render those
instead of computing them.

## Task

In `actions-on-entity.yaml`:

**1. Title** — replace the `workflows_config.yaml` `_ref` lookup (the `_nunjucks`
`on.title`) with `_state: entity_workflows.$.title`.

**2. `actionGroupConfig`** — replace the `_js` block that reads
`_module.var: workflows_config` with the group display now on the response. The
`ActionSteps` block's `actionGroupConfig` expects
`{ [group_id]: { order, title, icon?, link } }`; build it from
`entity_workflows.$.groups` (each group now `{ id, order, title, icon, link,
...summary }`) — e.g. an `_object.fromEntries` over the groups array mapping
`g.id → { order: g.order, title: g.title, icon: g.icon, link: g.link }`. The
`link` is the server-resolved group-overview link; the client no longer
constructs `pageId`/`urlQuery`.

Remove the `_module.var: workflows_config` and `_module.pageId:
workflow-group-overview` reads from this `_js`/component.

**3. Leave `onActionClick` wiring to Part 40.** The design states the
`onActionClick` branch (`kind === 'check'` → modal via
`GetWorkflowAction(_event.action._id)`, else `Link` to `action.link`) is
**owned by Part 40** (Ripples / cross-part contract). This task only ensures
`GetEntityWorkflows` supplies `_id`/`kind` on the cards (done in task 4) and that
the existing render keeps working. Do not build the modal here.

## Acceptance Criteria

- `actions-on-entity` reads workflow title and group display config from the
  `GetEntityWorkflows` response only.
- No `_module.var: workflows_config` and no `_ref:
components/workflows_config.yaml` remain in the component.
- The action-steps render unchanged visually against seeded data (groups in
  order, titles, icons, group-overview link).
- `pnpm ldf:b` builds; the demo lead-view / company entity render the workflow
  action steps.

## Files

- `modules/workflows/components/actions-on-entity.yaml` — modify — read `title` + group display from the response; drop the config `_js`.

## Notes

- This is the last reader of `components/workflows_config.yaml` (the titles map).
  Once this task lands, delete `components/workflows_config.yaml` and its
  `module.lowdefy.yaml` export — do it here if task 8 has already removed the
  overview-page refs, otherwise leave it for task 12 (which sweeps orphans).
- The existing `ActionSteps` disabled-row behavior (`linkDisabled = !action.link`)
  is unchanged and is the Part-40 hook for suppressing clicks on linkless rows.
