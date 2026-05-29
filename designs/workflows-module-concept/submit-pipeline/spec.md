# Workflows Submit Pipeline — Spec

Engine-orchestrated submit lifecycle. Full rationale in [design.md](designs/workflows-module-concept/submit-pipeline/design.md); this file carries only the committed decisions.

**Status:** Supersedes [module-surface](../module-surface/design.md) Decisions 4 & 5 (`submit-action` Api), [engine](../engine/design.md) Decision 1's `UpdateWorkflowActions` (renamed to `SubmitWorkflowAction`), and [action-authoring](../action-authoring/design.md) Decision 6's `makeWorkflowApis` (now emits `update-action-{action_type}`).

**Depends on:** [../call-api/design.md](../call-api/design.md) — gates implementation.

## Flow

```
Page button (template-shipped button bar)
  → workflows/update-action-{action_type}        (resolver-generated Lowdefy Api per action)
      └─ SubmitWorkflowAction (plugin handler — single in-process invocation)
            1. Validate payload + permissions; signal name known (unknown signal throws — engine D4)
            2. Pre-hook for signal (if declared) — returns optional actions[] (signals against OTHER actions) + event_overrides + form_overrides; aborts via `throw` / `:reject`
            3. Compute auto-unblocks (unblock signals) from blocked_by graph; merge with pre-hook actions[]
            4. Resolve + write action transitions via the FSM (transitions[kind][currentStatus][signal]; unlisted cell no-ops)
            5. Recompute workflow summary + groups[]
            6. Write form_data ($set per field) + workflow doc updates
            7. Generate log event (defaults overridable from action YAML + pre-hook)
            8. Dispatch notifications (via notifications module InternalApi)
            9. Fire tracker subscription if workflow status changed (sync in-process per engine D3, internal_mirror_child_* signals) — accumulates parent-level `completed_groups` per level
           10. Fire group on_complete pipelines for completed groups (originating + tracker-propagated union)
           11. Post-hook for signal (if declared)
           12. Return { action_ids, completed_groups, event_id, tracker_fired?, pre_hook_response?, post_hook_response? }
```

The current action lands per the signal the user fired; there is no current-action redirect. Pre-hook `actions[]` entries fire signals against *other* actions only.

## `SubmitWorkflowAction` plugin request

Replaces `UpdateWorkflowActions` (engine Decision 1). Same `WorkflowAPI` connection, broader handler. Single invocation owns: validate → pre-hook → write → side effects → post-hook → return.

Connection structure: see [engine spec](../engine/spec.md) for the canonical `src/connections/WorkflowAPI/` layout. Submit-pipeline adds the files under `SubmitWorkflowAction/` (handler, pre/post hook invokers, auto-unblock computation, log-event dispatch, notification dispatch, group `on_complete` fan-out).

## Per-action `update-action-{action_type}` Api (resolver-emitted)

`makeWorkflowApis` (action-authoring Decision 6) emits one Lowdefy Api per form / simple action. Shape:

```yaml
id: update-action-{action_type}
type: Api
routine:
  - id: submit
    type: SubmitWorkflowAction
    connectionId:
      _module.connectionId: workflow-api
    properties:
      action_id: { _payload: action_id }
      action_type: <action_type>                 # build-time literal
      workflow_type: <workflow_type>             # build-time literal
      signal: { _payload: signal }               # which signal the button fired (nullary — no target payload)
      current_key: { _payload: current_key }     # for keyed actions; omit for non-keyed
      form: { _payload: form }
      form_review: { _payload: form_review }
      fields: { _payload: fields }
      comment: { _payload: comment }             # user-supplied comment; handler maps to event.metadata.comment
      hooks:                                     # build-time literal map keyed by signal (only button-surfaced signals carry hooks)
        submit: { pre: <api-id-or-null>, post: <api-id-or-null> }
        progress: { pre, post }
        not_required: { pre, post }
        resolve_error: { pre, post }
        approve: { pre, post }
        request_changes: { pre, post }
      event_overrides:                           # build-time from action.event[signal]
        submit: { type, display, metadata }
        ...
  - :return:
      action_ids: { _step: submit.action_ids }
      completed_groups: { _step: submit.completed_groups }
      event_id: { _step: submit.event_id }
      tracker_fired: { _step: submit.tracker_fired }
      pre_hook_response: { _step: submit.pre_hook_response }
      post_hook_response: { _step: submit.post_hook_response }
```

