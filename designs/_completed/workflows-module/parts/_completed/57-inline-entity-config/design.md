# Single `entity:` block on the workflow

Today a workflow's entity wiring is scattered across three places: `entity_collection` and `entity_ref_key` sit flat on the workflow definition in `workflows_config`, while the host-app routing metadata the module needs to deep-link back into an entity page (`page_id`, `id_query_key`, `title`) lives in a separate `entities` module var — a map keyed by `entity_collection`, declared in the app's `vars` block away from the workflows it serves. This design consolidates **all** of a workflow's entity wiring into one nested `entity:` block on the workflow definition — `connection_id`, `ref_key`, `page_id`, `id_query_key`, `title` — so a developer declares everything about a workflow's entity in one place, and removes the `entities` var entirely.

The block is **materialized as authored**: `makeWorkflowsConfig` validates it and carries the whole nested `entity` object into the materialized config unchanged — it does **not** lift any field back out to a flat alias. The engine reads the routing fields off `wfConfig.entity` (replacing the old `connection.entities` map). The persistence/runtime layer (workflow/action documents, the `StartWorkflow` param, queries, indexes, and the `entity_ref_key` reader in `planEventDispatch`) still uses the old flat `entity_collection`/`entity_id`/`entity_ref_key` names; nesting **that** layer to read `workflowConfig.entity.connection_id` / `.ref_key` is the separate Part 59. The two are applied in sequence and the repo is intentionally in a broken state between them (see Dependents).

## Proposed change

