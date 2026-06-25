---
title: Mental Model
module: workflows
type: concept
concepts: [workflows, actions, kinds, groups, engine, mental-model]
---

# Workflows — Mental model

The `workflows` module gives an app structured, multi-step business processes on any entity. Drop it in, describe your processes in YAML, and get persistent action lists, role-gated transitions, audit trails, and a shared UI surface — without writing lifecycle orchestration code yourself.

## The three building blocks

**A workflow** is a named process type (`onboarding`, `device-installation`, …) attached to one entity. When your app calls `start-workflow`, the engine writes one workflow doc and N action docs — one per action declared in the config.

**An action** is one step inside a workflow. Every action has a status that progresses through a fixed lifecycle (`blocked → action-required → in-progress → done`, with review and error paths). Actions come in three kinds (see below).

**An action group** is a named phase that groups related actions. Groups have their own derived status (`blocked / in-progress / done`) and can be referenced in `blocked_by` — so you can say "Phase 2 starts when Phase 1 is done" in a single line rather than listing every Phase 1 action.

## Action kinds

The `kind:` field is required on every action. Three values:

| Kind | What authors write | How users interact |
|---|---|---|
| `form` | `kind: form` + a `form:` block | Opens a dedicated edit page with the declared form schema |
| `check` | `kind: check` (no `form:`, no `tracker:`) | Opens a shared edit page with assignee + due-date + comment inputs |
| `tracker` | `kind: tracker` + a `tracker:` block | Renders inline; mirrors a child workflow's lifecycle automatically |

A **form action** is for domain-specific data capture. A **check action** is for lightweight task tracking ("did this happen?"). A **tracker action** is a live link to another workflow running on a different entity — its status updates automatically when the child workflow transitions.

## How transitions happen

Every status change is driven by a **signal** — a named message fired against an action. The engine looks up `(currentStatus, signal) → newStatus` in a per-kind table. You never hard-code target statuses; you fire intent ("`submit`", "`approve`", "`not_required`") and the engine resolves where the action lands.

This means:
- The `submit` signal lands `in-review` if the action has a `review` verb declared in its `access` map, otherwise `done`.
- Signals against states that don't listen to them no-op silently — re-fires are structurally safe.
- Pre-hooks can emit signals against other actions, but the current action always lands per the signal the user fired.

For the full signal vocabulary and FSM tables, see [FSM and signals](../reference/fsm-and-signals.md). For the conceptual explanation, see [Signals vs status](signals-vs-status.md).

## A minimal end-to-end example

A generic onboarding workflow on a `lead` entity. Four actions, one per kind:

**Config (workflow YAML):**

```yaml
type: onboarding
entity_collection: leads-collection
display_order: 1
action_groups:
  - id: discovery
    title: Discovery
  - id: follow-up
    title: Follow-up
  - id: setup
    title: Setup
starting_actions:
  - { type: qualify, status: action-required }
  - { type: send-quote, status: blocked }
  - { type: schedule-followup, status: blocked }
  - { type: track-installation, status: blocked }
actions:
  - _ref: ./qualify.yaml            # form action, action_group: discovery
  - _ref: ./send-quote.yaml         # form action, blocked_by: [qualify]
  - _ref: ./schedule-followup.yaml  # check action, blocked_by: [send-quote]
  - _ref: ./track-installation.yaml # tracker action, blocked_by: [schedule-followup]
```

**Runtime sequence:**

1. Lead created → app calls `start-workflow`. Engine writes one workflow doc + four action docs (`qualify` at `action-required`; the others at `blocked`).
2. Lead page calls `get-entity-workflows` and renders the action list via the `actions-on-entity` component.
3. User clicks `qualify` → navigates to the form-action edit page. Submits → engine runs pre-hook → resolves `submit` signal → `qualify` moves to `done`, `send-quote` unblocks to `action-required`.
4. After `send-quote` completes, `schedule-followup` unblocks. User sets a due date and submits → check action moves to `done`, `track-installation` unblocks.
5. An installation ticket is created elsewhere. App code calls `start-workflow` with `parent_action_id` pointing at the tracker action. Engine links both sides. The tracker action moves to `in-progress`.
6. When the device-installation workflow completes, the engine's tracker subscription fires automatically — tracker action moves to `done`.

## What the module ships

- **Engine.** A `WorkflowAPI` plugin connection with three handlers: `StartWorkflow`, `SubmitWorkflowAction`, `CancelWorkflow`. Runs server-side; handles FSM resolution, summary writeback, group status, tracker subscription, hooks, log events, and notifications dispatch.
- **Operational read APIs (static).** `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview` — callable from any app page.
- **Resolver-emitted surface.** `makeActionPages` generates per-action page sets for form actions. `makeWorkflowApis` generates the per-type lifecycle endpoints (`{workflow_type}-start` / `-cancel` / `-close`) and one `{workflow_type}-{action_type}-submit` endpoint per form/check action. Both are derived automatically from your `workflows_config` — the lifecycle endpoints are type-scoped, so callers build the id from the workflow type rather than passing it in the payload.
- **Shared action pages.** `workflow-action-edit`, `workflow-action-view`, `workflow-action-review` for check actions; shared by all check actions via `?action_id=<id>` routing.
- **Entity-page components.** `actions-on-entity` (renders grouped action lists), `workflow-header`, `action_role_check`.
- **Form components library.** 27 named components (`text_input`, `date_selector`, `controlled_list`, …) you reference by name in action `form:` blocks.

See [Exports](../reference/exports.md) for the full list.
