# Task 6: Extend API contract — `metadata` + `action_display` payloads, plus `entry_id` connection wiring

## Context

The engine accepts two new caller-facing payload fields on Start and Submit, per design D5/D8:

- `metadata` — caller-supplied object merged into the action's accumulated metadata. Templates at later stages reference `{{ metadata.* }}` (or the corresponding flat alias) via the merged render context.
- `action_display` — caller-supplied per-app cell overrides for the current transition. Shape `{ [slug]: cellShapeForKind }` matching the cell-shape rules from design D6. Scoped to one transition (not persisted to the action config).

`action_display` is a separate channel from the existing `event_overrides.{interaction}.display` (which targets the **event** doc and uses `{ title, detail?, icon? }` per slug). Picking the new name prevents collision in payloads, tests, and docs.

The same task refreshes the `app_name` var description in the module manifest to reflect its third role (picks the per-app cell on display surfaces).

The same task also wires the new `entry_id` connection field (per design D4 § Mechanic + the `WorkflowAPI/schema.js` and `connections/workflow-api.yaml` Modified bullets). `computeEngineLinks` (Task 3) needs the workflows module entry id at runtime to compose module-scoped page IDs (e.g. `${entryId}/task-edit`), matching Lowdefy's build-time `_module.pageId` scoping. The entry id is threaded into the WorkflowAPI connection via a new schema field, wired at build time with `_module.id: true` (which resolves to the entry id under which the workflows module is mounted). Engine helpers read `context.entry_id` and pass it into `computeEngineLinks`. The wiring lands here (alongside the other contract-level changes) so Tasks 7, 8, and 9 can rely on `context.entry_id` being present.

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

4. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`** — add `entry_id` (string, required) to the connection schema's `properties` and `required` list, alongside the existing `app_name` field. Description: `"The workflows module entry id under which this connection is mounted. Engine uses it to compose module-scoped page IDs for engine-managed links (\`${entry_id}/task-edit\`, etc.), matching Lowdefy's build-time \`_module.pageId\` scoping (\`${entryId}/${pageId}\`) at runtime. Apps wire this from \`_module.id: true\` on \`connections/workflow-api.yaml\`. See Part 30 D4."`

5. **`modules/workflows/connections/workflow-api.yaml`** — add `entry_id: { _module.id: true }` to `properties`, alongside the existing `app_name: { _module.var: app_name }` wiring. `_module.id: true` resolves at build time to the entry id under which the workflows module is mounted (Lowdefy build/walker.js:479), giving the runtime engine the same prefix Lowdefy uses when scoping `_module.pageId` references.

No engine wiring yet — the payload values and the new `context.entry_id` plumb through but aren't yet consumed (Tasks 7, 8, 9 consume them).

## Acceptance Criteria

- `module.lowdefy.yaml` reflects the new `app_name` description.
- `api/start-workflow.yaml` declares both payload fields under the `StartWorkflow` action properties.
- `makeWorkflowApis.js` emits both payload fields for every `update-action-{action_type}` Api.
- `WorkflowAPI/schema.js` declares `entry_id` as a required string property.
- `connections/workflow-api.yaml` wires `entry_id: { _module.id: true }`.
- `pnpm -F @lowdefy/workflows test` (or repo-wide test) still passes.
- `pnpm ldf:b` (or equivalent demo build) succeeds — no manifest/schema regressions.

## Files

- `modules/workflows/module.lowdefy.yaml` — modify (update `app_name` description).
- `modules/workflows/api/start-workflow.yaml` — modify (add `metadata` and `action_display` to action properties).
- `modules/workflows/resolvers/makeWorkflowApis.js` — modify (extend submit-api payload mapping).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify (add `entry_id` property).
- `modules/workflows/connections/workflow-api.yaml` — modify (wire `entry_id: { _module.id: true }`).
