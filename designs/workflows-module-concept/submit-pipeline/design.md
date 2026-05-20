# Workflows Submit Pipeline

Replace the routine-orchestrated submit-action flow with an engine-orchestrated one. A new plugin request `SubmitWorkflowAction` owns the full submit lifecycle (pre-hook → engine writes → side effects → post-hook); a resolver emits one `update-action-{action_type}` Lowdefy API per form/task action; templates ship a fixed five-button vocabulary that calls those APIs with an `interaction` value distinguishing what the user clicked.

This sub-design supersedes parts of:

- [engine](../engine/design.md) Decision 1 — `UpdateWorkflowActions` becomes `SubmitWorkflowAction` (broader handler).
- [module-surface](../module-surface/design.md) Decisions 4 & 5 — the single `submit-action` Api is replaced by resolver-generated per-action APIs.
- [action-authoring](../action-authoring/design.md) Decision 6's `makeWorkflowApis` resolver — generates `update-action-{action_type}` per action, not `{workflow}-{action}-submit`.

Depends on a new Lowdefy primitive: invoking a Lowdefy API from inside a plugin connection. That work is split out into a sibling sub-design at [../call-api/design.md](../call-api/design.md).

## Problem

The status-quo submit flow has three orchestration layers:

```
Page → app's generated submit endpoint (workflows/<wf>-<action>-submit)
       (this endpoint's routine = app's submit_hook YAML)
       └─ CallApi → submit-action (module's Api, runs its own routine)
                    ├─ UpdateWorkflowActions (plugin connection — engine work)
                    ├─ MongoDBUpdateOne (entity update, optional)
                    ├─ CallApi → events.new-event (optional)
                    └─ CallApi → notifications.send-notification (optional)
```

Frictions:

1. **The submit-hook YAML is mostly a payload builder.** No domain logic; structured payload assembly.
2. **Three files to read to trace one submit:** page, app's submit hook, module's submit-action routine.
3. **Action-groups `on_complete` has no clean home.** Engine can compute "which groups completed" but can't fan out per-group `CallApi`s without a new Lowdefy primitive.
4. **Engine doesn't see the form data.** Validations depending on form values get re-implemented per submit hook or pushed to the page.
5. **Author has only one extension point.** A single submit hook that runs after engine writes. No way to inject auto-unblock logic before the engine writes, and no way to react cleanly after notifications fire.

Shared root: the user-authored hook is the orchestrator today. The engine is one step inside it. Every cross-cutting concern threads through the routine layer.

## Proposed shape

Invert control flow. **The engine becomes the orchestrator**; user hooks become pre/post extension points.

```
Page button (template-shipped vocabulary)
  → workflows/update-action-{action_type}   ← resolver-generated per action
      └─ SubmitWorkflowAction (plugin connection — owns the full submit lifecycle)
            1. Validate payload + permissions
            2. Pre-hook (if declared for this interaction)
                 └─ user's Lowdefy Api routine; may return extra actions[] to merge
            3. Engine computes auto-unblocks from blocked_by + pre-hook actions[]
            4. Engine writes core: action transitions, summary, groups[]
            5. Engine writes form_data ($set per field), workflow doc updates
            6. Engine writes log event (default shape, overridable)
            7. Engine dispatches notifications
            8. Engine fires group on_complete pipelines (if any)  [open]
            9. Engine fires tracker subscription (if applicable, sync in-process per engine D3)
           10. Post-hook (if declared for this interaction)
           11. Return result to caller
```

The page button doesn't care about the routine — it calls the resolver-generated endpoint with a payload that includes `interaction: <button-name>`. The engine reads `interaction` and dispatches the matching pre/post hooks declared on the action YAML.

## Decision 1 — `SubmitWorkflowAction` replaces `UpdateWorkflowActions`

The `WorkflowAPI` plugin's request handler is renamed and broadened. Same connection, full submit lifecycle.

**What it owns**, in order, single in-process call:

