# Workflows Submit Pipeline — Spec

Plugin-orchestrated submit flow. Full rationale in [design.md](design.md); this file carries only the committed decisions. **Status: alternative architecture to the status-quo design in module-surface Decision 5 / engine Decision 1 / action-authoring `submit_hook:` semantics. Not v1.**

## Flow

```
Page → workflows/submit-action (module Api, thin wrapper)
       └─ SubmitWorkflowAction (plugin connection — owns the full submit lifecycle)
              1. Validate payload + permissions
              2. Engine writes core
                 (action transition, unblocks, summary, auto-complete, trackers)
              3. Engine writes built-in side effects
                 (entity_update, event, notifications — if in payload)
              4. context.callApi(submit_hook_endpoint_id, hook_payload)   ← user hook, optional
                 └─ user's app-side Api routine — free-form
              5. Finalize and return
```

Single hook, fires after engine writes. Pre-write transform hooks (Alternative C in design.md) are explicitly rejected.

## Plugin shape

### Request type

`SubmitWorkflowAction` replaces `UpdateWorkflowActions` on the `WorkflowAPI` connection. Same connection; broader handler. Tracker subscription, references contract, status priority rule unchanged.

### Connection structure

```
src/connections/WorkflowAPI/
  WorkflowAPI.js
  SubmitWorkflowAction/
    SubmitWorkflowAction.js          # plugin handler entry point
    writeEntityUpdate.js             # step 3 — entity write
    dispatchEvent.js                 # step 3 — events.new-event via context.callApi
    dispatchNotification.js          # step 3 — notifications.send-notification via context.callApi
    invokeSubmitHook.js              # step 4 — user hook via context.callApi
  StartWorkflow/    # unchanged
  CancelWorkflow/   # unchanged
  shared/           # unchanged (createMongoDBConnection, getActionFields, getActions, populateIds)
```

### Handler signature

Same Lowdefy connection-handler contract as today, plus `context.callApi` exposed:

```js
async function SubmitWorkflowAction({ request, connection, context }) {
  // context.callApi(endpointId, payload) — invokes a Lowdefy Api endpoint internally
  // Inherits caller's user/roles; depth-counter guarded; throws propagate.
}
```

## `context.callApi` capability

New Lowdefy capability in `@lowdefy/api`. Required for v1 of this design — submit-pipeline cannot ship without it.

**Shape.** `@lowdefy/api` exports `callApi(context, { endpointId, payload, blockId? })` that re-enters the API runtime as if a routine `CallApi` step had run. Plugin's connection context gets a bound version: `context.callApi(endpointId, payload)`.

**Implementation sketch:**

```js
// packages/api/src/routes/request/callApi.js (new)
import callRequest from "./callRequest.js";

async function callApi(context, { endpointId, payload }) {
  return callRequest(context, {
    requestId: endpointId,
    payload,
    pageId: null,
    blockId: null,
  });
}
```

Plugin binds it on the context:

```js
const context = {
  ...incoming,
  callApi: (endpointId, payload) => callApi(incoming, { endpointId, payload }),
};
```

**Auth inheritance.** Internal call inherits the originating user/roles. No per-call principal override in v1. Apps that want a hook to run as a different principal handle that inside the hook routine.

**Depth bound.** Extends engine's tracker-recursion depth guard. Default limit 10. Exceeded → throws with chain in error message.

**Error semantics.** Throw in `context.callApi` propagates to the plugin handler. Plugin propagates to the page. Engine writes from steps 2–3 already durable; same partial-state-plus-retry model as today's `submit-action`.

## Action YAML — `submit_hook:` field

Form actions and task actions can declare an optional submit hook by endpoint id:

```yaml
type: qualify
kind: form
form: [...]
submit_hook: lead-onboarding-qualify-on-submit # optional; endpoint id
```

**Resolution.** Endpoint id resolves against the build-time API registry. Convention fallback: if the id matches `<workflow_type>-<action_type>-on-submit` and no app-registered Api matches, build checks for an app-shipped Api at `workflow_config/<workflow_type>/api/<action_type>-on-submit.yaml`. Apps that want their hook to live elsewhere register the Api with any id and reference it directly.

**Replaces** the status-quo `submit_hook:` field (string path to routine YAML). Field type changes from path → endpoint id; the field stays optional.

