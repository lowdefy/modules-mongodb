# Review 1

## Correctness — breaking collisions

### 1. The `entity` response key collides with the existing entity-identity field — overwriting it breaks `set_entity_id` and the entire action-workspace shell

The design (line 11, line 109) has `GetWorkflowAction` return the host routine object as `entity`:

```text
return { …action, entity_link, entity: data ?? null }
```

But `GetWorkflowAction` **already returns an `entity` field**, and it is the entity _identity_, not host data — see `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js:261-264`:

```js
entity: {
  connection_id: action.entity?.connection_id ?? null,
  id: action.entity?.id ?? null,
},
```

Every action template reads `_request: get_workflow_action.entity.id` in its `set_entity_id` onMount step to normalise `_state.entity_id`:

- `view.yaml.njk:131-135`, `edit.yaml.njk:125-129`, `review.yaml.njk:127-131`, `error.yaml.njk:127-131`
- `action.yaml.njk:197-198` (and ~8 further reads of `get_workflow_action.entity.id` at lines 362, 516, 607, 705, 826, 917, 985)

`_state.entity_id` is the linchpin of the shared shell. `components/action-workspace.yaml:57-61` gates its **entire render** on it:

```yaml
visible:
  _ne:
    - _state: entity_id
    - null
```

and feeds it to the left `actions-on-entity` panel (`action-workspace.yaml:77-78`, `:174`) and the History timeline reference value.

If the response's `entity` becomes the host routine's `{ name, email, status }` (no `id`), or `null` when no `data_endpoint` is declared / the routine throws, then `get_workflow_action.entity.id` is `undefined`/`null` → `entity_id` is null → **the workspace shell never renders** (left panel, middle form body, and History all vanish). This regresses **every** action page, including those that declare no `data_endpoint` at all, because the design changes the `entity` key shape unconditionally for `GetWorkflowAction`.

The design's "Action-page consolidation" §2/§3 (lines 130-131) and "Files changed" silently assume `get_workflow_action.entity` is free to repurpose; it is not.

**Fix:** surface the routine result under a **distinct** key, e.g. `entity_data`, and leave `entity: { connection_id, id }` intact:

```text
return { …action, entity_link, entity, entity_data: data ?? null }
```

Then point DataDescriptions `data.entity` and the `entity_view` slot at `get_workflow_action.entity_data` (not `.entity`), and `set_entity_id` keeps working untouched. Update §2/§3, the table at lines 112-119, and the verification bullets accordingly.

### 2. "Drop `connection_id` from `workspaceVars`" contradicts the design's own "`connection_id` stays" decision and breaks the `actions-on-entity` panel

> **Resolved (auto).** Confirmed `workspaceVars` (`makeActionPages.js:70`) carries `connection_id` for two uses — the deleted `get_entity` request's `connectionId` and the `entity_connection_id` var (`view.yaml.njk:166-167` → `actions-on-entity` panel). Corrected the "Files changed" bullet to drop only `name_field` and keep `connection_id`, and split the removal-table row so the `get_entity` `connectionId` baking is removed while the `workspaceVars` passthrough is marked kept.

"Files changed" (line 158) says:

> `makeActionPages.js` — drop `connection_id` and `name_field` from `workspaceVars`

But `connection_id` is baked into the templates for **two** independent purposes, and only one of them is being removed:

1. The `connectionId` of the `get_entity` request (`view.yaml.njk:103-105` etc.) — **this** use goes away with `get_entity`. ✅
2. The `entity_connection_id` var passed to the action-workspace left panel — **this stays.** See `view.yaml.njk:166-167` (and `edit:178`, `review:174`, `error:171`, `action:207`):

```yaml
entity_connection_id:
  _var: connection_id
```

which flows to `components/actions-on-entity.yaml:33-34` and becomes the `entity.connection_id` in the `get-entity-workflows` `CallAPI` payload (`actions-on-entity.yaml:24-38`).

Dropping `connection_id` from `workspaceVars` makes `entity_connection_id` `undefined`, so the left "actions on this entity" panel's `GetEntityWorkflows` query runs with a null connection id and returns nothing — on **every** action page. This directly contradicts the design's own "Key decisions" §"`connection_id` stays" (lines 41-42), which keeps `connection_id` precisely _because_ `GetEntityWorkflows` queries on it.

**Fix:** keep `connection_id` in `workspaceVars`; only remove its use inside `requests/get_entity.yaml.njk` (deleted) and the `get_entity` `_ref` in the templates' request lists. Correct the line-158 bullet.

## Correctness — under-specified behavior

### 3. `GetEntityWorkflows` "exactly one `callApi`" is wrong when the entity hub lists workflows of different types

Lines 117-119 claim `GetEntityWorkflows` issues "one call, single entity, applied to all listed workflows." But `data_endpoint` lives on each workflow type's `entity:` block, and `GetEntityWorkflows` is the entity _hub_: it lists **all** workflows for one entity instance, which can span **multiple workflow types** (e.g. `onboarding` + `renewal` on the same lead). The handler already builds `entity_link` per-workflow from each workflow's own `wfConfig.entity` (`GetEntityWorkflows.js:177-184`).

Those types may declare **different** `data_endpoint`s, or some may declare none. A single call cannot serve divergent endpoints, and the design never says _whose_ endpoint the "one call" uses. The "one routine per entity type; no dispatcher" framing (line 94) doesn't resolve this — the hub mixes types by construction.

**Fix:** resolve `data_endpoint` per workflow (it's already a per-`wfConfig` loop), memoising by endpoint id so identical endpoints across workflows collapse to one call and distinct ones each fire once. Workflows whose type declares no endpoint get `entity_link.name = null`. Replace the "exactly one call" claim with "one call per distinct `data_endpoint` among the listed workflows."

### 4. Template edits under-specified: the `get_entity` _onMount Request action_ and request-list `_ref` must both be removed, and the DataDescriptions/slot must still render on a page that loads the action

The design's removal list focuses on breadcrumb wiring, but `get_entity` appears in the templates in three places that all need handling (per `view.yaml.njk`):

- the request-list `_ref` (`:103-105`),
- the `onMount` `get_entity` **Request action** (`:138-140`), and
- the DataDescriptions `data.entity` read (`:200`).

`review.yaml.njk` and `view.yaml.njk` additionally have a second DataDescriptions read at `:208`/`:200`. Line 158's phrasing ("drop the `get_entity` request ref from the templates' request lists") is filed under `makeActionPages.js`, but these refs live in the `*.yaml.njk` template files, not the resolver. List all three edit sites under the templates bullet (line 160) so the onMount Request action isn't left dangling against a deleted request file (which would be a build error).

## Lower-confidence notes

### 5. `callApi` from a read handler is a new code path; the "depth-10 recursion guard" claim is a framework assumption, not verified in-repo

`callApi` is threaded onto the engine context for all handlers (`shared/phases/createEngineContext.js:48,65`), and the `{ endpointId, payload }` → routine `:return` (or `null`) → throws-on-failure contract is confirmed on the **write** path (`SubmitWorkflowAction/dispatchNotifications.js:22-27`, `shared/phases/invokePreHook.js:96-99`). But no **read** handler calls `callApi` today — `GetEventsTimeline` deliberately avoids it ("no callApi round-trip", `GetEventsTimeline.js:12`). The mechanism should work, but this is the first read-path use; the design's "battle-tested in this module" (line 26) is true only for writes. The "depth-10 recursion guard" (line 26) is a Lowdefy framework property and isn't observable in this repo — fine to rely on, but don't present it as a module guarantee. A try/catch around the read-path `callApi` (which the design already specifies, line 122-123) is the real safety net; keep it.
