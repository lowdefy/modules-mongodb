# Part 47 — Per-workflow submit endpoints

> **Superseded / parked by [Part 48](../48-render-config-off-connection/design.md).** This part collapsed *submit* endpoints from per-action to per-workflow as an endpoint-count play. Part 48 makes **all four** write endpoints per-workflow as the carrier for render config taken off the connection blob, subsuming this collapse. The per-workflow-vs-global analysis below (D1) remains useful context, but the work is folded into Part 48; do not implement this part standalone.

`makeWorkflowApis` generates one submit endpoint per action (`{workflow_type}-{action_type}-submit`). At the target scale (~100 workflows × ~5 actions in a production app) that is ~500 generated endpoints, each carrying that action's hook refs and event-overrides — config that is **not small**: `event.{signal}.display` is per-signal × per-app Nunjucks (`event_overrides` is deliberately excluded from the connection's `workflowsConfig`, see [D4](#d4--what-rides-on-the-endpoint-vs-workflowsconfig)). This part collapses them to **one submit endpoint per workflow** (`{workflow_type}-submit`), with those maps keyed by action type — cutting generated endpoint count ~5× **and** bounding each submit call's resolved config payload to a single workflow's actions, with no externally observable behaviour change.

**Layer:** module build wiring (`makeWorkflowApis`) + engine submit entry (`SubmitWorkflowAction`) + the call sites that target submit endpoints. **Size:** S–M. **Repo:** `modules/workflows/`, `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`.

## Proposed change

1. **`makeWorkflowApis` emits one `{workflow_type}-submit` endpoint per workflow** (skipping workflows with only tracker actions), instead of one per non-tracker action. Its `hooks` and `event_overrides` properties become maps keyed by action type.
2. **`SubmitWorkflowAction` indexes those maps by the loaded action's type** — after `loadWorkflowState` resolves the target action, the engine reads `params.hooks?.[action.type]` / `params.event_overrides?.[action.type]` instead of flat `params.hooks` / `params.event_overrides`.
3. **Hook endpoints and group `on_complete` endpoints are unchanged** — still one `InternalApi` per authored hook routine (`{workflow}-{action}-{signal}-{pre|post}`) and per group (`{workflow}-group-{id}-on-complete`); each is a distinct authored routine and needs its own endpoint.
4. **Call sites re-point to `{workflow_type}-submit`**, coordinated with Parts 39/40 which already own reworking them (see Call sites — they currently reference ids that no longer exist).
5. **`StartWorkflow`/`CancelWorkflow`/`CloseWorkflow` stay generic** — decision recorded (D2), no change.

## Key decisions

### D1 — Per-workflow, not per-action — and not global

Three granularities are possible. The choice is governed by **how much config each submit call must resolve**, because a built endpoint's static `properties` are evaluated into `params` on every call — exactly as the connection's `workflowsConfig` is loaded whole on every call (`loadWorkflowState.js:110`):

- **Per-action (today):** each call resolves one action's hooks/event_overrides — minimal payload — but emits ~500 endpoints.
- **Global (one fixed `workflow-submit`):** one endpoint, but every submit call resolves the hooks/event_overrides maps for *all* workflows. `event.{signal}.display` is per-signal × per-app Nunjucks ([D4](#d4--what-rides-on-the-endpoint-vs-workflowsconfig)), so this is the heaviest possible per-call payload. **Rejected.**
- **Per-workflow (chosen):** ~5× fewer endpoints than per-action, while each call resolves only one workflow's actions' maps. The balance point between endpoint count and per-call payload.

The engine knows which action's entry applies because the caller already sends `action_id`; the maps key by action type. Per-workflow is also the natural unit for **generic callers** (the Part 40 simple surface, anything data-driven): building `{workflow_type}-submit` needs one field every action doc carries, vs reproducing the generator's `{workflow}-{action}-submit` join from two. Access is unaffected — per-action/per-verb gates run in the engine (`loadWorkflowState`'s access check), not at the endpoint boundary.

(An earlier draft rejected global because it "would need config lookup at runtime." That reasoning was wrong — the engine already does config lookup (`loadWorkflowState.js:110`), and the build walker resolves `_module.endpointId` hook refs identically at any map depth. The real reason global loses is per-call payload weight, above — which is also why this config rides the endpoint at all rather than `workflowsConfig`; see D4.)

### D2 — Start/Cancel/Close stay generic

All three operate on one workflow and need its whole config, which they get from the connection's `workflowsConfig` (kept per Part 46 D3). Their callers are data-driven surfaces that pass `workflow_type` in the payload; per-workflow variants would force runtime endpoint-id construction on every caller for zero gain — they carry no per-action properties the way submit does.

### D3 — Hook and on_complete `InternalApi`s are untouched

Each authored routine is its own endpoint by design (engine-only, not HTTP-callable — `makeWorkflowApis.js:5–9`). Their count scales with authored hooks, which is irreducible. Only the *submit* `Api` endpoints collapse.

## Current state

- **Emitter:** `resolvers/makeWorkflowApis.js` — `emitActionEndpoint` (`:57–93`) emits `{workflow}-{action}-submit` per non-tracker action with properties: payload passthroughs (`action_id`, `signal`, `current_key`, `fields`, `form`, `form_review`, `comment`, `metadata`) plus optional `hooks` (signal→phase→pre-scoped endpoint ref) and `event_overrides` (signal→fields).
- **Engine:** `SubmitWorkflowAction` receives `params.hooks` / `params.event_overrides` flat (already scoped to one action by the endpoint); `invokePreHook`/`invokePostHook` read `params.hooks?.[signal]?.{pre|post}`.
- **Call sites are currently stale.** The form-page templates (`templates/{edit,review,error,view}.yaml.njk`) and the legacy simple pages (`pages/workflow-action-{edit,review}.yaml`) still call the **legacy `update-action-{action_type}` ids** (e.g. `templates/edit.yaml.njk:252`, `pages/workflow-action-edit.yaml:202`) — ids Part 38's rename removed (`makeWorkflowApis.test.js:251` asserts the new naming; `module.lowdefy.yaml:5`'s comment is also stale). Parts 39 (form submit buttons) and 40 (simple surfaces) own reworking these call sites.

## Endpoint shape

```yaml
id: {workflow_type}-submit          # e.g. onboarding-submit
type: Api
routine:
  - id: submit
    type: SubmitWorkflowAction
    connectionId: workflow-api
    properties:
      action_id: { _payload: action_id }
      signal:    { _payload: signal }
      # ...payload passthroughs unchanged...
      hooks:                         # keyed by action type
        kyc-form:
          submit: { pre: <scoped endpoint ref>, post: <scoped endpoint ref> }
        id-check:
          resolve_error: { post: <scoped endpoint ref> }
      event_overrides:               # keyed by action type
        kyc-form:
          submit: { type: ..., display: ... }
```

Engine change lives in `handleSubmit` (the phase composition behind `SubmitWorkflowAction`): after `loadWorkflowState` resolves `targetAction`, re-slice the maps by action type **before any phase runs** — `params.hooks = params.hooks?.[targetAction.type]` and `params.event_overrides = params.event_overrides?.[targetAction.type]`. This matters because the three consumers read the *signal*-keyed shape directly off `params`: `invokePreHook` / `invokePostHook` (`params.hooks?.[signal]?.{pre,post}`) and event planning (`planSubmit.js:200` — `params.event_overrides?.[signal]`). After the re-slice they see exactly today's shape, so the phases themselves are untouched; the re-slice is the entire engine change. Actions with no hooks/overrides slice to `undefined`, identical to today's absent-key case.

The Part 34 D10 reservation carries over: workflow type `workflow` stays reserved (`workflow-submit` would land in the module's fixed `workflow-*` page/endpoint space).

## Call sites and sequencing

Every client that submits an action must target `{workflow_type}-submit`. Known call sites:

| Caller | Today | Owner |
| ------ | ----- | ----- |
| Form-page templates (`templates/{edit,review,error,view}.yaml.njk`) | legacy `update-action-{type}` (stale) | Part 39 reworks the buttons; coordinate so they re-point **once**, to `{workflow_type}-submit` (build-time: templates have `workflow_type` in vars) |
| Legacy simple pages (`pages/workflow-action-{edit,review}.yaml`) | legacy `update-action-{type}` + old `interaction:` payload (stale) | Replaced by Part 40's surface; the surface builds the id from `workflow.workflow_type` at runtime |
| Anything else constructing `-submit` ids | none found (grep) | implementation re-sweeps |

Sequencing: this part should land **before or with** Parts 39/40's call-site work so the endpoint id changes once. If 39/40 land first against `{workflow}-{action}-submit`, this part re-points them — acceptable, just double churn.

## Non-goals

- Per-workflow Start/Cancel/Close endpoints (D2 — rejected).
- Moving config off the connection, or any client-side config change — [Part 46](../46-debundle-workflow-config/design.md)'s territory.
- Changing hook/on_complete endpoint emission (D3).

## Related

- [Part 46 — Debundle workflows_config (client-side)](../46-debundle-workflow-config/design.md) — sibling part from the same exploration; D3 there records why the connection keeps the full validated config, which D2 here relies on.
- [Part 39 — Form submit buttons](../_completed/39-form-submit-buttons/design.md) / [Part 40 — Simple-action surfaces](../40-simple-action-surfaces/design.md) — own the submit call sites (see sequencing).
- [Part 38 — Engine rebuild](../_completed/38-engine-rebuild/design.md) — introduced the current `{workflow}-{action}-submit` naming this part collapses.
- [Part 34 — Action access model](../_completed/34-action-access-model/design.md) — D10 reserved-name constraint inherited by `{workflow_type}-submit`.
