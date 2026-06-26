# Task 5: Convert the demo to `entity:` blocks and verify the build

## Context

The demo is the only consumer of the `entities` var. After Tasks 1 and 4, the build validator requires an `entity:` block on every workflow and the `entities` var is gone from the manifest. The demo's two workflow configs must move their flat `entity_collection`/`entity_ref_key` and the app's routing entries into per-workflow `entity:` blocks, and the `entities` map must be deleted from `vars.yaml`.

Current demo state:

- `apps/demo/modules/workflows/vars.yaml` — declares `entities` for two collections (`leads-collection` → `lead-view`, `companies/companies-collection` → `companies/view`).
- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — `entity_collection: leads-collection`, `entity_ref_key: lead_ids` (flat, lines 3-4).
- `apps/demo/modules/workflows/workflow_config/company-setup/company-setup.yaml` — `entity_collection: { _module.connectionId: { id: companies-collection, module: companies } }`, `entity_ref_key: company_ids` (flat).

## Task

### `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml`

Replace the flat `entity_collection`/`entity_ref_key` (lines 3-4) with an `entity:` block that folds in the app's `leads-collection` routing entry:

```yaml
type: onboarding
# title omitted — derives to "Onboarding" via humanizeSlug.
entity:
  connection_id: leads-collection
  ref_key: lead_ids
  page_id: lead-view
  title: Lead
  # id_query_key omitted — defaults to _id
display_order: 1
```

### `apps/demo/modules/workflows/workflow_config/company-setup/company-setup.yaml`

Replace the flat fields with an `entity:` block that folds in the `companies/companies-collection` routing entry. Preserve the `_module.connectionId` operator for `connection_id`:

```yaml
type: company-setup
# title omitted — derives to "Company Setup" via humanizeSlug.
entity:
  connection_id:
    _module.connectionId: { id: companies-collection, module: companies }
  ref_key: company_ids
  page_id: companies/view
  title: Company
  # id_query_key omitted — defaults to _id
display_order: 2
```

### `apps/demo/modules/workflows/vars.yaml`

Delete the entire `entities:` map (lines 7-17). What remains is `workflows_config` and `app_name`.

### Verify

Run a build check from the repo root: `pnpm --filter @lowdefy/modules-demo ldf:b` (or `pnpm ldf:b` from `apps/demo`). It must compile clean — this exercises the new validator against the real demo configs.

## Acceptance Criteria

- Both demo workflow configs declare an `entity:` block with `connection_id`, `ref_key`, `page_id`, `title` (and no `id_query_key`, relying on the `_id` default).
- `company-setup` preserves the `_module.connectionId` operator for `entity.connection_id`.
- `vars.yaml` no longer contains an `entities` map.
- `pnpm ldf:b` (demo build check) passes.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — modify — flat fields → `entity:` block.
- `apps/demo/modules/workflows/workflow_config/company-setup/company-setup.yaml` — modify — flat fields → `entity:` block (keep `_module.connectionId`).
- `apps/demo/modules/workflows/vars.yaml` — modify — delete the `entities` map.

## Notes

- The build is the gate here, not a runtime smoke test. `pnpm ldf:b` needs no secrets or network beyond npm; build failures are real config errors.
- Mapping reference: `leads-collection` → page `lead-view`, title "Lead"; `companies/companies-collection` → page `companies/view`, title "Company". Both used `id_query_key: _id`, which is now the default and can be omitted.