**Optional hook.** Actions without a `submit_hook:` skip step 4. Engine + built-in side effects still run. Most actions don't need a hook (today's design requires one per form action even when it's a one-liner).

## Module surface

### `submit-action` Api — thin wrapper

```yaml
id: submit-action
type: Api
routine:
  - id: submit
    type: SubmitWorkflowAction
    connectionId:
      _module.connectionId: workflow-api
    properties:
      action_id: { _payload: action_id }
      current_type: { _payload: current_type }
      current_status: { _payload: current_status }
      fields: { _payload: fields }
      form_data: { _payload: form_data }
      unblocks: { _payload: unblocks }
      entity_update: { _payload: entity_update }
      event: { _payload: event }

  - :return:
      success: true
      action_ids: { _step: submit.action_ids }
      event_id: { _step: submit.event_id }
      hook_response: { _step: submit.hook_response }
```

One step, one return. All orchestration moves inside the plugin handler. Replaces the status-quo four-step routine (`update_actions` → `write_entity` → `new_event` → `notify`).

### Why keep it as an Api

- **Auth surface.** Lowdefy Apis have an `auth` block; plugin connections don't. Keeping `submit-action` as the public surface preserves the existing Api auth model gating submissions.
- **Operator evaluation on payload.** Page payloads carry operators (`_state`, `_user`, etc.); Api layer evaluates them before the plugin handler sees resolved values.

### Page → `submit-action` call

Page (form-action edit / review page; task-edit / task-review page) calls `workflows/submit-action` directly:

```yaml
- id: submit
  type: CallApi
  endpointId:
    _module.endpointId: { id: submit-action, module: workflows }
  payload:
    action_id: { _state: action_id }
    current_type: <action-type>
    current_status: <verb-dependent> # done / changes-required / etc.
    form_data: { _state: form }
    # plus optional unblocks / entity_update / event as needed by the action
```

No per-action `workflows/<wf>-<action>-submit` endpoint. `makeWorkflowApis` drops per-form-action submit endpoint emission.

> **Naming reconciliation with module-surface spec.** Module-surface (the status-quo path that v1 ships first) splits the form payload into two fields — `form` (submitter-side, action's `form:` blocks) and `form_review` (reviewer-side, action's `form_review:` blocks). Submit-pipeline used `form_data` historically as a single field. When submit-pipeline supersedes module-surface Decision 5, the wrapper's payload field renames `form_data` → `form` and adds `form_review` to match. The engine's `SubmitWorkflowAction` request types `form` and `form_review` accordingly; the hook payload (see below) likewise renames. Treat all `form_data` references in this spec as pending the rename if submit-pipeline is adopted.

## Submit hook payload contract

When the engine invokes the hook via `context.callApi(submit_hook_id, hook_payload)`:

```
hook_payload:
  action_id: string             # the action that submitted
  action_type: string           # the action's YAML type
  current_status: string        # the status the engine just wrote
  workflow_id: string           # the parent workflow
  workflow_type: string         # the workflow's YAML type
  entity_type: string
  entity_id: string

  form_data: object             # the form payload from the page submission (form actions)
                                # null for task-action submits

  event_id: string              # the event id the engine generated; reuse for downstream events
  action_ids: array<string>     # ids of all actions written by the engine in this submission
                                # (current action + unblocked siblings)
  summary: object               # the workflow's recomputed summary { done, not_required, total }
  workflow_status: string       # workflow's current stage after auto-complete check
```

The hook is a regular `Api` — full Lowdefy capabilities (`MongoDBUpdateOne`, cross-module `CallApi`, `_payload` access, etc.). It can read additional data, do conditional writes, fire downstream APIs.

### Hook usage pattern

Engine has already written the action transition, applied unblocks, written `entity_update` / `event` / `notify` if those were in the page's payload. The hook is where app-specific extras go — writing to another collection, calling an external API, triggering a downstream workflow.

Example:

```yaml
id: lead-onboarding-qualify-on-submit
type: Api
routine:
  - id: sync_crm
    type: CallApi
    properties:
      endpointId:
        _module.endpointId: { id: push-lead, module: crm-sync }
      payload:
        lead_id: { _payload: entity_id }
        notes: { _payload: form_data.notes }
        qualified_at: { _date: now }

  - :return:
      success: true
      crm_id: { _step: sync_crm.crm_id }
```

### Hook response

Hook's `:return:` block is forwarded to the page as `hook_response`. Shape is free-form; engine doesn't require any specific keys. README documents the contract.

