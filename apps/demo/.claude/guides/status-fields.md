# Status Fields

How entities track status as an array with history, and how role-based transitions control allowed state changes.

## Pattern

Status is **not a single string** — it's an array of `{ stage, created: change_stamp }` entries, newest first. The current status is always `status.0.stage`. The full array is the audit history, showing every transition with who made the change and when.

**Writing status** always uses `$push` with `$position: 0` to prepend the new entry. This is an unshift — the new status becomes index 0 while all previous entries shift down. The document-level `updated` stamp must also be refreshed:

```yaml
$set:
  updated:
    _ref: ../shared/change_stamp.yaml
$push:
  status:
    $position: 0
    $each:
      - stage: {new_stage}
        created:
          _ref: ../shared/change_stamp.yaml
```

**Reading current status** in queries and aggregations:
- In `$match`: `'status.0.stage': { $in: [...] }` or `'status.0.stage': 'value'`
- In `$addFields`/`$project`: `$arrayElemAt: [$status.stage, 0]`
- In Lowdefy state: `_state: entity.status.0.stage`

**Status enum** defines display properties for each stage slug (see enums guide). The stage value stored in the array must match a key in the enum.

**Transitions config** controls which status changes are allowed per user role. A transitions file maps `role → current_status → { action: [...], selector: [...] }`:
- `action` — statuses reachable via one-click buttons (e.g., "Close", "Escalate")
- `selector` — statuses reachable via a dropdown (for flexible navigation between states)

A `SetState` action computes available transitions at runtime by intersecting the user's roles with the current status:

```js
const userRoles = user('roles') || [];
const currentStatus = state('current_status') || '';
const rolesConfig = lowdefyGlobal('enums.task_transitions')?.roles || {};
const selectorTransitions = new Set();
const actionTransitions = new Set();
userRoles.forEach((role) => {
  const transitions = rolesConfig[role]?.transitions?.[currentStatus];
  if (transitions?.action) transitions.action.forEach(s => actionTransitions.add(s));
  if (transitions?.selector) transitions.selector.forEach(s => selectorTransitions.add(s));
});
return { selectorTransitions: [...selectorTransitions], actionTransitions: [...actionTransitions] };
```

**Displaying status** uses the enum lookup pattern — look up `status.0.stage` in `_global: enums.{type}_statuses` and render a colored badge:

```yaml
_nunjucks:
  on:
    status:
      _global:
        _string.concat:
          - enums.ticket_statuses.
          - _state: ticket.status.0.stage
  template: |
    <div style="background: {{ status.color }}; padding: 4px 8px; border-radius: 6px; color: white;">{{ status.title | safe }}</div>
```

**Validation before write**: mature implementations validate the new stage exists in the enum before writing. This prevents typos from creating orphan statuses:

```yaml
- :set_state:
    enum:
      _get:
        from:
          _ref: ../shared/enums/task_statuses.yaml
        key:
          _state: new_status
- :if:
    _eq: [_state: enum, null]
  :then:
    :throw: 'Unknown Status'
```

## Data Flow

```
User clicks status action button (or selects from dropdown)
  → SetState sets new_status
  → Validate: check stage exists in enum (API routine)
  → Check: compare current status.0.stage to new_status (skip if same)
  → MongoDBUpdateOne:
      $set: { updated: change_stamp }
      $push: { status: { $position: 0, $each: [{ stage, created: change_stamp }] } }
  → Event logged with new stage in metadata
  → Notification triggered (if configured)
  → Refetch → UI updates badge, transitions recomputed for new current status
```

## Variations

**Simple status update** — direct request from page (ticket status change):

```yaml
update:
  $set:
    updated:
      _ref: ../shared/change_stamp.yaml
  $push:
    status:
      $position: 0
      $each:
        - stage:
            _payload: stage
          created:
            _ref: ../shared/change_stamp.yaml
```

**Status update in API routine with validation** — checks enum exists, skips if already at target stage, logs event, triggers notifications:

```yaml
- :set_state:
    enum: { _get: { from: { _ref: enums.yaml }, key: { _state: new_status } } }
- :if: { _eq: [_state: enum, null] }
  :then: { :throw: 'Unknown Status' }
- :if: { _ne: [_step: get_entity.status.0.stage, _state: new_status] }
  :then:
    - id: update_status
      type: MongoDBUpdateOne
      # ... $push with $position: 0 ...
    - id: log_event
      type: MongoDBInsertOne
      # ... event with stage in metadata ...
    - id: notify
      # ... send notification ...
```

**Bulk status update** — UpdateMany with same `$push` pattern (e.g., bulk close tickets, discard staged rows):

```yaml
type: MongoDBUpdateMany
properties:
  filter:
    _id: { $in: { _payload: ids } }
  update:
    $push:
      status:
        $each:
          - stage: discard
            created:
              _ref:
                module: events
                component: change_stamp
        $position: 0
```

**Filtering by current status in aggregation** — use dot path `status.0.stage`:

```yaml
- $match:
    status.0.stage:
      $in:
        _payload: filter.status
```

## Anti-patterns

- **Don't store status as a single string** — a flat string loses all history and auditability. Always use the array pattern.
- **Don't forget `$position: 0`** — without it, `$push` appends to the end, making `status.0` the *oldest* entry instead of the current one.
- **Don't `$set` the status array directly** — `$set` replaces the entire history. Use `$push` to prepend.
- **Don't forget to update `updated` alongside status** — the document-level `updated` stamp must be refreshed for optimistic concurrency and "Last modified" display.
- **Don't hardcode transitions in the UI** — use a transitions config and compute available transitions from user roles at runtime. Centralizes role logic and is auditable.
- **Don't skip same-status check** — before pushing, compare `status.0.stage` to the new stage. Writing the same status again pollutes the history.

## Reference Files

- `modules/data-upload/api/set-status-discard.yaml` — simple `$push` with `$position: 0` in API routine

## Template

```yaml
# requests/update_{entity}_status.yaml
id: update_{entity}_status
type: MongoDBUpdateOne
connectionId: {collection}
payload:
  {entity}_id:
    _url_query: _id
  stage:
    _state: stage
properties:
  filter:
    _id:
      _payload: {entity}_id
  update:
    $set:
      updated:
        _ref: ../shared/change_stamp.yaml
    $push:
      status:
        $position: 0
        $each:
          - stage:
              _payload: stage
            created:
              _ref: ../shared/change_stamp.yaml
```

## Checklist

- [ ] Status stored as array of `{ stage, created: change_stamp }`, newest first
- [ ] `$push` with `$position: 0` — never `$set` the array directly
- [ ] Document-level `updated` stamp refreshed alongside every status push
- [ ] Stage value matches a key in the corresponding status enum
- [ ] Same-status check before write (skip if `status.0.stage` already equals new stage)
- [ ] Filters use `'status.0.stage'` or `$arrayElemAt: [$status.stage, 0]` for current status
- [ ] Transitions config defines allowed moves per role (`action` vs `selector`)
- [ ] Event logged on every status change with new stage in metadata
