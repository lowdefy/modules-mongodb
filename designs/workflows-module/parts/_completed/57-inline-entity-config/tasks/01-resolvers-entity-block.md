# Task 1: Validate the `entity:` block and carry it nested in the build-time resolvers

## Context

Today a workflow's entity wiring is split: `entity_collection` and `entity_ref_key` are flat fields on each workflow definition in `workflows_config`, while the host-app routing metadata (`page_id`, `id_query_key`, `title`) lives in a separate `entities` module var keyed by `entity_collection`. This part consolidates everything into one nested `entity:` block on the workflow definition.

The block is **materialized as authored — not lifted**. `makeWorkflowsConfig` validates the block and carries the **whole `entity` object** into the materialized config unchanged; it does **not** lift any field back to a flat `entity_collection`/`entity_ref_key` alias. The engine reads its routing fields off `wfConfig.entity`. The persistence/runtime layer (documents, `StartWorkflow`, `planEventDispatch`, queries, indexes) still expects the flat `entity_collection`/`entity_id`/`entity_ref_key` names and **breaks** until Part 59 nests them — accepted, since the two parts ship in sequence and the modules are unreleased (see the design's "materialized nested" decision and Dependents).

New authoring shape (per workflow definition file, e.g. `workflow_config/onboarding/onboarding.yaml`):

```yaml
type: onboarding
entity:
  connection_id: leads-collection
  ref_key: lead_ids
  page_id: lead-view
  title: Lead
  # id_query_key defaults to _id
display_order: 1
```

Materialized shape the connection/engine see (the whole `entity` block, nested — no flat alias):

```js
{ ..., entity: { connection_id, ref_key, page_id, id_query_key, title } }
```

Two **build-time resolvers** read these entity authoring fields off raw YAML and must move together:

1. `modules/workflows/resolvers/makeWorkflowsConfig.js` — validates and materializes the config.
2. `modules/workflows/resolvers/makeActionPages.js` — generates per-verb action pages; at line 86 it reads `workflow.entity_collection` straight off raw YAML (see the comment at lines 73-76: "this resolver reads raw YAML, not the materialized config, so it must re-derive"). It is **parallel to** `makeWorkflowsConfig`, not downstream, so the materialization does not cover it. Under the new shape its read must become `workflow.entity.connection_id`. _(The design's "Files changed" list includes this file — design.md:152.)_

## Task

### `modules/workflows/resolvers/makeWorkflowsConfig.js`

**Validation (`validateWorkflow`, ~line 573).** Replace the current `entity_ref_key`-only required-string check with a full `entity:` block validation:

- Keep the existing legacy `entity_type` rejection (lines 574-579) exactly as-is.
- Require `workflow.entity` to be a non-null object. Fail with a precise message if missing or not an object.
- Require non-empty string `entity.connection_id`, `entity.ref_key`, `entity.page_id`, and `entity.title`. Each gets its own precise failure message in the style of the existing ones, e.g.:
  - `workflow "onboarding": missing required "entity.connection_id" — the Lowdefy connection id for the workflow's entity (e.g. "leads-collection").`
  - `workflow "onboarding": missing required "entity.ref_key" — the event-references key for the workflow's entity (e.g. "lead_ids"), written into event docs so events surface on the entity.`
  - `workflow "onboarding": missing required "entity.page_id" — the host-app page id the workflow back-link navigates to.`
  - `workflow "onboarding": missing required "entity.title" — the singular human-readable entity-kind label (e.g. "Lead").`
- `entity.id_query_key` is optional; when present it must be a non-empty string, and it defaults to `_id` (apply the default in the carry step below, not in validation).
- Leave the existing top-level-`title` type check (lines 591-596) untouched — that is the workflow's own display name and stays a top-level field. Note the workflow's top-level `title` (e.g. "Onboarding") and the entity-kind label `entity.title` (e.g. "Lead") are distinct and cannot collide.

**Carry the `entity` block nested (the `result.map` return, ~lines 769-776).** Currently `WORKFLOW_FIELDS` (lines 31-39) includes `'entity_collection'` and `'entity_ref_key'`, picked straight off the raw workflow. Change this so the materialized workflow object carries the whole `entity:` block nested, with nothing lifted to a flat alias:

- Remove `'entity_collection'` and `'entity_ref_key'` from `WORKFLOW_FIELDS` (they no longer exist as flat fields on the authored input).
- Carry the **whole `entity` object wholesale** — every authored field, not a fixed whitelist — applying only the `id_query_key` default. Concretely: `entity: { ...workflow.entity, id_query_key: workflow.entity.id_query_key ?? '_id' }`. Carrying it wholesale (rather than picking `connection_id`/`ref_key`/`page_id`/`id_query_key`/`title` explicitly) means an optional field a dependent part adds — e.g. Part 56's `name_field` — survives onto `wfConfig.entity` without this resolver knowing about it.
- The remaining `WORKFLOW_FIELDS` picks (`type`, `title`, `display_order`, `starting_actions`, `action_groups`) and the existing title/action-group defaulting stay as-is.

The resulting materialized shape must be exactly `{ type, title, entity: { connection_id, ref_key, page_id, id_query_key, title, ...optional }, display_order, ...action_groups?, actions }` — i.e. identical to today except the flat `entity_collection`/`entity_ref_key` picks are gone and the whole authored `entity` block is carried nested with `id_query_key` defaulted.

### `modules/workflows/resolvers/makeActionPages.js`

- Line 86: change `entity_collection: workflow.entity_collection,` to `entity_collection: workflow.entity.connection_id,`. The njk var name stays `entity_collection` (templates `view/edit/review/error.yaml.njk` consume `{{ entity_collection }}` unchanged in this part) — only the source moves to the nested block. (Part 59 later renames the template var to `connection_id`.)

### Test suites

- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — move every workflow fixture from flat `entity_collection`/`entity_ref_key` to the nested `entity:` block (`connection_id`, `ref_key`, `page_id`, `title`, optional `id_query_key`). Update assertions that check the materialized output to expect the whole `entity` block carried nested — `entity: { connection_id, ref_key, page_id, id_query_key, title }` (with `id_query_key` defaulting to `_id` when omitted) — and **no** flat `entity_collection`/`entity_ref_key` on the materialized workflow. Add coverage for the new validation: missing `entity` object, and missing each of `entity.connection_id`/`entity.ref_key`/`entity.page_id`/`entity.title`, each failing the build; `id_query_key` defaulting to `_id`; and an optional unknown field (e.g. `name_field`) surviving the wholesale carry. Keep the existing legacy `entity_type` rejection test.
- `modules/workflows/resolvers/makeActionPages.test.js` — the input workflow fixture at line 56 uses flat `entity_collection: "leads-collection"`; change it to `entity: { connection_id: "leads-collection", ref_key: "lead_ids", page_id: "lead-view", title: "Lead" }` (or whatever minimal block the test needs). Assertions on the emitted page var `entity_collection` stay (the value is unchanged — only its source moved).

## Acceptance Criteria

- `validateWorkflow` rejects a workflow missing the `entity` object or any of `entity.connection_id`/`entity.ref_key`/`entity.page_id`/`entity.title`, each with a precise message.
- `entity.id_query_key` defaults to `_id` in the materialized `entity` block when omitted.
- The materialized config carries the whole `entity` block nested — `entity: { connection_id, ref_key, page_id, id_query_key, title, ...optional }` — and exposes **no** flat `entity_collection`/`entity_ref_key`.
- `makeActionPages` sources the `entity_collection` page var from `workflow.entity.connection_id`.
- The legacy `entity_type` rejection still fires.
- `pnpm --filter @lowdefy/modules-workflows test` (or the repo's resolver test command) passes for `makeWorkflowsConfig.test.js` and `makeActionPages.test.js`.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — `entity:` block validation in `validateWorkflow`; carry the whole `entity` block nested (wholesale, `id_query_key` defaulted) in the materialized output, lifting nothing; drop `entity_collection`/`entity_ref_key` from `WORKFLOW_FIELDS`. Keep `entity_type` rejection.
- `modules/workflows/resolvers/makeActionPages.js` — modify — line 86: source the `entity_collection` page var from `workflow.entity.connection_id`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — migrate fixtures to the `entity:` block; add validation + default coverage.
- `modules/workflows/resolvers/makeActionPages.test.js` — modify — migrate the input fixture's flat `entity_collection` to the `entity:` block.

## Notes

- `makeWorkflowApis.js` reads `entity_collection` only via the runtime `_payload` operator (`makeWorkflowApis.js:221`), not off raw authoring YAML, so it needs no change. Its test fixtures use `entity_ref_key` as plain data not routed through `validateWorkflow`, so they are unaffected.
- Runtime consumers `StartWorkflow.js:181` and `planEventDispatch.js:160` read the **materialized** `workflowConfig.entity_ref_key` (a flat field). Because this task stops carrying that flat alias, those reads now resolve to `undefined` and **break** — accepted and intentional: Part 59 switches them to `workflowConfig.entity.ref_key`. Do **not** add a compatibility shim here; the in-between state is broken on purpose (see the design's "materialized nested" decision and Dependents).
- The company-setup demo workflow sets the connection id via the `_module.connectionId` operator (now under `entity.connection_id`). Validation runs on the resolved value at build time, so a non-string operator object is not a concern here — but do not assume `entity.connection_id` is a literal string in any code path other than validation (which sees the resolved value).
