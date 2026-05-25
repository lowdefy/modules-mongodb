# Task 5: API — `delete-activity` (Soft-Delete)

## Context

After Task 4, three APIs exist (create, update, change-status). This task adds the fourth: `delete-activity`. It's a soft-delete — sets `removed: change_stamp` and bumps `updated`, then emits a `delete-activity` event. Dedicated single-purpose endpoint (per `decisions.md` "Non-questions worth recording") rather than smuggling `removed` through `update-activity`.

The reason for a dedicated endpoint: keeps `update-activity`'s editable-fields list clean, makes the event-emission contract obvious from the call site (the detail page's "Delete" button calls `delete-activity`, end of story), mirrors the precedent set by `change-activity-status` and the files module's `delete-file`.

## Task

### `modules/activities/api/delete-activity.yaml`

```yaml
id: delete-activity
type: Api
routine:
  # Load needed for references (contact_ids, company_ids) on the emitted event,
  # since the payload only carries activity_id.
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
            updated: 1

  - id: soft-delete
    type: MongoDBUpdateOne
    connectionId:
      _module.connectionId: activities-collection
    properties:
      filter:
        _id:
          _payload: activity_id
        updated.timestamp:
          _step: load.0.updated.timestamp  # optimistic concurrency
      update:
        $set:
          removed:
            _ref:
              module: events
              component: change_stamp
          updated:
            _ref:
              module: events
              component: change_stamp

  - id: new-event
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: new-event
          module: events
      payload:
        type: delete-activity
        display:
          # Same _build.object.fromEntries / _build.array.map iteration as the other emit sites.
          # target: { _ref: ../defaults/event_target.yaml } — but note: target is built from
          # _payload, which only carries activity_id. So we need to feed type/title from the
          # loaded doc into the operator chain. Two options:
          #   (a) restructure target to read from _step.load.0 instead of _payload, OR
          #   (b) the API resolves a synthetic payload before the new-event call so target
          #       sees title/type as if they were in payload.
          # Option (a) cleaner — write a delete-specific target inline (or a second
          # defaults/event_target_from_load.yaml), since the emit context here is loaded-doc-driven.
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
      success: true
```

### Manifest update

Add `- _ref: api/delete-activity.yaml` to the manifest's `api:` list.

## Acceptance Criteria

- `modules/activities/api/delete-activity.yaml` exists; the endpoint is registered.
- Calling with `{ activity_id }` on a non-deleted activity:
  - Loads the doc.
  - Sets `removed: change_stamp` and refreshes `updated.timestamp`.
  - Emits a `delete-activity` event with `references.contact_ids` and `references.company_ids` from the load, and `metadata.activity_id`.
- The activity no longer appears in list/detail/tile queries that filter `removed.timestamp: $exists: false`.
- A second call on an already-deleted activity returns without error and without re-emitting (the load filter excludes deleted docs, so step 2 misses).
- Build is clean.

## Files

- `modules/activities/api/delete-activity.yaml` — create — load + soft-delete + emit routine.
- `modules/activities/module.lowdefy.yaml` — modify — add `_ref: api/delete-activity.yaml` to the `api:` list.

## Notes

- **Why load-then-update here too.** The emitted event needs `references.contact_ids` and `references.company_ids` so the activity's deletion surfaces on each linked contact/company's events timeline. The payload only carries `activity_id`, so the API has to load to get the linked IDs. This is a different reason for loading than `change-activity-status` (which loads for idempotency); both are deliberate.
- **Soft-delete only.** Don't `MongoDBDeleteOne`. The `removed` change_stamp keeps the audit trail (who deleted, when) and lets future investigations see what was deleted.
- **Don't smuggle `removed` through `update-activity`.** That was the original design before review-3 #2 surfaced the contradiction. `update-activity`'s editable-fields list explicitly excludes `removed`, and the events feed expects the right event type to fire — `delete-activity`, not `update-activity`.
- **The `display` block needs `target` data from the loaded doc** (since `_payload` only has `activity_id`). Either (a) inline a delete-specific target with `_step: load.0.*` references, or (b) factor a second `defaults/event_target_from_load.yaml`. (a) is simpler given this is the only emit site that reads from the load step. Verify in build output that `target.title` and `target.type_label` render correctly on the deletion event.