1. Add a required `entity:` block to each workflow definition in `workflows_config`, holding `connection_id`, `ref_key`, `page_id`, `title`, and optional `id_query_key` (defaults to `_id`) — the single home for everything about the workflow's entity.
2. Remove the `entities` module var from `module.lowdefy.yaml` and stop passing it to the `workflow-api` connection.
3. Drop the `entities` param from the WorkflowAPI connection schema; the four read methods that build `entity_link` read the routing fields off the workflow's already-resolved config entry (`wfConfig.entity`) instead of `connection.entities[entity_collection]`.
4. In `makeWorkflowsConfig`, validate the `entity:` block (required-string `connection_id`, `ref_key`, `page_id`, `title`; optional `id_query_key` defaulting to `_id`) and carry the **whole `entity` block wholesale** into the materialized config via `WORKFLOW_FIELDS` — nested, every field (not a fixed whitelist), so optional fields a dependent part adds (e.g. Part 56's `name_field`) survive without this resolver knowing about them. The old flat `entity_collection`/`entity_ref_key` picks in `WORKFLOW_FIELDS` are removed; nothing is lifted.
5. Update the demo (`vars.yaml` + per-workflow config files), docs, and the four engine method test suites to the new shape.

## Why

**One coherent entity block (primary reason).** A workflow definition already declares `type`, `display_order`, `starting_actions`, `action_groups`, and `actions` in one file (e.g. `workflow_config/onboarding/onboarding.yaml`), and today also carries `entity_collection` and `entity_ref_key` as flat fields — while the entity-page link lives in a separate `entities` map in the app's `vars` block. That splits one concept — "the entity this workflow is attached to, and how to reach it" — across flat workflow fields and a far-away keyed map, edited in two folder structures and kept in sync by hand. Gathering it all into one `entity:` block on the workflow removes the split and gives the developer a single, consistent place to describe the entity.

**The separate map is unvalidated today.** The manifest description for `entities` claims "part 4's `makeWorkflowsConfig` validator confirms every `entity_collection` referenced in `workflows_config` has a matching key here." That cross-check is **not implemented** — `makeWorkflowsConfig.js` contains no reference to `entities` (the var is read only by the connection at runtime). So today a missing or misspelled entry silently yields a `null` `entity_link` (no back-link) with no build error. Folding the fields into the workflow's `entity:` block lets `makeWorkflowsConfig` validate every entity field at build time — turning a silent runtime degradation into a build-time error. It also closes a pre-existing gap: today only `entity_ref_key` is required-checked, while `entity_collection` rides through `WORKFLOW_FIELDS` unvalidated (a workflow omitting it builds clean and writes documents with an undefined collection). Under the new block both `entity.connection_id` and `entity.ref_key` are required-checked in one place.

**Per-workflow link variation falls out, and is a supported use case.** Co-locating the routing fields means two workflows on the same entity connection can link to different entity pages — a different view per use-case — which a map keyed by `entity_collection` can't do without contortion. This is not the driver for the change (the two reasons above carry it on their own); it's a capability the new shape supports and that we intend to keep. The cost is duplication when several workflows share one connection and one link target — minimal here: the fields are few and static, and most entities carry a single workflow.

### Decision: the member is `connection_id`, not `collection`

The value (e.g. `leads-collection`) is a **Lowdefy connection id** — declared as a connection `id` in `lowdefy.yaml` and consumed everywhere as `connectionId:` — not a MongoDB collection name (the real collection lives inside the connection's config). The old flat field `entity_collection` named it loosely; the nested member is `entity.connection_id`, matching what the value is. Part 59 carries the same `connection_id` name onto the documents, query, and index, so authored and persisted names are identical end to end.

### Decision: one `entity:` block, materialized nested (not lifted)

All of a workflow's entity fields go in one nested `entity:` block:

```yaml
entity:
  connection_id: leads-collection
  ref_key: lead_ids
  page_id: lead-view
  title: Lead
  # id_query_key defaults to _id
```

Why one block rather than the prior split (flat `entity_collection`/`entity_ref_key` + a separate `entity:` block for routing only):

- **Consistency / one mental model.** Everything about the workflow's entity is described in one place. A developer doesn't have to know that "connection id" is a flat field but "page link" is a nested block — it's all `entity.*`.
- **Collision.** A workflow definition already accepts an optional top-level `title:` (its own display name, e.g. "Onboarding"). The entity type label is `entity.title`, which can't clash with the workflow's own top-level `title`.

**Materialized as authored — no lift.** An earlier revision of this design treated the block as authoring sugar and lifted `entity.connection_id`/`entity.ref_key` back to flat `entity_collection`/`entity_ref_key` so the persistence/runtime layer was untouched. That is dropped: lifting would leave the materialized config without a nested `entity.connection_id` for Part 59 to read, and re-flattening then re-nesting is churn. Instead `makeWorkflowsConfig` carries the whole `entity` block nested into the materialized config, and Part 59 updates the runtime readers (`StartWorkflow`, `planEventDispatch`, documents, queries, index) to consume `workflowConfig.entity.connection_id` / `.ref_key`. The consequence — accepted, since the modules are unreleased: between this part and Part 59 the runtime readers that still expect flat `entity_ref_key` break (`StartWorkflow` writes an undefined `entity_ref_key` onto new docs). No compatibility shim bridges the gap; the two parts ship in sequence and the in-between state is broken on purpose.

Alternative considered — keep everything flat with an `entity_` prefix (`entity_page_id`, `entity_id_query_key`, `entity_label`) and resolve the `title` collision by renaming. Rejected: a single grouped block is the whole point of the consolidation, and it reads better than five `entity_`-prefixed scalars.

### Rejected: keep the separate `entities` map

The prior design (part 17) chose the keyed map deliberately, on three arguments: it avoids duplicating fields across workflows that share a collection; the routing metadata is conceptually an _entity-kind_ fact (especially part 26's future `get_entity_endpoint`, "how to fetch a Lead"); and the engine consumes it keyed by `entity_collection` off the document. On re-examination:

- The runtime argument does not hold: every read method already resolves the workflow's config entry by `workflow_type` _before_ building `entity_link` (`GetWorkflowOverview.js:44`, `GetEntityWorkflows.js:81`, `GetWorkflowAction.js:147`, `GetWorkflowActionGroupOverview.js:43`), so reading `wfConfig.entity` is exactly as direct as `entities[entity_collection]` — no added indirection.
- The duplication argument is real but small (few static fields; usually one workflow per entity) and is the cost the user has explicitly accepted.
- The "entity-kind fact" argument is the genuine trade-off being made: we accept that an entity-scoped value (notably `get_entity_endpoint`) can be restated per workflow, in exchange for single-file config and build-time validation. Supporting per-workflow link variation is an additional benefit of the new shape, not the justification for it.

## Current state

**Var declaration** — `modules/workflows/module.lowdefy.yaml:75`:

```yaml
entities:
  type: object
  required: true
  description: >
    Map keyed by workflow `entity_collection` → `{ page_id, id_query_key, title }`. ...
```

**Connection wiring** — `modules/workflows/connections/workflow-api.yaml:17`:

```yaml
entities:
  _module.var: entities
```

**Connection schema** — `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js:153` declares the `entities` object param.

**Engine consumption** — four read methods, identical shape. Example, `GetWorkflowOverview.js:182`:

```js
const title = wfConfig?.title ?? null;
const entityConfig = entities[wfDoc.entity_collection];
const entity_link = entityConfig
  ? {
      pageId: entityConfig.page_id,
      urlQuery: { [entityConfig.id_query_key]: wfDoc.entity_id },
      title: entityConfig.title ?? null,
    }
  : null;
```

The same block appears in `GetEntityWorkflows.js:172`, `GetWorkflowAction.js:220` (keyed off `action.entity_collection` / `action.entity_id`), and `GetWorkflowActionGroupOverview.js:142`. Each reads `const entities = connection.entities ?? {}` near the top. The shared engine context already threads `workflowsConfig` (`shared/phases/createEngineContext.js:63`), and each method already holds the resolved `wfConfig`.

**Demo** — `apps/demo/modules/workflows/vars.yaml:7` declares the map for two collections (`leads-collection` → `lead-view`, `companies/companies-collection` → `companies/view`).

## Proposed shape

A workflow definition gains a single `entity:` block. Example, `workflow_config/onboarding/onboarding.yaml`:

```yaml
type: onboarding
entity:
  connection_id: leads-collection
  ref_key: lead_ids
  page_id: lead-view
  title: Lead
  # id_query_key defaults to _id
display_order: 1
starting_actions: [...]
action_groups: [...]
actions: [...]
```

Fields:

- `entity.connection_id` (required) — the entity's Lowdefy connection id (e.g. `leads-collection`). Carried nested into the materialized config; Part 59 makes it the document/query/index field.
- `entity.ref_key` (required) — the event-references key (e.g. `lead_ids`) written into event docs so events surface on the entity. Carried nested; Part 59 makes `planEventDispatch` read `workflow.entity.ref_key`.
- `entity.page_id` (required) — host-app page id rendering the entity.
- `entity.id_query_key` (optional, default `_id`) — URL query-string key the entity page expects for its primary id.
- `entity.title` (required) — singular human-readable entity-kind label (e.g. "Lead", "Company").

The materialized `entity` block carries the whole authored object (`connection_id`, `ref_key`, `page_id`, `id_query_key`, `title`, plus any optional field a dependent part adds — e.g. Part 56's `name_field`). The engine block becomes (using the already-resolved `wfConfig`):

```js
const title = wfConfig?.title ?? null;
const entityConfig = wfConfig?.entity;
const entity_link = entityConfig
  ? {
      pageId: entityConfig.page_id,
      urlQuery: { [entityConfig.id_query_key]: wfDoc.entity_id },
      title: entityConfig.title ?? null,
    }
  : null;
```

`GetWorkflowAction` continues to source the id from the action doc (`action.entity_id`) while reading the routing fields from `wfConfig.entity` (resolved via `action.workflow_type`). (Both the doc-id reads here and the `wfDoc.entity_id` read above stay flat in this part — Part 59 nests them.)

## Validation

In `makeWorkflowsConfig.js`:

- In `validateWorkflow` (~line 573), require `workflow.entity` to be an object with non-empty string `connection_id`, `ref_key`, `page_id`, and `title`; `id_query_key` is optional and defaults to `_id`. Fail the build with a precise message (e.g. `workflow "onboarding": missing required "entity.page_id" — the host-app page id the workflow back-link navigates to`). Keep the existing legacy `entity_type` rejection. The existing top-level-`title` type-check (the workflow's own display name) is unaffected — that field stays top-level.
- **Carry the whole `entity` block nested in the normalized output:** carry the `entity` object wholesale via `WORKFLOW_FIELDS` (`connection_id`, `ref_key`, `page_id`, `id_query_key` defaulted, `title`, plus any optional field a dependent part adds — not a fixed whitelist), and **remove** the old flat `entity_collection`/`entity_ref_key` picks. Nothing is lifted to a flat alias; the materialized shape the connection and engine see is `{ ..., entity: { connection_id, ref_key, page_id, id_query_key, title, ...optional } }`.

This is strictly more coverage than today: the `entities` map was unvalidated and `entity_collection` was carried-but-unvalidated; now every entity field is required-checked in one place.

## Files changed

- `modules/workflows/module.lowdefy.yaml` — remove the `entities` var (lines 75–87); rewrite the `workflows_config` description to document the unified `entity:` block (`connection_id`, `ref_key`, `page_id`, `id_query_key` default `_id`, `title`) instead of flat `entity_collection`/`entity_ref_key`.
- `modules/workflows/connections/workflow-api.yaml` — remove the `entities:` property (lines 17–18).
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — validate the `entity:` block in `validateWorkflow` (`connection_id`/`ref_key`/`page_id`/`title` required strings, `id_query_key` optional default `_id`); carry the **whole `entity` block nested** via `WORKFLOW_FIELDS` (every field, not a fixed whitelist, so optional fields like Part 56's `name_field` survive) and **drop** the now-obsolete flat `entity_collection`/`entity_ref_key` picks. Nothing is lifted. Keep the legacy `entity_type` rejection.
- `modules/workflows/resolvers/makeActionPages.js` — update the existing flat-shape read at `:86` (`entity_collection: workflow.entity_collection`) to the nested `workflow.entity.connection_id`. This resolver reads the **raw authored** workflow YAML, so it goes stale the moment this design moves the authored shape to the nested `entity:` block; it predates Part 56 and must move with the authoring change here (Part 56 then adds its own `entity.ref_key` / `entity_view` reads to the same resolver, and Part 59 renames the template var the value feeds).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — remove the `entities` param (lines 153–169). (No `entity`-block schema entry needed: it rides through the `additionalProperties: true` `workflowsConfig`.)
- Four engine methods — `GetWorkflowOverview.js`, `GetEntityWorkflows.js`, `GetWorkflowAction.js`, `GetWorkflowActionGroupOverview.js`: drop `const entities = connection.entities ?? {}`, read `wfConfig?.entity` for routing, and update the header/inline doc comments that reference `connection.entities`. (Collection/id reads stay on the flat `wfDoc.entity_collection` / `wfDoc.entity_id` — this part doesn't touch the document shape; Part 59 does.)
- Four engine test suites — replace the `entities` connection fixture with a unified `entity` block on the workflow-config fixtures; the existing "resolves from connection.entities" / "null when no entry" tests become "resolves from `wfConfig.entity`" / "null when the workflow config has no `entity` block".
- `apps/demo/modules/workflows/vars.yaml` — remove the `entities` map (lines 7–17).
- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` and `.../company-setup/company-setup.yaml` — replace the flat `entity_collection`/`entity_ref_key` and the app's routing entries with the unified `entity:` block.
- `apps/workflows-test/modules/workflows/vars.yaml` — remove the `entities` map (lines 7–11; one `things-collection` entry with `page_id`/`id_query_key`/`title`).
- The nine `apps/workflows-test/modules/workflows/workflow_config/**` definitions that carry flat `entity_collection`/`entity_ref_key` — `cascade-keyed`, `form-lifecycle`, `operational-lifecycle`, `tracker-child/tracker-child-flow`, `tracker-child/tracker-parent`, `access-verbs`, `error-recovery`, `field-gallery`, `check-blocked-by`. Replace the flat fields and the deleted `entities` routing entry with the unified `entity:` block on each (`connection_id: things-collection`, `ref_key` from the old `entity_ref_key`, `page_id: thing-view`, `id_query_key: _id`, `title: Thing`). These are **config definitions** (this part's domain, required by the updated `validateWorkflow`), not "start callers" — without them the workflows-test build fails the validator once this part lands. (Part 59 owns only the _runtime_ callers in workflows-test — start payloads, `get-entity-workflows` callers, e2e specs.)
- `docs/workflows/index.md` — remove the `entities` var bullet (line 56) and example (line 43); document the `entity:` block under workflow authoring.
- `docs/workflows/reference/authoring-grammar.md` — replace the flat `entity_collection`/`entity_ref_key` entries with the `entity:` block (line 16).
- `docs/workflows/reference/vars.md` — regenerated via `pnpm docs:gen` (drops the `entities` row).

## Migration

The modules are unreleased and have no external consumers, so there is no migration burden — the only `vars.entities` users are the two in-repo apps (`apps/demo` and `apps/workflows-test`), both updated as part of this change. In each app, every workflow's flat `entity_collection`/`entity_ref_key` and the app's `vars.entities` routing entry for its collection move into that workflow's `entity:` block; the `entities` var is then deleted. Build validation enforces the new shape (a workflow missing a required `entity.*` field fails the build) — which is exactly why the nine workflows-test config definitions must migrate here and not be left to Part 59: once this part's `validateWorkflow` requires the `entity:` block, any app still carrying flat fields fails the build.

## Non-goals

- **Nesting the entity object through the persistence/runtime layer** — the workflow/action documents, the queries, the `StartWorkflow` param, the index, and `planEventDispatch`'s `entity_ref_key` read still use the flat `entity_collection`/`entity_id`/`entity_ref_key` names. This part nests only the **config** (`workflowConfig.entity`); it does **not** keep the runtime working in isolation — the runtime readers that expect flat config fields break until Part 59 updates them (accepted, see the "materialized nested" decision and Dependents). Restructuring the persisted/runtime layer to a nested `entity: { connection_id, id }` is Part 59.
- No per-workflow `page_id` _override-with-fallback_ mechanism — each workflow declares its `entity:` block outright. (There is no shared map left to fall back to.)
- No change to how `entity_id` is sourced (still off the workflow/action document) or to the `entity_link` response shape consumed by the pages.

**Behavior change — back-link for de-configured workflow types.** Today `entity_link` is built from `entities[wfDoc.entity_collection]`, keyed off the collection stored on the document, so a workflow/action whose `workflow_type` has since been **removed or renamed** in `workflows_config` (e.g. a retired workflow whose historical/closed records are kept) still renders a back-link — the collection persists in the map even when the type is gone. After this change the link is built from `wfConfig?.entity`, resolved by `workflow_type`, so a document of a de-configured type yields `entity_link: null`. This is **inherent to routing by workflow rather than by collection** — once the routing fields live per-type and the type is gone, there is no data left to build the link from (the read methods don't filter de-configured types out; they still render, just without the back-link). Such a document already loses its config-derived chrome today (`title`, group titles/icons all null), so this is consistent with existing behavior — though note the per-action surface (message, links, status, access) is document-driven and still renders, so the missing back-link is the most visible loss. Accepted: the case is narrow (a type removed while its documents survive), the entity page itself is unaffected, and preserving the link would require keeping a collection-keyed fallback map — i.e. not doing this change.

## Dependents

- **Entity object end-to-end** — Part 59 (`parts/59-entity-instance-pointer`, "Nested entity instance pointer"). This design nests the **config** `entity:` block and materializes it nested (`workflowConfig.entity.connection_id` / `.ref_key`). Part 59 nests the **persistence/runtime** layer to match — `{ entity: { connection_id, id } }` on workflow/action documents, an `entity` param object on `StartWorkflow`, `entity.connection_id`/`entity.id` query and index keys, nested parent/child denormalization, and switching `StartWorkflow` / `planEventDispatch` to read `workflowConfig.entity.*` — so entity identity is represented one way top to bottom. It is cross-cutting (~8 engine source files + `StartWorkflow` + indexes + most test suites) and, since the modules are unreleased, needs no data migration. Sequence 57 → 59; the repo is intentionally broken between them (no compat shim).
- Part 26 (`parts/_next/26-entity-data-contract`) is a **parked, speculative** part: it proposes fetching entity data through a host-app-supplied `get_entity_endpoint` rather than letting the module read the entity collection directly. It is **not** a committed dependency of this design, and it overlaps with the far lighter `entity.name_field` (Part 56), which already covers the one concrete need on the table (the breadcrumb instance name). If it is ever revived, two things change under this design:
  - **Field location.** `get_entity_endpoint` would be an optional field on the per-workflow `entity:` block (`entity.get_entity_endpoint`), not a key on the removed `entities` map.
  - **Mechanism (the real friction, not just a field move).** Part 26 resolves the endpoint at **build time** via Nunjucks substitution in `makeActionPages` (`endpointId: {{ entities[entity_collection].get_entity_endpoint }}`, part-26 design lines 55–71), reading the raw `entities` enum keyed by collection. After this design that routing metadata lives in `workflows_config`, consumed at **runtime** through the `makeWorkflowsConfig` resolver and the connection — there is no build-time enum a `.njk` template can index by `entity_collection`. So Part 26 cannot simply point at `entity.get_entity_endpoint`; its whole build-time-substitution approach would need reworking to source the endpoint from runtime config (or keep the field reachable at build time some other way). Whoever picks up Part 26 should treat this as a mechanism change, not a field relocation.
