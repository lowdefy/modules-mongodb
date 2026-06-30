# Part 26 — Entity data contract (host `data_endpoint` routine, server-resolved)

Workflow pages need data _about the entity a workflow is attached to_ — its display name for breadcrumbs and back-links, and arbitrary entity fields for the action page's read-only summary and its side panel. Today that data is fetched two incompatible ways: action pages bake a per-workflow `get_entity` MongoDB request (works because they're generated per workflow type), while the shared overview pages can't bake a connection at all and so have no entity name. This part replaces both with **one mechanism**: the host app writes a single _routine_ per entity type that returns whatever entity data it wants, and the workflows module's read APIs call that routine server-side and surface the result on their responses. The client never learns the routine exists — it just reads `entity_link.name` and an `entity` object off the API response.

> This design predates a `vars.entities` enum that an earlier draft assumed. There is no such enum — entity wiring lives in each workflow's `entity:` block (`connection_id`, `ref_key`, `page_id`, `id_query_key`, `title`, plus the now-removed `name_field`). This rewrite reflects current reality.

## Proposed change

1. Add an optional **`entity.data_endpoint`** field to a workflow's `entity:` block — the id of a host-app Api endpoint (a routine) that, given an entity instance id, returns an entity-data object.
2. The four read handlers (`GetWorkflowAction`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview`, `GetEntityWorkflows`) call this routine **server-side via `callApi`** and lift its reserved **magic `name`** field onto `entity_link.name` on every response.
3. `GetWorkflowAction` additionally returns the **full routine object** as `entity` on its response, so the action page's `DataDescriptions` summary and its `entity_view` slot read entity fields from there.
4. **Delete** `requests/get_entity.yaml.njk`, the `connection_id`/`name_field` baking in `makeActionPages`, and the `entity.name_field` config field — all subsumed by the routine.
5. Keep `entity.connection_id` (its only remaining role is entity identity / the `GetEntityWorkflows` query) and keep static `entity.title` as the type label and the no-routine fallback.
6. Migrate the demo's entity slot and any `entity.*` form-config fields to read from the routine result instead of the deleted `get_entity` request.

## Key decisions and rationale

### Why a host routine called server-side, not a client fetch or a config-supplied pipeline

Three approaches were on the table for getting entity data onto the shared overview pages, which can't bake a per-workflow connection:

- **Client `CallApi`** (an earlier draft of this part): the page fires a host endpoint and stores the result in state. Rejected — it pushes the mechanism into the client (every page must remember to call it and wire the result), and it can't populate the back-link/breadcrumb that the layout reads from the API response itself.
- **Server-side read of the entity collection** (Part 63 Option B): the read handler reads the entity doc directly. Blocked — the handler only holds a Mongo handle to the _workflow-api_ connection's database, and only knows the entity's Lowdefy `connection_id`, not its Mongo collection name or cluster. It would need a new `entity.collection` field _and_ a same-database assumption (entity must live in the workflow store's DB).
- **Per-workflow generated overview pages** (Part 63 Option C): convert the shared pages to `makeActionPages`-style generation so each bakes its own `get_entity`. Rejected — large refactor with blast radius across every cross-module link to the overview pages and the engine link builders.

A host routine sidesteps all of it. The routine **names its own connection**, so it reads whatever database/collection/cluster it likes — no `entity.collection` field, no same-DB assumption. The read handler invokes it with `callApi`, which is already battle-tested in this module (events, notifications, and pre/post hooks all dispatch through `callApi({ endpointId, payload })`, running as the same authenticated user, returning just the routine's `:return` value, with a depth-10 recursion guard). The client stays ignorant: it reads populated fields off the response.

### Arbitrary data + reserved magic keys (not a fixed schema)

The routine returns an **arbitrary, host-shaped object** — the host decides what to fetch, compute, or hardcode. The module reserves exactly one **magic key** it reads for its own chrome: **`name`** (the entity instance display name). Everything else in the object belongs to the host, consumed by their own UI (the `DataDescriptions` `entity.*` field configs and the `entity_view` slot blocks).

This is what makes one routine able to serve every entity surface. A genuinely _fixed_ schema can't describe the slot, because the slot reads arbitrary fields the host authored. Reserving a small magic-key set and passing the rest through gives the host a single place to declare "everything about this entity" while keeping the module's contract tiny.

### `name` is the one magic field; `title` stays static

The entity **type label** (e.g. "Lead") stays as the existing required static `entity.title`. It is the breadcrumb's type-label crumb and the fallback shown when no instance name is available. Keeping it static means it works **without** a routine (the no-endpoint fallback) and never costs a call.

Making `type` a _second_ magic field would only earn its place if the entity type genuinely varied per instance (polymorphic entities) — a speculative need today. So: `name` is the single magic key the routine drives; `title` remains static config.

### `connection_id` stays; removing it is a separate change

With `get_entity` deleted, `connection_id` is no longer used to _fetch_ anything. Its only remaining role is **entity identity**: it is stored on the workflow doc's `entity` block and `GetEntityWorkflows` queries on it (`{ "entity.connection_id": …, "entity.id": … }`) to find every workflow for an entity, scoping the entity-id namespace. Removing it would touch the workflow write path, the stored document shape, the entity-hub query, and require migrating existing docs — an entity-identity-model change out of scope here. It stays.

## The routine contract

### Authoring — `entity.data_endpoint`

```yaml
workflows_config:
  - type: onboarding
    entity:
      connection_id: leads-collection # identity / GetEntityWorkflows query (unchanged)
      ref_key: lead_ids # event linkage (unchanged)
      page_id: lead-view # entity link target (unchanged)
      id_query_key: _id # entity link query key (unchanged)
      title: Lead # type label + no-routine fallback (unchanged)
      data_endpoint: get-lead-entity-data # NEW — host routine id
```

`data_endpoint` is **optional**. The value is the host-app endpoint id, passed verbatim to `callApi` (the same way pre/post hook ids and `endpoints.new_event` are handled today). The host registers the routine in their app's `apis:`.

### The routine itself (host-authored)

A normal Lowdefy Api endpoint. It receives `{ entity_id }` and returns an object whose only module-reserved key is `name`:

```yaml
# host app: apis/get-lead-entity-data.yaml
id: get-lead-entity-data
type: Api
routine:
  - id: load
    type: MongoDBAggregation
    connectionId: leads-collection # host wires its OWN connection here
    payload:
      entity_id:
        _payload: entity_id
    properties:
      pipeline:
        - $match: { _id: { _payload: entity_id } }
  - :return:
      name:
        _string.concat: # magic key — module reads this
          - _step: load.0.first_name
          - " "
          - _step: load.0.last_name
      email: # host-owned — for the slot / DataDescriptions
        _step: load.0.email
      status:
        _step: load.0.status
```

The routine is free to skip the DB entirely and return hardcoded/derived values — the module only cares that `name` (if present) is the display name, and that the rest is whatever the host's own UI references.

**Payload is `{ entity_id }` only.** The entity instance id comes from `wfDoc.entity.id` / `action.entity.id`. `connection_id` is deliberately _not_ in the payload — the host declares the connection inside the routine (less indirection, more intuitive). One routine per entity type; no dispatcher.

### Read-handler behavior

Each read handler matches the workflow's config (`wfConfig = workflowsConfig.find(wc => wc.type === doc.workflow_type)`), then, when `wfConfig.entity.data_endpoint` is set:

```text
data = await callApi({ endpointId: wfConfig.entity.data_endpoint,
                       payload: { entity_id: <doc>.entity.id } })
entity_link.name = data?.name ?? null      // lifted onto chrome — ALL four handlers
```

`GetWorkflowAction` additionally returns the whole object:

```text
return { …action, entity_link, entity: data ?? null }
```

| Handler                          | Lifts `name` → `entity_link.name`                              | Returns full `entity` object              |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `GetWorkflowAction`              | yes                                                            | **yes** (slot + DataDescriptions need it) |
| `GetWorkflowOverview`            | yes                                                            | no (overview has no slot/form)            |
| `GetWorkflowActionGroupOverview` | yes                                                            | no                                        |
| `GetEntityWorkflows`             | yes (one call, single entity, applied to all listed workflows) | no                                        |

Every handler resolves exactly **one** entity, so this is exactly **one `callApi` per read** — even `GetEntityWorkflows` (many workflows, one entity) calls once and reuses the result across the listed workflows' `entity_link`s. No batching needed.

### Error / missing handling — never fail the read

The `callApi` is wrapped in try/catch. A missing endpoint id, a throwing routine, or a deleted entity degrades to `name: null` (chrome falls back to the type label) and `entity: null`; the read never fails because the entity name couldn't resolve. Failures are logged.

## Action-page consolidation

Today `get_entity` (the full entity doc) feeds three consumers on action pages. All three move to the routine result on the `get_workflow_action` response:

1. **Breadcrumb name** — `action-breadcrumbs.yaml` stops reading `_request: get_entity.0.{name_field}` and reads `entity_link.name` (uniform with the overview pages — see Part 63).
2. **`DataDescriptions` summary** — `view`/`review` templates change the `entity` data branch from `_request: get_entity` to `_request: get_workflow_action.entity`. Field configs keyed `entity.<field>` resolve unchanged against that object.
3. **`entity_view` slot** — host slot blocks change `_request: get_entity.0.<field>` to `_request: get_workflow_action.entity.<field>` (note the shape change: the result is now an **object**, not a single-element array, so authors drop the `.0`).

Once these move, `makeActionPages` no longer bakes `connection_id` or `name_field`, and `requests/get_entity.yaml.njk` is deleted.

## What is removed, what stays

| Item                                                                      | Fate                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `requests/get_entity.yaml.njk`                                            | **removed**                                             |
| `connection_id` baked as the `get_entity` `connectionId`                  | **removed** with `get_entity`                           |
| `connection_id` passed via `workspaceVars` (→ `entity_connection_id`)     | **kept** — feeds the actions-on-entity panel            |
| `entity.name_field` config field + its validation                         | **removed** (routine returns `name`)                    |
| `entity_view_slot` baking in `makeActionPages`                            | kept — slot still baked; only its data source changes   |
| `entity.connection_id`                                                    | **kept** — entity identity / `GetEntityWorkflows` query |
| `entity.title`                                                            | **kept** — static type label + no-routine fallback      |
| `entity.page_id`, `id_query_key`, `ref_key`, `list_page_id`, `list_title` | **kept** — unchanged roles                              |

## Validation (Part 4 / `makeWorkflowsConfig`)

`makeWorkflowsConfig` validates `entity.data_endpoint`, when present, is a non-empty string (mirrors the old `name_field` check). The resolver receives only `workflows_config` — it cannot see the app's `apis:` registry — so build-time endpoint-existence validation is **not** done here; an unregistered endpoint id surfaces at runtime as a clear `callApi` `ConfigError`. The `name_field` validation block is removed.

## Manifest & docs (Part 20)

`module.lowdefy.yaml`'s `workflows_config` description: drop the `name_field` bullet, add a `data_endpoint` bullet (optional; host routine id; receives `{ entity_id }`; returns an object whose reserved `name` key is the instance display name; all other keys are host-owned and available on the action response's `entity` object and via the `entity_view` slot). Regenerate `docs/` per the manifest-is-source-of-truth rule.

## Files changed

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — replace `name_field` validation with `data_endpoint` string validation; stop carrying `name_field`; carry `data_endpoint`.
- `modules/workflows/resolvers/makeActionPages.js` — drop `name_field` from `workspaceVars`; **keep `connection_id`** (still passed through as `entity_connection_id` for the actions-on-entity panel).
- `modules/workflows/requests/get_entity.yaml.njk` — delete.
- `modules/workflows/templates/{view,review,edit,error,action}.yaml.njk` — remove the `entity_name`/`get_entity` wiring; point `DataDescriptions` `data.entity` and slot data at `get_workflow_action.entity`.
- `modules/workflows/components/action-breadcrumbs.yaml` — entity-crumb name reads `entity_link.name` (no longer an `entity_name` var sourced from `get_entity`).
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/{GetWorkflowAction,GetWorkflowOverview,GetWorkflowActionGroupOverview,GetEntityWorkflows}/*.js` — add the `callApi` to `data_endpoint`, lift `name` onto `entity_link`; `GetWorkflowAction` returns the full `entity` object. Candidate shared helper `resolveEntityData(context, wfConfig, entityId)`.
- `modules/workflows/module.lowdefy.yaml` + `docs/` — manifest description + regenerated var docs.
- Demo: `apps/demo/.../onboarding/lead-detail-slot.yaml` + any `entity.*` form configs — read from `get_workflow_action.entity`; add a `get-lead-entity-data` routine to the demo app and wire `data_endpoint`.

## Out of scope / non-goals

- **Removing `entity.connection_id`** — entity-identity-model change with write-path + migration blast radius; separate work.
- **Second magic field (`type`)** — only for polymorphic entities; not a concrete need. `title` stays static.
- **Build-time endpoint-existence validation** — resolver can't see the `apis:` registry; runtime `callApi` error is the guardrail.
- **Cross-entity dispatch / batching** — every read resolves a single entity; one routine per entity type.
- **Caching entity data across pages** — one `callApi` per read is cheap; revisit only if real apps show duplicate fetches.

## Relationship to Part 63 (overview-page breadcrumbs)

Part 63's open decision was how the shared overview pages resolve the entity instance name (its Options A/B/C). This part resolves it: the name arrives server-side on `entity_link.name`. Part 63 collapses to mechanical breadcrumb-trail work — both overview pages and the action pages read `entity_link.name` (falling back to `entity_link.title`), one uniform source.

## Verification

- **With `data_endpoint` declared, routine returns `{ name: "Acme Corp", email, status }`:**
  - Overview/group/action breadcrumbs and back-links show "Acme Corp".
  - Action page `DataDescriptions` fields keyed `entity.email`/`entity.status` render from `get_workflow_action.entity`.
  - The `entity_view` slot renders host blocks reading `get_workflow_action.entity.*`.
  - Exactly one `get-lead-entity-data` call per read; no direct hit on the entity collection from the module.
- **Routine returns no `name` key:** chrome falls back to the type label ("Lead"); host `entity.*` fields still render.
- **No `data_endpoint` declared:** breadcrumbs/back-links show the type label; no entity call fires; slot/`entity.*` fields show nothing (host chose not to surface entity data).
- **Routine throws / entity missing:** read succeeds, `name: null`, type-label fallback, error logged.
- **Validation:** `data_endpoint: 42` (non-string) fails the build with a precise per-workflow message.
- **End-to-end:** covered by Part 22's e2e suite once the demo declares the routine.

## Depends on

- [Part 4](../_completed/04-workflow-config-schema/design.md) — `data_endpoint` string validation (replaces `name_field`).
- [Part 16 page templates](../_completed/16-page-templates/design.md) — shipped; this part edits the four templates to drop `get_entity` and source `entity` from the action response.
- [Part 17 shared pages](../_completed/17-shared-pages/design.md) — introduced the overview pages and the per-workflow `entity` block this part extends.
- [Part 56](designs/workflows-module/parts/_completed/56-three-tier-action-pages/design.md) — introduced `name_field` + the action-breadcrumb entity crumb this part rewrites.
- [Part 63](../63-overview-page-breadcrumbs/design.md) — consumes `entity_link.name` from this part.