1. **Validate.** Payload shape, action exists, action belongs to caller's accessible workflows, role gate passes for the interaction.
2. **Execute pre-hook** (if `action.hooks.{interaction}.pre` is declared): engine invokes the named Lowdefy Api via the new CallApi primitive. Pre-hook receives the full submit payload + computed action context; returns optional `{ actions: [...], event_overrides: {...}, form_overrides: {...}, hook_error: <string> }` (full contract in Decision 4).
3. **Compute auto-unblocks.** Walk the workflow's `blocked_by` graph; identify actions whose dependencies are now terminal as a result of the current submission.
4. **Merge pre-hook `actions[]` with auto-unblocks.** Pre-hook entries take precedence; auto-unblocks fill in the rest.
5. **Write action transitions.** Apply the merged actions array via the existing `updateAction.js` / `createAction.js` helpers. Priority rule still applies (engine Decision 4).
6. **Recompute workflow `summary` and per-group `groups[]`** (action-groups Decision 4).
7. **Write `form_data`** per-field `$set` (engine Decision 5).
8. **Write workflow-doc updates** (summary, groups, form_data) in one Mongo update where possible.
9. **Generate log event** with the default shape (see Decision 5) merged with any author overrides.
10. **Dispatch notifications** via the notifications module's `send-notification` InternalApi (existing pattern, unchanged).
11. **Fire group `on_complete` pipelines** for any groups that transitioned to `done` in this call. Runs after notifications dispatch so phase-complete hooks observe the log event already in the database and any notifications already in-flight; runs before the post-hook so the post-hook can react to group fan-out outcomes. **Open — mechanism deferred to action-groups Decision 6; this sub-design enables it via the CallApi primitive.**
12. **Fire tracker subscription** if the workflow's status changed. Synchronous in-process per engine Decision 3 — submit-pipeline inherits that commitment and does not re-open it.
13. **Execute post-hook** (if `action.hooks.{interaction}.post` is declared): engine invokes the named Api with the full result context.
14. **Return** `{ action_ids, completed_groups, event_id, tracker_fired?, pre_hook_response?, post_hook_response? }`.

**Why broaden the engine.** Pulling steps 2/9/10/11/13 inside the handler means the engine sees the whole pipeline and can apply cross-cutting concerns (error capture, retries, transactional bracketing in v2) in one place. The routine layer outside the engine becomes the thin per-action endpoint Lowdefy Api — only operator-evaluation responsibility, no orchestration.

## Decision 2 — Per-action `update-action-{action_type}` resolver

A resolver (the renamed `makeWorkflowApis` from action-authoring Decision 6) emits one Lowdefy Api per form/task action:

```yaml
# Generated by makeWorkflowApis — one per (workflow, action) for kind: form|task
id: update-action-{action_type}
type: Api
routine:
  - id: submit
    type: SubmitWorkflowAction
    connectionId:
      _module.connectionId: workflow-api
    properties:
      action_id: { _payload: action_id }
      action_type: <action_type> # build-time literal
      workflow_type: <workflow_type> # build-time literal
      interaction: { _payload: interaction } # which button fired
      current_key: { _payload: current_key } # for keyed actions
      form: { _payload: form }
      form_review: { _payload: form_review }
      fields: { _payload: fields }
      hooks: # build-time literal map keyed by interaction
        submit_edit: { pre: <api-id-or-null>, post: <api-id-or-null> }
        not_required: { pre, post }
        resolve_error: { pre, post }
        approve: { pre, post }
        request_changes: { pre, post }
      event_overrides: # build-time literal map keyed by interaction (from action.event)
        submit_edit: { type, display, metadata }
        approve: { type, display, metadata }
        # ... one entry per interaction the author declared event overrides for

  - :return:
      action_ids: { _step: submit.action_ids }
      completed_groups: { _step: submit.completed_groups }
      event_id: { _step: submit.event_id }
      tracker_fired: { _step: submit.tracker_fired }
      pre_hook_response: { _step: submit.pre_hook_response }
      post_hook_response: { _step: submit.post_hook_response }
```

**One endpoint per action, all interactions multiplexed.** Every button on every page for this action calls the same endpoint with a different `interaction` value. The plugin reads the `hooks` map at handler time and dispatches the right pre/post hooks for the supplied `interaction`.

**`hooks` and `event_overrides` are keyed by interaction at the endpoint; unkeyed at the merge.** Both fields are emitted as full per-interaction maps because the resolver can't know which interaction the runtime payload will carry. The handler resolves once on entry — `hooks[interaction]` picks the pre/post API ids, `event_overrides[interaction]` picks the build-time event override bag for this submission — and treats both as scalar bags for the rest of the lifecycle. The pre-hook return's `event_overrides` is the unkeyed runtime bag that merges on top of the build-time bag (see Decision 5 "Override paths").

