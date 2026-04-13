# API Routines

How to write server-side API endpoint routines for create, update, and domain-action operations.

## Pattern

API routines are sequential step pipelines defined as `type: Api` with a `routine` array. Each step has an `id`, `type`, and `properties`. The routine ends with a `:return:` step that sends data back to the caller (or `:reject:` to abort with an error).

Routines live in `modules/{name}/api/` (for module-level, reusable endpoints) or `apps/{app}/api/` (for app-specific endpoints). Module routines are registered in the module manifest under `api:` with matching `exports.api` entries. App routines are listed in `apps/{app}/api/api.yaml`.

Module var injection points allow consumers to extend routines without forking:

- `components.profile_set_fields` — additional `$set` fields merged via `_object.assign` into the update document
- `request_stages.insert_{entity}` / `request_stages.update_{entity}` — additional MongoDB pipeline stages appended after `$set` via `_build.array.concat`
- `_build.if` with `_module.var` — conditionally include fields at build time (e.g., `show_title`)

## Step Types

**Database operations:**
- `MongoDBFindOne` — read a document (for validation, duplicate check, reading current state)
- `MongoDBInsertOne` — insert a new document
- `MongoDBUpdateOne` — update with filter, `$set`, `$push`, `upsert`
- `MongoDBUpdateMany` — bulk update matching documents
- `MongoDBAggregation` — complex query pipelines

**Cross-API calls:**
- `CallApi` — invoke another API endpoint, passing `payload`

## Control Flow

- **`:set_state:`** — store computed intermediate values, accessible via `_state: key` in later steps
- **`:if:` / `:then:` / `:else:`** — conditional branching (can be nested)
- **`:return:`** — return data to caller; can appear mid-routine for early exits
- **`:reject:`** — abort the routine with an error message (for input validation)
- **`:for:` / `:in:` / `:do:`** — iterate over arrays (bulk processing)
- **`:try:` / `:catch:`** — error isolation (one row's failure doesn't block others)
- **`skip:`** — conditionally skip a single step without branching the entire routine

## Data Access

| Operator | Reads from | Example |
|---|---|---|
| `_payload: key` | Caller's payload | `_payload: contact.email` |
| `_step: id.field` | Previous step result | `_step: insert.upsertedId` |
| `_state: key` | Routine state (`:set_state:`) | `_state: change_stamp` |
| `_item: row.field` | Current `:for:` loop item | `_item: row.method` |
| `_user: field` | Authenticated user | `_user: id` |
| `_var: key` | `_ref` vars (sub-routine params) | `_var: event_ids` |

## Connections and Endpoint References

**Module-level** (portable across apps):
```yaml
connectionId:
  _module.connectionId: contacts-collection
endpointId:
  _module.endpointId:
    id: new-event
    module: events
```

**App-level** (direct references):
```yaml
connectionId: lots
endpointId: new-event
```

## Event Logging

Every mutation should log an audit event. There are two patterns:

**Module APIs** — use `CallApi` to the events module. Event display titles are built at build time using the `_build.object.fromEntries` / `_build.array.map` / `_build.array.filter` pipeline pattern. This merges default display templates (`_ref: defaults/event_display.yaml`) with app overrides (`_module.var: event_display`), filters for the current event type, and renders Nunjucks templates:

```yaml
- id: new-event
  type: CallApi
  properties:
    endpointId:
      _module.endpointId:
        id: new-event
        module: events
    payload:
      type: create-{entity}
      display:
        _build.object.fromEntries:
          _build.array.map:
            on:
              _build.array.filter:
                on:
                  _build.object.entries:
                    _build.object.assign:
                      - _ref: defaults/event_display.yaml
                      - _module.var: event_display
                callback:
                  _build.function:
                    __build.ne:
                      - __build.if_none:
                          - __build.args: 0.1.create-{entity}
                          - null
                      - null
            callback:
              _build.function:
                key:
                  __build.args: 0.0
                value:
                  title:
                    _nunjucks:
                      template:
                        __build.args: 0.1.create-{entity}
                      on:
                        user:
                          _user: true
                        target:
                          name: ...
                  description: null
      references:
        {entity}_ids:
          - _step: insert.upsertedId
      metadata:
        {entity}_id:
          _step: insert.upsertedId
```

The default event_display.yaml file defines Nunjucks templates per event type:
```yaml
default:
  create-contact: "{{ user.profile.name }} created {{ target.name }}"
  update-contact: "{{ user.profile.name }} updated {{ target.name }}"
```

**App-level APIs** — use `CallApi` with direct `endpointId` and an app-keyed display object:

```yaml
- id: log_event
  type: CallApi
  properties:
    endpointId: new-event
    payload:
      type: gate-checklist-update
      references:
        lot_ids:
          - _payload: lot_id
      metadata:
        gate:
          _payload: gate_id
      hydra:
        title: S5 checklist updated
        description:
          _payload: note
```

## Notification Triggering

After logging an event, trigger notifications by calling the notifications module:

```yaml
- id: send-notification
  type: CallApi
  properties:
    endpointId:
      _module.endpointId:
        id: send-notification
        module: notifications
    payload:
      event_ids:
        - _step: new-event.eventId
```

## Composition via `_ref`

Large routines decompose into reusable sub-routine files. A sub-routine file contains bare steps (no `id:`/`type: Api` wrapper). The parent routine inlines them with `_ref`:

```yaml
routine:
  - _ref: pages/tasks/api/shared/routines/set_companies_state.yaml
  - id: update
    type: MongoDBUpdateOne
    # ...
  - _ref:
      path: ../shared/api/notifications/requests/create_notifications.yaml
      vars:
        event_ids:
          - _step: event_update_task_status.insertedId
```

Sub-routines access vars via `_var: { key: event_ids }` with optional `default:`.

## Routine Archetypes

### 1. Create with duplicate check
FindOne duplicate → UpdateOne upsert (skip if exists) → CallApi event (skip if exists) → `:return:` id + existing flag. Uses `$ifNull` for `_id` and `created` so re-upserts are safe.

### 2. Update with optimistic concurrency
Filter on `_id` + `updated.timestamp` → UpdateOne → CallApi event → `:return: success`. If someone else updated between fetch and save, the filter won't match.

### 3. Validation then update
`:if:` required fields missing → `:reject:` error message. Then UpdateOne → FindOne (read back updated doc for event template) → CallApi event → `:return:`.

### 4. Event-only (no document mutation)
CallApi event → (optional CallApi notification) → `:return:`. Used for comments, resend-invite.

### 5. Simple mutation
UpdateOne/UpdateMany → (optional event) → `:return:`. Used for soft deletes, status changes, file saves.

### 6. Branching domain action
FindOne current state → `:set_state:` computed values → `:if:` early returns for invalid states → UpdateOne → CallApi event → `:return:`. Used for gate advances, state machines.

### 7. Composed workflow
`:set_state:` → `_ref` sub-routines chained together → `:if:` conditional paths → `:return:`. Keeps each sub-routine under 80 lines.

### 8. Bulk processing
MongoDBAggregation query → `:set_state:` counters → `:for:` each row → `:try:` process (insert/update/delete based on method) → `:catch:` mark error → `:return:` summary counts.

## Anti-patterns

- **Don't skip the duplicate check** in create routines — re-submits create duplicates. The `skip` + `:return:` existing ID pattern is the safety net.
- **Don't omit `updated.timestamp` from update filters** — this is the optimistic concurrency guard. Without it, stale overwrites go undetected.
- **Don't use `$set` for `created` on upserts** — use `$ifNull: [$created, stamp]` so re-upserts preserve the original creation timestamp. Use `$setOnInsert` as an alternative.
- **Don't inline `_state` in API routine properties** — all page state should be passed through the `payload:` mapping in the `CallAPI` action. The routine reads it via `_payload:`.
- **Don't skip event logging** — every mutation that users can trigger should have an audit event. Even bulk operations should log per-row events.
- **Don't forget `_module.var` injection points** in module-level routines — without `request_stages.*` and `components.profile_set_fields`, consuming apps can't extend the routine.
- **Don't write sub-routines that exceed ~80 lines** — decompose into `_ref`'d files.

## Reference Files

- `modules/contacts/api/create-contact.yaml` — canonical create: duplicate check, upsert with `$ifNull`, event display templates, module var injection
- `modules/contacts/api/update-contact.yaml` — canonical update: optimistic concurrency via `updated.timestamp`, is_user guard, event logging
- `modules/user-account/api/create-profile.yaml` — validation with `:reject:`, read-back for event template via `_result: updated_user`
- `modules/files/api/save-file.yaml` — `$set` + `$setOnInsert` pattern, conditional event logging via `_module.var: log_events`
- `modules/files/api/delete-file.yaml` — soft delete: sets `removed: true`
- `modules/user-admin/api/invite-user.yaml` — complex upsert with dynamic app-scoped fields via `_object.defineProperty`, notification dispatch
- `modules/user-admin/api/resend-invite.yaml` — event-only routine (no document mutation)
- `modules/events/api/new-event.yaml` — the event logging endpoint all routines call (`_object.assign` merges display + references + core fields)
- `modules/data-upload/api/set-status-discard.yaml` — `MongoDBUpdateMany` for bulk status change
- `apps/hydra/api/lot-view/advance-gate.yaml` — branching domain action: read-then-branch with `:if:`, multi-step state machine
- `apps/hydra/api/lot-view/save-gate.yaml` — incremental `:set_state:` with `_object.assign` to build `$set` dynamically
- `apps/hydra/api/lot-view/save-linked-document.yaml` — `:if:` branch for edit vs add, `$push` for array subdocuments
- `apps/hydra/api/data-upload/lots/process-staged-lots.yaml` — `:for:` / `:try:` / `:catch:` bulk processing

## Template

**Create routine:**

