# Part 26 — Entity data contract (inline `entity.data` routine, module-generated endpoint)

Workflow pages need data _about the entity a workflow is attached to_ — its display name for breadcrumbs and back-links, and arbitrary entity fields for the action page's read-only summary and its side panel. Today that data is fetched two incompatible ways: action pages bake a per-workflow `get_entity` MongoDB request (works because they're generated per workflow type), while the shared overview pages can't bake a connection at all and so have no entity name. This part replaces both with **one mechanism, authored the same way hooks are**: the host declares an **inline Lowdefy routine** in the workflow's `entity:` block that returns whatever entity data it wants, the module's build resolver **automatically generates an engine-only endpoint** from that routine, and the workflows module's read APIs call that endpoint server-side and surface the result on their responses. The client never learns the endpoint exists — it just reads `entity_link.name` and an `entity` object off the API response.

> This rewrite supersedes an earlier draft that had the host **author their own `Api` endpoint** in the app's `apis:` and pass its **id** via `entity.data_endpoint`. That is exactly the pattern this module already abandoned for hooks (`makeWorkflowsConfig.js` hard-errors on a hook given as an endpoint-id string, demanding an inline `{ routine: [...] }`). Entity data now mirrors hooks: inline routine in, module-generated `InternalApi` out.

## Proposed change

