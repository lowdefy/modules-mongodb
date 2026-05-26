# Task 6: Extend API contract — `metadata` + `action_display` payloads

## Context

The engine accepts two new caller-facing payload fields on Start and Submit, per design D5/D8:

- `metadata` — caller-supplied object merged into the action's accumulated metadata. Templates at later stages reference `{{ metadata.* }}` (or the corresponding flat alias) via the merged render context.
- `action_display` — caller-supplied per-app cell overrides for the current transition. Shape `{ [slug]: cellShapeForKind }` matching the cell-shape rules from design D6. Scoped to one transition (not persisted to the action config).

`action_display` is a separate channel from the existing `event_overrides.{interaction}.display` (which targets the **event** doc and uses `{ title, detail?, icon? }` per slug). Picking the new name prevents collision in payloads, tests, and docs.

The same task refreshes the `app_name` var description in the module manifest to reflect its third role (picks the per-app cell on display surfaces).

## Task

1. **Module manifest** — `modules/workflows/module.lowdefy.yaml`. Locate the `app_name` var. Replace its `description` with:

   ```yaml
   description: >
     The host app's deployment slug. Three roles, all keyed by the same value:
     (1) access filtering — `access.{app_name}` per action;
     (2) event display — keys the default log-event display block (events module's display_key projection);
     (3) action display — picks `action[app_name].message` / `.link` on display surfaces.
   ```

   Leave `type: string` and `required: true` unchanged.

2. **`modules/workflows/api/start-workflow.yaml`** — add `metadata: { _payload: metadata }` and `action_display: { _payload: action_display }` to the `StartWorkflow` action's `properties` block so the start API passes both through to the connection plugin.

3. **`modules/workflows/resolvers/makeWorkflowApis.js`** — extend the emitted-api payload mapping at lines 71-80 (the `SubmitWorkflowAction` properties block) to pass `metadata: { _payload: metadata }` and `action_display: { _payload: action_display }`. Both fields then flow into the `SubmitWorkflowAction` plugin handler via `request.metadata` / `request.action_display`.

No engine wiring yet — the values plumb through but aren't yet consumed.

## Acceptance Criteria

- `module.lowdefy.yaml` reflects the new `app_name` description.
- `api/start-workflow.yaml` declares both payload fields under the `StartWorkflow` action properties.
- `makeWorkflowApis.js` emits both payload fields for every `update-action-{action_type}` Api.
- `pnpm -F @lowdefy/workflows test` (or repo-wide test) still passes.
- `pnpm ldf:b` (or equivalent demo build) succeeds — no manifest/schema regressions.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify (update `app_name` description).
- `modules/workflows/api/start-workflow.yaml` — modify (add `metadata` and `action_display` to action properties).
- `modules/workflows/resolvers/makeWorkflowApis.js` — modify (extend submit-api payload mapping).
