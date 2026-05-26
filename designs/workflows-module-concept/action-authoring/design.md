# Workflows Action Authoring

What an author writes — the YAML surface for workflows, actions, and tracker linking. Action kinds (form / task / tracker) declared via a required `kind:` field. Universal action fields (`assignees`, `due_date`, `description`). Status enum vocabulary. Form components library. Resolver pipeline that consumes authored YAML.

This sub-design owns "what authors type." The engine's runtime semantics that consume these shapes come from [engine](../engine/design.md); the page surface generated from these YAMLs comes from [ui](../ui/design.md); the module-level wiring that ties resolvers together comes from [module-surface](../module-surface/design.md).

## Problem

What this sub-design commits about the authoring vocabulary:

- The status enum source — module-shipped and stable.
- The action-kind taxonomy — three kinds (form, task, tracker) and how the YAML distinguishes them.
- Universal fields handling — `assignees`, `due_date`, `description` on every action.
- Tracker action YAML grammar — the `tracker:` block.
- The form components library that lets authors compose `form:` blocks from reusable building blocks.
- The resolver pipeline that consumes authored YAML at build time.

## Decision 1 — Action status enum (module-shipped)

The module ships **the status enum as a static YAML file**, not as a per-app resolver-generated config. The file lives at `enums/action_statuses.yaml` in the module package and is exposed as `global.action_statuses` (read by the WorkflowAPI plugin's `actionsEnum` parameter at runtime). Same for the workflow lifecycle stages at `enums/workflow_lifecycle_stages.yaml`, exposed as `global.workflow_lifecycle_stages`.

The action-status enum has eight statuses, each with `priority`, `title`, `color`, `borderColor`, `titleColor`, optional `icon`:

```yaml
# enums/action_statuses.yaml — module-shipped, not editable per app
not-required:
  priority: 0 # special: terminal "skipped"; lower than anything else
  title: Not Required
  color: "#d9d9d9"
  borderColor: "#8c8c8c"
  titleColor: "#434343"
error:
  priority: 1
  title: Alert
  # ...
changes-required:
  priority: 2
  title: Changes Required
  # ...
done:
  priority: 3
  title: Done
  icon: { _ref: public/icons/check-circle.svg }
  # ...
in-review:
  priority: 4
  title: In Review
  # ...
in-progress:
  priority: 5
  title: In Progress
  # ...
action-required:
  priority: 6
  title: Action Required
  icon: { _ref: public/icons/ticket-outline.svg }
  # ...
blocked:
  priority: 7
  title: Blocked
  # ...
```

The workflow lifecycle stages enum mirrors the display-field shape with a smaller set: `active`, `completed`, `cancelled`. Workflow stages do **not** carry `priority` — the engine doesn't apply the priority rule to workflow status pushes (those are guarded by a same-stage no-op check inside `pushWorkflowStatus`; see engine sub-design "Idempotency"). Each entry carries only display fields (`title`, `color`, `borderColor`, `titleColor`, optional `icon`).

**Status set is fixed; display attributes are app-overridable.** The eight status keys (and the three workflow-lifecycle keys) are the engine's vocabulary — the priority rule depends on them, and forcing a canonical set keeps every consuming app on the same semantics. Apps **cannot** add new statuses, remove statuses, or change priorities. But the display attributes — `title`, `color`, `borderColor`, `titleColor`, `icon` — are presentation-only; the engine doesn't read them. Apps that want different labels ("To Do" vs "Action Required") or different colors per deployment can override these per status without touching the engine's vocabulary.

Override mechanism: the module exposes two optional vars on the manifest, `action_statuses_display` and `workflow_lifecycle_stages_display`. Each is an object keyed by the canonical status name, with whichever display fields the app wants to override. Unknown keys are silently dropped (apps can't smuggle new statuses in this way). At build time, the module merges each override over the shipped enum's display fields per key — same shape and merge semantics as the events module's `event_display` var. The engine reads `priority` and the canonical key names from the merged enum; the UI reads everything else.

```yaml
# An app overriding display on two statuses
- id: workflows
  source: file:../../modules/workflows
  vars:
    workflows_config: { _ref: workflow_config/workflows.yaml }
    app_name: my-team-app
    action_statuses_display:
      action-required:
        title: To Do
        color: "#fff7e6"
      changes-required:
        title: Needs Revision
```

The runtime priority-transition semantics that consume these enums are owned by the [engine](../engine/design.md) sub-design.

### Workflow-level `action_groups:` declaration

A workflow YAML grows a top-level `action_groups:` field — an ordered array of group objects. Every `action.action_group` value must reference a declared group; build-time validation in `makeWorkflowsConfig` fails the build on unknown references. See [action-groups](../action-groups/design.md) Decision 1 for the canonical schema and semantics; the action-authoring touch-point is the YAML shape:

```yaml
type: onboarding
title: Onboarding
entity_collection: leads-collection
display_order: 1

action_groups:
  - id: phase-1
    title: Discovery
    on_complete: workflow_config/onboarding/api/phase-1-complete.yaml
  - id: phase-2
    title: Quote
  - id: phase-3
    title: Installation

starting_actions:
  - { type: qualify, status: action-required }
  - ...

actions:
  - _ref: ./qualify.yaml # action_group: phase-1
  - _ref: ./send-quote.yaml # action_group: phase-1, blocked_by: [qualify]
  - ...
```

**Per-group fields:** `id` (string, unique within the workflow), `title` (display), `on_complete` (optional path to a Lowdefy routine YAML, invoked once when the group transitions to `done`).

**`blocked_by` accepts group IDs.** An action's `blocked_by` list may mix action types and group IDs in one field. Group-ID entries unblock the action when the referenced group reaches `done`; action-type entries unblock when the named action reaches a terminal status (`done` or `not-required`). The engine resolves entries by lookup precedence (group ID first, then action type); a collision between a group ID and an action type within the same workflow is rejected at build time. See [action-groups](../action-groups/design.md) Decision 2 for the resolution rules.

## Decision 2 — Action kinds (form, task, tracker)

Every action declares its kind explicitly via a **required `kind:` field**. Three values:

| `kind:` value | Required companion block      | Primary content                                                             |
| ------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `form`        | `form:` block                 | A domain-specific form schema, rendered as the edit page's main content     |
| `task`        | none (no `form`/`tracker`)    | Generic status selector + comment field on a shared edit page               |
| `tracker`     | `tracker:` block (Decision 5) | None — display-only inline; status_map link points at the child entity view |

```yaml
# Form action
- type: qualify
  kind: form
  form: [...]

# Task action
- type: schedule-followup
  kind: task

# Tracker action
- type: track-installation
  kind: tracker
  tracker:
    workflow_type: device-installation
```

**Why explicit, not inferred.** An earlier draft inferred kind from YAML shape (`tracker:` → tracker, `form:` → form, otherwise → task). Switched to explicit because (1) the action's kind drives three pieces of build-time and runtime machinery — page generation, submit API surface, resolver invocation — and making that discriminator a label at the top of the file is more readable than scanning for the presence of `form:` / `tracker:` blocks; (2) it surfaces author mistakes earlier — `kind: form` without a `form:` block throws a clear build-time error, whereas the inference would just have generated a task action silently; (3) it follows the canonical "tagged union" pattern (e.g. TypeScript's discriminated-union `kind` field) — the word `kind` is deliberately distinct from Lowdefy's overloaded `type`.

**Validation at build time.**

- `kind: form` requires a non-empty `form:` block; rejects if `tracker:` is also present.
- `kind: tracker` requires a `tracker:` block with `workflow_type`; rejects if `form:` is also present.
- `kind: task` rejects both `form:` and `tracker:`.
- Any other `kind:` value rejects with a clear "unknown action kind" error.

The validations run inside `makeWorkflowsConfig` (resolver pipeline, Decision 6); errors fail the app build with a path to the offending action.

The kind drives three things downstream:

1. **Page generation.** Form actions emit per-action `edit` / `view` / `review` / `error` pages (per-verb page emitted only when the verb is in the action's `access.{app_name}` list; all four verbs gated identically). Task actions don't get per-action pages — they use shared module-level `task-edit` / `task-view` / `task-review` pages, addressed by `?action_id=<id>`. Tracker actions emit no pages. See [ui](../ui/design.md) for page-generation rules.
2. **Submit API surface.** Form and task actions each get a resolver-emitted `update-action-{action_type}` endpoint (submit-pipeline). Template-shipped buttons call it with an `interaction` value (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`); the engine maps interaction → target status per submit-pipeline Decision 3. Task `submit_edit` is the one interaction where the caller supplies `current_status` directly (status selector on `task-edit`). Tracker actions don't submit at all — the engine writes their status via the tracker subscription.
3. **Resolver invocation.** `makeActionsForm` and `makeActionFormConfigs` run only for form actions; task and tracker actions skip both. `makeActionPages` skips per-action emission for task and tracker kinds.

## Decision 3 — Action access semantics

Every action declares an `access:` block with two parts that do different jobs:

```yaml
access:
  # Per-app verb maps — UI affordance control per app deployment.
  my-team-app: [view, edit, review]
  my-customer-app: [view]
  # Role gate — applied across all apps; resolved at query and submit time.
  roles: [account-manager, ops-lead]
```

### Per-app verb maps

Keys are app deployment names (matching `vars.app_name` on each module composition). Each value is a verb list controlling which UI affordances the generated action surfaces render in that app:

| Verb     | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`   | Shows the action in `actions-on-entity` on the entity page and renders read-only detail pages (form-action `-view`, task-action `task-view`).                                                                                                                                                                                                                                                                                                                                                                              |
| `edit`   | Renders the submit form — form-action `-edit` pages, task-action `task-edit`. Implies `view`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `review` | Renders a dedicated review page — form actions get `{workflow_type}-{action_type}-review` (generated alongside `-edit` / `-view` / `-error` when present in the verb list); task actions use the shared `task-review` page. Approve and Request Changes are template-shipped buttons calling `update-action-{action_type}` with `interaction: approve` and `interaction: request_changes`; the engine resolves target status (`done` and `changes-required` respectively, per submit-pipeline Decision 3). Implies `view`. |

Apps without a key for a given app deployment **hide the action entirely** in that app — no `actions-on-entity` row, no edit page generated, no link reachable. The resolver's `makeActionPages` reads the host app's `app_name` and filters per-action page emission based on that app's verb list (form actions only emit `-edit` when `edit` is in the list, etc.). The runtime UI affordances on entity pages read the same map to decide what to render.

Vocabulary is module-defined. v1 ships `view`, `edit`, `review`; the module can grow additional verbs in v1.x without breaking apps (unknown verbs are silently ignored).

### Role gate

`access.roles` controls **who** can interact with the action regardless of which app they're in. Empty or missing means "no role gate" (any user with verb access can interact). Non-empty means the user's roles must intersect with this list.

Roles are resolved from `_user: roles` — the user's effective roles for the current app, sourced from `apps.{app_name}.roles` on the `user_contacts` doc (the same source the user-admin module manages).

Check semantics: `(access.roles is empty) OR (size(setIntersection(user.roles, access.roles)) > 0)`.

The engine enforces the role gate at two points:

- **At query time** in `get-entity-workflows`: actions where the user's roles don't satisfy the gate are filtered out of the response. Same effect as the user not having app-level access — the action is invisible to that user.
- **At submit time** inside the `SubmitWorkflowAction` handler: the engine re-checks the role gate against the action's `access.roles` before performing any writes. Rejects with a structured error if the user's roles no longer match (e.g. role revoked between page render and submit).

### Composition: verb gate AND role gate

The verb map and the role gate compose with AND semantics:

- App-level filter runs first (build-time + query-time): if `access.{current_app_name}` is missing or doesn't contain the relevant verb, the action / verb is not visible in this app.
- Role gate runs second (query-time + submit-time): if the user's roles don't intersect with `access.roles`, the action is invisible / submission is rejected.

A user with `account-manager` role visiting from an app without an `access.<that-app>` key sees nothing — app-scoping is intentional. An app with `access.my-team-app: [view, edit]` but missing `roles:` lets any my-team-app user interact (no role gate).

### Where the checks live

- **Build-time** (`makeActionPages`): per-app verb filter. Form actions emit only the page verbs the host app has access to.
- **Query-time** (`get-entity-workflows`): per-app verb filter + role gate. Both must pass for an action to appear in the response.
- **Submit-time** (the `SubmitWorkflowAction` handler): role gate re-check (the verb filter is implicit — the page wouldn't have been generated if the verb wasn't allowed in the current app, but a hostile caller hitting `update-action-{action_type}` directly is rejected by the engine's role check).

The `action_role_check` component (ui sub-design) is a thin client-side wrapper over the same check used at query time — apps can read it on entity pages to conditionally render verb buttons without re-implementing the logic.

## Decision 4 — Universal action fields

Every action doc — regardless of kind — carries three optional fields:

| Field         | Type       | Description                                                    |
| ------------- | ---------- | -------------------------------------------------------------- |
| `assignees`   | `String[]` | User IDs assigned to the action; multi-select on the edit page |
| `due_date`    | `Date?`    | When the action is due; date picker on the edit page           |
| `description` | `String?`  | Free-text description; rendered alongside form/task content    |

The fields are **uniformly user-editable** on the action's edit page, regardless of kind:

- On a **form action's** edit page they render in the page header alongside the form (a small assignees / due-date / description band above the form schema).
- On a **task action's** edit page they're the primary content, with a status selector and a comment field below.
- On a **tracker action's** inline display in `actions-on-entity` they show as small badges next to the link.

Updates flow through the per-action endpoint (`update-action-{action_type}`) like any other action change: the payload includes the new field values in `fields`, the engine writes them to the action doc atomically with the status transition, and a log event is emitted. Comments live on the events module — the comment is part of the `event.metadata.comment` payload that the engine forwards to `events.new-event`.

The fields are added to the actions schema and to the reserved-keys list (engine sub-design "References write contract") — apps' `references` payloads can't claim `assignees`, `due_date`, or `description`.

### Display-positioning fields

Two more optional fields are universal across kinds. They affect how the action surfaces in the entity-page UI but have no engine semantics:

| Field          | Type     | Description                                                                                                      |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `action_group` | `String` | Group ID referenced from the workflow's `action_groups:` list. Drives entity-page grouping and progress rollup.  |
| `sort_order`   | `Number` | Display order among siblings within an `action_group` (or within the workflow when no group). Lower comes first. |

`sort_order` is a v0 carry-over: the UI needs a deterministic display order that's cheaper to author than computing topological order from `blocked_by` and stable across status changes. Without `sort_order`, the UI falls back to `blocked_by` topological order with ties broken by `actions[]` declaration order; with `sort_order` set, the integer wins.

### Optional terminal-behaviour field

| Field                  | Type      | Description                                                                                                                                                                              |
| ---------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required_after_close` | `Boolean` | Default `false`. When `true`, the action remains visible and submittable after the workflow lifecycle moves to `completed` or `cancelled`. Used for post-close bookkeeping or follow-up. |

Engine effect: the `SubmitWorkflowAction` handler rejects writes on actions whose workflow is `completed` / `cancelled` unless the action's `required_after_close: true`.

### Fields explicitly dropped from the v1 grammar

The v0 corpus carried fields the team chose not to bring forward:

- **`responsibility`** — display-only label (e.g. `client`, `technician`). v1 leaves this to app-side UI; if a deployment wants the label, it derives it from `assignees` or attaches its own metadata.
- **`access.notification_roles`** — moved to the notifications sub-design / config; not part of the action grammar.
- **`roles` on the action** (separate from `access.roles`) — v0 had both; v1 keeps only `access.roles` as the role gate (Decision 3).
- **`workflow.ticket_category`** — v0 categorization for ticket-shaped workflows. v1 workflows are entity-agnostic; categorization, if needed, lives on the entity doc.

## Decision 5 — Tracker action YAML

Tracker actions are the design's mechanism for "this parent workflow has work happening on a related entity that we want reflected in the parent's progress." A tracker action's status mirrors a specific child workflow's lifecycle stage; when the child transitions, the engine writes the parent action's status (engine sub-design "Tracker subscription mechanism" covers the runtime mechanism).

The shape is one YAML field and one runtime convention.

### YAML shape

A tracker action declares a `tracker:` block with a single field — the child `workflow_type` it mirrors:

```yaml
type: track-installation
kind: tracker
action_group: setup
sort_order: 40
description: Tracks the device-installation workflow on the linked installation ticket.
blocked_by: [schedule-followup]
access:
  my-team-app: [view] # display-only — no edit / submit page
tracker:
  workflow_type: device-installation
status_map: # optional — display copy per parent stage; mapping itself is hard-coded
  blocked: { my-team-app: { message: Awaiting follow-up scheduling. } }
  in-progress: { my-team-app: { message: Installation in progress. } }
  done: { my-team-app: { message: Installation completed. } }
```

No `relationship`, no registry reference, no per-action `status_map` mapping child stages to parent stages. The `tracker:` block carries one fact: which child `workflow_type` this action tracks.

### How parent and child get linked at runtime

The link between a tracker action and its child workflow is **bidirectional**, established by `start-workflow` in a single call. Three fields on each side:

- **Tracker action** (parent side): `child_workflow_id` (the child workflow doc's `_id`), `child_entity_id`, and `child_entity_collection` — the workflow reference plus the entity reference and its MongoDB-collection-connection-id. All three null until the child is started; all three populated in the same `start-workflow` call.
- **Child workflow doc**: `parent_action_id` (the tracker action's `_id`), `parent_entity_id` (the parent workflow's entity id), and `parent_entity_collection` (the parent's collection connection id). All null for top-level workflows.

App code that creates the child entity calls `start-workflow` with `parent_action_id` set; the engine writes both sides in one server-side handler — the new child workflow doc with parent back-references, the N starting action docs for the child, and the parent tracker action's `child_workflow_id` (the new workflow's `_id`) / `child_entity_id` / `child_entity_collection` fields plus `in-progress` transition.

```yaml
# app's submit hook on a trigger action that spawns the child:
- id: create_ticket
  type: MongoDBInsertOne
  connectionId: tickets-collection
  properties: { ... }

- id: start_child_workflow
  type: CallApi
  endpointId: { _module.endpointId: { id: start-workflow, module: workflows } }
  payload:
    workflow_type: device-installation
    entity_id: { _step: create_ticket.insertedId }
    entity_collection: tickets-collection
    parent_action_id: { _state: parent_action_id } # the tracker action's _id
```

One `CallApi` to `start-workflow`, no follow-up submit to write the link. The engine reads the tracker action by `parent_action_id`, picks up `parent_entity_id` and `parent_entity_collection` from its `entity_id` / `entity_collection`, writes both sides atomically (on the shared client — see engine "Client and transaction model").

After this, the engine's tracker subscription (engine sub-design) walks **child → parent** by primary key: a child status change reads the child's `parent_action_id` and fetches the tracker action via `actions.findOne({ _id: parent_action_id })`. No reverse-lookup index needed; the default `{ _id: 1 }` index serves the lookup.

### Hard-coded child-stage map

The mapping from child workflow stage to parent action stage is **fixed by the module**. Apps don't supply a per-action `status_map` for it.

| Child workflow stage | Parent tracker action stage |
| -------------------- | --------------------------- |
| `active`             | `in-progress`               |
| `completed`          | `done`                      |
| `cancelled`          | `not-required`              |

Three reasons to hard-code:

- **The mapping is universal.** A running child should always show "in-progress" on the parent; a completed child should always show "done"; a cancelled child should always show "not-required" (the child was abandoned, parent doesn't wait on it any more).
- **Cuts every per-action `status_map` for tracker actions** — they only need display copy now, not stage logic.
- **Prevents inconsistency.** With per-action mappings, two tracker actions on the same parent could disagree about whether `cancelled` means "done" or "not-required." Hard-coding makes it deterministic.

Apps that genuinely need different semantics (e.g. cancelled child should flag the parent as `error`) use a regular form action and an app-side submit hook to mirror manually — "drop the engine machinery, push the rare case to app code."

### What this rules out

- **Cross-workflow gating** and **cross-entity gating** as separate primitives. If a parent action needs to wait on a child workflow, it adds a tracker action that tracks the child, and the parent's other actions add `blocked_by: [tracker-action]`. Same outcome, one mechanism (`blocked_by`).
- **Apps shouldn't need to declare cross-entity relationships in `modules.yaml`.** The engine knows nothing about how the lead and ticket entities are joined; the app's submit hook that creates the child is where that knowledge lives.
- **Per-action child-stage mapping.** Hard-coded as above. Apps that need bespoke mapping move to a form action + manual mirror hook.

### Constraint: 1:1 between tracker action and child workflow

A tracker action ↔ child workflow pair is **strictly one-to-one** in both directions. Each child workflow has at most one `parent_action_id` (its lifecycle mirrors at most one tracker action); each tracker action has at most one `child_workflow_id` (it mirrors at most one child workflow). The `child_entity_id` / `child_entity_collection` fields point at the entity the child workflow runs on — the 1:1 cardinality is on the workflow, not the entity (multiple workflows can run on the same entity).

What's ruled out by the constraint:

- One child workflow being mirrored by multiple parent tracker actions, across any parent workflows. Apps that need the same physical event (e.g. one installation visit) to drive multiple parent workflows either spawn one child workflow per parent or read shared entity state independently.
- One parent action mirroring multiple sequential children.
- A parent action that's both a regular action and a tracker action — `kind: form` / `kind: tracker` / `kind: task` are mutually exclusive (Decision 2).

### Two paired actions, not one

The recommended shape pairs **trigger** and **tracker** as two actions: a trigger action with a form that creates the child entity and starts the child workflow with `parent_action_id` set, plus a tracker action that mirrors the child's lifecycle. The trigger action's submit hook makes one `CallApi` to `start-workflow` (as shown above); the engine writes both sides of the link in one server-side call, and the tracker action takes it from there.

The module doesn't enforce this split — apps can put `tracker:` on whatever action makes sense — but the README documents the paired-actions pattern as the recommended shape because it separates "workflow logic that creates the child" from "state mirroring."

### Tracking simple entities (minimal workflow shim)

Tracker actions **only ever track workflows**. There is no `kind: tracker` variant that subscribes to entity-doc fields directly. For entities whose lifecycle is a single status field (e.g. a support ticket that just goes open → closed), declare a minimal workflow on that entity type with one bookkeeping action:

```yaml
# workflow_config/site-setup/site-setup.yaml
type: site-setup
title: Site Setup
entity_collection: support-tickets-collection
display_order: 1
starting_actions:
  - { type: complete-site-setup, status: action-required }
actions:
  - _ref: ./complete-site-setup.yaml
```

```yaml
# workflow_config/site-setup/complete-site-setup.yaml
type: complete-site-setup
kind: task
description: Mark site setup complete.
status_map:
  action-required:
    my-team-app:
      message: Complete site setup
      link:
        pageId: { _module.pageId: { id: task-edit, module: workflows } }
        urlQuery: { action_id: true }
  done:
    my-team-app: { message: Site setup completed. }
```

The parent tracker action declares `tracker: { workflow_type: site-setup }`. When the support ticket is created, app code calls `start-workflow` with `workflow_type: site-setup` and `parent_action_id: <parent_tracker_action_id>` — the engine writes the workflow, the single `complete-site-setup` action, and the bidirectional link in one call (parent tracker action goes to `in-progress`). When the user marks the bookkeeping action `done`, the shim workflow auto-completes and the engine's tracker subscription flips the parent action to `done`. If the entity is abandoned, app code calls `cancel-workflow` on the shim workflow — same path through the tracker subscription (`cancelled → not-required`).

**Why this pattern and not direct entity-status mirroring.** A previous design draft considered a second tracker mode (`on: entity` with a `status_map` mapping entity-status values to tracker stages, driven by an app-callable `update-tracker` API). The team rejected it in favour of keeping the engine on one code path: the tracker subscription has one source of truth (child workflow status); audit history comes for free (the shim workflow's status array); cascading composition works uniformly (any tracker → workflow → tracker chain follows the same rules). Trade-off accepted: one minimal workflow YAML per trackable entity type — written once, reused per entity instance.

**Cost characterization.** Apps with N trackable entity types ship N (workflow, action) YAML pairs. Per-instance cost is one workflow doc + one action doc — the same as any other workflow on the engine. For app teams with many trackable entity types added ad-hoc, this is the recommended escape hatch, not a one-line declaration. The cost is recognized; the engine simplification is judged to outweigh it.

## Decision 6 — Resolver pipeline

The module exports five JS resolvers that consume authored YAML at build time:

| Resolver                | Reads                                                   | Emits                                                                                                                                                                                                                                                          | Used in                                                                              |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `makeActionPages`       | `workflows_config`, `app_name`                          | Array of page YAML (one per (workflow, action, verb))                                                                                                                                                                                                          | `module.lowdefy.yaml` `pages:`                                                       |
| `makeWorkflowApis`      | `workflows_config`, `app_name`                          | Array of `Api` YAML — one `update-action-{action_type}` entry per form / task action (bakes in the action's `hooks:`, `event:`, `interactions:` blocks as build-time literals; validates `hook.auth.roles ⊇ action.access.roles`); skipped for tracker actions | `module.lowdefy.yaml` `api:`                                                         |
| `makeWorkflowsConfig`   | `workflows_config`                                      | Runtime config object consumed by the WorkflowAPI connection                                                                                                                                                                                                   | `module.lowdefy.yaml` `connections:` (the connection's `properties.workflowsConfig`) |
| `makeActionsForm`       | An action's `form` field + `components/fields/` library | Block tree for the form, with library components substituted by name (used inside the page templates)                                                                                                                                                          | Inside templates, called recursively per action (form actions only)                  |
| `makeActionFormConfigs` | `workflows_config`                                      | Per-action form metadata map (validation, default values, field types)                                                                                                                                                                                         | `global.action_form_configs` — read by templates and the workflow-overview page      |

Each resolver lives at `resolvers/{name}.js` in the module package and is invoked via `_ref: { resolver: ..., vars: { ... } }` from the appropriate location in `module.lowdefy.yaml`. Apps don't invoke any of them directly — the module's `module.lowdefy.yaml` does the wiring.

### `makeWorkflowsConfig` — runtime config + build-time validation

In addition to emitting the runtime config object the `WorkflowAPI` connection reads, `makeWorkflowsConfig` is the single place all build-time validation of `workflows_config` lives. Errors fail the app build with a path to the offending workflow / action.

Validation rules:

**Per workflow** (each element of `workflows_config`):

- `type` (string) — required, non-empty.
- `entity_collection` (string) — required, non-empty. A MongoDB collection connection id (e.g. `leads-collection`); the sole entity-identity scalar.
- `display_order` (number) — required.
- `starting_actions` (array) — required; each entry must be `{ type, status }` where `type` resolves to one of the workflow's declared `actions[].type` values and `status` is a key in the module-shipped `action_statuses` enum.
- `actions` (array) — required, non-empty.
- All `actions[].type` values within a workflow must be unique.
- `action_groups` (array) — optional but if any action declares `action_group`, the field is required. Each entry must have a unique `id` (string) and a `title` (string); `on_complete` (optional) is a string path to a routine YAML.
- **Group/action-type collision check.** No `action_groups[].id` may equal any `actions[].type` within the same workflow (engine resolves `blocked_by` entries by group-id-first lookup precedence and rejects collisions at build).

**Per action** (each entry in `actions`):

- `type` (string) — required, non-empty.
- `kind` (`form` | `task` | `tracker`) — required.
- `kind: form` requires a non-empty `form:` block; rejects if `tracker:` is also present.
- `kind: tracker` requires a `tracker:` block with `workflow_type` (string); rejects if `form:` is also present.
- `kind: task` rejects both `form:` and `tracker:`.
- Any other `kind:` value rejects with "unknown action kind."
- `status_map` keys (if present) must be members of `action_statuses`. Display-config under each key must be keyed by `app_name`. (Same app-keyed-display family as the events module's `event_display.{app_name}.{event_type}` pattern — see [docs/idioms.md "Event display"](../../../../docs/idioms.md#event-display); the workflows nesting is `status_map.{stage}.{app_name}` so per-stage display lives together.)
- `action_group` (if present) must reference a declared `action_groups[].id` in the same workflow.
- `blocked_by` entries (if present) must resolve to either another `actions[].type` value in the same workflow OR an `action_groups[].id`. Mixed lists are valid. Engine resolves by group-id-first precedence (see [action-groups](../action-groups/design.md) Decision 2). Unresolvable entries fail the build.
- `access.<app_name>` entries (if present) must be arrays of valid verbs (`view`, `edit`, `review` — see Decision 3 "Action access semantics" for the canonical verb vocabulary; unknown verbs are silently ignored at runtime but flagged at build time).
- Reference-key collisions: any key in `references:` payloads that collides with a reserved key (see engine sub-design "References write contract") is flagged. (Note: this is a _warning_ at build time only when the workflow YAML literally contains a `references:` block; runtime references go through the engine's merge-order silencing per the engine sub-design.)

The validations run inside `makeWorkflowsConfig`. Decision 2's per-kind invariants (form / task / tracker validation rules) are the same rules expressed from the action-kind perspective; this section restates them in resolver-implementation terms alongside the broader workflow-level invariants.

### `makeWorkflowApis` — the per-action endpoint generator

The resolver walks the workflows config and emits, per form / task action, one `update-action-{action_type}` `Api` entry. The endpoint's routine is a single call to the `SubmitWorkflowAction` plugin handler with the action's `hooks:`, `event:`, and `interactions:` blocks baked in as build-time literals (see submit-pipeline Decision 2 for the canonical shape):

```yaml
# Generated request — one per form / task action.
- id: update-action-{action_type}
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
        interaction: { _payload: interaction }     # which template button fired
        current_key: { _payload: current_key }     # for keyed actions; omit for non-keyed
        form: { _payload: form }
        form_review: { _payload: form_review }
        fields: { _payload: fields }
        hooks:                                     # build-time literal map from action.hooks
          submit_edit: { pre: <api-id-or-null>, post: <api-id-or-null> }
          not_required: { pre, post }
          resolve_error: { pre, post }
          approve: { pre, post }
          request_changes: { pre, post }
        event_overrides:                           # build-time literal map from action.event
          submit_edit: { type, display, metadata }
          ...
        interactions:                              # build-time literal map from action.interactions
          submit_edit: { status: <override-or-null> }
          ...
    - :return:
        action_ids: { _step: submit.action_ids }
        completed_groups: { _step: submit.completed_groups }
        event_id: { _step: submit.event_id }
        tracker_fired: { _step: submit.tracker_fired }
        pre_hook_response: { _step: submit.pre_hook_response }
        post_hook_response: { _step: submit.post_hook_response }
```

**Scope: form and task actions.** Tracker actions don't get an endpoint (the engine writes their status via the tracker subscription, never via a caller invocation).

**One endpoint per action, all interactions multiplexed.** Every button on every page for this action calls the same endpoint with a different `interaction` value (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`). The handler resolves `hooks[interaction]` and `event_overrides[interaction]` once on entry and treats them as scalar bags for the rest of the lifecycle. See submit-pipeline Decision 3 for the layered "interaction → target status" resolution (engine default → `interactions[interaction].status` → pre-hook return).

### Build-time validation: hook auth gate

`makeWorkflowApis` validates that each hook API referenced from `action.hooks.{interaction}.{pre,post}` satisfies the auth rule from submit-pipeline Decision 4: `hook.auth.roles ⊇ action.access.roles`, and `hook.auth.public` must not be `true`. The build fails with a path to the offending hook + action when the relationship doesn't hold. This catches the "user passes the action's role gate but the hook hard-fails on auth" mismatch at build, not at submit time.

An action YAML's submit-side authoring surface is the `hooks:` / `event:` / `interactions:` blocks (action-authoring Decision 4 grammar), all optional:

```yaml
# An action YAML in workflow_config/lead-onboarding/qualify.yaml
type: qualify
kind: form
action_group: discovery
status_map: { ... }
form: [...]
hooks: # optional; per-interaction pre/post hook APIs
  submit_edit:
    pre: lead-onboarding-qualify-pre-submit
    post: lead-onboarding-qualify-post-submit
event: # optional; per-interaction log-event overrides
  submit_edit:
    type: lead-qualified
    display:
      my-team-app: { title: "Lead qualified" }
interactions: # optional; per-interaction target-status overrides
  submit_edit: { status: done } # skip review even if `review` verb exists
```

### Resolver invocation in `module.lowdefy.yaml`

The module wires its own resolvers — apps don't write any of this. See [module-surface](../module-surface/design.md) "Decision 1" for the complete manifest sketch; the relevant resolver-invocation blocks are:

```yaml
pages:
  - _ref:
      resolver: resolvers/makeActionPages.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }

api:
  - _ref:
      resolver: resolvers/makeWorkflowApis.js
      vars:
        workflows: { _module.var: workflows_config }
        app_name: { _module.var: app_name }
  # plus the four static API _refs

global:
  workflows_config:
    _ref:
      resolver: resolvers/makeWorkflowsConfig.js
      vars: { workflows: { _module.var: workflows_config } }
  action_form_configs:
    _ref:
      resolver: resolvers/makeActionFormConfigs.js
      vars: { workflows: { _module.var: workflows_config } }
```

(`makeActionsForm` is the recursive form-builder; it's called inside the form-action page templates, not at the module's top level. It reads the form components library at `components/fields/` to substitute named components into the block tree — see Decision 7 below.)

## Decision 7 — Form components library

Form-author productivity comes from a small library of reusable field components — `controlled_list`, `label`, `label_value`, `date_range_selector`, plus the basic input wrappers — that authors compose into per-action `form:` blocks. The module ships this library at `components/fields/` in the module package. Apps reference components by **name** in their action YAML's `form:` array; the resolver substitutes the component's config (with author-supplied vars merged) into the page block tree at build time. **Apps never `_ref` these components directly** — there's nothing for the app to import or expose. The library is internal to the module's resolver pipeline.

Components shipped in v1 (27 total — full v0 parity):

| Category  | Component             | Purpose                                                                            |
| --------- | --------------------- | ---------------------------------------------------------------------------------- |
| Text      | `text_input`          | Single-line text — wrapper over Lowdefy's `TextInput`                              |
|           | `text_area`           | Multi-line text — wrapper over Lowdefy's `TextArea`                                |
|           | `tiptap_input`        | Rich-text editor (Tiptap)                                                          |
| Numeric   | `number`              | Numeric input                                                                      |
| Date      | `date_selector`       | Single date picker                                                                 |
|           | `date_range_selector` | Two-date picker for start + end                                                    |
| Choice    | `selector`            | Single-select dropdown                                                             |
|           | `multiple_selector`   | Multi-select dropdown                                                              |
|           | `radio_selector`      | Radio group                                                                        |
|           | `checkbox_selector`   | Multi-select checkbox group                                                        |
|           | `button_selector`     | Button group acting as selector                                                    |
|           | `checkbox_switch`     | Single toggle switch                                                               |
|           | `yes_no_selector`     | Two-option yes/no toggle                                                           |
|           | `enum_selector`       | Selector with options sourced from an enum                                         |
| Files     | `file_upload`         | File upload with policy-driven S3 put                                              |
|           | `file_download`       | File-list download with S3 get policy                                              |
| Location  | `location`            | Address + coordinate picker                                                        |
| Display   | `label`               | Read-only single-line label (with `viewOnly: true` for derived values)             |
|           | `label_value`         | Read-only key-value pair display                                                   |
|           | `title`               | Section header                                                                     |
|           | `section_title`       | Sub-section header                                                                 |
|           | `alert`               | Alert banner                                                                       |
|           | `html`                | Raw HTML block                                                                     |
| Structure | `box`                 | Conditional/grouped container — visible/disabled via operators, wraps child blocks |
|           | `section`             | Visually-grouped section with optional title                                       |
|           | `controlled_list`     | Dynamic list of sub-forms (fan-out per row — e.g. one row per device)              |
| Actions   | `button`              | Inline button block (typically for in-form actions)                                |

Each component is a YAML file with two top-level keys: `config` (the block-tree fragment to emit) and `vars` (the author-facing parameter list with types and required flags). **This two-key shape is specific to the form components library and is distinct from `exports.components`** — exported components ship a block tree directly at the top level (see e.g. `modules/contacts/components/basic-contact-selector.yaml`). The library shape exists because the resolver dereferences these components programmatically and needs the vars schema to validate author input; library components are never `_ref`'d by app YAML. Concrete example:

```yaml
# components/fields/controlled_list.yaml
vars:
  key: { type: string, required: true }
  title: { type: string, required: false }
  required: { type: boolean, default: false }
  hideAddButton: { type: boolean, default: false }
  hideRemoveButton: { type: boolean, default: false }
  form: { type: array, required: true } # the per-row sub-form blocks

config:
  id: { _var: key }
  type: ControlledList
  required: { _var: required }
  properties:
    title: { _var: title }
    hideAddButton: { _var: hideAddButton }
    hideRemoveButton: { _var: hideRemoveButton }
  blocks:
    _var: form
```

An author writes the following in their action YAML's `form:` block:

```yaml
form:
  - component: controlled_list
    key: form.devices
    title: Devices
    required: true
    hideAddButton: true
    form:
      - component: label_value
        key: form.devices.$._id
        title: Device Number
      - component: date_range_selector
        key: form.devices.$.warranty
        title: Warranty
        required: true
```

At build time, the form resolver (`makeActionsForm`) walks the array, looks up `controlled_list` and `label_value` and `date_range_selector` in `components/fields/`, merges the author's vars into each component's `config`, and emits one block tree the page template `_ref`s. Authors don't need to know what the rendered Lowdefy block tree looks like — they work in the component vocabulary.

**Why ship as a library, not as `exports.components`.** The components are not consumed via `_module.componentId` from app pages — they're internal building blocks the resolver dereferences. `exports.components` stays as the top-level UI blocks consuming apps drop onto entity pages: `actions-on-entity`, `workflow-header`, `action_role_check` (see [ui](../ui/design.md)). The form library is one layer below that; it never surfaces in app YAML except as a `component:` name string.

**Override + extension.** Apps that need a domain-specific component (e.g. a `device_selector` that hits an app-specific collection) ship it as a regular Lowdefy custom component in their plugin and reference it in `form:` blocks via `component: <plugin-name>:device_selector`. The resolver passes through any `component:` name it doesn't recognise as a library component, so app-side custom components compose alongside library components naturally.

Detailed library content is implementation-time material; the v1 list is the floor, and the module adds entries as patterns emerge during real-app adoption.

### v1 ships the full v0 set

The v0 production corpus surfaces 27 form components in real use (yes_no_selector, device_type_selector, location, file_upload, number, box, section, controlled_list, label, label_value, date_range_selector, text_input, text_area, and 14 more). v1 ships all 27 rather than a smaller floor. Rationale: the example_workflow exercises most of them; shipping the floor and asking apps to port over the rest as plugin components would block real adoption. Cost is one-time documentation and resolver coverage; benefit is day-one parity with v0 deployments.

Apps that need a domain-specific component (e.g. `device_type_selector` hitting an app-specific collection) keep using the plugin-component path (`component: <plugin-name>:device_selector`); the resolver passes through unrecognised names.

## Decision 8 — Status-map, page-event vocabulary, and per-page chrome

The example_workflow corpus confirms three authoring shapes that v1 adopts directly from v0:

### `status_map` — per-status display copy and links

Every action declares a `status_map:` block keyed first by status, then by app name. Each `{ status, app_name }` cell carries display copy (`message`) and an optional `link` block:

```yaml
status_map:
  action-required:
    my-team-app:
      message: Provide initial details for the installation.
      link:
        pageId: my-team-app-initial-details-edit
        title: Initial Details
        urlQuery: { action_id: true }
    my-customer-app:
      message: Awaiting initial details.
  done:
    my-team-app:
      message: Initial details completed.
      link:
        pageId: my-team-app-initial-details-view
        title: View Initial Details
        urlQuery: { action_id: true }
```

**Message templating.** The `message` string supports `{{ var }}` Nunjucks-style interpolation, rendered at read time against the action-instance context (action fields + the `key` value, if the action is instanced — see Decision 9). Useful for fan-out: `Awaiting installation of device {{ physical_id }}.` resolves against the per-instance key/joined-entity data the resolver injects.

**App-keyed shape mirrors `event_display`.** Same nesting and merge family as the events module's `event_display.{app_name}.{event_type}` pattern (see [docs/idioms.md "Event display"](../../../../docs/idioms.md#event-display)); workflows nest as `status_map.{stage}.{app_name}` so per-stage display lives together.

**Consumed by:** the `actions-on-entity` and `workflow-history` UI components (ui sub-design Decision 5). Status-map cells with `link:` set render as clickable cards; cells without a link render as static text. Tracker actions use `status_map` for display copy only — the engine hard-codes the child-stage → parent-status mapping (Decision 5).

### `form_review` — separate schema for review pages

Actions whose access list includes `review` may declare a second form block under `form_review:`:

```yaml
form: # the submitter's schema (edit page)
  - key: form.installation_files
    component: file_upload
    required: true
form_review: # the reviewer's schema (review page)
  - key: form.device_online
    component: yes_no_selector
    title: Is the device online?
    required: true
    validate:
      - message: You can only approve when the device is online.
        status: error
        pass: { _eq: [{ _state: form.device_online }, true] }
```

The reviewer's schema is distinct from the submitter's: it captures reviewer-supplied data (validation flags, approval rationale) that the submitter shouldn't be asked for. The review page renders both — the submitter's `form:` values read-only above, and `form_review:` blocks below as a writable form.

**Storage.** `form_review:` values land on the workflow doc at `form_data.{action_type}.{field}` — the same flat tree as `form:` blocks (form data layout, engine sub-design). No `.review` sub-key; authors pick non-colliding field names between the two blocks.

**Validation.** `form_review` runs through the same `makeActionsForm` resolver as `form:`. The two are independent schemas; nothing prevents a reviewer field overlapping with a submitter field by name, but the storage path keeps them separate.

### Four page-event verbs

Action `pages.{verb}.events` use a fixed vocabulary of four event names. The module wires each verb's page template to call these handlers:

| Event verb         | Pages that use it                 | Fires on                                    |
| ------------------ | --------------------------------- | ------------------------------------------- |
| `onMount`          | `edit`, `view`, `review`, `error` | Page load — for setup and request hydration |
| `onSubmit`         | `edit`, `error`                   | Submit button click                         |
| `onApprove`        | `review`                          | Approve button click                        |
| `onRequestChanges` | `review`                          | Request-changes button click                |

`error` pages use `onSubmit` for the recovery submit — same handler name as `edit` so apps that need to recover via the same submit hook share the routine.

Per-verb event handlers go under `pages.{verb}.events.{handler}` as standard Lowdefy action arrays. The module-emitted page wires the matching template button to each handler.

```yaml
pages:
  edit:
    events:
      onMount: [...]
      onSubmit:
        - id: submit
          type: CallAPI
          params:
            endpointId: my-team-app-initial-details-submit
            payload: { ... }
  review:
    events:
      onMount: [...]
      onApprove: [...]
      onRequestChanges: [...]
```

The per-action endpoint (`update-action-{action_type}`) is what each template-shipped button calls; the action's `hooks:` block declares which pre/post Lowdefy Apis the engine fires per interaction. See submit-pipeline for the endpoint resolution detail.

### Per-page chrome: `formHeader`, `formFooter`, `requests`, `modals`

Each action page may declare four additional blocks alongside `events`:

```yaml
pages:
  edit:
    title: Capture Initial Details
    requests: [...] # per-page data requests
    events: { onMount: [...], onSubmit: [...] }
    formHeader: [...] # blocks rendered above the form
    formFooter: [...] # blocks rendered below the form
  review:
    modals:
      request_changes:
        client_change: false # config knob for built-in request_changes modal
```

- `requests:` — list of Lowdefy request refs the page loads.
- `formHeader:` / `formFooter:` — block lists; the module-emitted page template slots them above/below the rendered form. Used in v0 for device-detail headers and informational collapse panels.
- `modals.{name}.{field}:` — config knobs on built-in module modals (the `request_changes` modal on review pages). Author-supplied values override the modal's defaults.

These fields belong to the action's authored YAML — they ride into the generated page YAML via the module's page-emission resolver (ui sub-design).

### Error pages and the `error` status

The fourth verb the page-emission resolver handles is `error`, gated identically to the other three: the resolver emits the `-error` page when `error` is in the action's `access.{app_name}` verb list. Actions without `error` in the list have no `-error` page in that app deployment — an author-driven `error` push still lands on the action, but there is no reachable recovery surface in the UI for that action there. `pages.error` is purely a chrome-override slot (like `pages.edit`); the template ships sensible defaults when it's absent.

**When an action enters `error`:** `error` is purely author-driven ([Part 29 § D1–D2](../../workflows-module/parts/29-error-model-cleanup/design.md)). Engine sub-step failures throw and propagate to `CallApi`; they do not write an `error` transition. Three entry paths put an action into `error`:

- **Pre-hook return.** A pre-hook (submit-pipeline Decision 4) returns `actions: [{ ..., status: 'error' }]` through the regular merge channel. No `force` needed — `error.priority = 1` is below every non-terminal stage. Failure context rides on the events-log entry via `event_overrides.metadata`.
- **Task `submit_edit` + caller-supplied status.** Task actions whose `task.statuses:` list includes `error` can be sent to `error` from the status-selector dropdown via `submit_edit + current_status: 'error'`.
- **External systems.** Backend microservices, scheduled lambdas, or other out-of-band writers push `error` directly.

Either way, the action's `status[0].stage` becomes `error` and the page resolver's `link.pageId` slot in `status_map.error.{app_name}` is expected to target `{workflow_type}-{action_type}-error?action_id=<id>`.

**Authoring the recovery form:**

Authors declare a `pages.error` block alongside `edit` / `view` / `review`:

```yaml
pages:
  error:
    title: Recover Initial Details
    requests: [...]
    events:
      onMount: [...] # typically: fetch action, redirect-to-view if status is no longer 'error'
      onSubmit: [...] # author-supplied page-state work before the template-shipped resolve_error button fires (the button itself calls update-action-{action_type})
    formHeader: [...]
    formFooter: [...]
    buttons: # optional; defaults to a single primary "Submit" button
      submit:
        title: Retry Submit
        modal: # optional confirm-modal config
          title: Confirm Resubmission
          content: This will re-attempt the submission. Continue?
```

The recovery form schema **reuses** the action's `form:` block — the user sees the same fields they originally submitted with the failure context surfaced as `formHeader` / `formFooter` blocks (typically a banner reading from the events-log entry referenced by `status[0].event_id`, where the author-driven entry path attached metadata via `event_overrides.metadata`; status entries themselves are uniform `{ stage, created, event_id }` per [Part 29 § D2a](../../workflows-module/parts/29-error-model-cleanup/design.md#d2a-status-entry-shape-simplification-docstypesreturn-field-cleanup)). Apps that need a different recovery schema declare a `form_error:` block parallel to `form:` / `form_review:`; if absent, the error page renders the `form:` schema by default.

**Stale-URL guard.** The error template's `onMount` ships a built-in redirect step: if the action's `status[0].stage` isn't `error` when the page loads, the template emits a `Link` to `-view`. Apps don't write this guard themselves; it's part of the template.

**Buttons.** The error template ships with a single primary "Submit" button wired to `pages.error.events.onSubmit`. Authors can override the button title and add a confirm modal via `pages.error.buttons.submit.{title,modal}`. Multi-button error pages can use `formFooter:` to add additional buttons with their own routines.

**`access` interaction.** The `-error` page is emitted for every form action regardless of the action's `access.{app_name}` verb list. The rationale is operational: an action in `error` is a stuck state; restricting visibility per app would strand users in apps that don't include the verb. Apps that don't want users from app X to see the error page filter at the status-map level (omit `status_map.error.{app_name}` to suppress the recovery link for that app), not at the page-emission level.

## Decision 9 — Instanced actions (`key:`)

Some actions exist as N instances per workflow rather than a single instance. The v0 device-installation workflow has one `proof-of-installation` action per device; each instance carries its own form data and its own status.

v1 supports both patterns:

- **Instanced action (`key:`)** — one action type, N action docs, discriminated by `key`. Form data per instance.
- **Tracker + child workflow** (Decision 5) — N child workflows, each with its own actions.

Authors choose based on whether the child has its own lifecycle (then tracker) or is "just another row" of the same form (then `key:`).

### YAML shape

```yaml
type: proof-of-installation
kind: form
key: $device_id # the instance discriminator — symbolic; resolved at start time
sort_order: 140
form:
  - component: file_upload
    key: form.installation_files
    required: true
status_map:
  action-required:
    my-team-app:
      message: Awaiting installation of device {{ physical_id }}.
  done:
    my-team-app:
      message: Device {{ physical_id }} installation complete.
```

The `key:` value is a symbolic placeholder (`$device_id`). The app supplies concrete key values at workflow-start time (or via a later API call that fans out instances — see "Spawning instances" below). The engine writes one action doc per `(workflow_id, type, key)` triple; the action doc carries the resolved `key` value (e.g. `key: "device-123"`) plus any context fields the spawn payload supplies.

### Engine effects

- **Action identity is `(workflow_id, type, key)`** for instanced actions. Without `key:`, action identity is `(workflow_id, type)` and only one row exists per type.
- **Form data path** gains a key segment: `form_data.{action_type}.{key}.{field}` instead of `form_data.{action_type}.{field}`. Engine and resolvers both treat the key segment as required when the action declares `key:`.
- **`blocked_by` semantics.** A non-instanced action that references an instanced action by `blocked_by: [proof-of-installation]` unblocks when **all** instances reach a terminal status (`done` or `not-required`). An instanced action referencing another instanced action by the same `key` (e.g. fan-out chain on one device) is allowed; cross-key references are not (build-time rejected — apps that need cross-instance gating use a regular action with an explicit fan-in step).
- **Status-map message templating** has access to the instance's `key` and any spawn-time context fields.

### Spawning instances

Two paths:

1. **At workflow start.** The `start-workflow` payload's `actions:` list may include instance specs: `{ type: proof-of-installation, key: device-123, status: action-required }`. The engine writes one action doc per entry.
2. **Mid-workflow.** A pre-hook return's `actions[]` array (submit-pipeline Decision 4) can append `{ type: proof-of-installation, key: device-456, status: action-required, upsert: true }` to spawn a new instance. The engine inserts a new action doc; existing instances are unaffected.

Both paths flow through the same `SubmitWorkflowAction` engine handler (engine sub-design). No new public endpoint.

### Constraint: `key:` and `tracker:` are mutually exclusive

A tracker action can't be keyed. Tracker semantics depend on a 1:1 parent-action ↔ child-workflow link (Decision 5); instancing a tracker would break the cardinality. Build-time rejection.

## Open Questions

1. **`makeActionsForm` recursion across module boundaries (early-implementation spike required).** The resolver recursively invokes itself to build nested form sections (e.g. ControlledList inside a form). The recursion uses a relative path. When the resolver lives in the module package, the recursive `_ref` path inside templates is resolved against the _template's source location_ at template-render time, which goes through the module-loader. No existing modules-mongodb module uses `_ref: { resolver }` from inside a template, so this is genuinely untested. Before relying on the recursion, run a minimal spike: a template inside a module that calls `_ref: { resolver: <relative-path> }` and confirms the resolver runs and the path resolves correctly. If it doesn't, the form builder becomes a flat (non-recursive) emitter — apps that need nested form sections supply a per-action template override.

## Next Step

Implementation of the resolvers, components library, and authoring conventions. Apps write YAML against this surface; the [engine](../engine/design.md) sub-design consumes it at runtime; the [ui](../ui/design.md) sub-design renders it.