1. Add an optional **`entity.data`** block to a workflow's `entity:` config — an inline routine in the `{ routine: [...] }` envelope (identical in shape to a hook's `hooks.{signal}.{phase}` and an action group's `on_complete`) that, given an entity instance id, returns an entity-data object.
2. **`makeWorkflowApis`** emits one **`InternalApi`** per workflow that declares `entity.data` — id `{type}-entity-data`, `routine: workflow.entity.data.routine` — exactly mirroring `emitHookApi` / `emitGroupOnCompleteApi`. Engine-only (blocks HTTP and client `CallApi`), reachable only via engine `callApi`.
3. **`makeWorkflowsConfig`** validates `entity.data` is a `{ routine: [...] }` object, **strips the raw routine** from the carried runtime config, and carries `entity.data_endpoint: { "_module.endpointId": "{type}-entity-data" }` so the build walker resolves it to a pre-scoped opaque id that rides `workflowsConfig` to the read handlers.
4. The three single-workflow read handlers (`GetWorkflowAction`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview`) call this endpoint **server-side via `callApi`** and lift its reserved **magic `name`** field onto `entity_link.name`. (`GetEntityWorkflows` — the entity hub — does **not** call it: it always runs on the entity's own page, and no consumer reads a per-workflow instance name there.)
5. `GetWorkflowAction` returns a single **`entity` object** = the module-injected **`id`** (the entity instance id, always present) merged with the routine result. The action page's `DataDescriptions` summary and `entity_view` slot read host fields off `entity`, while `set_entity_id` keeps reading `entity.id`. The previously-dead **`connection_id`** subfield (nothing read it — the panel's connection id is build-time baked) is dropped.
6. **Delete** `requests/get_entity.yaml.njk`, the `connection_id`/`name_field` baking in `makeActionPages`, and the `entity.name_field` config field — all subsumed by the routine. Keep `entity.connection_id` (entity identity / `GetEntityWorkflows` query) and keep static `entity.title` as the type label and the no-routine fallback.
7. Migrate the demo's entity slot and any `entity.*` form-config fields to read from the routine result instead of the deleted `get_entity` request, and add an `entity.data` routine to the demo workflow.

## Key decisions and rationale

### Why an inline routine the module turns into an endpoint, not a host-authored endpoint id

The host authors a **routine**, not an endpoint. The module **generates the endpoint**. This is the exact contract hooks and action-group `on_complete` already use, and it is enforced, not optional: `makeWorkflowsConfig.js:165-169` hard-errors when a hook is supplied as an endpoint-id string ("the legacy shape pointing at an external Api id. Convert to an inline routine object"). Entity data is a third instance of the same need — host-supplied server logic the module dispatches — so it gets the same shape rather than reintroducing the rejected one.

Concretely, mirroring hooks buys:

- **One authoring surface.** The routine lives in the module-entry `vars` (the app's `workflows_config`), right next to `connection_id`, `ref_key`, etc. The host registers nothing in their own `apis:` and invents no endpoint id. Compare hooks (`hooks.submit.pre.routine`) and groups (`on_complete.routine`) — same envelope, same place.
- **The endpoint always exists.** Because the module emits it from the routine, there is no "host forgot to register the endpoint" or "id typo" failure mode, and no need to defer endpoint-existence validation to runtime (the rejected draft's open problem — now moot).
- **The routine still names its own connection.** A hook routine writes `connectionId:` on its own steps against any app connection; so does this one. The host reads whatever database/collection/cluster it likes — no `entity.collection` field, no same-DB assumption. (This was the decisive advantage over the two server-side-read alternatives below, and it survives unchanged.)
- **Engine-only by construction.** Like `emitHookApi`, the generated endpoint is an **`InternalApi`**: a built `Api` is HTTP-callable, and the id (`{type}-entity-data`) is predictable, so a direct HTTP hit would bypass the engine. `InternalApi` blocks HTTP and client `CallApi` while staying reachable via the engine's `callApi` — which is exactly how the read handlers reach it (`createEngineContext` threads `callApi` into every read handler, confirmed on `GetWorkflowAction`).

### Alternatives rejected (for getting entity data onto the shared overview pages)

The shared overview pages can't bake a per-workflow connection, which is what forced a new mechanism. Three non-routine approaches were considered and dropped:

- **Client `CallApi`** (an even earlier draft): the page fires a host endpoint and stores the result in state. Rejected — it pushes the mechanism into the client (every page must remember to call it and wire the result), and it can't populate the back-link/breadcrumb that the layout reads from the API response itself.
- **Server-side read of the entity collection** (Part 63 Option B): the read handler reads the entity doc directly. Blocked — the handler only holds a Mongo handle to the _workflow-api_ connection's database, and only knows the entity's Lowdefy `connection_id`, not its Mongo collection name or cluster. It would need a new `entity.collection` field _and_ a same-database assumption.
- **Per-workflow generated overview pages** (Part 63 Option C): convert the shared pages to `makeActionPages`-style generation so each bakes its own `get_entity`. Rejected — large refactor with blast radius across every cross-module link to the overview pages and the engine link builders.

A module-generated routine endpoint sidesteps all of it: the read handler invokes it with `callApi`, already battle-tested in this module (events, notifications, and pre/post hooks all dispatch through `callApi({ endpointId, payload })`, running as the same authenticated user, returning just the routine's `:return` value, with a depth-10 recursion guard).

### Arbitrary data + reserved magic keys (not a fixed schema)

The routine returns an **arbitrary, host-shaped object** — the host decides what to fetch, compute, or hardcode. The module owns two keys on the resulting `entity` object: it **injects `id`** (the entity instance id, always present — even with no routine or a thrown routine) so the shell's `set_entity_id` and the id-dependent panels keep working, and it **reads `name`** (the instance display name) for its own chrome. Everything else in the object belongs to the host, consumed by their own UI (the `DataDescriptions` `entity.*` field configs and the `entity_view` slot blocks). The module injects `id` **last** in the merge (`{ ...routineResult, id }`), so a host that returns its own `id` key is harmlessly overridden — the instance id always wins, with no rule for the host to remember.

This is what makes one routine able to serve every entity surface. A genuinely _fixed_ schema can't describe the slot, because the slot reads arbitrary fields the host authored. Reserving a small magic-key set and passing the rest through gives the host a single place to declare "everything about this entity" while keeping the module's contract tiny.

### `name` is the one magic field; `title` stays static

The entity **type label** (e.g. "Lead") stays as the existing required static `entity.title`. It is the breadcrumb's type-label crumb and the fallback shown when no instance name is available. Keeping it static means it works **without** a routine (the no-`data` fallback) and never costs a call.

Making `type` a _second_ magic field would only earn its place if the entity type genuinely varied per instance (polymorphic entities) — a speculative need today. So: `name` is the single magic key the routine drives; `title` remains static config.

### `connection_id` stays; removing it is a separate change

With `get_entity` deleted, `connection_id` is no longer used to _fetch_ anything (the `entity.data` routine names its own connection). Its only remaining role is **entity identity**: it is stored on the workflow doc's `entity` block and `GetEntityWorkflows` queries on it (`{ "entity.connection_id": …, "entity.id": … }`) to find every workflow for an entity, scoping the entity-id namespace. Removing it would touch the workflow write path, the stored document shape, the entity-hub query, and require migrating existing docs — an entity-identity-model change out of scope here. It stays.

## The routine contract

### Authoring — `entity.data` (inline routine, like a hook)

```yaml
workflows_config:
  - type: onboarding
    entity:
      connection_id: leads-collection # identity / GetEntityWorkflows query (unchanged)
      ref_key: lead_ids # event linkage (unchanged)
      page_id: lead-view # entity link target (unchanged)
      id_query_key: _id # entity link query key (unchanged)
      title: Lead # type label + no-routine fallback (unchanged)
      data: # NEW — optional, inline routine (same { routine: [...] } envelope as hooks)
        routine:
          - id: load
            type: MongoDBAggregation
            connectionId: leads-collection # the routine names its OWN connection
            payload:
              entity_id:
                _payload: entity_id
            properties:
              pipeline:
                - $match: { _id: { _payload: entity_id } }
          - :return:
              name: # magic key — module reads this for chrome
                _string.concat:
                  - _step: load.0.first_name
                  - " "
                  - _step: load.0.last_name
              email: # host-owned — for the slot / DataDescriptions
                _step: load.0.email
              status:
                _step: load.0.status
```

`entity.data` is **optional**. Its shape is identical to a hook phase (`hooks.{signal}.{phase}.routine`) and an action group's `on_complete.routine`: an object with a `routine:` array ending in a `:return:`. The routine is free to skip the DB entirely and return hardcoded/derived values — the module only cares that `name` (if present) is the display name, and that the rest is whatever the host's own UI references.

**Payload is `{ entity_id }` only.** The entity instance id comes from `wfDoc.entity.id` / `action.entity.id`. The connection is declared inside the routine (less indirection, more intuitive), exactly as a hook routine does. One routine per entity type; no dispatcher.

### What the module generates — the `{type}-entity-data` InternalApi

`makeWorkflowApis` adds an `emitEntityDataApi(workflow)` alongside the existing emitters:

```text
function emitEntityDataApi(workflow) {
  if (!workflow.entity?.data) return null;
  return {
    id: `${workflow.type}-entity-data`,
    type: "InternalApi",
    routine: workflow.entity.data.routine,
  };
}
```

This is the same body as `emitGroupOnCompleteApi` (`makeWorkflowApis.js:295-303`). The id `{type}-entity-data` is collision-free: hook ids are 4 segments (`{type}-{action}-{signal}-{phase}`), group ids are `{type}-group-{id}-on-complete`, and the lifecycle/submit ids are `{type}-{submit|start|cancel|close|update-fields}` — none can equal `{type}-entity-data`. (`type: "workflow"` is already reserved by `emitForWorkflow`.)

### How the endpoint id reaches the read handlers

The read handlers consume **`workflowsConfig`** (built by `makeWorkflowsConfig`, carried onto the `workflow-api` connection via `properties.workflowsConfig`). They do not see `makeWorkflowApis` output. So `makeWorkflowsConfig` carries the resolved endpoint id on the entity block:

- When `entity.data` is present, the carried config drops the raw `data` routine (build-only, heavy) and adds `data_endpoint: { "_module.endpointId": "${type}-entity-data" }`.
- The build walker resolves `_module.endpointId` in resolver output to a **pre-scoped opaque string** (`<workflowsEntryId>/<type>-entity-data`) — the same resolution the hook refs rely on (`makeWorkflowApis.js:36-40`) and that `workflow-api.yaml`'s own `endpoints:` block already uses for `new_event` / `send_notification`. The handler reads `wfConfig.entity.data_endpoint` as that opaque string and passes it to `callApi` verbatim.
- When `entity.data` is absent, no endpoint is emitted and no `data_endpoint` is carried — the handler sees no endpoint and falls back to the type label.

### Read-handler behavior

Each calling handler matches the workflow's config (`wfConfig = workflowsConfig.find(wc => wc.type === doc.workflow_type)`), then, when `wfConfig.entity.data_endpoint` is set:

```text
data = await callApi({ endpointId: wfConfig.entity.data_endpoint,
                       payload: { entity_id: <doc>.entity.id } })
entity_link.name = data?.name ?? null      // lifted onto chrome
```

`GetWorkflowAction` merges the routine result onto the always-present entity id (no separate `entity_data` key; the dead `connection_id` subfield is gone):

```text
return { …action, entity_link, entity: { ...(data ?? {}), id: <doc>.entity.id } }
```

| Handler                          | Lifts `name` → `entity_link.name`                             | Returns `entity` object (id + routine result) |
| -------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `GetWorkflowAction`              | yes                                                           | **yes** (slot + DataDescriptions need it)     |
| `GetWorkflowOverview`            | yes                                                           | no (overview has no slot/form)                |
| `GetWorkflowActionGroupOverview` | yes                                                           | no                                            |
| `GetEntityWorkflows`             | **no** — hub runs on the entity's own page; no `.name` reader | no                                            |

Each _calling_ handler resolves exactly **one** workflow (one type → at most one endpoint), so this is exactly **one `callApi` per read**. `GetEntityWorkflows` makes no call at all — so the hub mixing multiple workflow types (each with its own or no `entity.data`) is a non-issue. No batching or per-type dispatch needed.

### Error / missing handling — never fail the read

The `callApi` is wrapped in try/catch. A missing endpoint (no `entity.data` declared), a throwing routine, or a deleted entity degrades to `name: null` (chrome falls back to the type label); `entity` reduces to just `{ id }` (host fields absent), so `set_entity_id` and the id-dependent panels keep working. The read never fails because the entity name couldn't resolve. Failures are logged.

## Action-page consolidation

Today `get_entity` (the full entity doc) feeds three consumers on action pages. All three move to the routine result on the `get_workflow_action` response:

1. **Breadcrumb name** — `action-breadcrumbs.yaml` stops reading `_request: get_entity.0.{name_field}` and reads `entity_link.name` (uniform with the overview pages — see Part 63).
2. **`DataDescriptions` summary** — `view`/`review` templates change the `entity` data branch from `_request: get_entity` to `_request: get_workflow_action.entity`. Field keys take the **same `.0`-drop migration as the slot**: `get_entity` is a `MongoDBAggregation` returning an array, so a working entity field key today is `entity.0.<field>`; against the new object it becomes `entity.<field>`.
3. **`entity_view` slot** — host slot blocks change `_request: get_entity.0.<field>` to `_request: get_workflow_action.entity.<field>` (note the shape change: the result is now an **object**, not a single-element array, so authors drop the `.0`).

Once these move, `makeActionPages` no longer bakes `name_field`, and `requests/get_entity.yaml.njk` is deleted. (`connection_id` keeps being baked — see the removal table.)

## Shell loading behavior (action-workspace)

With entity data now arriving on the single `get_workflow_action` response, the action-workspace shell stops blanking the page while that request is in flight. Today `components/action-workspace.yaml` gates its **entire** render on `visible: _ne: [_state.entity_id, null]`, and `entity_id` is a value the page sets itself in an onMount `SetState` (`set_entity_id`) — so the gate is a self-set-flag mount barrier that renders **nothing** until the action resolves.

Change:

- **Drop the whole-shell `visible` gate.** The shell renders immediately. The middle action surface and the right-hand Details/History content use the native `loading:` + `skeleton:` swap gated on `_not: _request: get_workflow_action` (the request is the source of truth — per the loading-skeletons idiom, never gate `loading` on the self-set `entity_id`), so they show content-shaped skeletons in flight instead of a blank page.
- **Keep the id-dependent panels gated until the id resolves.** `actions-on-entity` (its `call_entity_workflows` onMount `CallAPI`) and the History timeline (`reference_value: _state.entity_id`) must still mount only once the entity id is available, so they retain an entity-id gate — now narrowed to just those panels instead of the whole shell. Their onMount reads then fire with a real id, never null.

The null-gate survives only where it does real mount-ordering work; everywhere else the page falls through to skeletons.

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

A new `validateEntityData(workflow)` mirrors `validateHooks` / `validateGroupOnComplete`: when `entity.data` is present it must be a plain object with a `routine:` array, and a **string** value is rejected with the same "legacy shape pointing at an external Api id — convert to an inline routine object" message hooks already emit (the rejected draft's `data_endpoint: <id>` form lands here with a clear migration hint). The `name_field` validation block is removed. The resolver does not validate routine internals (same depth as hook/`on_complete` validation) — those are walked and validated by the build like any other routine. Build-time endpoint-existence validation is now **unnecessary**: the module generates the endpoint, so it cannot be missing.

In the materialization step, `makeWorkflowsConfig` strips `data` from the carried `entity` block and, when it was present, adds `data_endpoint: { "_module.endpointId": "${type}-entity-data" }` (the wholesale `entity` carry at `makeWorkflowsConfig.js:1030-1035` gains this transform).

## Manifest & docs (Part 20)

`module.lowdefy.yaml`'s `workflows_config` description: drop the `name_field` bullet, add an `entity.data` bullet (optional; inline `{ routine: [...] }` like hooks; the routine receives `{ entity_id }` and returns an object whose reserved `name` key is the instance display name; all other keys are host-owned and available on the action response's `entity` object and via the `entity_view` slot; the module generates the engine-only endpoint from it). Regenerate the generated `vars.md` per the manifest-is-source-of-truth rule, **and** update the two hand-authored pages that describe the removed `name_field` (`docs/workflows/reference/authoring-grammar.md`, `docs/workflows/concepts/action-pages.md`) — `pnpm docs:check` won't flag these, but `docs/` is the source of truth for consumer-observable behavior. (See the files-changed list for the exact edits.)

## Files changed

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — add `validateEntityData` (mirrors `validateHooks`); call it from `validateWorkflow`; remove the `name_field` validation block; in the entity-carry step, strip `data` and add the resolved `data_endpoint` `_module.endpointId` ref when `data` was present.
- `modules/workflows/resolvers/makeWorkflowApis.js` — add `emitEntityDataApi(workflow)` (same body as `emitGroupOnCompleteApi`); push its result in `emitForWorkflow` when non-null.
- `modules/workflows/resolvers/makeActionPages.js` — drop `name_field` from `workspaceVars`; **keep `connection_id`** (still passed through as `entity_connection_id` for the actions-on-entity panel).
- `modules/workflows/requests/get_entity.yaml.njk` — delete.
- `modules/workflows/templates/{view,review,edit,error,action}.yaml.njk` — `get_entity` appears in **three** spots per template that all must be handled: **delete** (a) the request-list `_ref` to `requests/get_entity.yaml.njk`, (b) the `onMount` `get_entity` **Request action** (`view:138-140` etc.) — leaving this dangling against the deleted request file is a build error, and (c) **re-source** the `entity_name` breadcrumb var in each template — change it from `_request: get_entity.0.{{ name_field }}` to `_state: action.entity_link.name`, mirroring how the sibling `entity_title` var is already sourced from `action.entity_link.title` (keep it as an injected `_var`, do **not** hard-code the state path inside the shared component); then **repoint** the `DataDescriptions` `data.entity` read (in `view` and `review` only — each has exactly one; `edit`/`error`/`action` carry the entity surface via the slot, not DataDescriptions) and the slot from `get_entity`/`get_entity.0.*` to `get_workflow_action.entity[.<field>]` (object, so drop the `.0`).
- `modules/workflows/components/action-breadcrumbs.yaml` — **no functional change**. It already takes `entity_name` as an injected `_var` with an `entity_name`-or-`entity_title` fallback; only the templates' source for that var changes (above). Just refresh its header comment, which currently says `entity_name` is "Resolved page-side from the existing `get_entity` request via … `entity.name_field`" — now sourced from `entity_link.name`. (This shared component serves the five action-page templates; the Part 63 overview pages use their own runtime breadcrumb fragment, not this one.)
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/{GetWorkflowAction,GetWorkflowOverview,GetWorkflowActionGroupOverview}/*.js` — add the `callApi` to `wfConfig.entity.data_endpoint`, lift `name` onto `entity_link`; `GetWorkflowAction` returns `entity: { ...routineResult, id }` (inject `id` **last** so it wins over any host-returned `id`, drop the dead `connection_id` subfield, no separate `entity_data` key). Candidate shared helper `resolveEntityData(context, wfConfig, entityId)`. **`GetEntityWorkflows` is unchanged** — it does not call the routine.
- `modules/workflows/components/action-workspace.yaml` — drop the whole-shell `visible: _ne: [_state.entity_id, null]` gate; add `loading:`/`skeleton:` (gated on `_not: _request: get_workflow_action`) to the middle and right content; narrow the entity-id gate to just `actions-on-entity` and the History timeline so their onMount reads still fire with a resolved id.
- `modules/workflows/module.lowdefy.yaml` + `docs/workflows/reference/vars.md` — manifest description + regenerated var docs.
- `docs/workflows/reference/authoring-grammar.md` — in the `entity:` block (`:32`), drop the `name_field` line and add an `entity.data` line (optional inline `{ routine: [...] }` like hooks; the routine receives `{ entity_id }` and returns an object whose reserved `name` key is the breadcrumb instance name).
- `docs/workflows/concepts/action-pages.md` — drop `name_field` from the `entity_view` example (`:55`) and update it to note slot blocks read `get_workflow_action.entity.<field>` (object — no `.0`) rather than a baked entity request; rewrite the Breadcrumbs paragraph (`:78`) so the instance name comes from the `entity.data` routine's reserved `name` key instead of `entity.name_field`.
- Demo: `apps/demo/.../onboarding/lead-detail-slot.yaml` + any `entity.*` form configs — read from `get_workflow_action.entity`; add an `entity.data` routine to the demo onboarding workflow's `entity:` block.

## Out of scope / non-goals

- **Removing `entity.connection_id`** — entity-identity-model change with write-path + migration blast radius; separate work.
- **Second magic field (`type`)** — only for polymorphic entities; not a concrete need. `title` stays static.
- **Cross-entity dispatch / batching** — every read resolves a single entity; one routine per entity type.
- **Caching entity data across pages** — one `callApi` per read is cheap; revisit only if real apps show duplicate fetches.

## Relationship to Part 63 (overview-page breadcrumbs)

Part 63's open decision was how the shared overview pages resolve the entity instance name (its Options A/B/C). This part resolves it: the name arrives server-side on `entity_link.name`. Part 63 collapses to mechanical breadcrumb-trail work — both overview pages and the action pages read `entity_link.name` (falling back to `entity_link.title`), one uniform source.

## Verification

- **With `entity.data` declared, routine returns `{ name: "Acme Corp", email, status }`:**
  - `makeWorkflowApis` emits an `onboarding-entity-data` `InternalApi`; `makeWorkflowsConfig` carries the resolved `data_endpoint` and no raw routine.
  - Overview/group/action breadcrumbs and back-links show "Acme Corp".
  - Action page `DataDescriptions` fields keyed `entity.email`/`entity.status` render from `get_workflow_action.entity`.
  - The `entity_view` slot renders host blocks reading `get_workflow_action.entity.*`.
  - Exactly one `entity-data` call per read; no direct hit on the entity collection from the module; a direct HTTP call to `{entry}/onboarding-entity-data` is rejected (InternalApi).
- **Routine returns no `name` key:** chrome falls back to the type label ("Lead"); host `entity.*` fields still render.
- **No `entity.data` declared:** breadcrumbs/back-links show the type label; no endpoint emitted, no entity call fires; slot/`entity.*` fields show nothing (host chose not to surface entity data).
- **Routine throws / entity missing:** read succeeds, `name: null`, type-label fallback, error logged.
- **Validation:** `entity.data: "get-lead-entity-data"` (string, the rejected-draft shape) fails the build with the "convert to an inline routine object" message; `entity.data: { routine: 42 }` fails with the routine-array message.
- **End-to-end:** covered by Part 22's e2e suite once the demo declares the routine.

## Depends on

- [Part 4](designs/workflows-module/parts/_completed/04-workflow-config-schema/design.md) — `entity.data` `{ routine }` validation (replaces `name_field`).
- [Part 16 page templates](designs/workflows-module/parts/_completed/16-page-templates/design.md) — shipped; this part edits the four templates to drop `get_entity` and source `entity` from the action response.
- [Part 17 shared pages](designs/workflows-module/parts/_completed/17-shared-pages/design.md) — introduced the overview pages and the per-workflow `entity` block this part extends.
- [Part 56](designs/workflows-module/parts/_completed/56-three-tier-action-pages/design.md) — introduced `name_field` + the action-breadcrumb entity crumb this part rewrites.
- [Part 63](designs/workflows-module/parts/63-overview-page-breadcrumbs/design.md) — consumes `entity_link.name` from this part.
