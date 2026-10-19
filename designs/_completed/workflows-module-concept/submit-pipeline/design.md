# Workflows Submit Pipeline

Replace the routine-orchestrated submit-action flow with an engine-orchestrated one. A new plugin request `SubmitWorkflowAction` owns the full submit lifecycle (pre-hook → engine writes → side effects → post-hook); a resolver emits one `{workflow_type}-{action_type}-submit` Lowdefy API per form/check action; page templates declare per-template button bars that call those APIs with a `signal` value naming what the user fired.

> **Transition model: see [state-machine](../state-machine/design.md).** Two pieces of this sub-design were superseded by the [state-machine](../state-machine/design.md) sub-design: Decision 3's "interaction → target status" resolution table (replaced by per-kind FSM resolution against named signals) and the original "fixed five-button vocabulary" (replaced by per-template button bars over the unified signal namespace). The buttons now fire **signals**; the engine resolves each signal through the FSM. Decisions 3 and 4 below are rewritten to the signal model; the canonical signal inventory and FSM tables live in [state-machine](../state-machine/design.md). The wire field that was `interaction:` is now `signal:` — "interaction" survives only as the word for _a signal a page template surfaces as a button_ (the subset of signals that have hook-dispatch points).

This sub-design supersedes parts of:

- [engine](../engine/design.md) Decision 1 — `UpdateWorkflowActions` becomes `SubmitWorkflowAction` (broader handler).
- [module-surface](../module-surface/design.md) Decisions 4 & 5 — the single `submit-action` Api is replaced by resolver-generated per-action APIs.
- [action-authoring](../action-authoring/design.md) Decision 6's `makeWorkflowApis` resolver — generates `{workflow_type}-{action_type}-submit` per action, not `{workflow}-{action}-submit`.

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
Page button (template-declared button bar)
  → workflows/{workflow_type}-{action_type}-submit   ← resolver-generated per action
      └─ SubmitWorkflowAction (plugin connection — owns the full submit lifecycle)
            1. Validate payload + permissions; resolve signal against the FSM
            2. Pre-hook (if declared for this signal)
                 └─ user's Lowdefy Api routine; may return actions[] signals (against other actions) to merge
            3. Engine stages auto-unblocks (unblock signals) from blocked_by + pre-hook actions[]
            4. Engine writes core: FSM-resolved action transitions, summary, groups[]
            5. Engine writes form_data ($set per field), workflow doc updates
            6. Engine writes log event (default shape, overridable)
            7. Engine dispatches notifications
            8. Engine fires group on_complete pipelines (if any)  [open]
            9. Engine fires tracker subscription (if applicable, sync in-process per engine D3)
           10. Post-hook (if declared for this signal)
           11. Return result to caller