**Why per-action, not generic.** Two reasons:

- **Build-time payload binding.** Action type, workflow type, and the hooks map are static per action — baking them into the generated endpoint means the page-side `CallApi` payload stays small (just `action_id`, `interaction`, form values). The engine doesn't have to resolve the hooks map from the action config at runtime.
- **Resolver convention parity.** Other modules-mongodb modules (companies, contacts) ship resolver-emitted APIs per entity-typed operation. Per-action endpoints fit the same shape; the existing `makeWorkflowApis` infrastructure is reused.

The historical "generic engine endpoints" alternative (single `workflows-submit-action` API for everything) is dropped — per-action endpoints carry static action context and align with existing modules-mongodb resolver conventions (see Decision 2 rationale above).

## Decision 3 — Button vocabulary on templates (open: validate)

The module's page templates ship a fixed set of submit-flavoured buttons that the engine dispatches on:

| Button            | Where rendered                                                         | Maps to interaction |
| ----------------- | ---------------------------------------------------------------------- | ------------------- |
| `submit_edit`     | `edit` template (form + task edit)                                     | `submit_edit`       |
| `not_required`    | `view` template; optionally `edit` (allow author to mark not-required) | `not_required`      |
| `resolve_error`   | `error` template (recovery submit — user is resolving the error)       | `resolve_error`     |
| `approve`         | `review` template                                                      | `approve`           |
| `request_changes` | `review` template                                                      | `request_changes`   |

Each button is a template-shipped block. Clicking it:

1. Fires the matching `pages.{verb}.events.{onSubmit|onApprove|onRequestChanges}` author-supplied event handler (lifecycle / state-setup work).
2. Calls `update-action-{action_type}` with `interaction: <button-name>` + payload.

### Interaction → target status

The engine resolves each interaction to a target action status using three layered sources, last wins:

1. **Engine default per interaction.**

   | Interaction       | Default target status (form action)                                                                              | Default target status (task action)                         |
   | ----------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
   | `submit_edit`     | `in-review` if the action has `review` in any `access.{app_name}` verb list, else `done`                         | caller-supplied (status selector on `task-edit`)            |
   | `not_required`    | `not-required`                                                                                                   | `not-required`                                              |
   | `resolve_error`   | same as `submit_edit` — `in-review` if the action has `review` in any `access.{app_name}` verb list, else `done` | same as `submit_edit` — caller-supplied via status selector |
   | `approve`         | `done`                                                                                                           | `done`                                                      |
   | `request_changes` | `changes-required`                                                                                               | `changes-required`                                          |

   Task `submit_edit` is special: the shared `task-edit` page surfaces a status selector (see ui Decision 7), so the payload carries `current_status` directly. Form `submit_edit` doesn't — the engine derives it from whether reviewers exist.

2. **Action-YAML override** via an optional `interactions:` block, mirroring the `hooks:` / `event:` shape:

   ```yaml
   type: qualify
   kind: form
   interactions:
     submit_edit:
       status: done # skip review even though `review` verb is enabled
     approve:
       status: done # explicit; same as default
   ```

   Resolved at build time; baked into the generated endpoint payload alongside `hooks:` and `event_overrides`.

3. **Pre-hook override** via the return value's `status` field:

   ```
   {
     status: string      # optional; overrides engine default + action-YAML interactions[interaction].status
     actions: [...]      # other auxiliary writes
     ...
   }
   ```

   Lets a pre-hook conditionally route the current action (e.g. "if the form passes silently, skip review and go to `done`; if it has flagged fields, force `in-review`"). Subject to the same priority rule as everything else — engine D4 governs whether the chosen status is reachable from the current stage.

The five-button list is **flagged as open** — Steph's review explicitly asked to validate. Candidates that have come up:

- Is `not_required` always available on every action's `view` page, or only when the action's authoring opts in?
- Should `submit_edit` exist on `error` templates too (e.g. a "Submit" button distinct from "Resolve"), or is `resolve_error` always the single error-template button?
- Are there other interactions that should be first-class (e.g. `cancel` for cancelling a workflow from an action context)?

