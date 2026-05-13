# Workflows Module — Spec

Implementation-ready summary of the workflows module. Full rationale in [design.md](design.md) and the four sub-design `design.md` files; this file carries only the committed decisions.

## Module shape

`modules/workflows/` — a modules-mongodb module supporting multiple parallel workflows per entity, with a two-collection schema (`workflows` + `actions`) and a per-action page generation pipeline. Composed in app `modules.yaml` like other modules in this repo.

Five sub-designs split by concern:

- **[engine](engine/spec.md)** — server-side `WorkflowAPI` plugin connection on `@lowdefy/modules-mongodb-plugins`; three request types (`StartWorkflow`, `UpdateWorkflowActions`, `CancelWorkflow`); references write contract; tracker subscription; status enum priority rule; persisted `groups[]` writeback + `blocked_by` re-evaluation.
- **[module-surface](module-surface/spec.md)** — `module.lowdefy.yaml` manifest and the four module APIs (`start-workflow`, `cancel-workflow`, `get-entity-workflows`, `submit-action`).
- **[action-authoring](action-authoring/spec.md)** — YAML grammar for workflows and actions; the three action kinds; universal fields; tracker block; resolver pipeline; form components library; workflow-level `action_groups:` declaration.
- **[ui](ui/spec.md)** — per-action page generation; form-action templates; static task pages; entity-page UI components.
- **[action-groups](action-groups/spec.md)** — workflow-level `action_groups:` as a first-class engine concept; persisted three-value group status; `blocked_by` accepts group IDs; engine-driven unblock evaluation; optional per-group `on_complete` hook.

## Core invariants

- **Two collections**: `workflows` (one doc per workflow instance) and `actions` (one doc per action instance). Both carry scalar `entity_type` + `entity_id` + `entity_collection`.
- **Action kinds** are declared explicitly via a required `kind:` field with three values: `form`, `task`, `tracker`. Mutually exclusive.
- **Status enum is module-shipped and fixed** (eight action statuses, three workflow-lifecycle stages). Display attributes (`title`, `color`, `borderColor`, `titleColor`, `icon`) are app-overridable; the status keys themselves are not.
- **Workflows can be linked as parent/child via tracker actions.** A child workflow's `parent_action_id` / `parent_entity_id` / `parent_entity_collection` point back at the parent's tracker action; the parent tracker action's `child_workflow_id` / `child_entity_id` / `child_entity_collection` point at the child workflow and its entity. The link is written by `start-workflow` in a single call when `parent_action_id` is in the payload. One child has at most one parent.
- **Tracker subscription is child → parent and synchronous in-process.** When a workflow's status changes, the engine reads its `parent_action_id` and writes the parent tracker action's status from the hard-coded child-stage map (`active → in-progress`, `completed → done`, `cancelled → not-required`).
- **Status transitions follow a priority rule.** A new status's priority must be strictly less than the current. Exceptions: `currentActionId` self-exception (same-stage allowed for the submitted action), `force: true` per-call override.
- **`submit-action` is the user-submit path.** Caller-supplied `current_status` covers submit, approve, and request-changes. `force: true` is not exposed on `submit-action`; migrations/admin tools call `UpdateWorkflowActions` directly via a privileged route.
- **References spread to doc root via merge order.** Reserved keys win silently on collision. No validation throws in v1.
- **Access has two parts that compose AND.** `access.{app_name}: [verb, ...]` controls per-app UI affordances (vocabulary: `view`, `edit`, `review`; apps without a key for a given app deployment hide the action there). `access.roles: [...]` is a role gate that applies across apps (intersection with `_user: roles`; empty means no gate). Enforcement runs at build-time (`makeActionPages` filters page emission), query-time (`get-entity-workflows` filters response), and submit-time (`submit-action` re-checks role gate). See action-authoring spec "Access."
- **`makeWorkflowApis` emits one endpoint per form action only.** Task actions use the shared `task-edit` page; tracker actions have no endpoint (engine writes their status via the subscription).
- **Form components library at `components/fields/` is internal.** Apps reference components by name in `form:` blocks; the resolver substitutes at build time.
- **Action groups are first-class engine concept.** Workflows declare a top-level `action_groups:` array (ordered, with `id`, `title`, optional `on_complete`); every `action.action_group` must reference a declared group (build-time validation). Group status is a derived three-value enum (`blocked` / `in-progress` / `done`) persisted on the workflow doc's `groups[]` array, recomputed eagerly inside `UpdateWorkflowActions`. `blocked_by:` accepts both action types and group IDs in one mixed list. The engine re-evaluates every blocked action's `blocked_by` against the new state on each transition and pushes affected actions to `action-required`. `UpdateWorkflowActions` returns `completed_groups: [...]` listing groups that transitioned to `done` in the call; an outer Layer-1 orchestration mechanism (deferred — see action-groups Decision 6) fans out one `CallApi` per declared `on_complete`.

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
        qualify-submit-hook.yaml
        send-quote-submit-hook.yaml
  modules.yaml
  lowdefy.yaml
