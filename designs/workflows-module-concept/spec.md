# Workflows Module — Spec

Implementation-ready summary of the workflows module. Full rationale in [design.md](designs/workflows-module-concept/design.md) and the seven sub-design `design.md` files; this file carries only the committed decisions.

## Module shape

`modules/workflows/` — a modules-mongodb module supporting multiple parallel workflows per entity, with a two-collection schema (`workflows` + `actions`) and a per-action page generation pipeline. Composed in app `modules.yaml` like other modules in this repo.

Seven sub-designs split by concern:

- **[engine](engine/spec.md)** — server-side `WorkflowAPI` plugin connection on `@lowdefy/modules-mongodb-plugins`; the request handler renamed to `SubmitWorkflowAction` per submit-pipeline; references write contract; tracker subscription; signal-driven FSM transitions (per [state-machine](state-machine/design.md)); persisted `groups[]` writeback + `blocked_by` re-evaluation.
- **[module-surface](module-surface/spec.md)** — `module.lowdefy.yaml` manifest and the module APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`). The submit endpoint is per-action and resolver-emitted per submit-pipeline.
- **[action-authoring](action-authoring/spec.md)** — YAML grammar for workflows and actions; the three action kinds; universal fields; tracker block; resolver pipeline; form components library; workflow-level `action_groups:` declaration.
- **[ui](ui/spec.md)** — per-action page generation; form-action templates; static simple-action pages; entity-page UI components.
- **[action-groups](action-groups/spec.md)** — workflow-level `action_groups:` as a first-class engine concept; persisted three-value group status; `blocked_by` accepts group IDs; engine-driven unblock evaluation; optional per-group `on_complete` hook.
- **[submit-pipeline](submit-pipeline/spec.md)** — engine-orchestrated submit lifecycle; `SubmitWorkflowAction` plugin handler; per-action `workflow-{workflow_type}-{action_type}-submit` resolver-emitted APIs; per-template button bars over the signal namespace; pre/post hooks per signal; default log event shape. Supersedes the routine-orchestrated `submit-action` shape originally in module-surface.
- **[call-api](call-api/spec.md)** — upstream Lowdefy primitive (`context.callApi`) that submit-pipeline depends on. First-time work in `@lowdefy/api`; gates submit-pipeline implementation.

## Core invariants

- **Two collections**: `workflows` (one doc per workflow instance) and `actions` (one doc per action instance). Both carry scalar `entity_id` + `entity_collection`.
- **Action kinds** are declared explicitly via a required `kind:` field with three values: `form`, `simple`, `tracker`. Mutually exclusive.
- **Status enum is module-shipped and fixed** (eight action statuses, three workflow-lifecycle stages). Display attributes (`title`, `color`, `borderColor`, `titleColor`, `icon`) are app-overridable; the status keys themselves are not.
- **Workflows can be linked as parent/child via tracker actions.** A child workflow's `parent_action_id` / `parent_entity_id` / `parent_entity_collection` point back at the parent's tracker action; the parent tracker action's `child_workflow_id` / `child_entity_id` / `child_entity_collection` point at the child workflow and its entity. The link is written by `start-workflow` in a single call when `parent_action_id` is in the payload. One child has at most one parent.
- **Tracker subscription is child → parent and synchronous in-process.** When a workflow's status changes, the engine reads its `parent_action_id` and emits the matching `internal_mirror_child_*` signal against the parent tracker action; the tracker FSM resolves it (`active → in-progress`, `completed → done`, `cancelled → not-required`, conditional on the tracker's current state).
- **Status transitions are signal-driven via a per-kind FSM.** Every status mutation is a named **signal** resolved against `transitions[kind][currentStatus][signal]` ([state-machine](state-machine/design.md)). A listed cell gives the new status; an unlisted cell is a silent no-op (this re-fire safety replaces the old priority rule's strict-less-than ordering). There is no priority rule and no `force: true`. Unknown signal names throw; known signals against states that don't list them no-op.
- **`SubmitWorkflowAction` is the user-submit path.** Resolver-generated per-action endpoints (`workflow-{workflow_type}-{action_type}-submit`) wrap a single call to the `SubmitWorkflowAction` plugin handler, which owns the full lifecycle (validate → pre-hook → writes → side effects → post-hook). The caller supplies a `signal` value (a button-surfaced signal) and the engine resolves the target via the action's FSM — there is no author-side status override (the v0 `interactions:` block is dropped) and no current-action redirect. Migrations/admin overrides that need to bypass the FSM stay out-of-band (direct DB writes).
- **References spread to doc root via merge order.** Reserved keys win silently on collision. No validation throws in v1.
- **Access is one canonical shape: per-app, per-verb role gates.** `access.{app_name}` is a map of verb (`view` / `edit` / `review` / `error`) → role-gate (`true` or a non-empty role-string array checked against `_user.apps.{app_name}.roles`). No action-wide `access.roles`, no shorthand verb-list form; `notification_roles` lives at the action root. Verbs are independent (granting one never grants another). Enforcement runs at build-time (`makeActionPages` emits a page per present verb key), query-time (`get-entity-workflows` projects `visible_verbs: { view, edit, review, error }` and drops all-`false` actions), and submit-time (the `SubmitWorkflowAction` handler checks `access.{current_app}.{interaction-required-verb}`). See action-authoring spec "Access" and [Part 34](../workflows-module/parts/_completed/34-action-access-model/design.md).
- **`makeWorkflowApis` emits one endpoint per form / simple action.** Endpoints are `workflow-{workflow_type}-{action_type}-submit` (Part 34 D10) and bake in the action's `hooks:` and `event:` maps (both keyed by signal) as build-time literals. (The v0 `interactions:` block is dropped — the FSM determines the target.) Tracker actions have no endpoint (engine writes their status via the subscription). Hooks are emitted as internal-only Apis with no auth gate of their own — the submit endpoint's per-verb check is the sole gate (Part 34 D11). The resolver flags `status:` keys in pre-hook returns with a "use `signal:` instead" error.
- **Form components library at `components/fields/` is internal.** Apps reference components by name in `form:` blocks; the resolver substitutes at build time.
- **Action groups are first-class engine concept.** Workflows declare a top-level `action_groups:` array (ordered, with `id`, `title`, optional `on_complete`); every `action.action_group` must reference a declared group (build-time validation). Group status is a derived three-value enum (`blocked` / `in-progress` / `done`) persisted on the workflow doc's `groups[]` array, recomputed eagerly inside `SubmitWorkflowAction`. `blocked_by:` accepts both action types and group IDs in one mixed list. The engine re-evaluates every blocked action's `blocked_by` against the new state on each transition and pushes affected actions to `action-required`. `SubmitWorkflowAction` returns `completed_groups: [...]` listing groups that transitioned to `done` in the call and fans out one `context.callApi` per declared `on_complete` (mechanism in submit-pipeline Decision 6, dependent on call-api).

## Worked example — onboarding workflow

A `lead` entity carries a generic onboarding workflow with four actions, one per kind:

- `qualify` — form action; captures contact name + notes.
- `send-quote` — form action; gated on `qualify`.
- `schedule-followup` — simple action; gated on `send-quote`. No form, just status + assignees + due-date + comment.
- `track-installation` — tracker action; mirrors a `device-installation` workflow on a separate ticket entity.

### App-side files

```
my-app/
  workflow_config/
    workflows.yaml
    onboarding/
      onboarding.yaml
      qualify.yaml
      send-quote.yaml
      schedule-followup.yaml
      track-installation.yaml
      api/
        qualify-pre-submit.yaml         # pre-hook for qualify.hooks.submit.pre
        send-quote-pre-submit.yaml      # pre-hook for send-quote.hooks.submit.pre
        send-quote-post-approve.yaml    # post-hook for send-quote.hooks.approve.post
  modules.yaml
  lowdefy.yaml
