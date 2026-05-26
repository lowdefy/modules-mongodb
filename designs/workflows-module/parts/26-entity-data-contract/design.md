# Part 26 — Entity data contract (`get_entity_endpoint` on the `entities` enum)

**Source rationale:** [part 17 shared-pages](../17-shared-pages/design.md) introduced `vars.entities` for back-link URL construction. This part extends the same enum with a `get_entity_endpoint` field so every module-shipped page that needs entity data — form-action templates, workflow-overview, future task-page entity context — uses one host-app-supplied Api endpoint per entity collection. **Layer:** cross-module contract change. **Size:** M. **Repo:** spans `modules/workflows/templates/`, `modules/workflows/pages/`, `modules/workflows/requests/`, and host apps' `api/` directories.

## Goal

Replace the current per-template `requests/get_entity.yaml.njk` fetch (build-time Nunjucks substitution of `{{ entity_collection }}` as `connectionId`, then a raw MongoDB find on the entity's collection) with a host-app-supplied Api endpoint named on the `entities` enum. The workflows module never reaches directly into the entity's collection — it calls an opaque endpoint the host app owns.

The same mechanism serves all current and future consumers:

- **Part 16 form-action templates** (`edit.yaml.njk`, `view.yaml.njk`, `review.yaml.njk`, `error.yaml.njk`) — currently fire `get_entity.yaml.njk` for back-link chrome and entity-context fields. Switch to `CallApi` against the named endpoint.
- **Part 17 workflow-overview page** — currently uses `vars.entities[entity_collection].title + entity_id` as the back-link label. Gains the option to use a richer label from the fetched entity doc (e.g. `entity.display_label`, `entity.full_name`, etc.) when the endpoint returns one.
- **Part 25 group-overview page** — same fetch contract as workflow-overview.
- **Future task-page entity context** (deferred per part 17 v1) — drops in cleanly when the time comes.

## Proposed change

### `entities` enum gains a `get_entity_endpoint` field

```yaml
modules:
  - id: workflows
    vars:
      entities:
        leads-collection:
          page_id: lead-view
          id_query_key: _id
          title: Lead
          get_entity_endpoint: get-lead-summary    # NEW
```

Field shape:

- **`get_entity_endpoint`** — Api endpoint id (host-app-registered). The endpoint accepts a payload `{ entity_id: <string> }` and returns an entity-shaped object — at minimum `{ _id, ... }`; apps decide what additional fields they project (e.g. `display_label`, foreign-key joins, computed display strings).
- **Optional in v1.** Existing apps without a declared endpoint fall back to today's behavior:
  - Form-action templates keep using `get_entity.yaml.njk` (deprecated path, but supported).
  - Workflow-overview keeps the `"<title> <entity_id>"` label introduced by part 17.

Apps that declare the endpoint get the new path uniformly. Two-mode coexistence is intentional — lets existing consumers migrate at their own pace.

### Form-action templates switch from request to CallApi

Today, part 16's `view.yaml.njk` (et al.) emit:

```yaml
- _ref:
    path: ../requests/get_entity.yaml.njk
    vars:
      entity_collection: {{ entity_collection }}
```

After this part:

```yaml
{% if entities[entity_collection].get_entity_endpoint %}
- id: get_entity
  type: CallApi
  properties:
    endpointId: {{ entities[entity_collection].get_entity_endpoint }}
    payload:
      entity_id:
        _request: get_action.entity_id
{% else %}
- _ref:                                # legacy fallback
    path: ../requests/get_entity.yaml.njk
    vars:
      entity_collection: {{ entity_collection }}
{% endif %}
```

The Nunjucks substitution happens at part 12's `makeActionPages` build time — the resolver already passes `entity_collection` per page, so it can also peek at `vars.entities[entity_collection].get_entity_endpoint` and select the branch. Once apps migrate, the `else` branch can be removed and `get_entity.yaml.njk` deleted.

Templates read the entity doc via `_request: get_entity` (Request) or `_state: get_entity_response` (CallApi result). Either path produces the same shape; templates consume via the same operator (`_request: get_entity.<field>`) by storing the CallApi response in a request-shaped state key. Worth checking during implementation that Lowdefy's CallApi result naming makes this transparent; if not, templates branch on which path was used.

### Workflow-overview page uses the endpoint when declared

The back-link label gains a third tier:

1. **No endpoint declared**: `"<title> <entity_id>"` (today's fallback).
2. **Endpoint declared**, response includes a `display_label` field: `"<display_label>"` (rich label).
3. **Endpoint declared**, no `display_label` field: `"<title> <entity_id>"` (graceful fallback to tier 1; never errors).

The page fires the endpoint after `get-workflow-overview` resolves. The response is stored at `_state.entity_summary` (or similar). The button title operator becomes:

```yaml
title:
  _if_else:
    - _ne:
        - _state: entity_summary.display_label
        - null
    - _state: entity_summary.display_label
    - _string.concat:
        - _get:
            from:
              _module.var: entities
            key:
              _string.concat:
                - _state: overview.workflow.entity_collection
                - .title
        - " "
        - _state: overview.workflow.entity_id
```

The endpoint is fired conditionally — only when declared on the entities enum for the loaded workflow's `entity_collection`. If not declared, the page skips the fetch and uses the tier-1 label.

### Validator obligation (part 4)

Part 17 already requires every `entity_collection` in `workflows_config` to have a matching `vars.entities` entry. This part **does not extend** that requirement — `get_entity_endpoint` is optional. If declared, however, part 4 validates that:

- The named endpoint exists in the host app's `apis:` registry (cross-resource lookup; same pattern used elsewhere for endpoint references).
- The endpoint's payload schema accepts `{ entity_id: <string> }` (optional check — could be deferred if the Lowdefy schema inspection is awkward).

### Manifest declaration (part 20)

`vars.entities`'s per-key shape documented in the manifest description gains `get_entity_endpoint` as an optional string. No structural manifest change needed — Lowdefy var schemas don't statically validate nested keys, so this is documentation only.

## Out of scope / deferred

- **Display-label composition rules** beyond a single `display_label` field. Apps that want composite labels ("Lead 12345 — Acme Corp") format the string inside their endpoint. The workflows module reads one field.
- **List-page redirect** (workflow-overview's null-redirect target) — still uses browser-back, not the entity page directly. Could route through the endpoint's `list_page_id` etc. in a future revision.
- **Removing `get_entity.yaml.njk` entirely**. Two-mode coexistence ships in v1 of this part. Deletion is a follow-up once the demo and worked-example apps migrate.
- **Cross-entity Apis** (one endpoint serving multiple entity collections via dispatch on `entity_collection` in payload). Each collection declares its own endpoint — duplication is acceptable; consolidation is a follow-up.
- **Caching / dedup of entity fetches** when multiple module-shipped pages render in the same session. Lowdefy's CallApi caches per-page; cross-page caching is out of v1's scope.

## Depends on

- [Part 4](../04-workflow-config-schema/design.md) — extends the `vars.entities` validator to check that `get_entity_endpoint`, if declared, names a registered Api.
- [Part 16 form-action page templates](../_completed/16-page-templates/design.md) — receives the template-fetch refactor (replaces `get_entity.yaml.njk` usage with `CallApi` when the endpoint is declared). Part 16 has shipped — this part edits the shipped templates directly.
- [Part 17 shared pages](../17-shared-pages/design.md) — introduces the `entities` enum that this part extends.
- [Part 20a module-manifest-static](modules-mongodb/designs/workflows-module/parts/_completed/20a-module-manifest-static/design.md) — documents `get_entity_endpoint` in the `vars.entities` manifest description (the `vars.entities` field itself lands in 20a; `get_entity_endpoint` is an additive field on each entry).

## Verification

- **Form-action templates with endpoint declared**:
  - Apps that declare `entities.leads-collection.get_entity_endpoint: get-lead-summary` render `edit` / `view` / `review` / `error` pages that fetch via `CallApi` rather than via the `MongoDBAggregation` Request. Verify by inspecting the network panel — one `get-lead-summary` call, no direct hit on the `leads-collection` connection.
- **Form-action templates without endpoint**:
  - The demo's worked-example onboarding workflow continues to work without a declared endpoint (uses legacy `get_entity.yaml.njk` path). No regression vs. part 16's current behavior.
- **Workflow-overview label tiers**:
  - With endpoint declared returning `{ display_label: "Acme Corp" }` — back-link button reads `"Acme Corp"`.
  - With endpoint declared returning `{ _id: <id>, name: "Acme Corp" }` (no `display_label`) — back-link button reads `"Lead <id>"` (graceful fallback to tier 1).
  - Without endpoint declared — back-link button reads `"Lead <id>"` (tier 1, matches part 17's behavior).
- **Validator behavior**:
  - Declaring `get_entity_endpoint: nonexistent-endpoint` fails the build with a precise message.
- **End-to-end**: covered by [part 22](../22-workflows-e2e-suite/design.md)'s e2e suite once an app fixture declaring the endpoint is added.

## Open questions

- **Endpoint payload contract.** Committed: `{ entity_id: <string> }`. Should the workflows module also pass `entity_collection` so a host can implement a single dispatching endpoint for multiple collections? Lean **no** — apps already partition endpoints by entity kind in practice; keeping the payload narrow is simpler.
- **Caching across module-shipped pages.** Currently each page fetches independently. If real apps surface duplicate fetches in tight succession, revisit.
- **Endpoint return-shape contract beyond `display_label`.** Should the module document a recommended set of fields (`display_label`, `subtitle`, `avatar_url`, etc.)? Defer — let real-app patterns drive the schema.
- **Migration path for the demo app**. The demo currently uses the implicit `get_entity.yaml.njk` flow. Migration is small (write a `get-lead-summary` Api with one `MongoDBAggregation` step), but worth flagging in the implementation tasks so the demo gets the new path coverage.

## Contract to neighbours

- **Part 17** introduces the `entities` enum. Part 26 extends it with the optional `get_entity_endpoint` field. Workflow-overview's back-link label gains the three-tier behavior described above.
- **Part 16** (shipped) currently fires `get_entity.yaml.njk` from its four templates. This part edits the four `.yaml.njk` files in place to conditionally branch on `entities[entity_collection].get_entity_endpoint`.
- **Part 4** validator: optional cross-resource check that the named endpoint is registered.
- **Part 20** documents the new optional field in the manifest's `vars.entities` description.
- **Part 25** (group-overview-page) — currently doesn't reference the entities enum's URL construction at all (it reuses workflow-overview's pattern). When part 26 ships, part 25's back-link picks up the same three-tier label behavior for free.
