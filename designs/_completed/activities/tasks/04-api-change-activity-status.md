# Task 4: API — `change-activity-status` + Action Wrappers

## Context

After Task 3, two APIs exist (`create-activity`, `update-activity`). This task adds the third API — `change-activity-status` — plus three CallApi action-sequence wrappers (`complete_activity`, `cancel_activity`, `reopen_activity`) that hardcode the target stage so UI buttons can trigger transitions with one click.

`change-activity-status` is a deliberately separate API from `update-activity` for two reasons (per `decisions.md` "Non-questions worth recording"): (1) the UI gets one-click action buttons without a full form submit, (2) the right event type per transition fires without the API having to diff input vs stored state.

The routine is a deliberate **departure from `update-company.yaml`** — it loads the activity first, then updates with optimistic concurrency on both `status[0].stage` and `updated.timestamp`. The load step buys idempotency on concurrent same-direction flips: if user A marks done and user B clicks Mark done before refetching, B silently succeeds rather than getting a stale-state error. See `design.md`'s `change-activity-status` section step 1 note for the rationale.

## Task

### `modules/activities/api/change-activity-status.yaml`

```yaml
id: change-activity-status
type: Api
routine:
  - id: load
    type: MongoDBAggregation
    connectionId:
      _module.connectionId: activities-collection
    properties:
      pipeline:
        - $match:
            _id:
              _payload: activity_id
            removed.timestamp:
              $exists: false
        - $project:
            _id: 1
            type: 1
            title: 1
            contact_ids: 1
            company_ids: 1
            status: 1
            updated: 1

  # Idempotent no-op: if current stage is already the requested stage, return without writing or emitting.
  # Implement via _if guard on subsequent steps, or via the MongoDBUpdateOne missing the filter (matchedCount:0 → no event).
  # Cleanest: gate the update + emit on _ne(load.0.status.0.stage, _payload.stage).

  - id: update
    type: MongoDBUpdateOne
    connectionId:
      _module.connectionId: activities-collection
    properties:
      filter:
        _id:
          _payload: activity_id
        status.0.stage:
          _step: load.0.status.0.stage
        updated.timestamp:
          _step: load.0.updated.timestamp
      update:
        $set:
          updated:
            _ref:
              module: events
              component: change_stamp
        $push:
          status:
            $each:
              - stage:
                  _payload: stage
                created:
                  _ref:
                    module: events
                    component: change_stamp
            $position: 0

  - id: new-event
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: new-event
          module: events
      payload:
        # Map stage to event_type
        type:
          _if:
            test:
              _eq:
                - _payload: stage
                - done
            then: complete-activity
            else:
              _if:
                test:
                  _eq:
                    - _payload: stage
                    - cancelled
                then: cancel-activity
                else: reopen-activity
        display:
          # Same _build.object.fromEntries / _build.array.map iteration as create-activity / update-activity.
          # The event_display lookup key must match the runtime-resolved event type above.
          # Use _build.* iteration over the merged event_display, dispatching on _payload.stage at runtime.
          ...
        references:
          contact_ids:
            _step: load.0.contact_ids
          company_ids:
            _step: load.0.company_ids
          activity_ids:
            - _payload: activity_id
        metadata:
          activity_id:
            _payload: activity_id

  - :return:
      previous_stage:
        _step: load.0.status.0.stage
      new_stage:
        _payload: stage
```

**Important:** `$each` is required whenever `$position` is specified in `$push` — without it MongoDB rejects the update. The `[ stage, created ]` object goes inside `$each`'s array.

The display-block runtime dispatch on event type is non-trivial — the merged `event_display` has separate templates per event type, and the API needs to render the one matching the runtime-computed `type` (complete/cancel/reopen). Two options:
- **(a)** Build all three template-rendered titles at build time (one per event type) and pick at runtime via `_if`. Verbose but works.
- **(b)** Restructure the `display` build chain to use `_payload.stage` as the iteration key. Closer to the `update-company` shape but needs a stage→event-type mapping inside the build operators.
Implementer's call — verify by emitting all three transitions and confirming the right template lands in the events collection.

### Action wrappers

Three thin CallApi action sequences. Each calls `change-activity-status` with `stage` hardcoded.

**`modules/activities/actions/complete_activity.yaml`:**

```yaml
- id: complete
  type: CallApi
  params:
    endpointId: change-activity-status
    payload:
      activity_id:
        _payload: activity_id
      stage: done
```

**`modules/activities/actions/cancel_activity.yaml`** — same shape, `stage: cancelled`.

**`modules/activities/actions/reopen_activity.yaml`** — same shape, `stage: open`.

These are referenced by UI elements (Mark done button, Cancel button, Reopen button) on the detail page, list rows, and tile rows. They're not exported cross-module — they live as internal action-sequence components consumed by this module's own pages and the table row actions.

### Manifest update

Add `- _ref: api/change-activity-status.yaml` to the manifest's `api:` list.

## Acceptance Criteria

- `modules/activities/api/change-activity-status.yaml` exists; the API endpoint is registered.
- Calling with `{ activity_id, stage: 'done' }` on an `open` activity:
  - Loads the activity.
  - Pushes `{ stage: 'done', created: change_stamp }` to position 0 of `status`.
  - Refreshes `updated.timestamp`.
  - Emits a `complete-activity` event with `references.contact_ids` and `references.company_ids` from the loaded doc, and `metadata.activity_id`.
- Calling with `stage: 'cancelled'` emits `cancel-activity`. Calling with `stage: 'open'` (on a done/cancelled activity) emits `reopen-activity`.
- Concurrent same-direction flips: two clients both clicking Mark done in quick succession — only one push lands, second silently succeeds with no extra event. (Idempotent no-op step gates this.)
- Stale timestamp / stale stage: filter misses, update no-ops, no event.
- The three action wrappers exist and call the API with the right stage hardcoded.
- Build is clean.

## Files

- `modules/activities/api/change-activity-status.yaml` — create — load-then-update routine with $each+$position.
- `modules/activities/actions/complete_activity.yaml` — create — `stage: done` wrapper.
- `modules/activities/actions/cancel_activity.yaml` — create — `stage: cancelled` wrapper.
- `modules/activities/actions/reopen_activity.yaml` — create — `stage: open` wrapper.
- `modules/activities/module.lowdefy.yaml` — modify — add `_ref: api/change-activity-status.yaml` to the `api:` list.

## Notes

- **Load-step rationale.** This is the only API in the module that loads before updating. Don't "fix" it to match `update-company.yaml`'s load-less pattern — see the inline note in `design.md` step 1 of the routine. The departure is intentional for idempotent UX on concurrent flips.
- **`$each` + `$position` is mandatory.** MongoDB rejects `$push` with `$position` if `$each` is missing. Don't shortcut to `$push: { status: { stage, created } }`.
- **Bumping `updated.timestamp` is required.** Without it, the default sort (`updated.timestamp desc`) wouldn't reflect status flips — see `decisions.md` §3.
- **The optimistic-concurrency filter on `status.0.stage`** prevents two simultaneous "Mark done" clicks from each pushing a `done` entry. Only the first lands; the second's filter misses.
- Action wrappers use the action-sequence shape, not the `Api` config. They don't go in `api:` — they go in `actions/` as standalone YAML files and are consumed via `_ref` from blocks' `events.onClick` (or similar). See the API surface intro in `design.md` for the framing.