## Ordering inside `SubmitWorkflowAction`

1. **Validate.** Payload schema (action_id present, current_type matches action doc, current_status in `action_statuses` enum). Permission check against the action's `access` block via `action_role_check` semantics. Optionally pre-flight the `unblocks` list to verify referenced action types / group ids resolve.
2. **Engine writes core.** Write requesting action's status. Apply `unblocks` (fan-out + upserts per keys). Recompute affected `groups[]` (action-groups Decision 5 steps 2-3). Re-evaluate `blocked_by` for blocked actions; push `action-required` on dependency-clear. Recompute workflow `summary`. Run auto-complete check. If workflow status changed, fire tracker subscription.
3. **Engine writes built-in side effects.** If `entity_update` in payload → Mongo update against the entity connection (`writeEntityUpdate.js`). If `event` in payload → `context.callApi(events.new-event, ...)` with engine-generated `event_id`. If `event.notifications: true` → `context.callApi(notifications.send-notification, ...)`.
4. **Invoke user submit hook.** If action has `submit_hook` → `context.callApi(submit_hook_id, hook_payload)`. Hook runs as a regular Api routine; return is captured.
5. **Finalize and return.** Plugin returns `{ success, action_ids, event_id, hook_response? }`.

Steps 2–4 are all in the same plugin handler invocation; same shared Mongo client; same `event_id`. Hook timing locks side effects after engine writes — a hook that wants to "veto" the submission has to compensate by reverting writes (acceptable for v1; matches the status-quo pattern).

## Idempotency

- **Step 2 (engine writes).** Same idempotency story as the status-quo engine — priority rule no-ops repeated stage pushes; same-stage workflow guard prevents duplicate status entries.
- **Step 3 (side effects).** Same as status-quo: `entity_update` idempotent with `$set` / `$ifNull` operators, not with `$push` / `$inc`. `events.new-event` and `notifications.send-notification` not retry-safe — duplicate events / notifications on retry, accepted as v1 cost. Stable-`event_id` flow remains the additive upgrade path.
- **Step 4 (hook).** Hook author responsibility; documented in README.

## Cancellation semantics

`CancelWorkflow` unchanged from status-quo. Cancellation doesn't fire submit hooks — the hook is tied to action submissions, not workflow cancellation. Apps that need cancellation-time side effects use the engine's tracker subscription on the parent (cancelled → not-required propagation) plus their own app-level cancellation routine.

## Supersedes (status-quo → submit-pipeline)

