# Task 17: Shared `event_types` Ref

## Context

After Task 1, the activities module ships `enums/event_types.yaml` listing the six event types it emits (create-activity, update-activity, complete-activity, cancel-activity, reopen-activity, delete-activity). The shared `modules/shared/enums/event_types.yaml` is the canonical merged registry that app-level `event_types` aggregations pull from. This task adds a single `_ref` line to that shared file.

The shared file uses `_build.object.assign` over multiple module-level event_types files. Pre-task, it includes user-admin, user-account, contacts, companies. After this task, it also includes activities.

This task can run early — it has only Task 1 as a dependency.

Reference: `modules/shared/enums/event_types.yaml` is the file. Read it to confirm the exact structure (assign-chain, ref order, etc.).

## Task

### `modules/shared/enums/event_types.yaml` (modify)

Read the existing file. It's likely shaped like:

```yaml
_build.object.assign:
  - _ref: ../../user-admin/enums/event_types.yaml
  - _ref: ../../user-account/enums/event_types.yaml
  - _ref: ../../contacts/enums/event_types.yaml
  - _ref: ../../companies/enums/event_types.yaml
```

Add an entry for activities:

```yaml
_build.object.assign:
  - _ref: ../../user-admin/enums/event_types.yaml
  - _ref: ../../user-account/enums/event_types.yaml
  - _ref: ../../contacts/enums/event_types.yaml
  - _ref: ../../companies/enums/event_types.yaml
  - _ref: ../../activities/enums/event_types.yaml   # add
```

The order matters only if event-type keys collide (later entries override earlier). Activities' six event types (`create-activity`, etc.) are unique to this module, so order is non-load-bearing. Append at the end for clarity.

## Acceptance Criteria

- `modules/shared/enums/event_types.yaml` includes a `_ref` to `activities/enums/event_types.yaml` in its assign chain.
- An app-level build that aggregates `shared.event_types` resolves all six activities event types — visible in the merged object as `create-activity`, `update-activity`, `complete-activity`, `cancel-activity`, `reopen-activity`, `delete-activity`, each with `title`, `color`, `icon`.
- The events module's `event_types` component (which merges `shared.event_types` with its own additions per `events/module.lowdefy.yaml:63-67`) now picks up activities event types automatically.
- Build is clean.

## Files

- `modules/shared/enums/event_types.yaml` — modify — add `_ref` to activities event_types.

## Notes

- **Read the file first** to confirm the exact path style. The relative path depends on whether `shared/enums/event_types.yaml` lives at depth 3 (so `../../activities/enums/event_types.yaml`) or somewhere else. Check before editing.
- **One-line change.** Don't restructure the file. Just append the activities entry.
- **The events module already merges `shared.event_types`** with its module-var additions. Activities' event types arrive automatically through this chain — no changes needed in the events module.