Resolve during review.

### Button vs event-verb separation

Buttons and event verbs are **separate concerns** and coexist on the action YAML:

- **Event verbs** (`onMount`, `onSubmit`, `onApprove`, `onRequestChanges`) — author-supplied Lowdefy action arrays that fire at page lifecycle points. Used for page-side work: set state, fire requests, build payloads, validate. No engine call. These are unchanged from action-authoring Decision 8.
- **Buttons** — template-shipped blocks that fire when the user clicks. Each button calls (a) the matching event verb's handler (if the author wrote one), then (b) the engine via the per-action API with `interaction: <button-name>`.

This means a `submit_edit` button click triggers `pages.edit.events.onSubmit` (author-supplied page logic) **and** posts to `update-action-{action_type}` with `interaction: submit_edit` (engine pipeline). The author never has to wire the CallApi step — the template button handles it. Authors who need pre-write logic register a pre-hook (Decision 4); authors who just need page-state work register an `onSubmit` event.

## Decision 4 — Pre and post hooks at action root

Actions declare hooks per interaction at the action root:

```yaml
type: qualify
kind: form
hooks:
  submit_edit:
    pre: lead-onboarding-qualify-pre-submit # Lowdefy Api id
    post: lead-onboarding-qualify-post-submit # Lowdefy Api id
  approve:
    pre: lead-onboarding-qualify-pre-approve
  request_changes:
    post: lead-onboarding-qualify-post-request-changes
  # not_required / resolve_error omitted — engine runs the default path with no hooks
```

Both `pre:` and `post:` are optional per interaction. Both fields together are optional per interaction. Hooks are author-supplied Lowdefy Apis (one per file under `workflow_config/{workflow}/api/`).

### Hook auth gate

Hook APIs are real Lowdefy Apis and go through their own `auth:` block on every invocation, including when the engine fires them via `context.callApi`. To keep the user-facing access model coherent — "if you can submit the action, you can run its hooks" — hook APIs **must declare `auth.roles` as a superset of (or equal to) the action's `access.roles`**.

```yaml
# action: lead-onboarding/qualify.yaml
access:
  roles: [account-manager, ops-lead]
hooks:
  submit_edit:
    pre: lead-onboarding-qualify-pre-submit
```

```yaml
# hook API: lead-onboarding-qualify-pre-submit.yaml
id: lead-onboarding-qualify-pre-submit
type: Api
auth:
  public: false
  roles: [account-manager, ops-lead] # must include every role in action.access.roles
```

The relationship is statically inspectable — both `action.access.roles` and `hook.auth.roles` are build-time literals. `makeWorkflowApis` validates the relationship per (action, hook) pair and fails the build with a clear error when the hook is more restrictive than the action (would cause hard-failing submits for callers who pass the action gate but not the hook gate). Hooks that need to be authenticated-only or app-internal can either:

- Set `auth.roles` equal to the action's `access.roles` (default recommendation).
- Set `auth.roles` to a wider superset if the hook also serves other internal callers.
- Add per-routine role checks inside the hook for finer-grained branching (e.g. "admins get the full path; everyone else takes a reduced branch") — orthogonal to the `auth:` block.

`auth.public: true` on a hook API is rejected at build — public hooks would let anyone with the endpoint id bypass the engine's role gate by hitting the hook directly.

### Pre-hook contract

Pre-hook is called **before** any engine writes (step 2 of Decision 1). It receives:

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
  fields: object              # universal action fields
  current_status: string      # the action's current stage
  user: { id, profile, roles }
  context:                    # engine-computed read-only context (pre-call state — before any engine writes)
    workflow: {...}           # full workflow doc as it stands before this submit's writes
    action: {...}             # full action doc as it stands before this submit's writes
