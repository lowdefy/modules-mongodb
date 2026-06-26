# Task 4: Make the events module's timeline self-enrich

## Context

The events module owns one timeline component, `components/events-timeline.yaml`,
which today runs an inline `MongoDBAggregation` (`get-events`) on the generic
`events-collection` (`MongoDBCollection`) and renders an events-only timeline. With
the config-free `GetEventsTimeline` engine now hosted on the new `EventsTimeline`
plugin connection type (task 3), this task makes the **single** events timeline
**self-enrich** with action cards wherever an app's events reference actions —
data-driven, with no per-entity wiring and no second component. The
`actions_collection` / `contacts_collection` vars are collection-name overrides
(the engine defaults to `actions` / `user-contacts`), not on/off gates.

Key design points (Part 50 changes 2–4, 6; D3, D4):

- The engine reads display blocks as `$<app_name>.title` and access as
  `access[app_name]`. The events module's existing **required** `display_key` var
  is exactly this key (D3) — wire `app_name: {_module.var: display_key}`.
- `actions_collection` and `contacts_collection` both default to **null** on the
  module entry; the **engine** supplies the effective default (`?? 'actions'` /
  `?? 'user-contacts'`). They are **collection-name overrides, not on/off gates** —
  both `$lookup`s stay unconditional (task 3, D4). A pure-CRM app whose events carry
  no `action_ids` renders identically to today's events-only timeline because the
  actions join matches nothing and returns `actions: []`; the contacts join degrades
  to initials when unmatched. The component just wires the vars onto the connection
  and never branches on them.
- The check-action click handler (`onActionClick`) moves onto this component. The
  handler is **config-free** — it only reads runtime event data
  (`action.kind`, `action._id`, `action.link.{pageId,urlQuery}`) and a fixed
  blockId string (`check_action_modal`). So it can live in the foundational events
  module without depending on workflows (no cycle). The check-action **modal**
  itself is still dropped by the page from the workflows module (see task 5's
  `lead-view`), not by this component.
- Dead display config is removed (change 6): the `action_statuses_display` manifest
  var, and the component's current `actionStatusConfig` wiring that merges it. The
  `EventsTimeline` **block** keeps its `actionStatusConfig` prop — the unified
  timeline now uses it — so re-wire it to the shared enum directly.

Reference shapes:

- New connection: model on `modules/workflows/connections/workflow-api.yaml` (the
  `type: WorkflowAPI` block) but for `type: EventsTimeline`.
- New request + `onActionClick`: model on
  `modules/workflows/requests/get_events_timeline.yaml` and
  `modules/workflows/components/workflows-events-timeline.yaml`.
- Click handler content: `modules/workflows/components/check-action-click.yaml`
  (copy its `try`/`catch` body — do **not** `_ref` it from workflows).

## Task

### 1. Manifest (`modules/events/module.lowdefy.yaml`)

- **Add** two vars (both `type: string`, `default: null`):
  - `actions_collection` — "Actions collection the events timeline joins to enrich
    events with action cards. The engine falls back to `actions` when unset, so
    override only when your actions collection is named differently. Enrichment is
    data-driven: the join is inert when events carry no `action_ids`, so entities
    with no workflow actions render as an events-only timeline."
  - `contacts_collection` — "Contacts collection joined to resolve each event
    author's avatar (`created.user.id` → `_id`, projecting `profile.picture`). The
    engine falls back to `user-contacts` when unset; avatars fall back to initials
    when an author has no matching contact." (Mirror the wording on the workflows
    module's `contacts_collection` var.)
    Provide `description:` for both (manifest is the source of truth for var docs).
- **Delete** the `action_statuses_display` var (lines ~58–66) — dead config.
- **Add** a `exports.connections` entry for the new `events-timeline` connection
  (id + description), alongside the existing `events-collection` export.
- **Add** the new connection to the `connections:` list via `_ref`.

### 2. New connection (`modules/events/connections/events-timeline.yaml`)

Create an `EventsTimeline`-type connection:

```yaml
id: events-timeline
type: EventsTimeline
properties:
  databaseUri:
    _secret: MONGODB_URI
  app_name:
    _module.var: display_key
  eventsCollection: log-events
  actionsCollection:
    _module.var: actions_collection
  contactsCollection:
    _module.var: contacts_collection
  user:
    _user: true
```

`events-collection.yaml` (`MongoDBCollection`) stays unchanged — it still hosts the
event writes and change-log.

### 3. Component rewrite (`modules/events/components/events-timeline.yaml`)

