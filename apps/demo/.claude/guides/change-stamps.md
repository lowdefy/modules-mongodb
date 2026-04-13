# Change Stamps

Audit metadata (`created`/`updated`) on every mutable document, tracking who changed what and when.

## Pattern

Every mutable document carries two change stamps: `created` (set once on first insert) and `updated` (refreshed on every write). The stamp shape is `{ timestamp, user: { name, id }, app_name, version }`. A single canonical definition lives at `apps/shared/change_stamp.yaml` and contains Lowdefy runtime operators (`_date: now`, `_user: profile.name`, etc.) that resolve fresh values per request.

**How modules access the stamp**: the events module re-exports the canonical stamp as a component. Modules reference it via `_ref: { module: events, component: change_stamp }`. The app wires the canonical file into the events module var: `change_stamp: { _ref: ../shared/change_stamp.yaml }` in `modules.yaml`. App-level code outside modules can `_ref` the canonical file directly: `_ref: ../shared/change_stamp.yaml`.

**Upsert safety**: on create/upsert routines, `created` must use `$ifNull: [$created, stamp]` so re-runs don't overwrite the original creation timestamp. Alternatively, `$setOnInsert` can guard insert-only fields. `updated` is always set unconditionally.

**Optimistic concurrency**: update routines filter on `updated.timestamp` alongside `_id`. If another user modified the record since it was fetched, the filter won't match and the update silently fails (returning `modifiedCount: 0`), preventing stale-state overwrites.

**Status arrays**: entities with workflow stages store status as an array of `{ stage, created: stamp }` entries, newest first (prepended with `$push` + `$position: 0`). Each transition gets its own stamp. The document-level `updated` must also be refreshed on every status change.

**Events**: event log entries are immutable — they only have a `created` stamp (no `updated`).

**Serverless context**: Lambda functions and mongoTransforms can't use Lowdefy operators. They build stamps inline with `$$NOW` for timestamp and hardcoded `app_name`/`user` fields, then reference via `$change_stamp` in later pipeline stages.

## Data Flow

`Save button → CallAPI (payload: entity state) → API routine resolves change_stamp operators at request time → $set updated (and $ifNull created on upsert) → MongoDB write → title-block reads doc.updated/created to display "Last modified by X on DATE"`

## Variations

**Module-level create (upsert with $ifNull)**:

```yaml
$set:
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
```

**Module-level create ($setOnInsert alternative)** — cleaner when not using `_build.array.concat`:

```yaml
$set:
  updated:
    _ref:
      module: events
      component: change_stamp
$setOnInsert:
  created:
    _ref:
      module: events
      component: change_stamp
```

**App-level update (direct ref)**:

```yaml
$set:
  updated:
    _ref: ../shared/change_stamp.yaml
```

**Status transition (prepend to array + update stamp)**:

```yaml
$set:
  updated:
    _ref: ../shared/change_stamp.yaml
$push:
  status:
    $position: 0
    $each:
      - stage: { NEW_STAGE }
        created:
          _ref: ../shared/change_stamp.yaml
```

**Serverless/Lambda (no Lowdefy operators)**:

```yaml
- $addFields:
    change_stamp:
      timestamp: $$NOW
      app_name: mongo_transforms
      user:
        name: Service Name
        id: service
- $project:
    updated: $change_stamp
    status:
      $concatArrays:
        - - stage: { NEW_STAGE }
            created: $change_stamp
        - $status
```

## Anti-patterns

- **Don't `$set` created directly on upserts** — use `$ifNull: [$created, stamp]` or `$setOnInsert`. Without this, re-running the create overwrites the original author and timestamp.
- **Don't forget to update `updated` on status changes** — pushing a new status entry without refreshing the document-level `updated` stamp breaks optimistic concurrency and makes "Last modified" metadata stale.
- **Don't omit `updated.timestamp` from update filters** — this is the optimistic concurrency guard. Without it, two users editing simultaneously can silently overwrite each other.
- **Don't construct the stamp inline** in Lowdefy routines — always `_ref` the canonical definition. Inline construction drifts from the shared shape and misses future field additions.
- **Don't hardcode user in Lowdefy context** — the canonical stamp uses `_user` + `_if_none` fallback. Only hardcode user info in serverless contexts where `_user` is unavailable.

## Reference Files

- `apps/shared/change_stamp.yaml` — canonical stamp definition (timestamp, user, app_name, version)
- `modules/events/defaults/change_stamp.yaml` — module re-export via `_module.var: change_stamp`
- `modules/events/module.lowdefy.yaml` — events module manifest showing `change_stamp` var and component export
- `modules/contacts/api/create-contact.yaml` — upsert pattern with `$ifNull` for created, `_object.assign` for module var injection
- `modules/contacts/api/update-contact.yaml` — optimistic concurrency filter, update-only stamp
- `modules/files/api/save-file.yaml` — `$setOnInsert` alternative for created stamp
- `modules/data-upload/api/set-status-discard.yaml` — status array prepend with `$push` + `$position: 0`
- `modules/shared/layout/title-block.yaml` — Nunjucks template displaying stamp metadata
- `docs/data-design/app-schema-example/_change_stamp.yaml` — full schema documentation with DB examples

## Template

**Canonical stamp definition** (`apps/shared/change_stamp.yaml`):

```yaml
timestamp:
  _date: now
user:
  name:
    _if_none:
      - _user: profile.name
      - _var: default_name
  id:
    _if_none:
      - _user: id
      - _var: default_id
app_name:
  _ref:
    path: app_config.yaml
    key: app_name
version:
  _ref: version.yaml
```

**Wiring in modules.yaml** (app passes canonical stamp to events module):

```yaml
- id: events
  source: "file:../../modules/events"
  vars:
    collection: log-events
    display_key: { APP_NAME }
    change_stamp:
      _ref: ../shared/change_stamp.yaml
```

## Checklist

- [ ] `created` uses `$ifNull` or `$setOnInsert` — never overwrite on re-upsert
- [ ] `updated` always set unconditionally on both create and update
- [ ] Update filter includes `updated.timestamp` for optimistic concurrency
- [ ] Status array entries each have their own `created` stamp
- [ ] Document-level `updated` refreshed alongside status array pushes
- [ ] Stamp referenced via `_ref: { module: events, component: change_stamp }` in modules, `_ref: ../shared/change_stamp.yaml` in app-level code
- [ ] Detail/edit pages pass `doc` var so title-block displays "Last modified by X on DATE"
- [ ] Events module receives `change_stamp` var in `modules.yaml`