```

Pre-hook may return:

```
{
  status: string              # optional; overrides the engine default + action-YAML
                              #   interactions[interaction].status for the current action.
                              #   See Decision 3 "Interaction → target status."
  actions: array              # optional; merged with engine-computed auto-unblocks (entries take precedence)
    - type: string
      key: string | null
      status: string
      fields: object          # optional; per-action universal field write
      upsert: boolean
      force: boolean          # optional; default false. When true, bypasses the priority rule
                              #   for this entry (engine D4 — escape hatch for replay/rollback
                              #   scenarios where a pre-hook needs to push an action backward
                              #   in priority, e.g. done → action-required).
  event_overrides: object     # optional; merged over the default log-event shape (Decision 5)
  form_overrides: object      # optional; additional fields to $set on form_data.{action_type}[.{key}]
  hook_error: string          # optional; if present, engine aborts the submit and writes status: error
                              #   with this string as the error context. Use for pre-condition failures.
}
```

Pre-hook **can abort** the submit by returning `hook_error`. Engine handles abort as a normal `error` transition (engine Decision 5 "Action error transition" rules apply — the action's `status[0]` entry carries `{ stage: error, reason: 'pre-hook', error_message: hook_error }`, no further writes).

### `form_overrides` semantics

The pre-hook return's `form_overrides` is merged into the user's `form` / `form_review` payload before the engine writes `form_data`:

- **Pre-hook wins on collision.** If the user submitted `form: { contact_name: "Alice" }` and pre-hook returns `form_overrides: { contact_name: "Bob" }`, the workflow doc lands `form_data.{action_type}.contact_name = "Bob"`. The pre-hook ran later and is the explicit override surface.
- **One flat namespace.** With the engine's flat `form_data` layout (engine D5 — no `.review` or `.error` sub-keys), `form_overrides` writes to `form_data.{action_type}.{field}` (or `.{key}.{field}` for keyed actions) the same way the user's `form` and `form_review` payloads do. No routing-by-interaction; no reserved-key collision check.
- **Skipped on abort.** When `hook_error` is set alongside `form_overrides`, the engine takes the abort path and ignores `form_overrides` — only the action's `status[0]` entry is written. Hooks that want to persist partial form context before aborting use the pre-hook `actions[]` array to write to a different action's form_data instead.

### Post-hook contract

Post-hook is called **after** all engine writes and side effects (step 13 of Decision 1). It receives:

```
post_hook_payload:
  workflow_id, workflow_type, action_id, action_type, current_key, interaction
  form, form_review, fields                # as submitted
  result:                                   # what the engine just wrote
    action_ids: array<string>               #   ids written this call
    completed_groups: array<string>         #   groups that transitioned to done
    event_id: string                        #   the log event id the engine emitted
    tracker_fired:                          #   present when tracker subscription propagated
                                            #     this submit to a parent workflow; null otherwise
      parent_action_id: string              #   the parent tracker action that was updated
      parent_workflow_id: string            #   the parent workflow doc the tracker action lives on
      new_status: string                    #   the action status the parent tracker landed on
  user: {...}
  context: {...}                            # the submit workflow's workflow + action docs, post-write.
                                            #   Does NOT include the parent workflow on tracker fire —
                                            #   hooks that need it fetch by parent_workflow_id.
```

Post-hook may return arbitrary data, surfaced to the page as `post_hook_response` on the API return. Post-hook **cannot** abort or rewrite engine writes — those have already landed. Use cases: external integrations (fire a Slack message, kick a CI job, sync a third-party CRM), follow-up writes the engine doesn't own.

### Why pre/post (not just one hook)

Two distinct extension points cover the realistic split:

- **Pre-hook = "modify what the engine writes."** Pre-validate, inject conditional unblocks, override the log event, abort with a user-visible error. Runs synchronously; abort is meaningful.
- **Post-hook = "react to what the engine wrote."** Fire integrations, follow-up writes. Runs after all engine writes; can't roll back; failure logged but doesn't abort the user's submission.

A single hook can't cover both responsibilities cleanly: it either runs before writes (can't react to results) or after (can't inject unblocks). Two hooks make the contract explicit and testable.

## Decision 5 — Default log event shape

Every interaction generates a log event by default — no author config required. The shape is generic and overridable.

**Default event shape:**

```yaml
type: action-{interaction} # e.g. action-submit_edit, action-approve, action-request_changes
display:
  {app_name}: # consuming app's app_name (= events module's display_key var)
    title:
      _nunjucks:
        template: "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}"
        on: { user, action_type, status_after }
references:
  workflow_ids: [<workflow_id>]
  action_ids: [<action_id>]
  {entity-ref-key}: [<workflow.entity_id>] # entity_collection-derived key, e.g. leads_ids