**Scope:** Emitted for `kind: form` and `kind: simple` actions. Tracker actions get no endpoint (engine writes their status via the tracker subscription).

**Per-app emission:** Endpoints are emitted regardless of `access.{app_name}` verb list — the engine enforces access at submit time via the role gate. (Per-page emission still verb-filtered per ui spec.)

**`hooks` and `event_overrides` keying:** Both are emitted as per-signal maps because the resolver can't know which signal the runtime payload carries. The handler resolves `hooks[signal]` and `event_overrides[signal]` once on entry and treats them as scalar bags for the rest of the lifecycle. The pre-hook return's `event_overrides` is the unkeyed runtime bag that merges on top. Only button-surfaced signals (the "interactions") carry hooks; engine-internal and cascade signals (`unblock`, `internal_*`) have no hook-dispatch point.

## Per-template button bars over the signal namespace

Each page template declares which signals it surfaces as buttons. A button click calls `update-action-{action_type}` with `signal: <name>`; the engine resolves the transition through the action's FSM (`transitions[kind][currentStatus][signal]`). There is no submit-pipeline-side "interaction → target status" table — the canonical button bars and FSM tables live in [state-machine](../state-machine/design.md) ("Templates and buttons", "Signal inventory").

Each button is a template-shipped block that, on click:

1. Fires the matching `pages.{verb}.events.{handler}` author-supplied event (if declared).
2. Calls `update-action-{action_type}` with `signal: <name>` + payload.

**Default v1 button bars** (from [state-machine](../state-machine/design.md) "Templates and buttons"):

| Template | Signals surfaced                          | Notes                                                                                       |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `edit`   | `submit`, `progress`, `not_required`      | The submitter's working surface. `progress` is restored in v1.                              |
| `view`   | Edit link (navigation)                    | Default landing for `done` actions. `request_changes` on view is a reviewer-gated ui follow-on (state-machine review-1 finding 7); not shipped by default. |
| `review` | `approve`, `request_changes`              | The reviewer's surface.                                                                     |
| `error`  | `resolve_error`                           | The error-handler's surface.                                                                |

Apps that customize a template pick the button bar they want; the FSM is unchanged. Adding a button (e.g. `not_required` on the view page) is a template edit, no engine work.

### How the target status is determined (FSM, not a table)

The engine carries no resolution table. The target is the FSM cell `transitions[kind][currentStatus][signal]`:

- **`submit`** lands `in-review` if the action's `access.{app_name}` lists `review`, else `done` — baked into the FSM's `submit` rule, **identical for form and simple kinds**. `submit` is nullary: the target is resolved from the action's static `review` verb, not from any runtime payload. Simple kind has **no status selector and no `target_status` payload** (the v0 selector is removed — state-machine review #6).
- **`progress` / `approve` / `request_changes` / `not_required` / `resolve_error`** are nullary — the signal name fully determines the transition via the FSM.
- **`error`** is a pre-hook/cascade signal (no button) that lands an action in `error` from any non-terminal state. Recovery is `resolve_error`.
- **No current-action redirect.** The current action lands per the signal the user fired; a pre-hook cannot re-signal it (it influences the current action only via `event_overrides` / `form_overrides`). All pre-hook signal emission is cross-action via `actions[]`.

### Button vs event-verb separation

Buttons and the page-event vocabulary (`onMount`, `onSubmit`, `onApprove`, `onRequestChanges` — action-authoring Decision 8) coexist and cover different concerns:

- **Event verbs** are author-supplied page lifecycle hooks. Set state, fire requests, build payloads, validate. No engine call. Unchanged.
- **Buttons** are the engine-call surface. Template-shipped; wire to the per-action API.