```

The page button doesn't care about the routine — it calls the resolver-generated endpoint with a payload that includes `signal: <name>`. The engine reads `signal`, resolves the transition against the action's FSM, and dispatches the matching pre/post hooks declared on the action YAML for that signal.

## Decision 1 — `SubmitWorkflowAction` replaces `UpdateWorkflowActions`

The `WorkflowAPI` plugin's request handler is renamed and broadened. Same connection, full submit lifecycle.

**What it owns**, in order, single in-process call:

1. **Validate.** Payload shape, action exists, action belongs to caller's accessible workflows, the per-verb access gate passes (`access.{current_app}.{interaction-required-verb}` intersects `_user.apps.{current_app}.roles` or is `true`), signal name is known (unknown names throw — engine Decision 4).
2. **Execute pre-hook** (if `action.hooks.{signal}.pre` is declared): engine invokes the named Lowdefy Api via the new CallApi primitive. Pre-hook receives the full submit payload + computed action context; returns optional `{ actions: [...], event_overrides: {...}, form_overrides: {...} }` — `actions[]` entries fire signals against other actions; the current action lands per the signal the user fired (no current-action redirect). Aborts via `throw` (infra failure) or Lowdefy's `:reject` control (user-facing rejection — propagates as `UserError(isReject: true)`, classified by the wrapping endpoint's `runRoutine`). Full contract in Decision 4; soft-reject rationale in [Part 29 § D5](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently).
3. **Stage auto-unblocks.** Walk the workflow's `blocked_by` graph; for each action whose dependencies are now terminal, stage an `unblock` signal.
4. **Merge pre-hook `actions[]` signals with auto-unblocks.** Pre-hook entries take precedence; auto-unblocks fill in the rest.
5. **Resolve and write action transitions.** For each staged signal, resolve `transitions[kind][currentStatus][signal]` (engine Decision 4) and apply the resulting status via the `updateAction.js` / `createAction.js` helpers; unlisted cells no-op.
6. **Recompute workflow `summary` and per-group `groups[]`** (action-groups Decision 4).
7. **Write `form_data`** per-field `$set` (engine Decision 5).
8. **Write workflow-doc updates** (summary, groups, form_data) in one Mongo update where possible.
9. **Generate log event** with the default shape (see Decision 5) merged with any author overrides.
10. **Dispatch notifications** via the notifications module's `send-notification` InternalApi (existing pattern, unchanged).
11. **Fire group `on_complete` pipelines** for any groups that transitioned to `done` in this call. Runs after notifications dispatch so phase-complete hooks observe the log event already in the database and any notifications already in-flight; runs before the post-hook so the post-hook can react to group fan-out outcomes. **Open — mechanism deferred to action-groups Decision 6; this sub-design enables it via the CallApi primitive.**
12. **Fire tracker subscription** if the workflow's status changed. Synchronous in-process per engine Decision 3 — submit-pipeline inherits that commitment and does not re-open it.
13. **Execute post-hook** (if `action.hooks.{signal}.post` is declared): engine invokes the named Api with the full result context.
14. **Return** `{ action_ids, completed_groups, event_id, tracker_fired?, pre_hook_response?, post_hook_response? }`.

**Why broaden the engine.** Pulling steps 2/9/10/11/13 inside the handler means the engine sees the whole pipeline and can apply cross-cutting concerns (error capture, retries, transactional bracketing in v2) in one place. The routine layer outside the engine becomes the thin per-action endpoint Lowdefy Api — only operator-evaluation responsibility, no orchestration.

## Decision 2 — Per-action `{workflow_type}-{action_type}-submit` resolver

A resolver (the renamed `makeWorkflowApis` from action-authoring Decision 6) emits one Lowdefy Api per form/check action:

```yaml
# Generated by makeWorkflowApis — one per (workflow, action) for kind: form|check
id: {workflow_type}-{action_type}-submit
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
      signal: { _payload: signal } # which signal the button fired (nullary — no target payload)
      current_key: { _payload: current_key } # for keyed actions
      form: { _payload: form }
      form_review: { _payload: form_review }
      fields: { _payload: fields }
      hooks: # build-time literal map keyed by signal (only button-surfaced signals carry hooks)
        submit: { pre: <api-id-or-null>, post: <api-id-or-null> }
        progress: { pre, post }
        not_required: { pre, post }
        resolve_error: { pre, post }
        approve: { pre, post }
        request_changes: { pre, post }
      event_overrides: # build-time literal map keyed by signal (from action.event)
        submit: { type, display, metadata }
        approve: { type, display, metadata }
        # ... one entry per signal the author declared event overrides for

  - :return:
      action_ids: { _step: submit.action_ids }
      completed_groups: { _step: submit.completed_groups }
      event_id: { _step: submit.event_id }
      tracker_fired: { _step: submit.tracker_fired }
      pre_hook_response: { _step: submit.pre_hook_response }
      post_hook_response: { _step: submit.post_hook_response }