metadata:
  action_type: <action_type>
  workflow_type: <workflow_type>
  interaction: <interaction>
  current_key: <current_key> # null for non-keyed
  status_before: <stage>
  status_after: <stage>
```

`display` is keyed by the consuming app's `app_name` (= the events module's `display_key` var, per [events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml)'s `$<display_key>.title` projection). The workflows module exposes its own `app_name` manifest var; the engine reads it from `connection.app_name`.

`{entity-ref-key}` is derived from `workflow.entity_collection`: strip a trailing `-collection` if present, replace remaining `-` with `_`, append `_ids` (so `leads-collection → leads_ids`, `tickets-collection → tickets_ids`). This is the same convention entity-page timeline components query by, so the engine-emitted event surfaces on the entity's timeline without per-action authoring.

**Override paths:**

1. **Action YAML.** Author declares `event:` on the action root with per-interaction override:
   ```yaml
   event:
     submit_edit:
       type: lead-qualified # overrides type
       display: { ... } # overrides default display
       metadata: { ... } # merged with default metadata
     approve:
       type: lead-approved
   ```
   The resolver bakes `action.event` into the generated endpoint as the `event_overrides` keyed map (see Decision 2). At handler entry the engine selects `event_overrides[interaction]` once and treats it as the build-time-resolved override bag for this submission.
2. **Pre-hook return.** Pre-hook's `event_overrides` field is the unkeyed runtime bag — it merges over the build-time-resolved bag from step 1, which is merged over the engine defaults. Pre-hook wins on collision.

**Event-type registry.** Steph's review flagged that event types may need to be exposed as a manifest var (similar to events module's `event_display`). Open question — see Open Questions.

### Why default event always generated

Every interaction is audit-worthy by definition (the engine wrote action transitions; the user did something). Making the event automatic means apps don't have to remember to emit one per action; making it overridable lets apps customize where customization matters. Same pattern as the existing `change_stamp` convention.

## Decision 6 — Side effects in scope

The engine owns these side effects natively (no longer routed through author-supplied routines):

| Effect               | When                                                                         | How                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log event            | Always, after action writes                                                  | Engine writes directly to `events` collection; calls events module's `new-event` Api via the CallApi primitive                                                                   |
| Notifications        | Always, after the log event (the app's `send_routine` decides who to notify) | Engine calls notifications module's `send-notification` InternalApi via the CallApi primitive                                                                                    |
| Group `on_complete`  | When groups transition to `done` (action-groups Decision 6)                  | **Open** — engine fans out one CallApi per declared `on_complete` Api id once the CallApi primitive lands                                                                        |
| Tracker subscription | When workflow status changes (engine Decision 3)                             | Synchronous in-process per engine D3. Engine writes parent tracker action via internal `updateAction` recursion; `SubmitWorkflowAction` invocations don't recurse on themselves. |

**Event-id flow into notifications.** The engine threads the log-event id returned by step 8's `new-event` invocation into step 9's notifications dispatch payload as `event_ids: [<event_id>]`. Multi-event submissions aren't possible in v1 — one submit = one log event = one notifications dispatch.

**When notifications dispatch — always.** The engine calls `send-notification` on every successful submit; there is no per-submit opt-in flag. The dispatch decision lives in the notifications module's `send_routine` var (which the consuming app supplies) — that routine reads the event doc by id, resolves recipients (typically from `event.references` or the action's role declarations), and dispatches via whatever channels the app wires. Apps that don't want notifications on a given workflow either don't compose the notifications module or ship a `send_routine` that no-ops for that workflow's event types. This is a deliberate departure from v0's per-payload `event.notifications: true` opt-in — pushing the decision into the app's `send_routine` keeps the engine's pipeline unconditional and matches the "engine becomes the orchestrator" framing (no per-call branching on side effects).

`entity_update` (the status-quo `submit-action` payload's optional Mongo write to the entity doc) is **dropped** from the engine. Apps that need to update the entity do so from their pre/post hook — the hook is a regular Lowdefy Api with full Mongo access.

**Why drop entity_update.** Less surface on the engine, more flexibility for apps. The entity-write was always tied to app-specific logic (which fields to write, conditional behavior, multi-collection writes); pushing it to hooks keeps the engine focused on workflow state.

## Decision 7 — Depends on CallApi-from-plugin primitive

The engine invoking pre/post hooks, the events module's `new-event` API, the notifications module's `send-notification` Api, and group `on_complete` pipelines all require a `context.callApi(endpointId, payload)` capability on plugin connections. This is a new Lowdefy primitive — no plugin currently calls a Lowdefy Api from inside a handler.

**Split out as a sibling sub-design** at [../call-api/design.md](../call-api/design.md). Covers: API surface on `@lowdefy/api`, auth-context inheritance, error propagation, depth-limit guard, payload-evaluation semantics.

Submit-pipeline is gated on call-api landing first.

## Open Questions

1. **Validate the button vocabulary.** Five buttons proposed (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`). Is this the full set? Edge cases to resolve during review:
   - `not_required` visibility default (always on view? opt-in per action?)
   - `resolve_error` vs `submit_edit` on the error page — are both ever needed?
   - Should there be a `cancel` button for workflow-level cancellation from an action context?