A `submit` button click fires `pages.edit.events.onSubmit` (page logic) and posts to the engine (with `signal: submit`). Authors who need pre-write logic register a pre-hook (next section); authors who just need page-state work register an `onSubmit` event handler.

## Action hooks contract

Authors declare hooks at the action root, per signal (keyed by the button-surfaced signal names — the "interactions"):

```yaml
type: qualify
kind: form
hooks:
  submit:
    pre: lead-onboarding-qualify-pre-submit
    post: lead-onboarding-qualify-post-submit
  approve:
    pre: lead-onboarding-qualify-pre-approve
  request_changes:
    post: lead-onboarding-qualify-post-request-changes
```

Each signal may declare `pre:`, `post:`, both, or neither. Values are Lowdefy Api endpoint ids; engine invokes them via the [call-api](../call-api/design.md) primitive. Only button-surfaced signals can carry hooks — engine cascades (`unblock`, `internal_*`) have no hook-dispatch point.

### Hook auth gate

Hook APIs go through their own `auth:` block on every invocation (including engine-fired). Authoring rule: **`hook.auth.roles` ⊇ `action.access.roles`** — `makeWorkflowApis` validates at build and fails on a mismatch. `auth.public: true` on a hook API is rejected at build (would bypass the action's role gate via direct endpoint access). Hooks that want finer-grained branching add per-routine `_user.roles` checks inside the routine, orthogonal to the auth block.

### Pre-hook payload

```
pre_hook_payload:
  workflow_id: string
  workflow_type: string
  action_id: string
  action_type: string
  current_key: string | null
  signal: string            # the signal the user fired (the button name; nullary)
  form: object
  form_review: object
  fields: object
  current_status: string    # the action's current stage (read-only; not the target)
  user: { id, profile, roles }
  context:                                  # pre-call state — before any engine writes
    workflow: <full workflow doc as it stands before this submit's writes>
    action:   <full action doc as it stands before this submit's writes>
```

### Pre-hook return (all fields optional)

```
{
  actions: array            # signals fired against OTHER actions, merged with engine-computed
                            #   auto-unblocks (entries take precedence). The current action lands
                            #   per the user-fired signal — there is no current-action redirect.
    - type: string          #   target by (type [+ key] in this workflow) ...
      key: string | null
      workflow_id: string   #   ... or by (workflow_id, type) ...
      action_id: string     #   ... or by primary key
      signal: string        #   the signal to fire against the target; resolved via its FSM
      fields: object        #   optional; per-action universal field write
      status: string        #   optional; ONLY for upsert spawns — the initial status of a
                            #     newly-created keyed instance (creation seed, not a transition).
                            #     Omit for existing-action targets; they move via `signal`.
      upsert: boolean       #   when true, creates a new keyed instance in `status`
  event_overrides: object   # merged over action.event[signal] over engine defaults.
                            #   Use event_overrides.metadata to attach diagnostic context to the
                            #   events-log entry (the channel for failure context on a pre-hook
                            #   `error`-signal cascade).
  form_overrides: object    # extra fields to $set on form_data.{action_type}[.{key}]
}
```

The `force` field is gone (engine D4 removed the priority bypass). Backward moves that used to need `force` — `done → changes-required`, `done → action-required` — are now ordinary FSM transitions reached by firing the appropriate signal (`request_changes`, `activate`, …). To push another action into `error`, fire `actions: [{ type, signal: error }]` (replacing the v0 `{ ..., status: 'error' }` return). To fail the *current* submission, `:reject` / `throw` — there is no way to error the current action from its own pre-hook. The `{ status }` → `{ signal }` migration mapping lives in [state-machine](../state-machine/design.md) "Pre-hook returns".

**Aborts.** A pre-hook aborts the lifecycle by throwing. Two flavours, the choice belongs to the hook author (see [Part 29 § D5](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently) and [Part 9 § Pre-hook abort modes](../../workflows-module/parts/_completed/09-hook-invocation/design.md)):

- **`:reject`** (Lowdefy control) — for user-facing validation failures. Propagates as a `UserError(isReject: true)` throw; the wrapping per-action endpoint's `runRoutine` classifies as `{ status: 'reject', error }` and the calling app's `CallApi` surfaces the message via the platform's standard reject UI.
- **`throw`** (or any thrown error) — for infrastructure failures. The wrapping endpoint classifies as `{ status: 'error', error }`; user sees a transient error toast and can retry.

In both cases the engine catches nothing — the throw propagates through `invokePreHook.js`, `handleSubmit.js`, and the plugin handler unchanged. There is **no `hook_error` return field** and no `{ rejected, reject_message }` return surface.

**`form_overrides` merge rules:** pre-hook wins over user-submitted `form` / `form_review` on field collision; writes to the same flat `form_data.{action_type}.{field}` tree (engine D5 — no `.review` / `.error` sub-keys).

### Post-hook payload

```
post_hook_payload:
  workflow_id, workflow_type, action_id, action_type, current_key, signal
  form, form_review, fields                # as submitted
  result:
    action_ids: array<string>
    completed_groups: array<string>
    event_id: string
    tracker_fired:                         # present when tracker subscription propagated to a parent;
                                           #   null otherwise. Hooks that need the parent's post-write
                                           #   doc fetch by parent_workflow_id.
      parent_action_id: string
      parent_workflow_id: string
      new_status: string
  user, context                            # context.workflow + context.action are the SUBMIT workflow's
                                           #   docs post-write. Parent workflow is not included on
                                           #   tracker fire — read it via tracker_fired.parent_workflow_id.
```

### Post-hook return

Free-form. Surfaced as `post_hook_response` on the API return. Post-hook **cannot abort** — engine writes already landed. Failures logged but not propagated to caller.

## Default log event

Every signal that transitions the current action generates a log event by default. Engine writes one event via [events module's `new-event` Api](../../../../modules/events/api/new-event.yaml).

**Default shape:**

```yaml
type: action-{signal} # e.g. action-submit, action-approve
display:
  { app_name }: # consuming app's app_name (events module's display_key)
    title:
      _nunjucks:
        template: "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}"
        on: { user, action_type, status_after }
references:
  workflow_ids: [<workflow_id>]
  action_ids: [<action_id>]
  { entity-ref-key }: [<workflow.entity_id>] # entity_collection-derived key, see below
metadata: action_type, workflow_type, signal, current_key
  status_before, status_after
```

The audit entry records the signal the user **fired** and the `status_after` it resolved to. With no current-action redirect, the recorded `signal` and the landed status always reconcile against the FSM table (`transitions[kind][status_before][signal] == status_after`).

`display` is keyed by the consuming app's `app_name` (= events module's `display_key` var, per [modules/events/components/events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml)'s `$<display_key>.title` projection). The workflows module declares its own `app_name` manifest var; engines read it from `connection.app_name`.

`{entity-ref-key}` is derived from `workflow.entity_collection`: strip a trailing `-collection` if present, replace remaining `-` with `_`, append `_ids`. So `leads-collection → leads_ids`, `tickets-collection → tickets_ids`. This is the same convention entity pages' timeline components query by (see [apps/demo/.claude/guides/events.md](../../../../apps/demo/.claude/guides/events.md)), so the engine-emitted event appears on the entity's timeline without per-action authoring.

**Override paths** (merged in order, last wins):

1. Engine defaults (above).
2. Action YAML `event.{signal}.{type|display|metadata}` — resolver bakes the whole `event:` block into the endpoint payload's keyed `event_overrides` map; handler resolves `event_overrides[signal]` once on entry.
3. Pre-hook return `event_overrides` — unkeyed runtime bag, merges on top of (2).

Action YAML shape:

```yaml
event:
  submit:
    type: lead-qualified
    display: { ... }
    metadata: { ... }
  approve:
    type: lead-approved
```

## Side effects owned by the engine

| Effect               | When                                              | How                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log event            | Always, after action writes                       | Engine `context.callApi('new-event', module: 'events')` with merged event payload                                                                                                                                                   |
| Notifications        | Always, after the log event                       | Engine `context.callApi('send-notification', module: 'notifications')` with `{ event_ids: [<event_id>] }`. The app's `send_routine` (on the notifications module entry) decides recipients — silent no-op when no routine is wired. |
| Tracker subscription | When workflow status changed                      | Synchronous in-process per engine D3. Engine writes parent tracker action via internal `emitSignal` recursion firing the `internal_mirror_child_*` signal; `SubmitWorkflowAction` invocations don't recurse on themselves. Each level emits `completed_groups` from its recompute diff and accumulates them on the fire chain.                                                                                       |
| Group `on_complete`  | When groups transition to `done` this call        | Engine `context.callApi(<on_complete-api-id>)` per completed group. Fires for the union of the originating workflow's `completed_groups` and every tracker-propagated parent level's `completed_groups`. Runs after tracker subscription so parent-level completions are visible. |

`entity_update` (the status-quo `submit-action` payload's optional Mongo write to the entity doc) is **dropped**. Apps that need to update the entity do so from a pre/post hook.

## Page → API call

The button block (template-shipped) calls the per-action API with a fixed payload shape:

```yaml
- id: submit_button # template-shipped block id
  type: Button
  events:
    onClick:
      - id: call_event_handler # fire author's page event first
        type: <whichever event verb maps> # e.g. CallMethod or inline action array
      - id: submit
        type: CallApi
        params:
          endpointId:
            _module.endpointId:
              id: update-action-{action_type}
              module: workflows
          payload:
            action_id: { _request: get_action._id }
            signal: submit
            current_key: { _request: get_action.key }
            form: { _state: form }
            form_review: { _state: form_review }
            fields: { _state: fields }
            comment: { _state: comment } # optional; handler maps to event.metadata.comment
```

The page never builds this manually — the template ships the button and the wiring.

## Dropped from module-surface

- **`submit-action` Api** — removed. Replaced by per-action `update-action-{action_type}`.
- **`submit-action` payload's `entity_update` field** — apps use pre/post hooks for entity writes.
- **`submit-action` routine** — engine owns the lifecycle.

## Renamed

- `UpdateWorkflowActions` → `SubmitWorkflowAction` (engine Decision 1).
- `makeWorkflowApis` resolver output: `{workflow_type}-{action_type}-submit` → `update-action-{action_type}`.
- Action YAML field: `submit_hook:` → `hooks:` (per-signal map).
- Wire field: `interaction:` → `signal:` ("interaction" survives only as the word for a signal a page template surfaces as a button).

## Open questions

1. **Per-template button bars.** The default bars are settled in [state-machine](../state-machine/design.md) "Templates and buttons" (`edit`: `submit` / `progress` / `not_required`; `view`: Edit link; `review`: `approve` / `request_changes`; `error`: `resolve_error`). Remaining edge cases to confirm during review:
   - `request_changes` on the `view` template — should default to reviewer-gated (state-machine review-1 finding 7).
   - A `cancel` button for workflow-level cancellation from an action context (out of scope for the v1 signal inventory).
   - How the shared simple pages surface `error` recovery — a `simple-error` page vs. a `resolve_error` button on `simple-view` (ui follow-on).
2. **Group `on_complete` mechanism.** Engine fans out one `context.callApi` per completed group's declared `on_complete` endpoint. Confirm during review.
3. **Event-types config var.** Should the module expose `event_types` as a manifest var (like events module's `event_display`) so apps can register canonical types per app? Steph flagged.
4. **Pre-hook actions[] merge precedence on collisions.** Pre-hook entries take precedence over auto-unblocks on `(type, key)` collisions. Confirm during review.
5. **Hook payload size.** Pre-hook receives full workflow + action docs. Add a `context.shallow` flag if real-world sizes exceed payload limits.

## Implementation order

1. Land [call-api](../call-api/design.md) — gates this sub-design.
2. Confirm the per-template button bars (Open Question 1) during review.
3. Implement `SubmitWorkflowAction` plugin handler, resolving signals against the FSM tables in [state-machine](../state-machine/design.md).
4. Rewrite `makeWorkflowApis` to emit `update-action-{action_type}` (signal-keyed `hooks` / `event_overrides`).
5. Update templates to declare the per-template button bars, wired to the per-action APIs with `signal:` payloads.
