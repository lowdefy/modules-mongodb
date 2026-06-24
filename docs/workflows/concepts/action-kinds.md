---
title: Action Kinds
module: workflows
type: concept
concepts: [form, check, tracker, kinds, instanced-actions, start-link, form-data]
---

# Workflows — Action kinds

Every action declares `kind:` as a required field. The kind drives page generation, submit API surface, and resolver behavior. Three values: `form`, `check`, `tracker`.

## Form actions (`kind: form`)

A form action captures domain-specific data from a user. It declares a `form:` block that describes the schema — a list of named field components that the build-time resolver turns into a Lowdefy block tree.

```yaml
type: qualify
kind: form
action_group: discovery
access:
  my-app:
    view: true
    edit: [account-manager]
form:
  - component: text_input
    key: form.contact_name
    title: Contact Name
    required: true
  - component: text_area
    key: form.notes
    title: Notes
```

**What the module emits for form actions:**
- A set of pages per declared verb: `{workflow_type}-{action_type}-edit`, `-view`, `-review`, `-error`. A page is only emitted when its verb key is present in the action's `access.{app_name}` map.
- One submit endpoint: `{workflow_type}-{action_type}-submit`. Every button on every page for this action calls this endpoint with a different `signal` value.

**Form data paths.** The engine writes submitted form fields to `form_data.{action_type}.{field}` on the workflow doc. For instanced actions (see below), the path gains a key segment: `form_data.{action_type}.{key}.{field}`.

**`form_review:` for reviewer-supplied fields.** When a form action declares the `review` verb, it may also declare a `form_review:` block alongside `form:`. The review page renders the submitter's `form:` values read-only above and `form_review:` as writable inputs below. Reviewer fields are stored in the same flat `form_data` namespace — choose non-colliding field names between `form:` and `form_review:`.

**Hooks.** Form actions can declare `hooks:` — pre/post hooks per signal, invoked by the engine at fixed points in the submit lifecycle. See [Hooks](hooks.md).

## Check actions (`kind: check`)

A check action is a lightweight task — no domain form, just the universal fields (`assignees`, `due_date`, `description`) and a comment. It uses the module's shared pages (`workflow-action-edit`, `workflow-action-view`, `workflow-action-review`) routed by `?action_id=<id>`.

```yaml
type: schedule-followup
kind: check
action_group: follow-up
blocked_by: [send-quote]
access:
  my-app:
    view: true
    edit: [account-manager]
```

**No per-action pages.** Check actions don't get per-action page sets. The shared pages handle all check actions via the query param.

**Same FSM as form.** The check kind uses the same FSM table as the form kind. `submit` is nullary — the target (`in-review` vs `done`) depends on whether the action declares the `review` verb, same as form actions. There is no status selector — the v0 "choose your target" dropdown is gone.

**Hooks.** Check actions can declare `hooks:` per signal. These follow the same contract as form action hooks.

## Tracker actions (`kind: tracker`)

A tracker action mirrors the lifecycle of a child workflow running on a different entity. Its status updates automatically whenever the child workflow transitions — you never submit a tracker action manually.

```yaml
type: track-installation
kind: tracker
action_group: setup
description: Tracks the device-installation workflow on the linked installation ticket.
blocked_by: [schedule-followup]
access:
  my-app:
    view: true
    edit: [account-manager]  # controls start-link visibility
tracker:
  workflow_type: device-installation
  start_link:
    pageId: ticket-new
    urlQuery:
      action_id: true   # substituted with tracker action _id at render time
      entity_id: true   # substituted with parent entity _id at render time
```

**No pages, no submit endpoint.** Tracker actions have no edit page and no resolver-emitted endpoint. The engine writes their status via the tracker subscription.

**How status mirrors.** The child workflow's stage maps to the tracker action's status:

| Child workflow stage | Parent tracker action status |
|---|---|
| `active` | `in-progress` |
| `completed` | `done` |
| `cancelled` | `not-required` |

This mapping is fixed by the module — no per-action override. Apps that need different semantics use a form action with a manual pre-hook mirror instead.

### `start_link` wiring

Before a child workflow exists, the tracker row sits at `action-required` with nothing for the user to click. `start_link` provides the navigation target for that state.

```yaml
tracker:
  workflow_type: device-installation
  start_link:
    pageId: ticket-new       # page where the user creates the child entity
    urlQuery:
      action_id: true        # → tracker action _id — pass as parent_action_id to start-workflow
      entity_id: true        # → parent entity _id — prefill the child doc's parent reference
      source: onboarding     # static params pass through verbatim
```

`action_id: true` and `entity_id: true` are the two reserved `urlQuery` keys. They substitute runtime values at render time. All other keys pass through as-is.

The link is active while the tracker is `action-required` with no `child_workflow_id`. Once a child is started (via `start-workflow` with `parent_action_id`), the link switches to the child entity's view page.

The `start_link` is only shown to users with the `edit` verb. Trackers without `edit` in their access map remain display-only regardless.

**When to use `start_link` vs a paired trigger action:**
- **App page owns creation → `start_link`.** When the child entity is created on a normal app page (a new-ticket form, etc.), add `start_link` to the tracker. No separate trigger action needed.
- **Inline form owns creation → paired trigger + tracker.** When creation is a small inline form with no existing app page, use a `kind: form` (or `kind: check`) trigger action to create the entity and call `start-workflow`, plus a separate tracker action to mirror the child's lifecycle.

### Linking parent and child at runtime

The bidirectional link between a tracker action and its child workflow is established by `start-workflow` in a single call:

```yaml
# In an app page or pre-hook — creating the child entity and starting its workflow
- id: create_ticket
  type: MongoDBInsertOne
  connectionId: tickets-collection
  properties: { ... }

- id: start_child_workflow
  type: CallApi
  endpointId:
    _module.endpointId: { id: start-workflow, module: workflows }
  payload:
    workflow_type: device-installation
    entity_id: { _step: create_ticket.insertedId }
    entity_collection: tickets-collection
    parent_action_id: { _state: parent_action_id }  # the tracker action's _id
```

One `CallApi` is all that's needed. The engine writes:
1. The new child workflow doc (with back-references to the parent).
2. The child's starting action docs.
3. The parent tracker action's `child_workflow_id`, `child_entity_id`, `child_entity_collection` fields, and the `in-progress` transition.

All in one server-side call. No follow-up API call to wire the link.

### Instanced actions and form data paths

Some actions exist as N instances per workflow — for example, one proof-of-installation action per device, each with its own form data and status.

**Declaring an instanced action:**
```yaml
type: proof-of-installation
kind: form
key: $device_id   # symbolic placeholder — resolved at start time
form:
  - component: file_upload
    key: form.installation_files
    required: true
status_map:
  action-required:
    my-app:
      message: "Awaiting installation of device {{ physical_id }}."
```

**Form data path changes.** For instanced actions, the engine writes to `form_data.{action_type}.{key}.{field}` instead of `form_data.{action_type}.{field}`. If you read form data from the workflow doc in a pre-hook or post-hook, account for the extra key segment.

**Spawning instances:**
- At workflow start: include `{ type: proof-of-installation, key: device-123, status: action-required }` in the `start-workflow` payload's `actions:` list.
- Mid-workflow: return `{ type: proof-of-installation, key: device-456, signal: activate, upsert: true }` from a pre-hook.

**`blocked_by` semantics for instanced actions.** A non-instanced action that references an instanced action type in `blocked_by` unblocks when **all** instances of that type reach a terminal status (`done` or `not-required`).

For the how-to guide on working with instanced actions, see [Instanced actions](../how-to/instanced-actions.md).
