# Task 5: Tracker-mirror override channel in `planTrackerLevel`

## Context

When a child workflow changes state, the tracker cascade fires `internal_mirror_child_{active,completed,cancelled}` against the parent's tracker action, and `planTrackerLevel` (`plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planTrackerLevel.js`) plans the mirror event. It already resolves the parent tracker's `actionConfig` (`:80–82`) but calls `planEventDispatch` with **no override argument** (`:140–151`), so the event always renders the engine default `"Tracker mirrored child {{ status_after }}"`.

Part 48 D4 opens this channel. The pieces are already in place:

- Task 3's seam: during the child's cascade, each parent level re-loads through `loadWorkflowState`, which splices that parent's `event_overrides` (delivered via the originating endpoint's `render_config` ancestor bundle, task 8) onto its tracker `actionConfig`. So `actionConfig.event_overrides?.[signal]` is in scope right here.
- Task 2's gate: `planEventDispatch` now merges whenever an override slice is present.

Authoring lives on the parent's tracker action: `event: { internal_mirror_child_completed: { display: { {app}: { title: "{{ ticket }} closed by {{ agent }}" } } } }` (validated in task 7, emitted into `render_config` in task 8).

## Task

In `planTrackerLevel.js`, pass the mirror override slice into the event dispatch (`:140–151`):

```js
const event = planEventDispatch({
  event_id,
  user: now?.user,
  handlerType: 'tracker-mirror',
  signal,
  plannedWorkflowDoc,
  plannedActionDoc: targetEntry.doc,
  status_before,
  status_after,
  allTouchedActionDocs: [targetEntry.doc],
  connection,
  yamlEventOverrides: actionConfig.event_overrides?.[signal],
});
```

`signal` here is the cascade mirror signal (`internal_mirror_child_*`), so the lookup key is the mirror signal itself — same keying convention as the submit path (`event_overrides` keyed by triggering signal).

Update the file's JSDoc (the "Differences from planSubmit" block) to note the mirror event now honors the parent tracker action's `event_overrides[mirror signal]` when present.

Tests (`planTrackerLevel.test.js`):

- `actionConfig.event_overrides.internal_mirror_child_completed` present on the tracker config → planned event display reflects the override (title replaced; render context is the action-event context, so `{{ status_after }}`-style references still work).
- No `event_overrides` on the config → engine default `"Tracker mirrored child …"` unchanged (existing tests).

## Acceptance Criteria

- Override present → merged event; absent → today's default. Both under test.
- `pnpm test` passes in `plugins/modules-mongodb-plugins`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planTrackerLevel.js` — modify — thread override into `planEventDispatch` + JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planTrackerLevel.test.js` — modify — override tests.

## Notes

- `planTrackerLevel` stays pure — the override arrives on `actionConfig` via the load-phase seam, not via `params`. Don't read `context`/`params` here.
- The mirror render context is the action-event context (`{ user, action, workflow, signal, status_before, status_after, submitted_form }`), unlike lifecycle overrides (task 6).
