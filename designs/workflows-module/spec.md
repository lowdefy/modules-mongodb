# Workflows Module — Spec

Implementation-ready summary of the workflows module. Full rationale in [design.md](design.md) and the seven sub-design `design.md` files; this file carries only the committed decisions.

## Module shape

`modules/workflows/` — a modules-mongodb module supporting multiple parallel workflows per entity, with a two-collection schema (`workflows` + `actions`) and a per-action page generation pipeline. Composed in app `modules.yaml` like other modules in this repo.

Seven sub-designs split by concern:

- **[engine](engine/spec.md)** — server-side `WorkflowAPI` plugin connection on `@lowdefy/modules-mongodb-plugins`; the request handler renamed to `SubmitWorkflowAction` per submit-pipeline; references write contract; tracker subscription; status enum priority rule; persisted `groups[]` writeback + `blocked_by` re-evaluation.
- **[module-surface](module-surface/spec.md)** — `module.lowdefy.yaml` manifest and the module APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`). The submit endpoint is per-action and resolver-emitted per submit-pipeline.
- **[action-authoring](action-authoring/spec.md)** — YAML grammar for workflows and actions; the three action kinds; universal fields; tracker block; resolver pipeline; form components library; workflow-level `action_groups:` declaration.
- **[ui](ui/spec.md)** — per-action page generation; form-action templates; static task pages; entity-page UI components.
- **[action-groups](action-groups/spec.md)** — workflow-level `action_groups:` as a first-class engine concept; persisted three-value group status; `blocked_by` accepts group IDs; engine-driven unblock evaluation; optional per-group `on_complete` hook.
- **[submit-pipeline](submit-pipeline/spec.md)** — engine-orchestrated submit lifecycle; `SubmitWorkflowAction` plugin handler; per-action `update-action-{action_type}` resolver-emitted APIs; fixed button vocabulary; pre/post hooks per interaction; default log event shape. Supersedes the routine-orchestrated `submit-action` shape originally in module-surface.
- **[call-api](call-api/spec.md)** — upstream Lowdefy primitive (`context.callApi`) that submit-pipeline depends on. First-time work in `@lowdefy/api`; gates submit-pipeline implementation.

## Core invariants

- **Two collections**: `workflows` (one doc per workflow instance) and `actions` (one doc per action instance). Both carry scalar `entity_type` + `entity_id` + `entity_collection`.
- **Action kinds** are declared explicitly via a required `kind:` field with three values: `form`, `task`, `tracker`. Mutually exclusive.
- **Status enum is module-shipped and fixed** (eight action statuses, three workflow-lifecycle stages). Display attributes (`title`, `color`, `borderColor`, `titleColor`, `icon`) are app-overridable; the status keys themselves are not.
- **Workflows can be linked as parent/child via tracker actions.** A child workflow's `parent_action_id` / `parent_entity_id` / `parent_entity_collection` point back at the parent's tracker action; the parent tracker action's `child_workflow_id` / `child_entity_id` / `child_entity_collection` point at the child workflow and its entity. The link is written by `start-workflow` in a single call when `parent_action_id` is in the payload. One child has at most one parent.
- **Tracker subscription is child → parent and synchronous in-process.** When a workflow's status changes, the engine reads its `parent_action_id` and writes the parent tracker action's status from the hard-coded child-stage map (`active → in-progress`, `completed → done`, `cancelled → not-required`).
- **Status transitions follow a priority rule.** A new status's priority must be strictly less than the current. Exceptions: `currentActionId` self-exception (same-stage allowed for the submitted action); `force: true` override (engine D4 — per-call on the `SubmitWorkflowAction` payload, or per-entry on individual `actions[]` entries, used by submit-pipeline pre-hook returns for replay/rollback).
- **`SubmitWorkflowAction` is the user-submit path.** Resolver-generated per-action endpoints (`update-action-{action_type}`) wrap a single call to the `SubmitWorkflowAction` plugin handler, which owns the full lifecycle (validate → pre-hook → writes → side effects → post-hook). The caller supplies an `interaction` value (one of the five-button vocabulary) and the engine maps it to a target status per the layered resolution rule (engine default → action YAML `interactions:` → pre-hook `status` return). `force: true` is not exposed to user submissions; migrations/admin tools call `SubmitWorkflowAction` directly via a privileged route with per-call or per-entry `force`.
- **References spread to doc root via merge order.** Reserved keys win silently on collision. No validation throws in v1.
- **Access has two parts that compose AND.** `access.{app_name}: [verb, ...]` controls per-app UI affordances (vocabulary: `view`, `edit`, `review`; apps without a key for a given app deployment hide the action there). `access.roles: [...]` is a role gate that applies across apps (intersection with `_user: roles`; empty means no gate). Enforcement runs at build-time (`makeActionPages` filters page emission), query-time (`get-entity-workflows` filters response), and submit-time (the `SubmitWorkflowAction` handler re-checks the role gate). See action-authoring spec "Access."
- **`makeWorkflowApis` emits one endpoint per form / task action.** Endpoints are `update-action-{action_type}` and bake in the action's `hooks:`, `event:`, and `interactions:` maps as build-time literals. Tracker actions have no endpoint (engine writes their status via the subscription). The resolver also validates `hook.auth.roles ⊇ action.access.roles` at build time and rejects `hook.auth.public: true`.
- **Form components library at `components/fields/` is internal.** Apps reference components by name in `form:` blocks; the resolver substitutes at build time.
- **Action groups are first-class engine concept.** Workflows declare a top-level `action_groups:` array (ordered, with `id`, `title`, optional `on_complete`); every `action.action_group` must reference a declared group (build-time validation). Group status is a derived three-value enum (`blocked` / `in-progress` / `done`) persisted on the workflow doc's `groups[]` array, recomputed eagerly inside `SubmitWorkflowAction`. `blocked_by:` accepts both action types and group IDs in one mixed list. The engine re-evaluates every blocked action's `blocked_by` against the new state on each transition and pushes affected actions to `action-required`. `SubmitWorkflowAction` returns `completed_groups: [...]` listing groups that transitioned to `done` in the call and fans out one `context.callApi` per declared `on_complete` (mechanism in submit-pipeline Decision 6, dependent on call-api).

## Worked example — onboarding workflow

A `lead` entity carries a generic onboarding workflow with four actions, one per kind:

- `qualify` — form action; captures contact name + notes.
- `send-quote` — form action; gated on `qualify`.
- `schedule-followup` — task action; gated on `send-quote`. No form, just status + assignees + due-date + comment.
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
        qualify-pre-submit.yaml         # pre-hook for qualify.hooks.submit_edit.pre
        send-quote-pre-submit.yaml      # pre-hook for send-quote.hooks.submit_edit.pre
        send-quote-post-approve.yaml    # post-hook for send-quote.hooks.approve.post
  modules.yaml
  lowdefy.yaml
```

