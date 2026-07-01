# Task 3: Wire each ActionSteps group title to its `group-overview` page

## Context

[`modules/workflows/components/actions-on-entity.yaml`](../../../../modules/workflows/components/actions-on-entity.yaml) is the entity-page widget shipped by part 18. It renders one [`ActionSteps`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/) block per workflow on the host entity page. The block already exposes `actionGroupConfig[group].link` ([schema.json:84-95](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/schema.json)) — wrapping the group title in a clickable `Link`. The current `_js` builder at [`actions-on-entity.yaml:48-64`](../../../../modules/workflows/components/actions-on-entity.yaml) builds `actionGroupConfig` without a `link`, so group titles render as inert text.

This task populates the `link` for every group, pointing at the page shipped in Task 2.

## Task

### 1. Edit `modules/workflows/components/actions-on-entity.yaml`

Extend the existing `actionGroupConfig` `_js` builder ([`actions-on-entity.yaml:48-64`](../../../../modules/workflows/components/actions-on-entity.yaml)) to also write `link` on every group. Pass `_module.pageId: { id: group-overview, module: workflows }` as a third `_js` param.

Current builder:

```yaml
actionGroupConfig:
  _js:
    params:
      - _array_indices: true
      - _module.var: workflows_config
    body: |
      const [workflow, workflowsConfig] = params;
      const wfConfig = (workflowsConfig || []).find(
        (w) => w.type === workflow.workflow_type
      ) || {};
      const groupsDef = wfConfig.action_groups || [];
      const config = {};
      groupsDef.forEach((g, i) => {
        config[g.id] = { order: i, title: g.title };
        if (g.icon) config[g.id].icon = g.icon;
      });
      return config;
```

After the edit:

```yaml
actionGroupConfig:
  _js:
    params:
      - _array_indices: true
      - _module.var: workflows_config
      - _module.pageId:
          id: group-overview
          module: workflows
    body: |
      const [workflow, workflowsConfig, groupOverviewPageId] = params;
      const wfConfig = (workflowsConfig || []).find(
        (w) => w.type === workflow.workflow_type
      ) || {};
      const groupsDef = wfConfig.action_groups || [];
      const config = {};
      groupsDef.forEach((g, i) => {
        config[g.id] = {
          order: i,
          title: g.title,
          link: {
            pageId: groupOverviewPageId,
            urlQuery: { workflow_id: workflow._id, group_id: g.id },
          },
        };
        if (g.icon) config[g.id].icon = g.icon;
      });
      return config;
```

### 2. Sanity-check `_module.pageId` resolves in `_js.params`

There's no in-repo precedent for `_module.pageId` inside `_js.params` (other `_module.*` operators do resolve in this position — the existing builder uses `_module.var` successfully). After the edit:

- Run `pnpm ldf:b`.
- Mount the demo app and load an entity page that renders `actions-on-entity`. Open the rendered DOM and confirm each group-title `Link` has a real `href` matching `/<scoped group-overview pageId>?workflow_id=…&group_id=…`.

If Lowdefy fails to resolve `_module.pageId` in this position (build error or unresolved-operator warning), fall back to the YAML-level workaround:

- Lift the `_module.pageId: { id: group-overview, module: workflows }` resolution to a sibling property on the `ActionSteps` block (e.g., a hidden constant via `properties: { _group_overview_page_id: ... }`) and reference it from the `_js` `params`, or
- Build the per-group `link` map in YAML (`actionGroupConfig:` literal alongside the `_js` block, then merged via `_object.assign`).

Pick whichever is more readable; the design's "Why client-side, not status_map" rationale doesn't bind us to a specific YAML shape.

## Acceptance Criteria

- `modules/workflows/components/actions-on-entity.yaml` builder writes `link: { pageId, urlQuery: { workflow_id, group_id } }` on every entry in `actionGroupConfig`.
- `pnpm ldf:b` succeeds. No Lowdefy warnings on the edit.
- DOM smoke: on the demo entity page, every `ActionSteps` group title is rendered as an `<a>` with an `href` whose query string contains both `workflow_id=<row's workflow._id>` and `group_id=<group's id>`.
- Clicking a group title in a browser session lands on `group-overview` and the page loads the correct group via `get-action-group-overview` (the round-trip exercises Tasks 1 + 2 + 3 together).
- Group title's `Link` is rendered for every configured group, including `done` and `not-required` groups (per the design's "every group, no opt-out" decision — the two known edges in design.md:104-107 are accepted in v1).

## Files

- `modules/workflows/components/actions-on-entity.yaml` — **modify** — extend the `actionGroupConfig` `_js` builder.

## Notes

- Don't touch the `items` `_js` builder (lines 65-95). The per-action `link` cell (`status_map.{stage}.{app_name}.link`) is unchanged.
- The `ActionSteps` block already renders `actionGroupConfig[group].link` (see [`ActionSteps.js:111, 121-134`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js)). No plugin changes needed; no README edit needed (review-1 finding 9 rejected this).
- The known UX edges (bounce-back on access-restricted `done` groups, struck-through clickable title on all-`not-required` groups) are documented in design.md:104-107 and explicitly accepted in v1. Don't add `link.disabled` logic; if it becomes a complaint, that's a follow-up.
