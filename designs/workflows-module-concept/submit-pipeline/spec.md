# Workflows Submit Pipeline — Spec

Engine-orchestrated submit lifecycle. Full rationale in [design.md](designs/workflows-module-concept/submit-pipeline/design.md); this file carries only the committed decisions.

**Status:** Supersedes [module-surface](../module-surface/design.md) Decisions 4 & 5 (`submit-action` Api), [engine](../engine/design.md) Decision 1's `UpdateWorkflowActions` (renamed to `SubmitWorkflowAction`), and [action-authoring](../action-authoring/design.md) Decision 6's `makeWorkflowApis` (now emits `update-action-{action_type}`).

**Depends on:** [../call-api/design.md](../call-api/design.md) — gates implementation.

## Flow

```
Page button (template-shipped)
  → workflows/update-action-{action_type}        (resolver-generated Lowdefy Api per action)
      └─ SubmitWorkflowAction (plugin handler — single in-process invocation)
            1. Validate payload + permissions
            2. Pre-hook for interaction (if declared) — returns optional actions[] + event_overrides + form_overrides; aborts via `throw` / `:reject`
            3. Compute auto-unblocks from blocked_by graph; merge with pre-hook actions[]
            4. Write action transitions (priority rule applies)
            5. Recompute workflow summary + groups[]
            6. Write form_data ($set per field) + workflow doc updates
            7. Generate log event (defaults overridable from action YAML + pre-hook)
            8. Dispatch notifications (via notifications module InternalApi)
            9. Fire group on_complete pipelines for completed groups  [open]
           10. Fire tracker subscription if workflow status changed (sync in-process per engine D3)
           11. Post-hook for interaction (if declared)
           12. Return { action_ids, completed_groups, event_id, tracker_fired?, pre_hook_response?, post_hook_response? }
```

## `SubmitWorkflowAction` plugin request

Replaces `UpdateWorkflowActions` (engine Decision 1). Same `WorkflowAPI` connection, broader handler. Single invocation owns: validate → pre-hook → write → side effects → post-hook → return.

Connection structure: see [engine spec](../engine/spec.md) for the canonical `src/connections/WorkflowAPI/` layout. Submit-pipeline adds the files under `SubmitWorkflowAction/` (handler, pre/post hook invokers, auto-unblock computation, log-event dispatch, notification dispatch, group `on_complete` fan-out).

## Per-action `update-action-{action_type}` Api (resolver-emitted)

`makeWorkflowApis` (action-authoring Decision 6) emits one Lowdefy Api per form / task action. Shape:

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
      interaction: { _payload: interaction }     # which button fired
      current_key: { _payload: current_key }     # for keyed actions; omit for non-keyed
      form: { _payload: form }
      form_review: { _payload: form_review }
      fields: { _payload: fields }
      comment: { _payload: comment }             # user-supplied comment; handler maps to event.metadata.comment
      hooks:                                     # build-time literal map from action.hooks
        submit_edit: { pre: <api-id-or-null>, post: <api-id-or-null> }
        not_required: { pre, post }
        resolve_error: { pre, post }
        approve: { pre, post }
        request_changes: { pre, post }
      event_overrides:                           # build-time from action.event[interaction]
        submit_edit: { type, display, metadata }
        ...
  - :return:
      action_ids: { _step: submit.action_ids }
      completed_groups: { _step: submit.completed_groups }
      event_id: { _step: submit.event_id }
      tracker_fired: { _step: submit.tracker_fired }
      pre_hook_response: { _step: submit.pre_hook_response }
      post_hook_response: { _step: submit.post_hook_response }
