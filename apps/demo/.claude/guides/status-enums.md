# Status Fields & Enums

How entities track status as an array with history, how enums define display properties, and how transitions control which status changes are allowed.

## Pattern

Status is **not a single field** — it's an array of `{ stage, created: change_stamp }` entries, newest first. The current status is always `status.0.stage`. The full array is the status history, showing every transition with who did it and when.

**Enum definitions** map each status slug to display properties. They live in `shared/enums/` (or `apps/shared/enums/`) as YAML maps:

```yaml
new:
  color: '#73C0DE'
  title: New
  final: false
  order: 1
  icon: IoTicketOutline
```

Common fields: `color` (hex), `title` (display label), `icon` (React Icons name). Optional: `final` (terminal state flag), `order` (sort weight for kanban/reports), `description` (tooltip/docs), `clientTitle` (different label for external-facing apps), `path` (SVG icon path for specialized renderers).

**Enums are loaded into `_global`** via the app's `lowdefy.yaml` global config:
```yaml
global:
  enums:
    ticket_statuses:
      _ref: ../shared/enums/ticket_statuses.yaml
    task_statuses:
      _ref: ../shared/enums/task_statuses.yaml
```

This makes them accessible everywhere via `_global: enums.{type}` — in cell renderers, filter options, transition logic, and reports.

**Status transitions** define which status changes are allowed per role. A transitions config maps `role → current_status → { action: [...], selector: [...] }`:
- `action` — statuses reachable via buttons (one-click actions like "Close", "Escalate")
- `selector` — statuses reachable via a dropdown selector (for flexible navigation between states)

A JavaScript `SetState` action reads `_user: roles`, the current status, and the transitions config to compute available transitions at runtime. This drives which buttons and selector options are visible on view pages.

**Updating status** always uses `$push` with `$position: 0` to prepend the new entry, plus a `$set` on `updated` to refresh the document-level change stamp:

```yaml
$set:
  updated:
    _ref: ../shared/change_stamp.yaml
$push:
  status:
    $position: 0
    $each:
      - stage: {NEW_STAGE}
        created:
          _ref: ../shared/change_stamp.yaml
```

**Reading current status** in aggregation pipelines: `$arrayElemAt: [$status.stage, 0]`.

**Filtering by status** in `$match`: `'status.0.stage': { $in: _payload: filter.status }` or inside `$cond` conditional patterns.

## Data Flow

```
Enum YAML → _global: enums.{type} (loaded at app startup)
  → Filters: options_enum.yaml transforms enum map into { label, value, style } for selectors
  → Table: cellRenderer uses __get from __global: enums.{type} for colored badge
  → View page: transitions config + user roles → SetState computes allowed transitions
  → User clicks status action → update request: $push status array + $set updated stamp
  → Event logged with new stage reference
  → Refetch updates UI
```

## Variations

**Simple enum (event types, categories)** — color + title + icon, no status array:
```yaml
create-contact:
  color: '#1890ff'
  title: Contact Created
  icon: AiOutlineUserAdd
```
Used by events-timeline and display renderers. Not stored as arrays.

**Status enum with workflow metadata** — adds `final`, `order`, `description`:
```yaml
await-client:
  color: '#EE6666'
  title: Awaiting Client
  clientTitle: Feedback Required
  final: false
  order: 2
  icon: AiOutlineUserSwitch
```

**Role-based transition config** — per-role allowed transitions with action vs selector split:
```yaml
roles:
  developer:
    transitions:
      dev-investigation:
        action:
          - dev-investigation-done
  scrum-master:
    transitions:
      new:
        action: [sa-to-discuss, closed-not-required]
        selector: [sa-to-update, dev-investigation, feeder-board]
```

**Enum-to-selector transform** — `options_enum.yaml` converts enum map into `{ label, value, style, tag }` for MultipleSelector/Selector options:
```yaml
_mql.aggregate:
  - - _var: enum
  - - $project:
        items: { $objectToArray: $$ROOT }
    - $unwind: { path: $items }
    - $project:
        label: $items.v.title
        value: $items.k
        style: { color: $items.v.color }
        tag: { color: $items.v.color, icon: $items.v.icon, title: $items.v.title }
```
Usage: `_ref: { path: ../shared/enums/options_enum.yaml, vars: { enum: { _global: enums.ticket_statuses } } }`

**Module-level status (simple `$push` in API routine):**
```yaml
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

## Anti-patterns

- **Don't store status as a single string** — always use the array pattern with `{ stage, created }` entries. A flat string loses all history and auditability.
- **Don't forget `$position: 0`** — without it, `$push` appends to the end, making `status.0` the *oldest* entry instead of the current one.
- **Don't `$set` the status array directly** — use `$push` to prepend. `$set` replaces the entire history.
- **Don't forget to update `updated` alongside status** — the document-level `updated` stamp must be refreshed on every status change for optimistic concurrency and "Last modified" display.
- **Don't hardcode allowed transitions in the UI** — use a transitions config file and compute available transitions from the user's roles at runtime. This keeps role logic centralized and auditable.
- **Don't rely on color alone for status** — per accessibility requirements, always pair color with a text label (and optionally an icon). Status badges use the `<span style="color: ...; border: 1px solid ...">{{ title }}</span>` pattern.

## Reference Files

- `modules/shared/enums/event_types.yaml` — simple event type enum (color, title, icon)
- `modules/contacts/requests/get_all_contacts.yaml` — aggregation filtering on `hidden`/`disabled` flags

## Template

**Status enum definition:**
```yaml
# shared/enums/{entity}_statuses.yaml
{status-slug}:
  color: '{hex_color}'
  title: {Display Title}
  icon: {AiOutlineIcon}
  final: false
  order: {sort_weight}

{another-status}:
  color: '{hex_color}'
  title: {Display Title}
  icon: {AiOutlineIcon}
  final: true
  order: {sort_weight}
```

**Status update request:**
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

**Reading current status in aggregation:**
```yaml
- $addFields:
    current_status:
      $arrayElemAt:
        - $status.stage
        - 0
```

## Checklist

- [ ] Status stored as array of `{ stage, created: change_stamp }`, newest first
- [ ] `$push` with `$position: 0` — never `$set` the array directly
- [ ] Document-level `updated` stamp refreshed alongside every status push
- [ ] Enum loaded into `_global` via app's `lowdefy.yaml`
- [ ] Status badge renders color + text label (not color alone — accessibility)
- [ ] Filters use `'status.0.stage'` or `$arrayElemAt: [$status.stage, 0]` for current status
- [ ] Transitions config defines allowed moves per role (action vs selector)
- [ ] Event logged on every status change with the new stage in metadata
