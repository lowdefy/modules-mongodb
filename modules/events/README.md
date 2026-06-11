# Events

Audit event log shared by every other module — a `new-event` API for logging, a timeline panel for rendering, and the `change_stamp` and `event_types` components consumed across the repo.

`events` has no module dependencies, so it sits at the bottom of the dependency graph. Every module that writes data either logs events or stamps audit metadata onto its writes through this module.

## Dependencies

None.

## How to Use

```yaml
modules:
  - id: events
    source: "github:lowdefy/modules-mongodb/modules/events@v0.7.0"
    vars:
      display_key: my-app
```

The minimum requirement is `display_key` — the app identifier that selects which pre-rendered title to show in event timelines. See [App name scoping](../../docs/idioms.md#app-name) and [Event display](../../docs/idioms.md#event-display).

To extend the change stamp (e.g. add `app_name` so writes record which app produced them) or to add custom event-type display metadata, see [Change stamps](../../docs/idioms.md#change-stamps).

```yaml
- id: events
  source: "github:lowdefy/modules-mongodb/modules/events@v0.7.0"
  vars:
    display_key: my-app
    change_stamp:
      timestamp:
        _date: now
      user:
        name:
          _user: profile.name
        id:
          _user: id
      app_name: my-app
    event_types:
      sync-job:
        title: Sync job
        color: blue
        icon: AiOutlineSync
```

## Exports

### Components

- **`change_stamp`** — Audit metadata template (timestamp + user). Resolves to `_module.var: change_stamp` so consumers always pick up the override. See [Change stamps](../../docs/idioms.md#change-stamps).

  ```yaml
  created:
    _ref:
      module: events
      component: change_stamp
  ```

- **`event_types`** — Map of `event_type → { title, color, icon }`. Built-in types are merged with the `event_types` var. Pull a single field via `key`:

  ```yaml
  icon:
    _ref:
      module: events
      component: event_types
      key: login.icon
  ```

- **`events-timeline`** — Timeline panel for an entity's event history. **Events-only** — it renders no workflow action cards; apps using the workflows module that want an action-enriched timeline use the workflows module's `workflows-events-timeline` component instead (see [Live action cards](../../docs/idioms.md#live-action-cards)). Drop into a sidebar tile:

  ```yaml
  _ref:
    module: events
    component: events-timeline
    vars:
      target_collection: companies
      target_id:
        _url_query: _id
  ```

### API Endpoints

| ID | Description |
|---|---|
| `new-event` | Log a new audit event. Called by other modules' write APIs. |

### Connections

| ID | Collection |
|---|---|
| `events-collection` | `log-events` |

## Vars

### `display_key` (required)

`string` — App identifier used to select which per-app title to render from each event's `display.{display_key}` field. Must not contain dots — see [App name scoping](../../docs/idioms.md#app-name).

### `change_stamp`

`object` — Audit metadata template resolved at request time. Default:

```yaml
timestamp:
  _date: now
user:
  name:
    _user: profile.name
  id:
    _user: id
```

The operators (`_date: now`, `_user: profile.name`) are runtime operators. See [Change stamps](../../docs/idioms.md#change-stamps).

### `event_types`

`object` — Default `{}`. Additional event-type display metadata merged with the built-in types in `modules/shared/enums/event_types.yaml`. Keys are event type strings; values are `{ title, color, icon }`.

### `action_statuses_display`

`object` — Default `{}`. Per-status display overrides for the shared action_statuses enum. **Currently unused**: since the events timeline became events-only (no action cards), this var no longer affects anything — it is retained for manifest compatibility. Action-card display overrides belong on the workflows module's `action_statuses_display` var. See [Live action cards](../../docs/idioms.md#live-action-cards).

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |

## Plugins

- `@lowdefy/modules-mongodb-plugins` — `EventsTimeline` block

## Notes

Event documents store **per-app pre-rendered titles** under `display.{app_name}`. The events module's role on read is just to project `display.{display_key}` — no Nunjucks at read time. Writers (other modules' APIs) are responsible for rendering all known per-app titles at write time using the `event_display` var on the writing module. See [Event display](../../docs/idioms.md#event-display).

The events timeline is **events-only**: it does not join the `actions` collection and renders no workflow action cards. The action-enriched timeline is the workflows module's `workflows-events-timeline` component, backed by the `GetEventsTimeline` engine method. See [Live action cards](../../docs/idioms.md#live-action-cards).