```

**One endpoint per action, all signals multiplexed.** Every button on every page for this action calls the same endpoint with a different `signal` value. The plugin reads the `hooks` map at handler time and dispatches the right pre/post hooks for the supplied `signal`. (Only button-surfaced signals — the "interactions" — appear in the `hooks` map; engine-internal and cascade signals like `unblock` / `internal_*` have no hook-dispatch point.)

**`hooks` and `event_overrides` are keyed by signal at the endpoint; unkeyed at the merge.** Both fields are emitted as full per-signal maps because the resolver can't know which signal the runtime payload will carry. The handler resolves once on entry — `hooks[signal]` picks the pre/post API ids, `event_overrides[signal]` picks the build-time event override bag for this submission — and treats both as scalar bags for the rest of the lifecycle. The pre-hook return's `event_overrides` is the unkeyed runtime bag that merges on top of the build-time bag (see Decision 5 "Override paths").

**Why per-action, not generic.** Two reasons:

- **Build-time payload binding.** Action type, workflow type, and the hooks map are static per action — baking them into the generated endpoint means the page-side `CallApi` payload stays small (just `action_id`, `signal`, form values). The engine doesn't have to resolve the hooks map from the action config at runtime.
- **Resolver convention parity.** Other modules-mongodb modules (companies, contacts) ship resolver-emitted APIs per entity-typed operation. Per-action endpoints fit the same shape; the existing `makeWorkflowApis` infrastructure is reused.

The historical "generic engine endpoints" alternative (single `workflows-submit-action` API for everything) is dropped — per-action endpoints carry static action context and align with existing modules-mongodb resolver conventions (see Decision 2 rationale above).

## Decision 3 — Per-template button bars over the signal namespace

> Replaces the original "fixed five-button vocabulary" + three-layer "interaction → target status" resolution. The canonical button bars and FSM resolution are owned by the [state-machine](../state-machine/design.md) sub-design ("Templates and buttons", "Signal inventory"); this section covers how those buttons wire into the per-action endpoint.

Each page template declares which signals it surfaces as buttons. A button click calls `{workflow_type}-{action_type}-submit` with `signal: <name>`; the engine resolves the transition through the action's FSM. There is no longer a submit-pipeline-side "interaction → target status" table — the target is whatever `transitions[kind][currentStatus][signal]` yields.

**Default v1 button bars** (from [state-machine](../state-machine/design.md) "Templates and buttons"):

| Template | Signals surfaced                                         | Notes                                                                                                                                                                                                                                                                                                                |
| -------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edit`   | `submit`, `progress`, `not_required`                     | The submitter's working surface. `progress` is restored in v1.                                                                                                                                                                                                                                                       |
| `view`   | `request_changes` (opt-in; modal for comment), Edit link | Default landing for `done` actions. "Edit" is navigation, not a signal. `request_changes` is viewer-fireable by design — the engine accepts it on `view`, `edit`, OR `review` ([Part 49](../../workflows-module/parts/_completed/49-request-changes-verb-gate/design.md) resolved review-1 finding 7 the other way). |
| `review` | `approve`, `request_changes`                             | The reviewer's surface.                                                                                                                                                                                                                                                                                              |
| `error`  | `resolve_error`                                          | The error-handler's surface.                                                                                                                                                                                                                                                                                         |

Apps that customize a template pick the button bar they want; the FSM is unchanged. Adding a button (e.g. `not_required` on the view page) is a template edit, no engine work.

Each button is a template-shipped block. Clicking it:

1. Fires the matching `pages.{verb}.events.{onSubmit|onApprove|onRequestChanges}` author-supplied event handler (lifecycle / state-setup work).
2. Calls `{workflow_type}-{action_type}-submit` with `signal: <name>` + payload.

### How the target status is determined (FSM, not a table)

The engine no longer carries a three-layer resolution table. The target status is the FSM cell:

- **`submit`** lands `in-review` if the action declares the `review` verb in its `access.{app_name}` map, else `done` — baked into the FSM's `submit` resolution rule, **identical for form and check kinds** ([state-machine](../state-machine/design.md)). `submit` is nullary: the target is resolved from the action's static `review` verb, not from any runtime payload. The check kind has **no status selector and no `target_status` payload** (the v0 selector is removed — review #6); a check action advances through the same lifecycle as a form action, driven by the same buttons. The old author-side `interactions:` override is also removed — the FSM is engine-locked and not author-overridable in v1, so the review-or-done split is governed solely by whether the action declares the `review` verb. An action that wants no review step simply omits `review`.
- **`approve` / `request_changes` / `not_required` / `resolve_error` / `progress`** are nullary — the signal name fully determines the transition via the FSM.
- **`error`** is a pre-hook/cascade signal (no button) that lands an action in `error` from any non-terminal state — the author-deliberate "this downstream action failed" signal, replacing the v0 `{ status: 'error' }` return. It applies to both form and check kinds. Recovery is `resolve_error`. See engine Decision 5 and [state-machine](../state-machine/design.md).
- **No current-action redirect.** The current action lands per the signal the user fired — a pre-hook cannot re-signal it. Pre-hooks influence the current action only via `event_overrides` / `form_overrides`; all signal emission is cross-action via `actions[]` (which may target any _other_ action by `type` or `action_id`). Conditional landing for the current submit is modelled as a separate thin action with its own button, not a redirect (see [state-machine](../state-machine/design.md) worked example 4). See Decision 4.

### Button vs event-verb separation

Buttons and event verbs are **separate concerns** and coexist on the action YAML:

- **Event verbs** (`onMount`, `onSubmit`, `onApprove`, `onRequestChanges`) — author-supplied Lowdefy action arrays that fire at page lifecycle points. Used for page-side work: set state, fire requests, build payloads, validate. No engine call. These are unchanged from action-authoring Decision 8.
- **Buttons** — template-shipped blocks that fire a signal when the user clicks. Each button calls (a) the matching event verb's handler (if the author wrote one), then (b) the engine via the per-action API with `signal: <name>`.

This means a `submit` button click triggers `pages.edit.events.onSubmit` (author-supplied page logic) **and** posts to `{workflow_type}-{action_type}-submit` with `signal: submit` (engine pipeline). The author never has to wire the CallApi step — the template button handles it. Authors who need pre-write logic register a pre-hook (Decision 4); authors who just need page-state work register an `onSubmit` event.

## Decision 4 — Pre and post hooks at action root

Actions declare hooks per signal at the action root (keyed by the button-surfaced signal names — the "interactions"):

```yaml
type: qualify
kind: form
hooks:
  submit:
    pre: lead-onboarding-qualify-pre-submit # Lowdefy Api id
    post: lead-onboarding-qualify-post-submit # Lowdefy Api id
  approve:
    pre: lead-onboarding-qualify-pre-approve
  request_changes:
    post: lead-onboarding-qualify-post-request-changes
  # progress / not_required / resolve_error omitted — engine runs the default path with no hooks
```

Both `pre:` and `post:` are optional per signal. Both fields together are optional per signal. Hooks are author-supplied Lowdefy Apis (one per file under `workflow_config/{workflow}/api/`). Only button-surfaced signals can carry hooks — engine cascades (`unblock`, `internal_*`) have no hook-dispatch point.

### Hooks are internal-only — no separate auth gate

Hooks are emitted as **internal-only Apis** — no HTTP entry point, callable only via `context.callApi` from the submit endpoint's routine, fired _after_ the submit-time access check has passed. They carry **no `auth:` block of their own**, so there is no "hook auth gate" and nothing for `makeWorkflowApis` to validate against the action's access.

This replaces the earlier `hook.auth.roles ⊇ action.access.roles` rule, which existed because the old flat `action.access.roles` was a single build-time literal a hook's `auth.roles` could be statically compared against. Under per-app, per-verb gates there is no single action-wide role list to be a superset of, and — more fundamentally — Lowdefy's central auth model doesn't carry per-endpoint role lists. The access model resolves cleanly without the gate:

- **The submit endpoint is the sole gate.** Its handler runs the precise per-app + per-verb check (`access.{current_app}.{interaction-required-verb}` against `_user.apps.{current_app}.roles`); Lowdefy's central `api.roles` glob over the submit endpoint id is the coarse outer fence ([Part 34 § D10–D11](../../workflows-module/parts/_completed/34-action-access-model/design.md)).
- **Hooks inherit that gate by construction.** Being internal-only, a hook can't be reached except through the submit endpoint that already gated the caller — so "if you can submit the action, you can run its hooks" holds without a separate auth declaration.
- **Finer-grained branching** still lives inside the hook routine via `_user.roles` checks.

```yaml
# action: lead-onboarding/qualify.yaml — per-app, per-verb gates; no action-wide roles
access:
  my-team-app:
    view: true
    edit: [account-manager, ops-lead]
hooks:
  submit:
    pre: # inline routine; resolver emits it as an internal-only Api
      routine: [...]
```

### Pre-hook contract

Pre-hook is called **before** any engine writes (step 2 of Decision 1). It receives:

```
pre_hook_payload:
  workflow_id: string
  workflow_type: string
  action_id: string
  action_type: string
  current_key: string | null
  signal: string              # the signal the user fired (the button name; nullary)
  form: object
  form_review: object
  fields: object              # universal action fields
  current_status: string      # the action's current stage (read-only; not the target)
  user: { id, profile, roles }
  context:                    # engine-computed read-only context (pre-call state — before any engine writes)
    workflow: {...}           # full workflow doc as it stands before this submit's writes
    action: {...}             # full action doc as it stands before this submit's writes
```

Pre-hook may return:

```
{
  actions: array              # optional; signals fired against other actions, merged with
                              #   engine-computed auto-unblocks (entries take precedence).
                              #   The current action lands per the user-fired signal — there is
                              #   no current-action redirect field.
    - type: string            #   target by (type [+ key] in this workflow) ...
      key: string | null
      workflow_id: string     #   ... or by (workflow_id, type) ...
      action_id: string       #   ... or by primary key
      signal: string          #   the signal to fire against the target; resolved via its FSM
      fields: object          # optional; per-action universal field write
      status: string          # optional; ONLY for upsert spawns — the initial status of a
                              #   newly-created keyed instance (creation seed, not a transition).
                              #   Omit for existing-action targets; they move via `signal`.
      upsert: boolean         # when true, creates a new keyed instance in `status`
  event_overrides: object     # optional; merged over the default log-event shape (Decision 5).
                              #   Use event_overrides.metadata to attach diagnostic context to the
                              #   events-log entry.
  form_overrides: object      # optional; additional fields to $set on form_data.{action_type}[.{key}]
}
```

The `force` field is gone (engine Decision 4 removed the priority bypass). Backward moves that used to need `force` — `done → changes-required`, `done → action-required`, etc. — are now ordinary FSM transitions reached by firing the appropriate signal (`request_changes`, `activate`, …). The migration mapping from `{ status }` returns to `{ signal }` returns lives in [state-machine](../state-machine/design.md) "Pre-hook returns".

Pre-hook **can abort** the submit by throwing. Two flavours, the choice belongs to the hook author ([Part 29 § D5](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d5-soft-reject-channel----reject-from-a-pre-hook-propagates-transparently), [Part 9 § Pre-hook abort modes](../../workflows-module/parts/_completed/09-hook-invocation/design.md#pre-hook-abort-modes--throw-vs-reject)):

- **`:reject`** (Lowdefy control) — propagates as `UserError(isReject: true)`; the wrapping per-action endpoint's `runRoutine` classifies as `{ status: 'reject', error }` and the calling app's `CallApi` surfaces the message via the platform's standard reject UI. Use for user-facing validation rejections.
- **`throw`** (or any thrown error) — classified as `{ status: 'error', error }`; user sees a transient error toast and can retry. Use for infrastructure failures the user can't fix.

The engine catches neither. The `hook_error` return field is removed. A pre-hook that wants to mark _another_ action errored (without aborting the whole submit) fires the **`error` signal** through the `actions[]` channel — `actions: [{ type, signal: error }]` — replacing the v0 `actions: [{ ..., status: 'error' }]` return ([state-machine](../state-machine/design.md) inventory; engine Decision 5). (There is no way to error the _current_ action from its own pre-hook — to fail a submission, `:reject` / `throw` instead.) A pre-hook that wants to _abort_ the submit entirely uses `:reject` / `throw`. ([Part 29 § D2](../../workflows-module/parts/_completed/29-error-model-cleanup/design.md#d2-why-pre-hooks-no-longer-get-a-hook_error-field).)

### `form_overrides` semantics

The pre-hook return's `form_overrides` is merged into the user's `form` / `form_review` payload before the engine writes `form_data`:

- **Pre-hook wins on collision.** If the user submitted `form: { contact_name: "Alice" }` and pre-hook returns `form_overrides: { contact_name: "Bob" }`, the workflow doc lands `form_data.{action_type}.contact_name = "Bob"`. The pre-hook ran later and is the explicit override surface.
- **One flat namespace.** With the engine's flat `form_data` layout (engine D5 — no `.review` or `.error` sub-keys), `form_overrides` writes to `form_data.{action_type}.{field}` (or `.{key}.{field}` for keyed actions) the same way the user's `form` and `form_review` payloads do. No routing-by-signal; no reserved-key collision check.
- **No abort-time merge.** Aborts throw (`:reject` / `throw`) — they propagate before step 4 ever runs, so `form_overrides` are never written on an abort path. Hooks that want to persist partial form context before aborting use the pre-hook `actions[]` array to write to a _different_ action's form_data instead, then `throw` / `:reject` to abort the current submit.

### Post-hook contract

Post-hook is called **after** all engine writes and side effects (step 13 of Decision 1). It receives:

```
post_hook_payload:
  workflow_id, workflow_type, action_id, action_type, current_key, signal
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

Every signal that transitions the current action generates a log event by default — no author config required. The shape is generic and overridable.

**Default event shape:**

```yaml
type: action-{signal} # e.g. action-submit, action-approve, action-request_changes
display:
  { app_name }: # consuming app's app_name (= events module's display_key var)
    title:
      _nunjucks:
        template: "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}"
        on: { user, action_type, status_after }
references:
  workflow_ids: [<workflow_id>]
  action_ids: [<action_id>]
  { entity_ref_key }: [<workflow.entity_id>] # the workflow config's entity_ref_key, e.g. lead_ids
metadata:
  action_type: <action_type>
  workflow_type: <workflow_type>
  signal: <signal> # the signal the user fired
  current_key: <current_key> # null for non-keyed
  status_before: <stage>
  status_after: <stage>
```

The audit entry records the signal the user **fired** against the current action and the `status_after` it resolved to. There is no current-action redirect, so the recorded `signal` and the landed status always reconcile against the FSM table (`transitions[kind][status_before][signal] == status_after`). (state-machine review-1 finding 10 is moot — the redirect feature it concerned was removed.)

`display` is keyed by the consuming app's `app_name` (= the events module's `display_key` var, per [events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml)'s `$<display_key>.title` projection). The workflows module exposes its own `app_name` manifest var; the engine reads it from `connection.app_name`.

`{entity_ref_key}` is the workflow config's required `entity_ref_key` field (e.g. `lead_ids`) — the event-references key for the workflow's entity. It is denormalized onto the workflow doc at start (`StartWorkflow` copies `workflowConfig.entity_ref_key` onto the doc), and the engine writes `{ [entity_ref_key]: [workflow.entity_id] }` into the event references. This is the same key entity-page timeline components query by, so the engine-emitted event surfaces on the entity's timeline without per-action authoring.

**Override paths:**

1. **Action YAML.** Author declares `event:` on the action root with per-signal override:
   ```yaml
   event:
     submit:
       type: lead-qualified # overrides type
       display: { ... } # overrides default display
       metadata: { ... } # merged with default metadata
     approve:
       type: lead-approved
   ```
   The resolver bakes `action.event` into the generated endpoint as the `event_overrides` keyed map (see Decision 2). At handler entry the engine selects `event_overrides[signal]` once and treats it as the build-time-resolved override bag for this submission.
2. **Pre-hook return.** Pre-hook's `event_overrides` field is the unkeyed runtime bag — it merges over the build-time-resolved bag from step 1, which is merged over the engine defaults. Pre-hook wins on collision.

**Event-type registry.** Steph's review flagged that event types may need to be exposed as a manifest var (similar to events module's `event_display`). Open question — see Open Questions.

### Why default event always generated

Every user-fired signal is audit-worthy by definition (the engine wrote action transitions; the user did something). Making the event automatic means apps don't have to remember to emit one per action; making it overridable lets apps customize where customization matters. Same pattern as the existing `change_stamp` convention.

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

1. **Button bars per template.** The default bars are settled in [state-machine](../state-machine/design.md) "Templates and buttons" (`edit`: `submit` / `progress` / `not_required`; `view`: `request_changes` + Edit link; `review`: `approve` / `request_changes`; `error`: `resolve_error`). Remaining edge cases to confirm during review:
   - ~~`request_changes` on the `view` template — should default to reviewer-gated (state-machine review-1 finding 7).~~ **Resolved the other way ([Part 49](../../workflows-module/parts/_completed/49-request-changes-verb-gate/design.md)):** viewer-fireable by design — the engine accepts `request_changes` on `view`, `edit`, OR `review`. `review` gates judgement power (`approve`), not flagging problems.
   - Should there be a `cancel` button for workflow-level cancellation from an action context? (Out of scope for v1 signal inventory.)
   - How the shared check pages surface `error` _recovery_ — a `check-error` page vs. a `resolve_error` button on `workflow-action-view` (ui follow-on; the check `error` row is reachable via cascade but no check page ships an error surface yet).
2. **Group `on_complete` mechanism.** Action-groups Decision 6 defers the fan-out mechanism. With CallApi primitive in place, the engine fans out one call per declared `on_complete` endpoint id. Confirm during review.
3. **Event-types config var.** Should the module expose `event_types` as a var (similar to events module's `event_display`) so apps can register additional canonical types and merge them into the action's default event? Steph's review flagged for investigation.
4. **Pre-hook `actions[]` merge precedence on collisions.** When a pre-hook fires `actions: [{ type: X, signal: ... }]` against an action the auto-unblock computation also targets with `unblock`, pre-hook wins (its signal is the one resolved). Is that the right default? Surface during review.
5. **Hook payload size.** Pre-hook receives the full workflow + action docs. Realistic sizes? Could exceed payload limits for workflows with hundreds of actions. Mitigate with a `context.shallow` flag if needed.

## Interaction with the other sub-designs

This sub-design layers against the existing tree; affected surfaces:

- **[engine](../engine/design.md)** — `UpdateWorkflowActions` → `SubmitWorkflowAction`. Same connection; broader handler. Tracker subscription and references contract unchanged. Engine Decision 4 is the signal-driven FSM (no priority rule, no `force: true`) per [state-machine](../state-machine/design.md); pre-hook `actions[]` entries carry `signal`, not `status` + `force`. Engine D5 restructured: `form_data` is one flat tree per action (no `.review` / `.error` sub-keys); error context lives on the action doc's status entry, not `form_data`. Decision 1's pseudo-code grows steps for built-in side effects + hook dispatch.
- **[module-surface](../module-surface/design.md)** — Drops `submit-action` Api. Replaced by resolver-generated `{workflow_type}-{action_type}-submit` per action. The module-level APIs become four: `start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview` (the per-action APIs replace `submit-action`).
- **[action-authoring](../action-authoring/design.md)** —
  - `submit_hook:` field on action YAML is **removed** (replaced by `hooks:` map per Decision 4, keyed by signal).
  - The previously-proposed `interactions:` block (per-interaction `status:` overrides) is **dropped** — the FSM determines the target; the review-or-done split is governed by the `review` access verb ([state-machine](../state-machine/design.md), Decision 3).
  - New `event:` block on the action YAML for per-signal log-event overrides (Decision 5).
  - `makeWorkflowApis` resolver now emits the `{workflow_type}-{action_type}-submit` endpoint (Decision 2; Part 34 D10) and the internal-only hook Apis. There is no hook auth gate to validate (Part 34 D11 — hooks are internal-only, the submit endpoint is the sole gate). Per state-machine "Next step" it still adds a build-time validator flagging `status:` keys in pre-hook returns with a "use `signal:` instead" error.
  - Decision 8 (page events) and the 4-event-verb vocabulary **stay** — buttons and event verbs are separate concerns per Decision 3.
- **[ui](../ui/design.md)** — Templates declare per-template button bars over the signal namespace (state-machine "Templates and buttons"). Buttons fire signals against the per-action API; event verbs handle page lifecycle. Page templates simplify (no per-page submit-payload construction; the button block handles it).
- **[state-machine](../state-machine/design.md)** — Owns the transition model this sub-design's Decisions 3 + 4 now defer to: the signal inventory, the per-kind FSM tables, and the pre-hook signal-return shape.
- **[action-groups](../action-groups/design.md)** — Group `on_complete` becomes implementable once CallApi lands. Engine fans out per Decision 6 of action-groups.
- **[call-api](../call-api/design.md)** — New sibling sub-design covering the `context.callApi` primitive this sub-design depends on. Gates submit-pipeline implementation.

## Next Step

1. Land [call-api](../call-api/design.md) first — submit-pipeline can't be implemented without it.
2. Confirm the per-template button bars and the `error`-signal gap (Decision 3 open items) during the next review.
3. Implement `SubmitWorkflowAction` per Decision 1, resolving signals against the FSM tables in [state-machine](../state-machine/design.md); restructure plugin per engine Decision 1 connection structure.
4. Rewrite `makeWorkflowApis` per Decision 2 (signal-keyed `hooks` / `event_overrides`; add the `status:` → `signal:` pre-hook-return validator).
5. Update templates to declare the per-template button bars, wired to the per-action APIs with `signal:` payloads.