- **Replace** the inline `get-events` `MongoDBAggregation` request with a
  `GetEventsTimeline` request on the new connection. Model on
  `requests/get_events_timeline.yaml`:

  ```yaml
  requests:
    - id: get-events
      type: GetEventsTimeline
      connectionId:
        _module.connectionId: events-timeline
      payload:
        reference_value:
          _var: reference_value
      properties:
        reference_field:
          _var: reference_field
        reference_value:
          _payload: reference_value
  ```

  Keep the request id `get-events` so the existing `onMount` fetch, the empty-state
  `visible`, and the block `data` binding keep working with no rename churn. (If
  keeping the id is awkward, rename consistently across `onMount`, both `visible`
  conditions, and `data` — but prefer keeping `get-events`.)

  The engine sorts events newest-first and now produces the same overall shape
  (`title`/`description`/`info` + `actions[]`) the old aggregation produced, so the
  `events_timeline_empty` / `events-timeline` blocks need no structural change.

- **Re-wire** `actionStatusConfig` on the `EventsTimeline` block: drop the
  `_build.object.assign` merge with `_module.var: action_statuses_display` (deleted)
  and reference the shared enum directly:

  ```yaml
  actionStatusConfig:
    _ref: ../shared/enums/action_statuses.yaml
  ```

- **Add** `onActionClick` to the `EventsTimeline` block — copy the `try`/`catch`
  body from `modules/workflows/components/check-action-click.yaml` inline (do not
  `_ref` workflows). This handler: on a `check`-kind card, sets
  `check_action_modal.action_id` and tries `CallMethod(check_action_modal,
setOpen, [{open:true}])` with `messages.error: false`; on every other kind,
  `Link`s to `action.link.{pageId,urlQuery}`; the `catch` `Link`s to the action page
  when no modal is present.

- Keep the existing optional vars (`reverse`, `s3GetPolicyRequestId`,
  `contact_page_url`, `disable_contact_link`, `compact`) and their defaults. Note
  today's events component defaults `reverse: true`; the engine sorts newest-first,
  so preserve the events component's existing default behaviour (do not silently
  flip ordering — keep `reverse` default `true` as it is today).

### 4. README

`modules/events/README.md` is a stub (`# Events`) per the docs convention — no
dead-config section exists there to remove. Consumer-facing docs are updated in
task 7. Leave the README stub as-is.

## Acceptance Criteria

- Events manifest declares `actions_collection` + `contacts_collection` (both
  default null, both with descriptions) and no longer declares
  `action_statuses_display`.
- `modules/events/connections/events-timeline.yaml` exists as an `EventsTimeline`
  connection wiring `app_name` from `display_key`, the two collection vars, and
  `_user: true`; it is `_ref`'d in the manifest and exported.
- `events-timeline.yaml` component routes `get-events` through `GetEventsTimeline`
  on the new connection, wires `actionStatusConfig` from the shared enum, and
  carries the config-free `onActionClick` handler.
- The events module declares no dependency on the workflows module (no `_ref` into
  `modules/workflows/...`).
- `pnpm --filter @lowdefy/modules-demo ldf:b` succeeds (config compiles). With the
  demo still on `actions_collection` unset (task 5 flips it), the events timeline
  builds and renders events-only.
- `pnpm docs:gen` regenerates `docs/events/reference/vars.md` with the new vars and
  without `action_statuses_display`; commit the regenerated file.

## Files

- `modules/events/module.lowdefy.yaml` — modify — add the two vars, delete
  `action_statuses_display`, add the connection export + `_ref`.
- `modules/events/connections/events-timeline.yaml` — create — `EventsTimeline` connection.
- `modules/events/components/events-timeline.yaml` — modify — route through the
  engine, re-wire `actionStatusConfig`, add `onActionClick`.
- `docs/events/reference/vars.md` — regenerate via `pnpm docs:gen` (generated; do not hand-edit).

## Notes

- This creates a **second** copy of the check-action click handler (the events
  inline copy + the workflows `check-action-click.yaml`, which `actions-on-entity`
  still uses). That is the unavoidable cost of the events ↛ workflows boundary —
  events cannot `_ref` a workflows component. Task 6 keeps `check-action-click.yaml`
  for `actions-on-entity`; it does not delete it.
- There is **no join gating**: both `$lookup`s run unconditionally in the engine
  (task 3, D4). The actions join is inert without `action_ids`; the contacts join
  degrades to initials when unmatched. The component just passes the connection and
  does not branch on the vars itself.
