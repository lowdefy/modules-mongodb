# Task 6: Delete the workflows-module timeline duplicate; de-register from `WorkflowAPI`

## Context

With the unified, self-enriching events timeline live (task 4) and the demo pointed
at it (task 5), the workflows module's timeline duplication is now dead and can be
removed. The duplication is the artefact of Part 46 D6's two-timeline split, which
this part supersedes.

What is being removed (Part 50 change 5):

- `modules/workflows/components/workflows-events-timeline.yaml` — the
  action-enriched timeline component (replaced by the events module's `events-timeline`).
- `modules/workflows/requests/get_events_timeline.yaml` — the `GetEventsTimeline`
  request on the `workflow-api` connection.
- The manifest export + component entry for `workflows-events-timeline`.
- The `WorkflowAPI`-bound `GetEventsTimeline` request wiring (the entry in
  `WorkflowAPI.js`'s `requests` map). After task 3, `GetEventsTimeline` is exposed
  on the new `EventsTimeline` connection, so `WorkflowAPI` no longer needs it.

What is **kept**:

- `modules/workflows/components/check-action-click.yaml` — `actions-on-entity`
  (ActionSteps) still uses it as its `onActionClick`. The events timeline carries
  its own inline copy (task 4); this workflows copy stays for `actions-on-entity`.
- The `GetEventsTimeline` engine handler file
  (`plugins/.../WorkflowAPI/GetEventsTimeline/GetEventsTimeline.js`) — it stays in
  place and is imported by the `EventsTimeline` connection (task 3). Only the
  `WorkflowAPI` registration of it is removed.

## Task

### 1. Delete the workflows timeline component + request

- Delete `modules/workflows/components/workflows-events-timeline.yaml`.
- Delete `modules/workflows/requests/get_events_timeline.yaml`.

### 2. Clean the workflows manifest (`modules/workflows/module.lowdefy.yaml`)

- Remove the `exports.components` entry for `workflows-events-timeline` (~line 142).
- Remove the `components:` `_ref` entry for `workflows-events-timeline` (~line 173).
- Check `contacts_collection` (workflows var, ~line 116): its description says it is
  "the timeline lookup (GetEventsTimeline) joins to resolve each event author's
  avatar." With the timeline gone from the workflows module, audit whether the
  workflows module still uses `contacts_collection` anywhere (e.g. the
  `workflow-api` connection's `contactsCollection` for the overview engines'
  contact resolution). If still used, keep the var but correct the description; if
  unused after this deletion, remove it. **Verify by grep** before deciding —
  do not remove a still-referenced var.

### 3. De-register `GetEventsTimeline` from `WorkflowAPI`

In `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js`:

- Remove the `import GetEventsTimeline from './GetEventsTimeline/GetEventsTimeline.js';`
- Remove `GetEventsTimeline` from the `requests` map.

Leave the handler files (`GetEventsTimeline.js`, `GetEventsTimeline.test.js`) in
place — the `EventsTimeline` connection imports the handler from there.

Audit `WorkflowAPI/schema.js`: `eventsCollection` and `contactsCollection` were
added for the now-removed `WorkflowAPI`-bound `GetEventsTimeline`. If no remaining
`WorkflowAPI` request reads them, remove them from the schema; if the overview
engines still read `contactsCollection` (contact resolution), keep it and remove
only `eventsCollection`. **Verify by grep** which `WorkflowAPI` requests read each
field before removing.

### 4. Docs reference (`docs/workflows/reference/exports.md`)

Remove the `workflows-events-timeline` row (~line 47) and the mention of it in the
`check-action-click` row (~line 46) — `check-action-click` is now baked into
`actions-on-entity` only (within the workflows module). (Broader docs prose is
handled in task 7; this is the exports-table correction co-located with the
deletion.)

## Acceptance Criteria

- `modules/workflows/components/workflows-events-timeline.yaml` and
  `modules/workflows/requests/get_events_timeline.yaml` no longer exist.
- The workflows manifest no longer exports or `_ref`s `workflows-events-timeline`.
- `WorkflowAPI.js` no longer imports or registers `GetEventsTimeline`;
  `EventsTimeline` still does.
- `check-action-click.yaml` still exists and is still wired into `actions-on-entity`.
- Any `WorkflowAPI/schema.js` fields left dead by the de-registration are removed;
  fields still read by remaining `WorkflowAPI` requests are kept (decision recorded
  by grep evidence).
- `grep -rn "workflows-events-timeline\|get_events_timeline" modules/ apps/` returns
  nothing (request id and component fully gone).
- `pnpm --filter @lowdefy/modules-mongodb-plugins test` passes (handler still imported by `EventsTimeline`).
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds.

## Files

- `modules/workflows/components/workflows-events-timeline.yaml` — delete.
- `modules/workflows/requests/get_events_timeline.yaml` — delete.
- `modules/workflows/module.lowdefy.yaml` — modify — remove export + component `_ref`; audit `contacts_collection` var.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/WorkflowAPI.js` — modify — drop the `GetEventsTimeline` import + registration.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — remove fields left dead (grep-verified).
- `docs/workflows/reference/exports.md` — modify — remove the `workflows-events-timeline` row; fix the `check-action-click` row.

## Notes

- Ordering: this must come **after** task 5 (demo repoint) — the demo references
  `workflows-events-timeline` and `get_events_timeline` until then, so deleting
  earlier breaks the build.
- The `GetEventsTimeline` handler now lives under a `WorkflowAPI/` directory but is
  only used by the `EventsTimeline` connection. Relocating the file is out of scope
  (the design's Files-changed list keeps it where it is); leave it.
