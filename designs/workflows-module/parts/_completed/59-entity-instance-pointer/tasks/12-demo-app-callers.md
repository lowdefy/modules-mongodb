# Task 12: Demo app — nest entity in runtime start callers, list callers, hook reads, and e2e

## Context

The demo app exercises the modules and contains several **runtime callers** of the Part 59 surface. This task updates only those runtime callers — the workflow_config **definitions** themselves (`onboarding.yaml`, `company-setup.yaml`, `track-company-setup.yaml` top-level `entity_collection` / `entity_ref_key`, and any `vars.entities` map) are config-shape and migrate under **Part 57**, not here.

Key distinction from the design's "Where uniform stops": the **URL query param** `entity_id` stays flat (the link sentinel emits `?entity_id=…`). Only documents, payloads to start/list endpoints, Mongo queries, and hook reads nest.

## Task

### `apps/demo/pages/leads/lead-view.yaml`

- Start-button payloads to the generated start endpoint: `entity_id` / `entity_collection` → `entity: { id }` (drop the connection id — it's sourced from config in StartWorkflow).
- `actions-on-entity` and `entity-workflows-refetch` `_ref` callers: rename the var `entity_collection: leads-collection` → `entity_connection_id: leads-collection` (matches the component `_var` rename in Task 10). `entity_id` stays.

### `apps/demo/api/leads-create.yaml`

The `start_onboarding` call to `onboarding-start` (~lines 46-56) maps `entity_id: { _payload: _id }` + `entity_collection: leads-collection`. Drop the connection id and nest:

```yaml
properties:
  entity:
    id:
      _payload: _id
```

### `apps/demo/modules/workflows/workflow_config/company-setup/billing-details.yaml`

App-authored action requests read `_payload: context.workflow.entity_id` (~lines 37, 50) → `context.workflow.entity.id`. Update the explanatory comment (~lines 20-21) accordingly.

### `apps/demo/modules/companies/vars.yaml`

The `actions-on-entity` and `entity-workflows-refetch` `_ref` callers pass `entity_collection: { _module.connectionId: { id: companies-collection, module: companies } }` → rename the var to `entity_connection_id:` (same value). `entity_id` stays.

### `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`

- **Mongo queries** (`countDocuments` / `findOne` with `{ entity_id: ... }`, ~lines 74, 87, 97, 549) → `{ 'entity.id': ... }`.
- **Start-caller payload** (~lines 537-541) `entity_id: companyId` + `entity_collection: 'companies/companies-collection'` → `entity: { id: companyId }` (drop connection id).
- **URL-param assertions stay flat** (~lines 495, 513): `startHref` containing `entity_id=${leadId}` and `searchParams.get('entity_id')` are URL query params and keep the flat `entity_id` name — **do not change these**.

## Acceptance Criteria

- All demo runtime start-caller payloads pass `entity: { id }` (no `entity_collection`).
- `actions-on-entity` / `entity-workflows-refetch` `_ref` callers pass `entity_connection_id` (renamed) + `entity_id`.
- Hook/action reads use `context.workflow.entity.id`.
- e2e Mongo queries key on `entity.id`; URL-param assertions remain `entity_id`.
- `pnpm ldf:b` (from `apps/demo`) compiles (with Part 57 + Task 10 landed).

## Files

- `apps/demo/pages/leads/lead-view.yaml` — modify — start payloads + `_ref` var rename.
- `apps/demo/api/leads-create.yaml` — modify — nested start-caller payload.
- `apps/demo/modules/workflows/workflow_config/company-setup/billing-details.yaml` — modify — `context.workflow.entity.id` reads + comment.
- `apps/demo/modules/companies/vars.yaml` — modify — `_ref` var rename.
- `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — modify — Mongo queries + start payload (URL-param assertions unchanged).

## Notes

Depends on Tasks 9 + 10 (generated start endpoint param shape and component `_var` rename). The component rename and these caller renames must land together — between them the demo build is broken (accepted: unreleased modules). Workflow_config definitions are Part 57.