```yaml
id: create-{entity}
type: Api
routine:
  - id: check-existing
    type: MongoDBFindOne
    connectionId:
      _module.connectionId: {entities}-collection
    properties:
      query:
        {unique_field}:
          _payload: {entity}.{unique_field}

  - id: insert
    type: MongoDBUpdateOne
    skip:
      _ne:
        - _step: check-existing
        - null
    connectionId:
      _module.connectionId: {entities}-collection
    properties:
      filter:
        _id:
          _payload: _id
      options:
        upsert: true
      update:
        _build.array.concat:
          - - $set:
                _object.assign:
                  - _id:
                      $ifNull:
                        - $_id
                        - _payload: _id
                    created:
                      $ifNull:
                        - $created
                        - _ref:
                            module: events
                            component: change_stamp
                    updated:
                      _ref:
                        module: events
                        component: change_stamp
                  - {field}:
                      _payload: {entity}.{field}
                  - _module.var:
                      key: components.profile_set_fields
                      default: {}
          - _module.var:
              key: request_stages.insert_{entity}
              default: []

  - id: new-event
    type: CallApi
    skip:
      _ne:
        - _step: check-existing
        - null
    properties:
      endpointId:
        _module.endpointId:
          id: new-event
          module: events
      payload:
        type: create-{entity}
        references:
          {entity}_ids:
            - _step: insert.upsertedId
        metadata:
          {entity}_id:
            _step: insert.upsertedId

  - :return:
      {entity}Id:
        _if:
          test:
            _ne:
              - _step: check-existing
              - null
          then:
            _step: check-existing._id
          else:
            _step: insert.upsertedId
      existing:
        _ne:
          - _step: check-existing
          - null
```

**Update routine:**

```yaml
id: update-{entity}
type: Api
routine:
  - id: update
    type: MongoDBUpdateOne
    connectionId:
      _module.connectionId: {entities}-collection
    properties:
      filter:
        _id:
          _payload: {entity}._id
        updated.timestamp:
          _payload: {entity}.updated.timestamp
      update:
        _build.array.concat:
          - - $set:
                _object.assign:
                  - {field}:
                      _payload: {entity}.{field}
                    updated:
                      _ref:
                        module: events
                        component: change_stamp
                  - _module.var:
                      key: components.profile_set_fields
                      default: {}
          - _module.var:
              key: request_stages.update_{entity}
              default: []

  - id: new-event
    type: CallApi
    properties:
      endpointId:
        _module.endpointId:
          id: new-event
          module: events
      payload:
        type: update-{entity}
        references:
          {entity}_ids:
            - _payload: {entity}._id
        metadata:
          {entity}_id:
            _payload: {entity}._id

  - :return:
      success: true
```

**App-level domain action:**

```yaml
id: {action_name}
type: Api
routine:
  - :set_state:
      change_stamp:
        _ref: ../shared/change_stamp.yaml

  - id: get_current
    type: MongoDBFindOne
    connectionId: {collection}
    properties:
      query:
        _id:
          _payload: {entity}_id

  - :set_state:
      current_value:
        _get:
          from:
            _step: get_current
          key: {field}

  - :if:
      _eq:
        - _state: current_value
        - {invalid_state}
    :then:
      - :return:
          error: {validation_message}

  - id: update
    type: MongoDBUpdateOne
    connectionId: {collection}
    properties:
      filter:
        _id:
          _payload: {entity}_id
      update:
        $set:
          {field}:
            _payload: new_value
          updated:
            _state: change_stamp

  - id: log_event
    type: CallApi
    properties:
      endpointId: new-event
      payload:
        type: {event_type}
        references:
          {entity}_ids:
            - _payload: {entity}_id
        metadata:
          from:
            _state: current_value
          to:
            _payload: new_value
        {app_name}:
          title: {Event Title}

  - :return:
      success: true
```

## Checklist

- [ ] Create routine checks for duplicates with `MongoDBFindOne` before inserting
- [ ] `skip` on both insert and event steps uses `_ne: [_step: check-existing, null]`
- [ ] `created` stamp uses `$ifNull` for upsert safety (never overwrites original)
- [ ] `updated` stamp always set unconditionally to current change stamp
- [ ] Update filter includes `updated.timestamp` for optimistic concurrency
- [ ] Event logged via `CallApi` — module routines use `_module.endpointId`, app routines use direct `endpointId`
- [ ] Module var injection: `components.profile_set_fields` for extra `$set` fields, `request_stages.*` for extra pipeline stages
- [ ] `:return:` at end — creates return ID + existing flag; updates return success
- [ ] Endpoint registered in module manifest under `api:` with matching `exports.api` entry
- [ ] Page calls via `CallAPI` with `endpointId: { _module.endpointId: ... }` and `payload:` mapping
- [ ] Status arrays use `$push` with `$each` + `$position: 0` (prepend, newest first)
- [ ] Soft deletes set `removed: true` (or `removed: change_stamp`) — never hard delete