```

**Scope:** Emitted for `kind: form` and `kind: task` actions. Tracker actions get no endpoint (engine writes their status via the tracker subscription).

**Per-app emission:** Endpoints are emitted regardless of `access.{app_name}` verb list — the engine enforces access at submit time via the role gate. (Per-page emission still verb-filtered per ui spec.)

**`hooks` and `event_overrides` keying:** Both are emitted as per-interaction maps because the resolver can't know which interaction the runtime payload carries. The handler resolves `hooks[interaction]` and `event_overrides[interaction]` once on entry and treats them as scalar bags for the rest of the lifecycle. The pre-hook return's `event_overrides` is the unkeyed runtime bag that merges on top.

## Button vocabulary (template-shipped, open: validate)

Templates ship a fixed set of submit-flavoured buttons. Each button is a template-shipped block that, on click:

1. Fires the matching `pages.{verb}.events.{handler}` author-supplied event (if declared).
2. Calls `update-action-{action_type}` with `interaction: <button-name>` + payload.

| Button            | Renders on      | `interaction` value |
| ----------------- | --------------- | ------------------- |
| `submit_edit`     | `edit`          | `submit_edit`       |
| `not_required`    | `edit` (opt-in) | `not_required`      |
| `resolve_error`   | `error`         | `resolve_error`     |
| `approve`         | `review`        | `approve`           |
| `request_changes` | `review`        | `request_changes`   |

**Status: open** — Steph's review asks to validate the button list. Locked during sub-design review.

### Interaction → target status

Resolved last-wins across three layers (full rationale in design Decision 3):

1. **Engine default per interaction** (table below).
2. **Action YAML `interactions:` block** — optional, build-time-baked into the generated endpoint.
3. **Pre-hook return `status` field** — runtime, overrides both above.

#### Engine default per interaction

| Interaction       | Form action default                                                    | Task action default                     |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `submit_edit`     | `in-review` if any `access.{app}` includes `review`, else `done`       | caller-supplied via status selector     |
| `not_required`    | `not-required`                                                         | `not-required`                          |
| `resolve_error`   | same as `submit_edit` (`in-review` if review verb exists, else `done`) | same as `submit_edit` (caller-supplied) |
| `approve`         | `done`                                                                 | `done`                                  |
| `request_changes` | `changes-required`                                                     | `changes-required`                      |

#### Action YAML `interactions:` block

```yaml
type: qualify
kind: form
interactions:
  submit_edit: { status: done }
  approve: { status: done }
```

Priority rule (engine D4) still applies to the resolved status — unreachable transitions are rejected unless an entry on the pre-hook `actions[]` opts into `force: true`.

### Button vs event-verb separation

Buttons and the page-event vocabulary (`onMount`, `onSubmit`, `onApprove`, `onRequestChanges` — action-authoring Decision 8) coexist and cover different concerns:

- **Event verbs** are author-supplied page lifecycle hooks. Set state, fire requests, build payloads, validate. No engine call. Unchanged.
- **Buttons** are the engine-call surface. Template-shipped; wire to the per-action API.

A `submit_edit` button click fires `pages.edit.events.onSubmit` (page logic) and posts to the engine (with `interaction: submit_edit`). Authors who need pre-write logic register a pre-hook (next section); authors who just need page-state work register an `onSubmit` event handler.

## Action hooks contract

Authors declare hooks at the action root, per interaction:

```yaml
type: qualify
kind: form
hooks:
  submit_edit:
    pre: lead-onboarding-qualify-pre-submit
    post: lead-onboarding-qualify-post-submit
  approve:
    pre: lead-onboarding-qualify-pre-approve
  request_changes:
    post: lead-onboarding-qualify-post-request-changes
```

Each interaction may declare `pre:`, `post:`, both, or neither. Values are Lowdefy Api endpoint ids; engine invokes them via the [call-api](../call-api/design.md) primitive.

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
  interaction: string
  form: object
  form_review: object
  fields: object
  current_status: string
  user: { id, profile, roles }
  context:                                  # pre-call state — before any engine writes
    workflow: <full workflow doc as it stands before this submit's writes>
    action:   <full action doc as it stands before this submit's writes>
```

### Pre-hook return (all fields optional)

```
{
  status: string            # overrides current action's target status (precedence:
                            #   pre-hook > action.interactions[interaction].status > engine default)
  actions: array            # merged with auto-unblocks; entries take precedence
    - { type, key, status, fields, upsert, force }
                            #   force: optional bool; bypasses priority rule for this entry only.
                            #   Use for replay / rollback (e.g. done → action-required).
                            #   To push to error, set status: 'error' — no force needed
                            #   (error.priority = 1 is below every non-terminal stage).
  event_overrides: object   # merged over action.event[interaction] over engine defaults
                            #   Use event_overrides.metadata to attach diagnostic context to
                            #   the events-log entry (the channel for failure context on an
                            #   author-driven error push).
  form_overrides: object    # extra fields to $set on form_data.{action_type}[.{key}]
}
```

**Aborts.** A pre-hook aborts the lifecycle by throwing. Two flavours, the choice belongs to the hook author (see [Part 29 § D5](../../workflows-module/parts/29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently) and [Part 9 § Pre-hook abort modes](../../workflows-module/parts/09-hook-invocation/design.md)):

