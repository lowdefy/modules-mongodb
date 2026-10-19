# Task 4: Author tracker-only onboarding + installation child workflow

## Context

`apps/demo/` currently has no `workflow_config/` directory and no workflows wired in. This task adds the worked-example workflow YAML that the demo will use to exercise the static surface end-to-end.

The demo has two workflows:

- **Parent — `onboarding`.** Three actions, all `kind: tracker`, declared on the `leads-collection` entity. Sequential `blocked_by` chain so the second is blocked until the first completes, third blocked until the second completes. Each tracker action points at the `installation` child `workflow_type` (per action-authoring/spec.md:99, `kind: tracker` requires `tracker:` with a real `workflow_type`).
- **Child — `installation`.** One `kind: task` action ("installation step") on the same entity. This is the spec's documented "minimal workflow shim" (action-authoring/spec.md:489). The child workflow's lifecycle is driven by direct `close-workflow` / `cancel-workflow` calls from the demo's lead-view buttons (task 7) — the child's `task-*` pages are intentionally NOT rendered in the demo UI in this part (see design § "Child workflow rendering — skipped in 20a").

The workflow YAML schema is owned by [part 4](../../04-workflow-config-schema/design.md)'s `makeWorkflowsConfig`. Action authoring contract: `designs/workflows-module-concept/action-authoring/spec.md`. The action_groups state machine lives in [part 7](../../07-group-state-machine/design.md). Notes from the action-authoring spec:

- Every workflow needs `starting_actions`.
- `kind: tracker` requires `tracker:` block with `workflow_type` (line 99).
- `key:` and `tracker:` are mutually exclusive (line 354).
- `kind: task` rejects both `form:` and `tracker:` (line 100).
- One `action_group` per action plus a starting-group; the engine uses `action_groups[]` index for declaration order.

The demo's `vars.workflows_config` will be wired in task 6 to `_ref: workflow_config/workflows.yaml`, which expects an array of workflow entries.

## Task

Create the following files under `apps/demo/workflow_config/`.

### `apps/demo/workflow_config/workflows.yaml`

The aggregated workflows array — a top-level `_ref` array that the demo's `vars.workflows_config` points at.

```yaml
- _ref: onboarding/onboarding.yaml
- _ref: installation/installation.yaml
```

### `apps/demo/workflow_config/onboarding/onboarding.yaml`

Workflow definition for the parent. Three tracker actions, sequential `blocked_by` chain, one action_group per action plus a starting group. The `entity_collection` is `leads-collection`. Skeleton:

```yaml
type: onboarding
entity_collection: leads-collection
display_order: 1

starting_actions:
  - type: track-step-1
    status: action-required

action_groups:
  - id: g1
  - id: g2
    blocked_by: [g1]
  - id: g3
    blocked_by: [g2]

actions:
  - _ref: track-step-1.yaml
  - _ref: track-step-2.yaml
  - _ref: track-step-3.yaml
```

### `apps/demo/workflow_config/onboarding/track-step-1.yaml`, `track-step-2.yaml`, `track-step-3.yaml`

Three tracker action files. Each has `kind: tracker`, points at the `installation` child workflow type via `tracker:`, declares its action_group, and (for steps 2 and 3) its `blocked_by` predecessor action. Universal shape (replace `N` with `1`/`2`/`3`):

```yaml
type: track-step-N
kind: tracker
action_group: gN
sort_order: N
description: Track installation step N.
access:
  demo:
    roles: [admin]
    verbs: [view]
status_map:
  in-progress:
    demo:
      message: "Installation step N in progress."
  done:
    demo:
      message: "Installation step N complete."
  not-required:
    demo:
      message: "Installation step N skipped."
tracker:
  workflow_type: installation
```

For step 2 and step 3, add at the top:

```yaml
blocked_by:
  - type: track-step-1 # for step 2; track-step-2 for step 3
```

### `apps/demo/workflow_config/installation/installation.yaml`

The minimal child workflow. One `kind: task` action.

```yaml
type: installation
entity_collection: leads-collection
display_order: 2

starting_actions:
  - type: install-step
    status: action-required

action_groups:
  - id: g1

actions:
  - _ref: install-step.yaml
```

### `apps/demo/workflow_config/installation/install-step.yaml`

The single task action.

```yaml
type: install-step
kind: task
action_group: g1
sort_order: 1
description: Installation step.
access:
  demo:
    roles: [admin]
    verbs: [view]
status_map:
  in-progress:
    demo:
      message: "Installation step in progress."
  done:
    demo:
      message: "Installation step complete."
  not-required:
    demo:
      message: "Installation step skipped."
```

## Acceptance Criteria

- `apps/demo/workflow_config/workflows.yaml` exists and resolves to a two-element array of workflow objects.
- `apps/demo/workflow_config/onboarding/` contains `onboarding.yaml` + three `track-step-N.yaml` files.
- `apps/demo/workflow_config/installation/` contains `installation.yaml` + `install-step.yaml`.
- Every tracker action has a `tracker:` block with `workflow_type: installation`.
- Sequential `blocked_by` chain wired (step 2 blocked by step 1, step 3 blocked by step 2).
- All actions reference real `action_group` IDs declared in their workflow's `action_groups[]`.
- After tasks 2 + 5 + 6 land and the demo wires this via `workflows_config`, the part 4 build validator passes (no missing `entity_collection` keys in `vars.entities`; every action has the required schema fields).
- The schema in `designs/workflows-module-concept/action-authoring/spec.md` accepts every authored field (no extras that the validator rejects).

## Files

- `apps/demo/workflow_config/workflows.yaml` — **create**
- `apps/demo/workflow_config/onboarding/onboarding.yaml` — **create**
- `apps/demo/workflow_config/onboarding/track-step-1.yaml` — **create**
- `apps/demo/workflow_config/onboarding/track-step-2.yaml` — **create**
- `apps/demo/workflow_config/onboarding/track-step-3.yaml` — **create**
- `apps/demo/workflow_config/installation/installation.yaml` — **create**
- `apps/demo/workflow_config/installation/install-step.yaml` — **create**

## Notes

- `access.{app_name}` uses `demo` as the app name (matches `apps/demo/app_config.yaml`'s `app_name: demo`). Confirm by reading `app_config.yaml` before wiring.
- The demo deliberately uses minimal `access.roles: [admin]` so a demo user with `roles: [admin]` can exercise every action. Adjust to `[]` (open) only if `apps/demo`'s auth strategy already authenticates a non-admin demo user.
- `kind: tracker` actions emit no per-action pages — only the universal-fields-style inline display in `actions-on-entity` (per the concept spec, "tracker → no pages (inline display)").
- Do not add `hooks:`, `interactions:`, `event:`, `form:`, or `form_review:` blocks — those are 20b territory.
- The child `installation` workflow's `install-step` action does NOT declare `tracker:` or `form:` (per action-authoring/spec.md:100, `kind: task` rejects both).
