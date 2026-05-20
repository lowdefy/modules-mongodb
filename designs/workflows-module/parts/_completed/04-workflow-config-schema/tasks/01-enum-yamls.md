# Task 1: Ship the two fixed status enums

## Context

The workflows module ships two **closed-vocabulary** enums that the engine and consuming apps reference by status name. They are static YAML files — no resolver, no computation. Per the concept doc ([workflows-module-concept/action-authoring/design.md](../../../workflows-module-concept/action-authoring/design.md) "Action status enum"):

- **`action_statuses`** is an object keyed by status name (`not-required`, `error`, ..., `blocked`), each carrying `priority`, `title`, `color`, `borderColor`, `titleColor`, optional `icon`. The engine reads `priority` for the priority-rule check inside `SubmitWorkflowAction` — `newStatus.priority < currentStatus.priority` is rejected (with the same-stage and `force: true` exceptions). The other fields are display-only; the engine doesn't read them. Apps override display per-status via `vars.action_statuses_display`; the override merges via `_build.object.assign` into a UI-facing component (`action_statuses`) declared in `module.lowdefy.yaml`. The engine reads the canonical enum file directly from the manifest's connection wiring (part 20), so display overrides cannot affect engine priority logic — channel separation, not whitelist enforcement.

- **`workflow_lifecycle_stages`** is an object keyed by stage name (`active`, `completed`, `cancelled`). **No `priority`** — the engine doesn't apply the priority rule to workflow status pushes (those are guarded by an idempotent same-stage no-op check inside `pushWorkflowStatus`). Same display-field shape minus priority.

The shape is **object-keyed**, not an array of entries. This matters because:
- The override mechanism merges by status name (`vars.action_statuses_display.action-required.title`).
- Engine reads via `enum[status].priority`, not `enum.find(...)`.
- The shape mirrors the events module's `event_display` family pattern.

## Task

Create two YAML files under `modules/workflows/enums/`. Both are top-level YAML objects (not arrays).

### 1. `modules/workflows/enums/action_statuses.yaml`

Exact content:

```yaml
not-required:
  color: '#d9d9d9'
  borderColor: '#8c8c8c'
  titleColor: '#434343'
  title: Not Required
  priority: 0
blocked:
  color: '#efefef'
  borderColor: '#aeaeae'
  titleColor: '#595959'
  title: Blocked
  priority: 7
action-required:
  color: '#e6f7ff'
  borderColor: '#91d5ff'
  titleColor: '#096dd9'
  title: Action Required
  priority: 6
in-progress:
  color: '#e6fffb'
  borderColor: '#87e8de'
  titleColor: '#08979c'
  title: In Progress
  priority: 5
in-review:
  color: '#f9f0ff'
  borderColor: '#d3adf7'
  titleColor: '#531dab'
  title: In Review
  priority: 4
done:
  color: '#f6ffed'
  borderColor: '#b7eb8f'
  titleColor: '#389e0d'
  title: Done
  priority: 3
changes-required:
  color: '#fff7e6'
  borderColor: '#ffc069'
  titleColor: '#d46b08'
  title: Changes Required
  priority: 2
error:
  color: '#fff1f0'
  borderColor: '#ff7875'
  titleColor: '#cf1322'
  title: Alert
  priority: 1
```

### 2. `modules/workflows/enums/workflow_lifecycle_stages.yaml`

Exact content:

```yaml
active:
  color: '#e6f7ff'
  borderColor: '#91d5ff'
  titleColor: '#096dd9'
  title: Active
completed:
  color: '#f6ffed'
  borderColor: '#b7eb8f'
  titleColor: '#389e0d'
  title: Completed
cancelled:
  color: '#fafafa'
  borderColor: '#d9d9d9'
  titleColor: '#595959'
  title: Cancelled
```

## Acceptance Criteria

- Both files exist at the exact paths above.
- `action_statuses.yaml` has exactly the 8 top-level keys: `not-required`, `error`, `changes-required`, `done`, `in-review`, `in-progress`, `action-required`, `blocked`.
- Each `action_statuses` entry has `priority` (integer 0–7), `title`, `color`, `borderColor`, `titleColor`. No `icon` field on any entry.
- The 8 priorities are exactly: `not-required` (0), `error` (1), `changes-required` (2), `done` (3), `in-review` (4), `in-progress` (5), `action-required` (6), `blocked` (7).
- `workflow_lifecycle_stages.yaml` has exactly 3 top-level keys: `active`, `completed`, `cancelled`. Each has `title`, `color`, `borderColor`, `titleColor`. **No `priority`** on any entry.

## Files

- `modules/workflows/enums/action_statuses.yaml` — create
- `modules/workflows/enums/workflow_lifecycle_stages.yaml` — create

## Notes

- **Shape is object-keyed, not array-of-entries.** A previous draft of this task used `- value: not-required, priority: 0` array entries; that's wrong. The concept doc and the override mechanism both require object-keyed shape.
- **Priorities are load-bearing for engine logic.** Do not reorder or renumber.
- **Lifecycle stages explicitly omit `priority`.** Per concept doc: workflow status pushes use an idempotent same-stage no-op check, not the priority rule.
- **Display attributes are kept in the shipped file** because the override merge (in `module.lowdefy.yaml` via `_build.object.assign`) layers *over* the shipped defaults. Apps that want different titles/colors override; apps that don't get the defaults shipped here.
- **Two consumers, two paths.** The manifest exposes a merged `action_statuses` component for UI consumption (apps wire it into `global.enums.action_statuses` themselves). The engine reads the canonical YAML file directly via the connection wiring (lands in part 20). Display overrides reach UI only.
