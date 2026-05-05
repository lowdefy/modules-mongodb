# Task 3: API — `update-activity`

## Context

After Task 2, `create-activity` and the shared `defaults/event_target.yaml` exist. This task adds `update-activity` — the editable-fields update with optimistic concurrency. It mirrors `modules/companies/api/update-company.yaml`'s shape exactly: `MongoDBUpdateOne` with a filter on `_id` and `updated.timestamp` (the optimistic-concurrency pattern), `$set` of editable fields plus a refreshed `updated` change_stamp, `request_stages.write` hook applied via `_build.array.concat`, then a `new-event` CallApi.

Editable fields per the design: `title`, `description`, `contact_ids`, `company_ids`, `attributes`. **Not** `type` (changing type retroactively breaks the event-display history), **not** `status` (handled by `change-activity-status` in Task 4), **not** `removed` (handled by `delete-activity` in Task 5), **not** `source` (set once at creation).

## Task

### `modules/activities/api/update-activity.yaml`

Mirror `modules/companies/api/update-company.yaml` line-for-line, with these adaptations:

- Editable fields: `title`, `description`, `contact_ids`, `company_ids`, `attributes`. The `companies` shape uses `$mergeObjects` for sub-objects (contact, address, attributes) — keep `$mergeObjects` for `attributes` on activities; overwrite `title`, `description`, `contact_ids`, `company_ids` directly.
- Drop the contact ↔ company linking steps (`unlink-old-contacts`, `link-new-contacts`) — activities deliberately do **not** denormalize parent IDs onto contacts/companies (per `decisions.md` "Non-questions worth recording"). Reverse lookups go through indexes on `contact_ids` / `company_ids`.
- The `new-event` step emits `update-activity` (not `update-company`):
  - `references: { contact_ids: [<post-update>], company_ids: [<post-update>], activity_ids: [_payload._id] }`. Use the post-update IDs only — don't load + diff for delink visibility (see design's "Future consideration — delink visibility" note).
  - `metadata: { activity_id: { _payload: _id } }`.
  - `target: { _ref: ../defaults/event_target.yaml }` — same shared block as `create-activity`.

Skeleton:

```yaml
id: update-activity
type: Api
routine:
  - id: validate
    # _ref the validate/activity.yaml shared validation
    type: ...

  - id: update
    type: MongoDBUpdateOne
    connectionId:
      _module.connectionId: activities-collection
    properties:
      filter:
        _id:
          _payload: _id
        updated.timestamp:
          _payload: updated.timestamp  # optimistic concurrency
      update:
        _build.array.concat:
          - - $set:
                title:
                  _payload: title
                description:
                  _payload: description
                contact_ids:
                  _if_none:
                    - _payload: contact_ids
                    - []
                company_ids:
                  _if_none:
                    - _payload: company_ids
                    - []
                attributes:
                  $mergeObjects:
                    - $ifNull:
                        - "$$ROOT.attributes"
                        - {}
                    - $ifNull:
                        - _payload: attributes
                        - {}
                updated:
                  _ref:
                    module: events
                    component: change_stamp
          - _module.var: request_stages.write

  - id: new-event
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: new-event
          module: events
      payload:
        type: update-activity
        display:
          # Same _build.object.fromEntries / _build.array.map pattern as create-activity,
          # keyed on update-activity templates from the merged event_display.
          # `target` is _ref ../defaults/event_target.yaml.
          ...
        references:
          contact_ids:
            _if_none:
              - _payload: contact_ids
              - []
          company_ids:
            _if_none:
              - _payload: company_ids
              - []
          activity_ids:
            - _payload: _id
        metadata:
          activity_id:
            _payload: _id

  - :return:
      success: true
```

If the `MongoDBUpdateOne`'s `matchedCount` is 0 (timestamp moved between load and write), the API should return a stale-state error. Mirror `update-company.yaml`'s handling — check the actual file for whether it explicitly returns an error or relies on Lowdefy's default behavior. If `update-company` doesn't explicit-error, follow the same.

### Manifest update

Add `- _ref: api/update-activity.yaml` to the manifest's `api:` list.

## Acceptance Criteria

- `modules/activities/api/update-activity.yaml` exists; the API endpoint is registered.
- Calling the endpoint with a payload `{ _id, updated.timestamp, title: "Updated", contact_ids: [c1, c2] }` updates the doc's `title`, replaces `contact_ids`, refreshes `updated.timestamp`. The `attributes` field merges (existing keys preserved unless overwritten in payload).
- An `update-activity` event is emitted with `references.contact_ids = [c1, c2]` (post-update only) and `metadata.activity_id = <_id>`.
- If the payload's `updated.timestamp` doesn't match the current doc, the update misses; no event is emitted.
- Build is clean.

## Files

- `modules/activities/api/update-activity.yaml` — create — full update routine.
- `modules/activities/module.lowdefy.yaml` — modify — add `_ref: api/update-activity.yaml` to the `api:` list.

## Notes

- **No reverse-denormalization.** Don't add the `unlink-old-contacts` / `link-new-contacts` steps from `update-company`. Activities reverse lookups use the indexes on `contact_ids` / `company_ids` defined in the design — see `decisions.md` "Non-questions worth recording" → "No reverse denormalization."
- **No type/status/removed/source mutation here.** If a payload includes any of those, ignore them (filter to allowed keys at validation step, or just don't include them in `$set`).
- The `attributes` `$mergeObjects` shape preserves consumer-set attribute fields when the payload only updates a subset. This matches `update-company.yaml:42-49`.
- `request_stages.write` hook fires via `_build.array.concat` appending the var's pipeline stages to the update's pipeline. If the var is empty `[]`, this becomes a no-op.
- For the `display` block, copy the exact `_build.object.fromEntries` / `_build.array.map` / `_build.array.filter` iteration shape from `update-company.yaml:108-139`. Swap the event-type key from `update-company` to `update-activity`.