```

### Runtime flow

1. Lead created → app calls `start-workflow` with `{ workflow_type: onboarding, entity_id: <lead_id>, entity_collection: leads-collection }`. Engine writes one workflow doc + four action docs.
2. Lead page calls `get-entity-workflows` with `(entity_collection: leads-collection, entity_id: <lead_id>)`. Returns workflow docs + grouped actions.
3. User clicks `qualify` → form-action edit page `workflows/workflow-onboarding-qualify-edit`. The template-shipped `submit` button calls `workflows/workflow-onboarding-qualify-submit` with `signal: submit` + form payload. The endpoint's routine fires `SubmitWorkflowAction`, which runs the lifecycle: invokes the action's `submit.pre` hook (`qualify-pre-submit`); merges pre-hook `actions[]` signals with engine-computed auto-unblocks; resolves the `submit` signal via the form FSM (`qualify` → `done`, no review verb) and writes it, plus the `unblock` that flips `send-quote` → `action-required`; generates a log event (engine default merged with the pre-hook's `event_overrides`); dispatches notifications; returns.
4. Later, user clicks `schedule-followup` (simple action) → shared `workflows/simple-edit?action_id=<id>` page. User sets due date, adds comment, clicks Submit. The page calls `workflows/workflow-onboarding-schedule-followup-submit` with `signal: submit` + `fields` block + a top-level `comment` field (the resolver-emitted API maps it to `event.metadata.comment`). `submit` is nullary — there is no status selector; the simple FSM resolves the target from the action's `review` verb exactly as for form actions ([state-machine](state-machine/design.md) "Simple kind"). Engine writes the transition; `blocked_by` re-evaluation flips `track-installation` to `action-required`.
5. Later, an installation ticket is created. The flow that creates it (often itself a pre-hook on a separate "create installation" form action) calls `start-workflow` with `parent_action_id: <track-installation._id>`. Engine writes the new device-installation workflow (with parent back-references), its starting action docs, and the parent tracker action's `child_workflow_id` / `child_entity_id` / `child_entity_collection` + `in-progress` transition — all in one server-side call.
6. When the device-installation workflow completes, the engine's tracker subscription reads its `parent_action_id`, fetches the tracker action by primary key, and writes its status to `done`. The submit response that triggered the child's completion carries `tracker_fired: { parent_action_id, parent_workflow_id, new_status: done }` so any post-hook or page-side caller observing the fan-up sees the signal.

## Non-goals

- A user-facing template builder. Workflow YAML is authored by developers.
- A Lowdefy routine helper library. The module ships APIs, not helpers.
- Per-action page styling parity with existing app-specific templates. Apps override per action when they need bespoke pages.
- Migration tooling for existing app-specific workflow schemas.

## Deferred to separate designs

- **MongoDB transactions** — routine-level `StartTransaction` / `EndTransaction` with session passthrough into plugin requests. Lowdefy-core enabler needed. Not v1; the engine's "Client and transaction model" delegates every read/write to `@lowdefy/community-plugin-mongodb` handlers that don't expose sessions, so a future ACID path would require a parallel raw-driver helper alongside the dispatcher.
- **`on_complete` invocation mechanism for action groups** — the action-groups sub-design commits _what_ happens on group completion (engine returns `completed_groups`; submit-pipeline fans out one `context.callApi` per entry once the call-api primitive lands) but defers some refinements to a follow-up `api-hooks` sub-design.

## Cross-cutting risks

- **Plugin dual-runtime build.** First-time server-side code in `@lowdefy/modules-mongodb-plugins` (currently client-only). Treated as a v1 milestone with hard `src/blocks/` vs `src/connections/` split and dist/-output verification.
- **No transactional atomicity in v1.** Mid-sequence handler failure leaves earlier writes durable; later steps unrun. Caller retry is safe (idempotency guards converge), periodic reconciliation is the catch-all.
- **`makeActionsForm` recursion from inside Nunjucks templates** is unverified in this repo. Implementation must spike `_ref: { resolver }` from inside a module template before relying on recursive form composition.
- **Workflow-doc write contention** under high parallelism. Mitigation: opt-in `summary_dirty: true` lazy-writeback mode per workflow YAML.
- **`keys: []` silent no-op footgun.** Documented; gating via `skip` / `_if` on `keys.length` is the author-side mitigation.
