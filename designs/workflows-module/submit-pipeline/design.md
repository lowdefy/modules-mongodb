# Workflows Submit Pipeline

Replace the routine-orchestrated submit-action flow with an engine-orchestrated one. A new plugin request `SubmitWorkflowAction` becomes the entry point — it owns the full submit lifecycle (validate → write core → invoke user hook → finalize) and calls the app-supplied submit hook by **endpoint id**, not by routine path. The hook becomes optional and runs as a regular Lowdefy `Api` that the plugin invokes via a new `context.callApi` capability.

This sub-design is an alternative architecture to the submit-action shape committed in [module-surface](../module-surface/design.md) Decision 4 and the `UpdateWorkflowActions` request shape committed in [engine](../engine/design.md) Decision 1. It's framed as a sub-design so the trade-offs are visible; if accepted it supersedes the relevant parts of those two designs (noted per decision).

Action-groups `on_complete` is out of scope here, but the same `context.callApi` plumbing falls out cleanly — Decision 6 in [action-groups](../action-groups/design.md) stops being a "deferred mechanism" question because the engine can fire each group's `on_complete` endpoint directly from the handler. Section "Extension preview — action-groups" sketches the shape without committing it.

## Problem

The submit flow today has three orchestration layers:

```
Page → app's generated submit endpoint (workflows/<wf>-<action>-submit)
       (this endpoint's routine = app's submit_hook YAML)
       └─ CallApi → submit-action (module's Api, runs its own routine)
                    ├─ UpdateWorkflowActions (plugin connection — engine work)
                    ├─ MongoDBUpdateOne (entity update, optional)
                    ├─ CallApi → events.new-event (optional)
                    └─ CallApi → notifications.send-notification (optional)
```

Frictions this layering produces:

1. **The submit-hook YAML is mostly a payload builder.** Looking at the `qualify-submit-hook` worked example: one `CallApi` step, no domain logic, just structured payload assembly. Authoring it for every form action is ceremony — particularly for the common case where unblocks and event shape are static.
2. **Three places to look for "what happens when an action submits":** the page (form), the app's submit hook YAML (payload), the module's submit-action routine (engine + side effects). Tracing a submit end-to-end requires hopping between files in different modules.
3. **Action-groups `on_complete` has no clean home for invocation.** Action-groups Decision 6 defers the fan-out mechanism precisely because the routine layer can't easily fan out N variable-length `CallApi`s without a new Lowdefy primitive. The engine can compute "which groups completed" but can't fire their hooks without help.
4. **Engine doesn't see the form data.** Today's `UpdateWorkflowActions` operates on transition specs (action ids, statuses, unblocks). Validations that depend on form values (cross-field invariants, server-side authorization checks) have to be re-implemented per submit hook or pushed into the page.

The shared root: **the user-authored hook is the orchestrator** today. The engine is invoked as one step inside the hook's routine. Every cross-cutting engine concern (action-groups completion, validation, fan-out) has to thread through the routine layer.

## Proposed shape

Invert the control flow. **The engine becomes the orchestrator**; the user hook becomes an extension point.

```
Page → workflows/submit-action (module's Api, very thin)
       └─ SubmitWorkflowAction (plugin connection — owns the full submit lifecycle)
              1. Validate payload + permissions
              2. Engine writes core (action transition, unblocks, summary, auto-complete, trackers)
              3. Engine writes built-in side effects (entity_update, event, notifications — if in payload)
              4. context.callApi(submit_hook_endpoint_id, hook_payload)   ← user hook, optional
                 └─ user's app-side Api routine — free-form
              5. Finalize and return
```

Three things change shape:

- `UpdateWorkflowActions` becomes `SubmitWorkflowAction` — the plugin request grows to own the full submit, not just the transition.
- `submit_hook:` on action YAML becomes an **endpoint id** (e.g. `lead-onboarding-qualify-on-submit`), not a routine YAML path. The user authors a regular module-or-app Lowdefy `Api`; the engine invokes it by id.
- `@lowdefy/api` gains a `context.callApi` function exposed to plugin connections. This is a new Lowdefy capability (see Decision 2).

