---
title: The collections catalog
module: reporting
type: reference
concepts: [catalog, roles, confidentiality, display-hints, bootstrap, view-leak]
---

# The collections catalog

The `catalog` var is the reporting module's single most important input. It is two things at once:

1. **The data dictionary** — the agent's knowledge of what it can query, embedded in its instructions at build time.
2. **The confidentiality and authorization boundary** — the allowlist the [query engine](../concepts/open-query-engine.md) validates every pipeline against.

The agent can only describe and query what the catalog declares. See [Vars](vars.md) for the generated schema summary; this page explains the shape and its semantics.

## Shape

`catalog` is a map keyed by collection name. Each entry describes one collection (or view):

```yaml
catalog:
  demo_orders:
    roles: [reporting-viewer] # optional — see "roles semantics" below
    description: >
      Synthetic customer orders — one document per order, with totals,
      quantities, status and channel.
    fields:
      region:
        type: string
        description: Customer region
        values: [North, South, East, West] # enum values — feed select-filter options
      total:
        type: number
        description: Order total, money.
        format: currency # display hints — prompt material only
        currency: USD
        locale: en-US
        decimals: 2
    relationships:
      - field: customer_id
        collection: demo_companies
        foreignField: _id
```

| Key             | Type                                                      | Meaning                                                                                                |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `roles`         | `string[]` (optional)                                     | User roles allowed to query this collection. **Absent or empty = any authenticated user** (see below). |
| `description`   | `string`                                                  | What the collection holds — prompt material for the agent.                                             |
| `fields`        | `map` of field name → field entry (optional)              | Per-field type, description, enum values, and display hints.                                           |
| `relationships` | array of `{ field, collection, foreignField }` (optional) | Which fields join to which collections, so the agent can author correct `$lookup`s.                    |

A **field entry** carries `type` (one of `string`, `number`, `boolean`, `date`, `object`, `array`), `description`, an optional enum `values` array, and the optional display hints `format`, `currency`, `locale`, `decimals`. Field names may be dotted paths into sub-documents (`profile.name`, `created.timestamp`).

## Roles semantics

- **Absent or empty `roles` means any authenticated user may query the collection.** Role-gating is opt-in per collection.
- **Declaring a collection in the catalog is itself the act of exposing it.** There is no separate "enable" flag — presence is the gate.
- **The engine enforces the union of roles across every touched collection.** A pipeline whose base collection and `$lookup.from` targets carry `roles` lists requires the caller to satisfy _every_ non-empty list among them. If any touched collection is role-gated and the caller holds none of its roles, the whole pipeline is rejected.

There is **no field-level scoping.** Declaring a collection exposes _all_ its fields. To expose a collection while hiding some fields, declare a read-only MongoDB view that projects the sensitive fields away and catalog the view instead (see [Reporting over complex data](../how-to/complex-data.md)).

## Where the catalog binds

The module wires the catalog onto its own `reporting-data` connection (via `_module.var: catalog`), so every query validates against the same catalog by construction — requests never carry one.

**If your app remaps `reporting-data` onto its own connection entry, you must bind the catalog there yourself.** A `connections:` remap replaces the module's connection definition entirely, including the catalog binding — without it, the engine has no catalog and rejects every pipeline. Set `catalog:` on the app connection's `properties`, referencing the same file the module var uses so the two cannot drift:

```yaml
- id: reporting-analytics # app connection reporting-data is remapped to
  type: ReportingData
  properties:
    databaseUri:
      _secret: REPORTING_DATA_MONGODB_URI
    catalog:
      _ref: modules/reporting/catalog.yaml
```

See `apps/demo/lowdefy.yaml` for the worked example.

## Display hints are prompt material, not enforcement

`format`, `currency`, `locale`, `decimals`, and a field's enum `values` are **prompt material only.** The agent copies them into the [presentation contracts](presentation-contract.md) it authors, so a field formats consistently across every chart, KPI, table, and report that touches it. The engine never enforces them against the data — they shape the agent's output, nothing more. (Enum `values` do double as the fallback option source for a report's select filters.)

## The bootstrap workflow

The curated catalog is a trusted, human-owned artifact. To lower the cost of the first draft across many collections, `scripts/gen-reporting-catalog.mjs` drafts one from a live database:

1. It connects with the reporting **read-only principal** (the same credential the engine queries with — see the [provisioning steps](../../shared/secrets.md#read-only-reporting-principal-reporting_data_mongodb_uri)), lists collections and views, and `$samples` a bounded number of documents from each.
2. It infers per-field types, flattens sub-documents one level into dotted paths, notes arrays, and detects low-cardinality string fields as candidate enums.
3. Optionally it asks a model (via the reporting AI gateway) to draft descriptions, confirm enum candidates, propose display hints, and infer relationships from field naming.

Two properties make the draft safe to hand a human:

- **It fails closed.** Every collection entry is emitted **commented out.** An active entry with empty `roles` would be queryable by any authenticated user, so declaring a collection must be a deliberate human act — **uncommenting an entry is that act.** An unedited draft checked in declares nothing.
- **`roles` are never AI-drafted.** The script emits `roles` only as an empty placeholder for the curator to fill.

Re-runs are **schema-drift detection**: collections, fields, relationships, and enum values are emitted in deterministic sorted order, so a re-run against a changed schema diffs cleanly against the curated file. (Descriptions come from the model and may vary slightly; `$sample` is random, so rarely-present fields and observed enum values can flicker between runs.)

This script is never a runtime path — the engine reads only the curated, committed `catalog` var.

## The view-leak caveat

A cataloged collection may be a **MongoDB view** whose own definition `$lookup`s into a collection that is **not** declared in the catalog. The engine sees only the view name and never inspects the view's underlying pipeline, and a DB-wide `read` principal can read the view's targets — so such a view can leak data past the catalog boundary.

When you declare a view in the catalog, **auditing its definition is an operator responsibility**: every collection it reaches must be one you intend to expose. Deployments that cannot audit their views should narrow the read-only principal to per-collection grants instead. See [Secrets → View-leak audit responsibility](../../shared/secrets.md#view-leak-audit-responsibility).