### Runtime flow

1. Lead created → app calls `start-workflow` with `{ workflow_type: onboarding, entity_type: lead, entity_id: <lead_id>, entity_collection: leads-collection }`. Engine writes one workflow doc + four action docs.
2. Lead page calls `get-entity-workflows` with `(entity_type: lead, entity_id: <lead_id>)`. Returns workflow docs + grouped actions.
3. User clicks `qualify` → form-action edit page `workflows/onboarding-qualify-edit`. The template-shipped `submit_edit` button calls `workflows/update-action-qualify` with `interaction: submit_edit` + form payload. The endpoint's routine fires `SubmitWorkflowAction`, which runs the lifecycle: invokes the action's `submit_edit.pre` hook (`qualify-pre-submit`); merges pre-hook `actions[]` with engine-computed auto-unblocks; writes the transition (`qualify` → `done`, `send-quote` → `action-required`); generates a log event (engine default merged with the pre-hook's `event_overrides`); dispatches notifications; returns.
4. Later, user clicks `schedule-followup` (task action) → shared `workflows/task-edit?action_id=<id>` page. User picks `done`, sets due date, adds comment, clicks Submit. The page calls `workflows/update-action-schedule-followup` with `interaction: submit_edit` + `current_status: done` + `fields` block + `event.metadata.comment`. Task `submit_edit` is the one interaction where the caller supplies `current_status` directly (because the page surfaces a status selector). Engine writes the transition; `blocked_by` re-evaluation flips `track-installation` to `action-required`.
5. Later, an installation ticket is created. The flow that creates it (often itself a pre-hook on a separate "create installation" form action) calls `start-workflow` with `parent_action_id: <track-installation._id>`. Engine writes the new device-installation workflow (with parent back-references), its starting action docs, and the parent tracker action's `child_workflow_id` / `child_entity_id` / `child_entity_collection` + `in-progress` transition — all in one server-side call.
6. When the device-installation workflow completes, the engine's tracker subscription reads its `parent_action_id`, fetches the tracker action by primary key, and writes its status to `done`. The submit response that triggered the child's completion carries `tracker_fired: { parent_action_id, parent_workflow_id, new_status: done }` so any post-hook or page-side caller observing the fan-up sees the signal.

## Non-goals

- A user-facing template builder. Workflow YAML is authored by developers.
- A Lowdefy routine helper library. The module ships APIs, not helpers.
- Per-action page styling parity with existing app-specific templates. Apps override per action when they need bespoke pages.
- Migration tooling for existing app-specific workflow schemas.

## Deferred to separate designs

- **MongoDB transactions** — routine-level `StartTransaction` / `EndTransaction` with session passthrough into plugin requests. Lowdefy-core enabler needed. Not v1; engine's "Client and transaction model" already accommodates a future `session.withTransaction(...)` opt-in inside the handler.
- **`on_complete` invocation mechanism for action groups** — the action-groups sub-design commits _what_ happens on group completion (engine returns `completed_groups`; submit-pipeline fans out one `context.callApi` per entry once the call-api primitive lands) but defers some refinements to a follow-up `api-hooks` sub-design.

## Cross-cutting risks

- **Plugin dual-runtime build.** First-time server-side code in `@lowdefy/modules-mongodb-plugins` (currently client-only). Treated as a v1 milestone with hard `src/blocks/` vs `src/connections/` split and dist/-output verification.
- **No transactional atomicity in v1.** Mid-sequence handler failure leaves earlier writes durable; later steps unrun. Caller retry is safe (idempotency guards converge), periodic reconciliation is the catch-all.
- **`makeActionsForm` recursion from inside Nunjucks templates** is unverified in this repo. Implementation must spike `_ref: { resolver }` from inside a module template before relying on recursive form composition.
- **Workflow-doc write contention** under high parallelism. Mitigation: opt-in `summary_dirty: true` lazy-writeback mode per workflow YAML.
- **`keys: []` silent no-op footgun.** Documented; gating via `skip` / `_if` on `keys.length` is the author-side mitigation.
