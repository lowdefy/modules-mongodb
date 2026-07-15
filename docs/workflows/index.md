---
title: Workflows
module: workflows
type: index
concepts: [workflows, actions, fsm, signals, hooks, trackers]
---

# Workflows

Multi-workflow engine that lets apps declare workflow YAML, render entity-scoped action lists, and submit lifecycle transitions through engine-managed handlers. Submissions carry a **signal** that the engine resolves against a per-kind finite-state machine — authors do not hand-write status transitions. The engine ships two static overview pages, six operational APIs, and a resolver-emitted dynamic surface: a per-verb page set per form action, one `{workflow_type}-action` page per workflow with check actions, and one submit endpoint per form/check action, all derived from the app's `workflows_config`. Every action page renders in the same [three-tier workspace](concepts/action-pages.md).

## Dependencies

| Module                                                 | Why                                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [layout](../../modules/layout/README.md)               | Page wrapper consumed by every shared page                                                                          |
| [events](../../modules/events/README.md)               | Provides the `change_stamp` component and the `new-event` API the engine dispatches the per-invocation log event to |
| [notifications](../../modules/notifications/README.md) | Provides the `send-notification` InternalApi the engine dispatches after each committed event                       |
| [contacts](../../modules/contacts/README.md)           | Provides the `contact-selector` component wrapped by `contact` / `multiple_contact` form fields                     |
| [user-account](../../modules/user-account/README.md)   | Supplies the `user-multi-selector` and `user-avatar` components used by the universal-fields surface                |

The `events` and `notifications` dispatch targets are resolved at app build time via `_module.endpointId` into the `workflow-api` connection's `endpoints` property.

## When to use

Add `workflows` when an app needs multi-step business processes on any entity — where work items progress through defined stages with role-gated transitions, optional review steps, approval flows, and audit trails. Typical use cases include sales pipelines, onboarding checklists, compliance reviews, service orders, and any entity that needs a structured lifecycle managed across teams.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: workflows
    source: "github:lowdefy/modules-mongodb/modules/workflows@v0.6.0"
    vars:
      workflows_config:
        _ref: workflow_config/workflows.yaml
      app_name:
        _ref:
          path: app_config.yaml
          key: app_name
```

- `workflows_config` — the app's workflow YAML, one entry per workflow type with actions and optional `action_groups`. Validated at build time by `makeWorkflowsConfig`.
- `app_name` — the host app's deployment name. Filters per-action access via `access.{app_name}`. See [App name scoping](../shared/app-name.md).

Each workflow declares its own entity wiring (`connection_id`, `ref_key`, and the page link) in a per-workflow `entity:` block inside `workflows_config` — not as a module var. See [Authoring grammar](reference/authoring-grammar.md).

See [`apps/demo/modules/workflows/vars.yaml`](../../apps/demo/modules/workflows/vars.yaml) for a worked example.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions
- [Exports](reference/exports.md) — pages, components, API endpoints, connections
- [Indexes](reference/indexes.md) — required MongoDB indexes and the `actions` validator constraint
- [FSM and signals](reference/fsm-and-signals.md) — finite-state machine tables and the signal inventory
- [Form components](reference/form-components.md) — built-in form field components for action `form:` blocks
- [Authoring grammar](reference/authoring-grammar.md) — action YAML grammar (kinds, access, hooks, trackers, starting actions)

## Concepts

- [Mental model](concepts/mental-model.md) — workflows, actions, kinds, groups, and the engine at a glance
- [Signals vs status](concepts/signals-vs-status.md) — how the FSM resolves signal → status, why `force: true` is gone
- [Action kinds](concepts/action-kinds.md) — form, check, and tracker actions in depth
- [Action pages](concepts/action-pages.md) — the three-tier workspace, the per-workflow check page, and `entity_view`
- [Groups and blocking](concepts/groups-and-blocking.md) — `action_groups`, `blocked_by`, and the group unblock rule
- [Access](concepts/access.md) — per-app, per-verb role gates; how the engine collapses access server-side
- [Hooks](concepts/hooks.md) — pre/post hook phases, the `:return` shape, out-of-band vs. committed writes
- [Events](concepts/events.md) — the timeline events the engine emits per invocation

## How-to

- [Add a review step](how-to/add-a-review-step.md) — declare the `review` verb; how `submit` lands `in-review` vs `done`
- [Conditional actions](how-to/conditional-actions.md) — spawn actions from pre-hooks with `upsert: true`
- [Multi-app access](how-to/multi-app-access.md) — gate pages and links per app in a single workflow config
- [Track a child workflow](how-to/track-a-child-workflow.md) — tracker actions, `start_link`, `parent_action_id`
- [Instanced actions](how-to/instanced-actions.md) — keyed actions, `key` field, per-instance spawning
- [Write a hook](how-to/write-a-hook.md) — inline routines, `pre`/`post` phases, the `:return` shape
- [Migrate from a legacy workflow engine](how-to/migrate-from-a-legacy-workflow-engine.md) — map a hand-rolled, app-embedded engine onto the module

## Shared idioms

- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on every engine write
- [Event display](../shared/event-display.md) — per-app display titles on log events
- [Slots](../shared/slots.md) — consumer-extension slots on shared pages
- [App name scoping](../shared/app-name.md) — how `app_name` filters access and keys display data
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
