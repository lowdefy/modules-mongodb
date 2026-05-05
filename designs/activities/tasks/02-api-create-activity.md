# Task 2: API — `create-activity` + Shared Event Target

## Context

After Task 1, the module skeleton exists. This task implements the first API: `create-activity`. It also introduces `defaults/event_target.yaml` — the shared `target` object built at every emit site, used by all six emitted events (create/update/complete/cancel/reopen/delete). Pinning this file now means Tasks 3–5 can `_ref` it without duplication.

Reference shape: `modules/companies/api/create-company.yaml` is the canonical template for create-X APIs in this codebase. The new-event call shape (lines 99–146 of `update-company.yaml`, similar in `create-company.yaml`) shows how to build the `display` field with `_build.object.assign + _build.array.map` over `event_display`, plus how `target` is built at the call site.

## Task

### `modules/activities/defaults/event_target.yaml`

The shared `target` object. Built at every API emit site as `target: { _ref: defaults/event_target.yaml }`. Looks up the human label from the merged `activity_types` enum at runtime via `_get`:

```yaml
title:
  _payload: title
type:
  _payload: type
type_label:
  _get:
    from:
      _build.object.assign:
        - _ref: ../enums/activity_types.yaml
        - _module.var: activity_types
    key:
      _string.concat:
        - _payload: type
        - .title
    default:
      _payload: type
```

**Why this works:** `from` is build-time-resolved (the merged enum, including consumer-added types via `_module.var: activity_types`). `key` is runtime — `_payload.type` (e.g. `"call"`) concatenated with `".title"` produces a deep path (`"call.title"`), and `_get` resolves it against `from`. `default: _payload.type` falls back to the raw type string if the lookup misses (defensive).

### `modules/activities/api/create-activity.yaml`

API routine:

```yaml
id: create-activity
type: Api
routine:
  - id: validate
    # _ref the validate/activity.yaml shared validation
    type: ...

  - id: insert
    type: MongoDBInsertOne
    connectionId:
      _module.connectionId: activities-collection
    properties:
      doc:
        _id:
          _payload: _id  # client-generated UUID
        type:
          _payload: type
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
          _if_none:
            - _payload: attributes
            - {}
        source:
          channel:
            _if_none:
              - _payload: source.channel
              - manual
          external_ref:
            _if_none:
              - _payload: source.external_ref
              - null
          raw:
            _if_none:
              - _payload: source.raw
              - null
        status:
          - stage:
              # initial_stage from payload, else the type's default_stage from the merged enum
              _if_none:
                - _payload: initial_stage
                - _get:
                    from:
                      _build.object.assign:
                        - _ref: ../enums/activity_types.yaml
                        - _module.var: activity_types
                    key:
                      _string.concat:
                        - _payload: type
                        - .default_stage
                    default: open
            created:
              _ref:
                module: events
                component: change_stamp
        created:
          _ref:
            module: events
            component: change_stamp
        updated:
          _ref:
            module: events
            component: change_stamp
        removed: null

  # Optional: apply request_stages.write hook via a follow-up MongoDBUpdateOne
  # that runs the consumer's pipeline stages on the just-inserted doc. Skip
  # the step at build time when the var is empty (mirrors create-company's
  # treatment).

  - id: new-event
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: new-event
          module: events
      payload:
        type: create-activity
        display:
          # _build.object.fromEntries + _build.array.map iteration over the
          # merged event_display object. Mirror the shape used by
          # update-company.yaml:108-139, but with `target` from the shared
          # event_target.yaml ref.
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
      activityId:
        _payload: _id
```

The `display` block is the one in `update-company.yaml:108-139`, adapted: replace the `target` block with `target: { _ref: ../defaults/event_target.yaml }` and replace the `update-company` keying with `create-activity` keying. Same `_build.object.fromEntries` / `_build.array.map` / `_build.array.filter` iteration pattern.

### Manifest update

In `modules/activities/module.lowdefy.yaml`, add this api `_ref` to the `api:` list (which was empty after Task 1):

```yaml
api:
  - _ref: api/create-activity.yaml
```

## Acceptance Criteria

- `modules/activities/defaults/event_target.yaml` exists and resolves at build time without error.
- `modules/activities/api/create-activity.yaml` exists; the API endpoint is registered after build (visible as `create-activity` in the build output's API list).
- Calling the endpoint with a minimal payload (e.g. `{ _id: <uuid>, type: "call", title: "Test" }`) inserts a document with `status: [{ stage: 'done', created: { timestamp, user } }]` (`done` because that's the type's `default_stage`), `created`/`updated` change_stamps, `removed: null`, defaults filled in.
- A `create-activity` event is emitted with `references: { contact_ids: [], company_ids: [], activity_ids: [<the new id>] }` and `metadata: { activity_id: <id> }`.
- The emitted event's `display.<app>.title` Nunjucks template renders correctly with `target.title = "Test"` and `target.type_label = "Call"`.
- Build is clean.

## Files

- `modules/activities/defaults/event_target.yaml` — create — shared target object with `_get`-based type_label lookup.
- `modules/activities/api/create-activity.yaml` — create — full create routine.
- `modules/activities/module.lowdefy.yaml` — modify — add `_ref: api/create-activity.yaml` to the manifest's `api:` list.

## Notes

- Activities use **client-generated UUIDs**, not consecutive IDs. Don't use `MongoDBInsertConsecutiveId`. The client sends `_id` in the payload (per `decisions.md` §2). If `_id` is missing, the API should reject (validation step).
- `removed: null` literal on insert (not omitted). Consumers exclude soft-deleted docs at read time via `removed.timestamp: { $exists: false }` in `$match`, or Atlas Search `mustNot exists path: removed.timestamp` on the list. Don't write `removed: { $ne: true }`-style filters anywhere — that's the buggy pattern in `get_company.yaml`.
- The `type_label` lookup in `event_target.yaml` uses **runtime** `_get` with a build-time `from` and a runtime-computed `key` — verified to work in Lowdefy's operator set (`packages/plugins/operators/operators-js/src/operators/shared/get.js`). Don't try `_object.get` — there's no such runtime operator (only `_object.assign`, `_object.fromEntries`, etc.).
- The `display` field's `_build.*` operator chain is non-trivial. Copy the exact shape from `modules/companies/api/update-company.yaml:108-139`, swapping the event-type key (`update-company` → `create-activity`) and replacing the inline `target` block with a single `_ref: ../defaults/event_target.yaml`.
- This is the first API to emit, so test it in isolation: insert via the form (or a manual CallApi from a test page) and confirm the event lands in the events collection with the right shape. Tasks 3–5 build on this.