- **`:reject`** (Lowdefy control) — for user-facing validation failures. Propagates as a `UserError(isReject: true)` throw; the wrapping per-action endpoint's `runRoutine` classifies as `{ status: 'reject', error }` and the calling app's `CallApi` surfaces the message via the platform's standard reject UI.
- **`throw`** (or any thrown error) — for infrastructure failures. The wrapping endpoint classifies as `{ status: 'error', error }`; user sees a transient error toast and can retry.

In both cases the engine catches nothing — the throw propagates through `invokePreHook.js`, `handleSubmit.js`, and the plugin handler unchanged. There is **no `hook_error` return field** and no `{ rejected, reject_message }` return surface.

**`form_overrides` merge rules:** pre-hook wins over user-submitted `form` / `form_review` on field collision; writes to the same flat `form_data.{action_type}.{field}` tree (engine D5 — no `.review` / `.error` sub-keys).

### Post-hook payload

```
post_hook_payload:
  workflow_id, workflow_type, action_id, action_type, current_key, interaction
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

Every interaction generates a log event by default. Engine writes one event via [events module's `new-event` Api](../../../../modules/events/api/new-event.yaml).

**Default shape:**

```yaml
type: action-{interaction} # e.g. action-submit_edit, action-approve
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
metadata: action_type, workflow_type, interaction, current_key
  status_before, status_after
```

`display` is keyed by the consuming app's `app_name` (= events module's `display_key` var, per [modules/events/components/events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml)'s `$<display_key>.title` projection). The workflows module declares its own `app_name` manifest var; engines read it from `connection.app_name`.

`{entity-ref-key}` is derived from `workflow.entity_collection`: strip a trailing `-collection` if present, replace remaining `-` with `_`, append `_ids`. So `leads-collection → leads_ids`, `tickets-collection → tickets_ids`. This is the same convention entity pages' timeline components query by (see [apps/demo/.claude/guides/events.md](../../../../apps/demo/.claude/guides/events.md)), so the engine-emitted event appears on the entity's timeline without per-action authoring.

**Override paths** (merged in order, last wins):

1. Engine defaults (above).
2. Action YAML `event.{interaction}.{type|display|metadata}` — resolver bakes the whole `event:` block into the endpoint payload's keyed `event_overrides` map; handler resolves `event_overrides[interaction]` once on entry.
3. Pre-hook return `event_overrides` — unkeyed runtime bag, merges on top of (2).

Action YAML shape:

```yaml
event:
  submit_edit:
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
| Group `on_complete`  | When groups transition to `done` this call (open) | Engine `context.callApi(<on_complete-api-id>)` per completed group                                                                                                                                                                  |
| Tracker subscription | When workflow status changed                      | Synchronous in-process per engine D3. Engine writes parent tracker action via internal `updateAction` recursion; `SubmitWorkflowAction` invocations don't recurse on themselves.                                                    |

`entity_update` (the status-quo `submit-action` payload's optional Mongo write to the entity doc) is **dropped**. Apps that need to update the entity do so from a pre/post hook.

## Page → API call

The button block (template-shipped) calls the per-action API with a fixed payload shape:

```yaml
- id: button_submit_edit # template-shipped block id
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
            interaction: submit_edit
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
- Action YAML field: `submit_hook:` → `hooks:` (per-interaction map).

## Open questions

1. **Validate the five-button vocabulary.** `submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes` — is this the full set? Edge cases:
   - `not_required` visibility default (always on view? opt-in per action?)
   - `resolve_error` vs `submit_edit` on the error page
   - `cancel` button for workflow-level cancellation
2. **Group `on_complete` mechanism.** Engine fans out one `context.callApi` per completed group's declared `on_complete` endpoint. Confirm during review.
3. **Event-types config var.** Should the module expose `event_types` as a manifest var (like events module's `event_display`) so apps can register canonical types per app? Steph flagged.
4. **Pre-hook actions[] merge precedence on collisions.** Pre-hook entries take precedence over auto-unblocks on `(type, key)` collisions. Confirm during review.
5. **Hook payload size.** Pre-hook receives full workflow + action docs. Add a `context.shallow` flag if real-world sizes exceed payload limits.

## Implementation order

1. Land [call-api](../call-api/design.md) — gates this sub-design.
2. Lock the button vocabulary (Open Question 1) during review.
3. Implement `SubmitWorkflowAction` plugin handler.
4. Rewrite `makeWorkflowApis` to emit `update-action-{action_type}`.
5. Update form-action templates with the five-button vocabulary, wired to per-action APIs.