| Sub-design                                                                 | What changes                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [engine](../engine/design.md) Decision 1                                   | `UpdateWorkflowActions` → `SubmitWorkflowAction`. Same connection; broader handler. Side effects (`entity_update` / `event` / `notifications`) and hook dispatch live inside the handler.    |
| [module-surface](../module-surface/design.md) Decision 5                   | `submit-action` Api routine collapses from four steps to one. Composition-error-semantics table simplifies (one step's idempotency analysis covers the whole submit).                        |
| [action-authoring](../action-authoring/design.md) `submit_hook:` semantics | Field type changes from "string path to routine YAML" to "string endpoint id." Field stays optional (today's design requires one per form action).                                           |
| [action-authoring](../action-authoring/design.md) `makeWorkflowApis`       | Per-form-action submit endpoint emission (`workflows/<wf>-<action>-submit`) dropped. Resolver still emits other action-level Apis if any.                                                    |
| [ui](../ui/design.md)                                                      | Generated form-action edit / review pages and task-edit / task-review pages call `workflows/submit-action` directly. Page templates simplify.                                                |
| [action-groups](../action-groups/design.md) Decision 6                     | `on_complete` invocation mechanism uses the same `context.callApi` primitive (extension preview; not committed in this sub-design). The deferred "api-hooks follow-up sub-design" dissolves. |

## Extension preview — action-groups `on_complete`

Out of scope here; same plumbing applies. Sketch:

- Action-groups Decision 1 `on_complete:` field changes from "path to routine YAML" to "endpoint id."
- Action-groups Decision 5 step 2 (recompute affected groups' statuses) also dispatches: for each group transitioning to `done`, plugin calls `context.callApi(group.on_complete_id, group_hook_payload)` before continuing.
- The deferred Decision 6 "fanout mechanism" question dissolves — dispatch happens in the plugin handler via the same `context.callApi` primitive.
- `completed_groups` return shape stays the same (downstream consumers may still want it).

## Risks

- **`context.callApi` is a new Lowdefy capability** with auth and re-entrancy implications. Auth model (hook inherits caller's user/roles) binds the engine to one principal model; multi-tenant apps that want hooks to run as service principals need per-call auth context override — listed as v2 extension. Re-entrancy bounded by the depth guard but needs operational testing in deep workflow trees.
- **Refactor cost is real.** Supersedes parts of three other sub-designs (engine, module-surface, action-authoring). Time-box the decision: pick this or status-quo before any of the affected sub-designs start implementation, otherwise the migration cost compounds.
- **Hook timing locks side effects after engine writes.** A hook that needs to veto the submission has to compensate by reverting. Apps with strict server-side validation patterns push validation to the page or to a pre-step they call before `submit-action`. Acceptable for v1.
- **Plugin handler complexity.** Folding `entity_update` + `event` + `notify` into the plugin grows it from "transition logic only" to "transition + cross-module dispatch + user-hook invocation." Mitigated by per-step helper files (`writeEntityUpdate.js`, `dispatchEvent.js`, `dispatchNotification.js`, `invokeSubmitHook.js`).
- **Plugin → Api → Plugin recursion.** A submit hook calling another module's API that calls `submit-action` again. Same risk class as tracker-update recursion; same mitigation (depth-limit guard with clear error citing the chain).

## Open questions

1. **Decision D — where conditional unblock logic lives.** Surfaced during the UI / example_workflow review. Options:
   - (a) Per-action API files (v0 shape — currently committed in action-authoring Decision 6 via `makeWorkflowApis`).
   - (b) Inline routine in action YAML under `pages.{verb}.events.{onSubmit|onApprove|onRequestChanges}`.
   - (c) Declarative outcomes in action YAML (`outcomes.on_submit:` rules the engine resolves).
   - (d) Hybrid declarative outcomes + optional hook.

   User preference noted as (b) during review but explicitly tagged as a submit-pipeline decision. This sub-design's "Action YAML — `submit_hook:` field" section is one shape addressing the same friction; open call is whether to merge / supersede / co-exist. **Status: not yet committed.**

2. **Decision F — module-emitted API surface.** Surfaced during the UI / example_workflow review. Options:
   - (a) Generic engine endpoints (page event calls `workflows-submit-action` directly).
   - (b) Per-action API files (v0 shape, currently committed via `makeWorkflowApis`).
   - (c) Hybrid: generic by default + opt-in named alias via action-level `api_id:`.

   User preference noted as (a) but explicitly tagged as a submit-pipeline decision. This sub-design's "Module surface → `submit-action` Api — thin wrapper" section is the (a)-shaped resolution; open call is whether to keep `makeWorkflowApis` as a deprecated path or remove outright. **Status: not yet committed.**

3. **Declarative templates on action YAML.** With the page now building the full `submit-action` payload, action YAML could grow `event_template:` / `entity_update_template:` blocks evaluated against `form_data`. Pushes the payload contract toward `{ action_id, current_type, form_data }`. Out of scope; enabled by the inversion.
4. **Per-action authorization moves to the engine.** Today's `submit-action` Api has app-level `auth:`; per-action role checks live via `action_role_check`. With engine owning the lifecycle, per-action role checks should move into step 1. Worth specifying explicitly; not committed in this draft.
5. **`hook_response` shape.** Free-form. Should the engine require any specific keys (e.g. `success: true`)? Probably not — keep transparent; page handles whatever the hook returns. Document in README.
6. **Should action-groups `on_complete` fold in here?** Mechanism is the same. Re-open if the design lands cleanly and folding groups in is small.

## Next step

1. Add `context.callApi` to `@lowdefy/api`. Verify auth context inheritance, depth-limit guard, error propagation in an isolated spike — this is the new-capability work and should land first.
2. Restructure `WorkflowAPI` plugin per "Plugin shape" above. Move `UpdateWorkflowActions` → `SubmitWorkflowAction`; add side-effects helpers.
3. Update `submit-action.yaml` per "Module surface" above.
4. Update action-authoring resolver: treat `submit_hook:` as endpoint id; drop `makeWorkflowApis` submit endpoint emission.
5. Update form-action page templates to call `workflows/submit-action` directly.
6. Once stable, fold in action-groups `on_complete` using the same primitive.
