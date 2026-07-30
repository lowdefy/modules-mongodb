# Task 4: Collections Catalog Replaces the Dataset List

## Context

Today's data dictionary is a **list of datasets** keyed by `id` (`apps/demo/modules/reporting/datasets.yaml`), each with `source.collection`, `dimensions`, and `measures` — passed to the reporting module as the `datasets` var declared in `modules/reporting/module.lowdefy.yaml`. The open engine names raw collection names (`collection`, `$lookup.from`), so the dictionary becomes a **collections catalog**: a map keyed by collection name. With charts/reports/exports also on pipelines, nothing consumes `dimensions`/`measures` anymore — the catalog replaces the dataset list outright (single policy source).

This task is independent of the plugin work (tasks 1–3) and can run in parallel. Naming decision (recorded in tasks.md): the module var renames `datasets` → `catalog`; the demo file renames to `catalog.yaml`.

## Task

**`modules/reporting/module.lowdefy.yaml`:** replace the `datasets` var with `catalog`. Per the repo rule, every var (top-level and nested) carries `description:`, `type:`, and where applicable `default:`/`required:`/`enum:`. Shape:

```yaml
catalog: { [collectionName]: {
        roles, # optional string[] — user roles allowed to query this collection.
        # ABSENT/EMPTY = any authenticated user (role-gating is opt-in;
        # declaring a collection at all is the act of exposure). Say this
        # explicitly in the description.
        description, # what the collection holds — prompt material for the agent
        ? fields # map of field name → entry
        : { [fieldName]: {
                type, # string | number | boolean | date | object | array
                description,
                values, # optional enum values — feeds report select-filter options
                format,
                currency,
                locale,
                decimals, # optional display hints — prompt material
                # the agent copies into presentation contracts,
                # never enforcement
              } },
        relationships, # optional — which fields join to which collections, so the agent
        # can author correct $lookups, e.g.
        # [{ field: company_id, collection: companies, foreignField: _id }]
      } }
```

The engine enforces the **union** of `roles` across every collection a pipeline touches (base + all `$lookup.from`s, recursively).

**`apps/demo/modules/reporting/`:** replace `datasets.yaml` with `catalog.yaml` covering the collections the demo queries — `demo_orders` plus the view-backed collections the current datasets point at (`demo_activities_report` and friends; the views remain first-class catalog citizens, now optional conveniences rather than the required join mechanism). Requirements:

- At least one **relationship declaration** enabling a `$lookup` (e.g. an activities-style collection joining to a companies-style collection).
- At least one field with a **currency display hint** (carry over `demo_orders.total`: `format: currency` — today's dataset already declares it).
- At least one field with enum `values` (carry over `region`/`status`/etc.) so report select-filters keep working in task 6/7.
- Keep the header comment explaining the roles semantics, replacing the current "No `roles` on any dataset means any authenticated user may query it" comment with the catalog equivalent.

Update `apps/demo/modules/reporting/vars.yaml` (and any other `_var`/`_ref` plumbing that passed `datasets` into the module entry) to pass `catalog`.

Search `modules/reporting/` for every `_module.var: datasets` reference (agent instructions, API YAMLs, connection YAML) — do NOT rewrite their logic here (tasks 3/5/6 own those files), but leave a checklist in the task PR/commit message of the sites found, and update pure var-name plumbing where the change is mechanical (e.g. the connection property added in task 3 reads `_module.var: catalog`).

**Generated docs:** run `pnpm docs:gen` to regenerate `docs/reporting/reference/vars.md` from the manifest, and commit the regenerated file. `pnpm docs:check` must pass.

## Acceptance Criteria

- `module.lowdefy.yaml` declares `catalog` with full nested var schema (description/type on every level); `datasets` is gone.
- Demo `catalog.yaml` has ≥1 relationship, ≥1 currency display hint, ≥1 enum `values` field, and documents the empty-roles semantics in its header.
- `pnpm docs:gen` runs clean and `docs/reporting/reference/vars.md` reflects the catalog var.
- No file under `apps/demo/` still references `datasets.yaml`.

## Files

- `modules/reporting/module.lowdefy.yaml` — modify — `datasets` var → `catalog` with new shape
- `apps/demo/modules/reporting/datasets.yaml` — delete (replaced)
- `apps/demo/modules/reporting/catalog.yaml` — create
- `apps/demo/modules/reporting/vars.yaml` — modify — pass `catalog`
- `docs/reporting/reference/vars.md` — regenerate via `pnpm docs:gen`

## Notes

The demo build (`pnpm ldf:b:i`) will NOT pass after this task alone — the agent/API YAMLs still reference the old var and spec shape until tasks 5/6. The build gate is task 7. Don't "fix" those files here; that splits ownership and causes conflicts.