```

### Runtime flow

1. Lead created → app calls `start-workflow` with `{ workflow_type: onboarding, entity_type: lead, entity_id: <lead_id>, entity_collection: leads-collection }`. Engine writes one workflow doc + four action docs.
2. Lead page calls `get-entity-workflows` with `(entity_type: lead, entity_id: <lead_id>)`. Returns workflow docs + grouped actions.
3. User clicks `qualify` → form-action edit page `workflows/onboarding-qualify-edit`. Submit → generated endpoint `workflows/onboarding-qualify-submit` → app's submit hook → one `CallApi` to `submit-action`. Action transitions to `done`; `send-quote` unblocks; event logged.
4. Later, user clicks `schedule-followup` (task action) → shared `workflows/task-edit?action_id=<id>` page. User picks `done`, sets due date, adds comment, submits. Page builds the `submit-action` payload directly (no per-action endpoint).
5. Later, an installation ticket is created. Trigger action's submit hook calls `start-workflow` with `parent_action_id: <track-installation._id>`. Engine writes the new device-installation workflow (with parent back-references), its starting action docs, and the parent tracker action's `child_workflow_id` / `child_entity_id` / `child_entity_collection` + `in-progress` transition — all in one server-side call.
6. When the device-installation workflow completes, the engine's tracker subscription reads its `parent_action_id`, fetches the tracker action by primary key, and writes its status to `done`.

## Non-goals

- A user-facing template builder. Workflow YAML is authored by developers.
- A Lowdefy routine helper library. The module ships APIs, not helpers.
- Per-action page styling parity with existing app-specific templates. Apps override per action when they need bespoke pages.
- Migration tooling for existing app-specific workflow schemas.

## Deferred to separate designs

- **Submit-pipeline architecture** ([submit-pipeline/design.md](submit-pipeline/design.md)) — inversion to plugin-orchestrated submit. Requires upstream Lowdefy `context.callApi` capability. Not v1.
- **MongoDB transactions** — routine-level `StartTransaction` / `EndTransaction` with session passthrough into plugin requests. Lowdefy-core enabler needed. Not v1; engine's "Client and transaction model" already accommodates a future `session.withTransaction(...)` opt-in inside the handler.
- **`on_complete` invocation mechanism for action groups** — the action-groups sub-design commits _what_ happens on group completion (engine returns `completed_groups`; an outer Layer-1 mechanism fans out one `CallApi` per entry) but defers _how_ (`api-hooks` follow-up sub-design). Three candidate mechanisms (per-group generated endpoints, dispatcher API, plugin-side invocation) are listed in action-groups Decision 6. Engine work (Decisions 1–5) ships independently — the `completed_groups` return value lands first and is functional without the hook fan-out.

## Cross-cutting risks

- **Plugin dual-runtime build.** First-time server-side code in `@lowdefy/modules-mongodb-plugins` (currently client-only). Treated as a v1 milestone with hard `src/blocks/` vs `src/connections/` split and dist/-output verification.
- **No transactional atomicity in v1.** Mid-sequence handler failure leaves earlier writes durable; later steps unrun. Caller retry is safe (idempotency guards converge), periodic reconciliation is the catch-all.
- **`makeActionsForm` recursion from inside Nunjucks templates** is unverified in this repo. Implementation must spike `_ref: { resolver }` from inside a module template before relying on recursive form composition.
- **Workflow-doc write contention** under high parallelism. Mitigation: opt-in `summary_dirty: true` lazy-writeback mode per workflow YAML.
- **`keys: []` silent no-op footgun.** Documented; gating via `skip` / `_if` on `keys.length` is the author-side mitigation.