2. **Group `on_complete` mechanism.** Action-groups Decision 6 defers the fan-out mechanism. With CallApi primitive in place, the engine fans out one call per declared `on_complete` endpoint id. Confirm during review.
3. **Event-types config var.** Should the module expose `event_types` as a var (similar to events module's `event_display`) so apps can register additional canonical types and merge them into the action's default event? Steph's review flagged for investigation.
4. **Pre-hook `actions[]` merge precedence on collisions.** When pre-hook returns `actions: [{ type: X, status: done }]` and the auto-unblock computation also produces `{ type: X, status: action-required }`, pre-hook wins. Is that the right default? Surface during review.
5. **Hook payload size.** Pre-hook receives the full workflow + action docs. Realistic sizes? Could exceed payload limits for workflows with hundreds of actions. Mitigate with a `context.shallow` flag if needed.

## Interaction with the other sub-designs

This sub-design layers against the existing tree; affected surfaces:

- **[engine](../engine/design.md)** — `UpdateWorkflowActions` → `SubmitWorkflowAction`. Same connection; broader handler. Tracker subscription, references contract, status priority rule unchanged. Engine D4 gains per-entry `force: true` on `actions[]` entries (used by submit-pipeline pre-hook return). Engine D5 restructured: `form_data` is one flat tree per action (no `.review` / `.error` sub-keys); error context lives on the action doc's status entry, not `form_data`. Decision 1's pseudo-code grows steps for built-in side effects + hook dispatch.
- **[module-surface](../module-surface/design.md)** — Drops `submit-action` Api. Replaced by resolver-generated `update-action-{action_type}` per action. The module-level APIs become four: `start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview` (the per-action APIs replace `submit-action`).
- **[action-authoring](../action-authoring/design.md)** —
  - `submit_hook:` field on action YAML is **removed** (replaced by `hooks:` map per Decision 4).
  - New `interactions:` block on the action YAML for per-interaction `status:` overrides (Decision 3).
  - New `event:` block on the action YAML for per-interaction log-event overrides (Decision 5).
  - `makeWorkflowApis` resolver now emits `update-action-{action_type}` shape (Decision 2) and validates the hook auth rule (`hook.auth.roles ⊇ action.access.roles`; `auth.public: true` rejected) at build time.
  - Decision 8 (page events) and the 4-event-verb vocabulary **stay** — buttons and event verbs are separate concerns per Decision 3.
- **[ui](../ui/design.md)** — Templates ship the five button vocabulary as template-shipped blocks. Buttons call the per-action API; event verbs handle page lifecycle. Page templates simplify (no per-page submit-payload construction; the button block handles it).
- **[action-groups](../action-groups/design.md)** — Group `on_complete` becomes implementable once CallApi lands. Engine fans out per Decision 6 of action-groups.
- **[call-api](../call-api/design.md)** — New sibling sub-design covering the `context.callApi` primitive this sub-design depends on. Gates submit-pipeline implementation.

## Next Step

1. Land [call-api](../call-api/design.md) first — submit-pipeline can't be implemented without it.
2. Lock the button vocabulary (Decision 3 open question) during the next review.
3. Implement `SubmitWorkflowAction` per Decision 1; restructure plugin per engine Decision 1 connection structure.
4. Rewrite `makeWorkflowApis` per Decision 2.
5. Update templates to ship the five-button vocabulary, wired to the per-action APIs.