The page doesn't change much — it still posts to `workflows/submit-action` with a structured payload. The generated per-action submit endpoint (`workflows/<wf>-<action>-submit`) goes away.

## Decision 1 — `SubmitWorkflowAction` replaces `UpdateWorkflowActions`

The plugin's `WorkflowAPI` connection ships a new request handler that supersedes `UpdateWorkflowActions` (engine sub-design Decision 1). Same connection, broader responsibility.

**What it owns** (in order, single in-process call):

1. **Validate.** Payload schema (action_id present, current_type matches the action doc, current_status is in the action_statuses enum). Permission check against the action's `access` block via the engine's `action_role_check` semantics. Optionally pre-flight the `unblocks` list to verify referenced action types / group ids resolve.
2. **Engine writes core.** Write the requesting action's status. Apply `unblocks` (fan-out + upserts per keys). Recompute the workflow's `summary`. Run auto-complete. Fire the sub-workflow tracker subscription. Same logic the engine does today inside `UpdateWorkflowActions` — semantics preserved.
3. **Engine writes built-in side effects.** If the payload carries `entity_update`, plugin issues a Mongo update against the entity connection (same as today's `write_entity` step). If the payload carries `event`, plugin issues an internal callApi to `events.new-event`. If `event.notifications: true`, plugin issues an internal callApi to `notifications.send-notification`. The Mongo driver and cross-module dispatch all run inside the handler — see Decision 2.
4. **Invoke user submit hook.** If the action's `submit_hook` resolves to an endpoint id, plugin issues `context.callApi(submit_hook_id, hook_payload)` — see Decision 4 for payload shape, Decision 3 for the field semantics. Hook is optional; missing hook is no-op.
5. **Finalize and return.** Return `{ success, action_ids, event_id, hook_response? }` — the hook's response is forwarded if the hook ran, so the page can use it (e.g. for redirect URLs computed app-side).

**Why fold steps 3 and 4 into the plugin, not the routine layer.** Two reasons:

- **Atomicity-of-event-id.** The `event_id` generated for this submission flows uniformly through (a) the engine's audit chain, (b) the entity event log, (c) the user hook's downstream calls. The hook receives the same `event_id` so its retries / log entries correlate with the engine's. A routine layer doing this works but has to thread the id explicitly through every step.
- **No new fanout primitive needed.** Action-groups `on_complete` (a future extension) needs the engine to fire one hook per completed group, in-flight. A routine layer would need a fanout step (`ForEach`-equivalent over an array of `CallApi`s). With the plugin owning the dispatch, it just iterates and calls `context.callApi` per entry.

**Supersedes:** [engine](../engine/design.md) Decision 1's `UpdateWorkflowActions` request — same connection, renamed and broadened. The directory shape stays (`src/connections/WorkflowAPI/SubmitWorkflowAction/...`) with new helper files for the side-effects step (`writeEntityUpdate.js`, `dispatchEvent.js`, `dispatchNotification.js`, `invokeSubmitHook.js`).

## Decision 2 — `context.callApi` capability in `@lowdefy/api`

This is a **new Lowdefy capability**. Plugin connections today receive a `context` with `logger`, request metadata, and connection properties — but no way to invoke a Lowdefy API endpoint from inside the handler. This sub-design adds one.

**Shape.** `@lowdefy/api` exports a `callApi(context, { endpointId, payload, blockId? })` helper that re-enters the API runtime as if a routine `CallApi` step had run — same authorization model, same operator evaluation, same context. The plugin's connection context gets a bound version: `context.callApi(endpointId, payload)`.

**Implementation sketch** (in `@lowdefy/api`):

```js
// packages/api/src/routes/request/callApi.js (new)
import callRequest from "./callRequest.js";

async function callApi(context, { endpointId, payload }) {
  // Reuses callRequest under the hood — same auth, same operator evaluation.
  // endpointId is the resolved API endpoint id; payload is structured input.
  return callRequest(context, {
    requestId: endpointId,
    payload,
    pageId: null, // server-originated; no calling page
    blockId: null, // server-originated; no calling block
  });
}
```

The plugin's `createConnection` factory receives the context and binds `callApi`:

```js
// inside plugin connection handler
const context = {
  ...incoming,
  callApi: (endpointId, payload) => callApi(incoming, { endpointId, payload }),
};
```

**Authorization context.** The internal `callApi` inherits the originating user from the outer request's context (same `user`, same `roles`). This is the only sane default — the user submitting the form is the principal for everything downstream. Apps that want a hook to run as a different principal (e.g. a system user for entity writes) handle that in the hook itself.

**Re-entrancy / depth bound.** A hook called by `SubmitWorkflowAction` could itself call `submit-action` (the public Api) again — recursive submission. The engine sub-design already commits a depth-limit guard for tracker recursion (engine open question 1). Extend the same guard here: `context.callApi` carries a depth counter in context; default limit 10; exceeding it throws with a clear error citing the chain.

**Error semantics.** A throw inside `context.callApi` propagates to the plugin handler. Plugin handler catches and decides whether to roll-back its own writes or propagate. v1: propagate — if the hook throws, the engine returns the error to the page, **but engine writes from steps 2–3 are already durable**. This matches today's submit-action partial-state-plus-retry model (module-surface Decision 4 "Composition error semantics"). The README documents the contract.

**Why a new capability, not "wrap submit-action in a routine that calls CallApi."** The routine-wrapping alternative (Fork B in the trade-offs section) works for the simple "engine-then-hook" case but breaks down for action-groups: the engine can't tell the routine layer "fire these N hooks now, before I finalize." `context.callApi` lets engine-internal dispatch live where the dispatch decision lives — in the plugin handler. Once the capability exists, both submit hooks and group `on_complete` hooks use the same primitive.

## Decision 3 — `submit_hook:` becomes an endpoint id

Today's action YAML:

```yaml
type: qualify
submit_hook: workflow_config/onboarding/api/qualify-submit-hook.yaml # path to a routine
```

Becomes:

```yaml
type: qualify
submit_hook: lead-onboarding-qualify-on-submit # an API endpoint id
```

**Resolution.** The endpoint id is resolved against the build-time API registry. If the id is `<workflow_type>-<action_type>-on-submit` and matches no app-registered API, the build falls back to checking for an app-shipped Api at the conventional path (`workflow_config/<workflow_type>/api/<action_type>-on-submit.yaml`) — purely a developer-convenience fallback. Apps that want their hook to live elsewhere register the Api with whatever id they like and reference it directly.

**No more `makeWorkflowApis` per-form-action endpoint.** Today the resolver pipeline ([action-authoring](../action-authoring/design.md)) generates one endpoint per form action — these are the `workflows/<wf>-<action>-submit` endpoints whose routine = app's submit_hook YAML. With submit hooks now being regular Apis registered by the app, `makeWorkflowApis` doesn't generate per-action submit endpoints. It still generates other action-level Apis (if any — action-authoring sub-design owns the full list); just not the submit ones.

**Page calls module endpoint directly.** The page (form-action edit page generated by the ui sub-design) calls `workflows/submit-action` (the module's single submit Api). Today the page calls `workflows/<wf>-<action>-submit`; with this design the per-action endpoint goes away and the page invokes the module Api with `action_id` + `current_type` + form payload.

**Supersedes:** [action-authoring](../action-authoring/design.md) `submit_hook:` field semantics and the `makeWorkflowApis` per-form-action endpoint generation. The field's type changes from "string path to routine YAML" to "string endpoint id." The build-time resolver pipeline drops the per-form-action `submit` endpoint emission step.

**Optional hook.** Actions without a `submit_hook:` have no app-side hook to fire. Step 4 of `SubmitWorkflowAction` (Decision 1) no-ops. The engine + built-in side effects still run normally. Today every form action's submit hook has to exist (even if it's a one-liner); with this design **the field is optional** and most actions don't need one.

## Decision 4 — Submit hook payload contract

When the engine invokes the hook via `context.callApi(submit_hook_id, hook_payload)`, the payload carries enough context for the hook to act:

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

The hook is a regular `Api` so it has all the normal capabilities — `MongoDBUpdateOne`, cross-module `CallApi`, `_payload` access, etc. It can read additional data, do conditional writes, fire downstream APIs.

**Pattern: hook does app-specific side effects.** Engine has already written the action transition, applied unblocks, written `entity_update` / `event` / `notify` if those were in the page's payload. The hook is where app-specific extras go — writing to another collection, calling an external API, triggering a downstream workflow.

**Example: a qualify-on-submit hook**

```yaml
id: lead-onboarding-qualify-on-submit
type: Api
routine:
  # Sync the lead's CRM record with the qualification notes.
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

The engine has already done the action transition, written the entity stage, logged the standard event, dispatched any notifications. The hook just does the CRM sync, which is the only thing the standard built-ins don't cover.

**No more "build the submit-action payload."** The page submits the structured payload to `workflows/submit-action` directly. Whatever transition spec was in the old submit-hook YAML (unblocks, event, entity_update) now lives in the page's submit call — or in declarative `action.unblocks: [...]` / `action.event_template: {...}` blocks on the action YAML (additive extension, future).

**Open question:** should action YAML grow declarative `event_template:` / `entity_update_template:` blocks so the page doesn't have to build them per-submission? Yes, probably — see Open Questions. Out of scope for this sub-design but the inversion enables it cleanly.

## Decision 5 — submit-action Api becomes thin

The module's `submit-action.yaml` becomes:

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

One step, one return. All the side-effect orchestration moves inside the plugin handler.

**Supersedes:** [module-surface](../module-surface/design.md) Decision 4's multi-step routine. The four-step routine (`update_actions` → `write_entity` → `new_event` → `notify`) collapses into one `SubmitWorkflowAction` step that does everything.

**Why keep it an Api at all?** Two reasons:

- **Auth surface.** Lowdefy Apis have an `auth` block that controls who can call them. Plugin connections have no equivalent — they're invoked by routine steps and inherit the routine's auth. Keeping `submit-action` as the public surface means the existing Api auth model gates submissions.
- **Operator evaluation on payload.** Page payloads come in with operators (`_state`, `_user`, etc.). The Api layer evaluates them before passing into the plugin. The plugin handler gets resolved values.

The Api is so thin that "could the page call `SubmitWorkflowAction` directly?" is a reasonable question. Answer: no, because plugin connections aren't directly callable from page actions — the `CallApi` action targets API endpoints (Apis), not connections.

## Extension preview — action-groups `on_complete`

This sub-design defers action-groups (per the scope question), but the same plumbing applies. Sketch:

- Action-groups [Decision 1](../action-groups/design.md) keeps `on_complete:` on the group declaration; the field changes from "path to a routine YAML" to "endpoint id" (same shape as submit_hook in Decision 3).
- Action-groups [Decision 5](../action-groups/design.md) step 2 ("recompute affected groups' statuses") now also dispatches: for each group transitioning to `done`, plugin calls `context.callApi(group.on_complete_id, group_hook_payload)` before continuing to step 3.
- The deferred Decision 6 "fanout mechanism" question dissolves — there's nothing to defer because dispatch happens in the plugin handler via the same `context.callApi` primitive used for submit hooks.
- `completed_groups` return shape stays the same (downstream consumers may still want it for read-side awareness) but the orchestration responsibility moves out of the routine layer.

That collapses action-groups Open Question 1 to "we use `context.callApi`, same as submit hooks" and removes the api-hooks follow-up sub-design entirely.

## Trade-offs vs alternatives

### Alternative A — Status quo (routine-orchestrated, module-surface Decision 4)

Today's design. Submit hook is an authored routine that calls submit-action. submit-action's routine does the engine + side effects.

| Aspect                           | Status quo                          | This sub-design                                 |
| -------------------------------- | ----------------------------------- | ----------------------------------------------- |
| Files per form action (app)      | submit hook YAML + form action YAML | form action YAML (hook optional)                |
| Submit endpoints generated       | one per form action                 | none (page hits module's submit-action)         |
| Where event-id correlation lives | routine step variables              | plugin handler state                            |
| Action-groups fanout mechanism   | open question (api-hooks follow-up) | falls out for free                              |
| New Lowdefy capability needed    | none                                | `context.callApi`                               |
| Test surface                     | routine YAML + plugin               | plugin only (hooks tested independently)        |
| Refactor cost                    | none                                | substantial — supersedes 3 sub-design decisions |

### Alternative B — Routine still orchestrates, but with hook-by-id

Keep submit-action as today's multi-step routine, but add a hook step that does `CallApi` against the user's endpoint id. No new Lowdefy capability — just uses existing `CallApi`.

```yaml
# submit-action Api routine — alternative B
routine:
  - id: update_actions
    type: UpdateWorkflowActions
    properties: { ... }
  - id: write_entity # optional
    type: MongoDBUpdateOne
    skip: { _not: { _payload: entity_update } }
  - id: new_event # optional
    type: CallApi
    properties:
      endpointId: { _module.endpointId: { id: new-event, module: events } }
  - id: notify # optional
    type: CallApi
  - id: user_hook # NEW
    type: CallApi
    skip: { _not: { _payload: submit_hook_id } }
    properties:
      endpointId: { _payload: submit_hook_id }
      payload: { ... }
```

Page resolves the `submit_hook_id` from the action config at request time (or it flows down from the action's YAML via a lookup) and passes it in the payload.

**Where this falls down:**

- **Action-groups fanout still unsolved.** Routine YAML can't fan out N variable-length `CallApi`s; the api-hooks follow-up is still required.
- **Plugin handler can't trigger hooks mid-write.** A future "engine fires hook when group transitions to done" pattern needs plugin-side dispatch.
- **The page has to know the hook id** ahead of time and pass it in the payload. With the proposed Decision 3 shape, the plugin handler looks up the hook id from the action's YAML — the page doesn't have to plumb it.

**Where it wins:** no new Lowdefy capability; same plugin shape as today. If the `context.callApi` work is heavy, Alternative B is the cheaper fallback that captures most of the inversion benefit (optional hook by endpoint id, fewer generated submit endpoints).

### Alternative C — Hook is a pre-write transform

Different shape entirely: hook runs **before** engine writes. Hook receives form data + action context, returns `{ unblocks, entity_update, event }` — a transition spec. Engine applies spec atomically. Hook can reject the submission.

Power: hooks can compute dynamic unblocks based on form data and have first-class control over what the engine writes.

Cost: hook semantics are "must return the transition spec" — much less flexible than "free-form Api routine." Hooks that just want to do app-specific side effects (the common case) have to also assemble the transition spec, which the page could have done.

**Rejected for primary design.** Doesn't fit "engine writes core, hook does side effects" — flips the relationship. Worth holding as a future shape if pre-write validation needs grow.

## Risks

- **`context.callApi` is a new Lowdefy capability with auth and re-entrancy implications.** The auth model (hook inherits caller's user/roles) is the only obvious choice but binds the engine to one principal model. Multi-tenant apps that want hooks to run as service principals can't get that without per-call auth context override — listed as a v2 extension. Re-entrancy is bounded by the depth guard (Decision 2) but the guard needs operational testing — a deep workflow tree (parent → sub-workflow → grand-child) hitting hooks at each layer could surface the limit unexpectedly.
- **Refactor cost is real.** This sub-design supersedes parts of three other sub-designs (engine, module-surface, action-authoring). Adopting it after those are implemented means rework — the WorkflowAPI plugin's request shape changes, the submit-action Api shrinks, the resolver pipeline drops `makeWorkflowApis` per-action emission, action YAML grammar changes for `submit_hook`. Time-box the decision: pick this or status-quo before any of the affected sub-designs start implementation, otherwise the migration cost compounds.
- **Hook timing locks side effects after engine writes.** The hook fires after `entity_update` / `event` / `notify` have already happened. A hook that needs to "veto" the submission (e.g. validation rule that fires too late to surface) has to compensate by reverting writes. Today's pattern has the same shape (the hook is mostly a payload builder so vetos happen client-side); preserving this means apps with strict server-side validation patterns push validation to the page or to a pre-step they call before submit-action. Acceptable for v1.
- **Plugin handler complexity.** Folding entity_update + event + notify into the plugin handler grows it from "transition logic only" (today's `UpdateWorkflowActions`) to "transition + cross-module dispatch + user-hook invocation." More code, more state, harder to unit-test in isolation. Mitigation: keep each step in its own helper file (`writeEntityUpdate.js`, `dispatchEvent.js`, `dispatchNotification.js`, `invokeSubmitHook.js`) so the handler is a thin orchestrator over named steps — mirrors the directory layout in [engine](../engine/design.md) Decision 1.
- **Plugin → Api → Plugin recursion.** A submit hook that calls another module's API that calls submit-action again is technically possible. The depth guard catches infinite loops but doesn't catch slow blow-ups. Same risk class as the existing tracker-update recursion in engine sub-design; same mitigation (depth-limit guard with clear error citing the chain).

## Open Questions

1. **Declarative templates on action YAML.** With the page now building the full submit-action payload, action YAML could grow `event_template:` / `entity_update_template:` blocks that the page evaluates against form_data. The page becomes a thin client that submits raw form data; the engine reads the templates from the action config and applies. Pushes the submit-action payload contract toward "tiny" — `{ action_id, current_type, form_data }` — and the engine assembles everything else. Out of scope here but enabled by the inversion.
2. **Per-action authorization moves to the engine.** Today's submit-action Api has app-level `auth:` config; per-action role checks live in the routine via `action_role_check`. With the engine owning the submit lifecycle, per-action role checks should move into step 1 of `SubmitWorkflowAction` (Decision 1) — engine reads the action's `access` block and rejects with a structured error if the caller's roles don't match. Worth specifying explicitly; not done in this draft.
3. **`hook_response` shape.** Decision 1 returns the hook's response. The hook is a free-form Api so the response shape is whatever the hook routine returns. Should the engine require any specific keys (e.g. `success: true`)? Probably not — keep it transparent; page handles whatever the hook returns. Document in README.
4. **Should action-groups `on_complete` happen in this same sub-design?** User chose "submit hook only; defer groups." Once submit hooks are implemented, the action-groups extension is mechanical — `context.callApi` per completed group. Re-open if the design lands cleanly and folding groups in is small.

## Interaction with the other sub-designs

This sub-design is layered against the existing five; the affected surfaces:

- **[engine](../engine/design.md)** — `UpdateWorkflowActions` → `SubmitWorkflowAction`. Same connection; broader handler. Tracker subscription, references contract, status priority rule all unchanged. Decision 1's pseudo-code grows steps for built-in side effects and hook dispatch.
- **[module-surface](../module-surface/design.md)** — `submit-action` Api shrinks to a one-step wrapper (Decision 5). The Api's payload shape grows `form_data` and `submit_hook_id` fields (the latter only if the engine doesn't look it up from action config). Decision 4's "Composition error semantics" table simplifies — one step's idempotency analysis covers the whole submit.
- **[action-authoring](../action-authoring/design.md)** — `submit_hook:` field type changes (Decision 3). `makeWorkflowApis` no longer emits per-form-action submit endpoints. Conventional fallback path (`workflow_config/.../{action}-on-submit.yaml`) listed in resolver doc.
- **[ui](../ui/design.md)** — Generated form-action edit pages call `workflows/submit-action` directly with `action_id` + `current_type` + `form_data`. No per-action `workflows/<wf>-<action>-submit` endpoint to call. Page templates simplify.
- **[action-groups](../action-groups/design.md)** — Future extension; same `context.callApi` plumbing replaces the deferred "fanout mechanism" question.

## Next Step

Decide between this and status-quo before any of the affected sub-designs begin implementation. If adopted:

1. Add `context.callApi` to `@lowdefy/api` (the Lowdefy-side change). Verify auth context inheritance, depth-limit guard, error propagation in an isolated spike — this is the new-capability work and should land first.
2. Restructure `WorkflowAPI` plugin per Decision 1. Move `UpdateWorkflowActions` to `SubmitWorkflowAction`; add side-effects helpers.
3. Update `submit-action.yaml` per Decision 5.
4. Update action-authoring resolver to treat `submit_hook:` as an endpoint id; drop `makeWorkflowApis` submit endpoint emission.
5. Update form-action edit page template to call module's submit-action directly.
6. Once stable, fold in action-groups `on_complete` using the same primitive.
