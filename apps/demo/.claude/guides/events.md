# Event Logging

How to log audit events and display event timelines on entity pages.

## Pattern

Every significant action (create, update, status change, comment) inserts an immutable event document into the `log-events` collection. Events are the audit trail — they record what happened, who did it, and which entities are involved.

**Event document shape**: `{ _id (UUID), type, date, created (change_stamp), {app-key}: { title, description, info }, {entity}_ids, metadata, files, action_ids }`. Events only have a `created` stamp — they are never updated.

**Per-app display**: events store display data keyed by app name (e.g., `example-app`, `admin-app`, `customer-app`). This lets multiple apps render the same event differently — an internal app can show clickable links while a customer-facing app shows plain text. Titles use `_nunjucks` templates with HTML for rich rendering.

**Entity reference arrays**: events carry arrays like `lot_ids`, `ticket_ids`, `device_ids`, `company_ids`, `contact_ids`. These are the filter keys — the timeline component matches events by checking if the current entity's ID appears in the relevant array. Without these references, the event won't appear on that entity's timeline.

**Event types**: each `type` string maps to display metadata (color, title, icon) defined in enum files. These get merged at build time or loaded into `_global` state. The timeline component uses this config to render colored icons and styled cards.

**Two insertion approaches**:
- **Module-level**: `CallApi` to the events module's `new-event` endpoint, passing display/references/metadata via payload. The API assembles the document. This ensures consistent structure.
- **App-level**: direct `MongoDBInsertOne` to the events connection. More flexible — supports multi-app display keys and complex conditional logic. The caller builds the full document.

**Serverless events** (Lambda/mongoTransforms): no Lowdefy operators available. Build events inline in aggregation pipelines with `$$NOW`, `$concat` for titles (no Nunjucks), hardcoded service user, and `$merge` into `log-events`.

## Data Flow

`User action → API routine mutates entity → event insert (CallApi or MongoDBInsertOne) → log-events collection → timeline component queries by {entity}_ids → $addFields extracts app-specific title/description → EventsTimeline renders with event type styling`

## Variations

**Via events module API** (module-level code — payload-based):

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
      references:
        {entity}_ids:
          - _step: insert.upsertedId
        company_ids:
          _if_none:
            - _payload: {entity}.company_ids
            - []
      metadata:
        {entity}_id:
          _step: insert.upsertedId
```

**Direct insert** (app-level code — multi-app display):

```yaml
- id: event_{action}
  type: MongoDBInsertOne
  connectionId: events
  properties:
    doc:
      _id:
        _uuid: true
      created:
        _ref: ../shared/change_stamp.yaml
      date:
        _date: now
      type: {event-type}
      '{app-name}':
        title:
          _nunjucks:
            on:
              user:
                _user: true
            template: |
              <a href='/contacts-details?_id={{ user.id }}'>{{ user.profile.name | safe }}</a> did something
        description: null
      {entity}_ids:
        - _payload: {entity}._id
      company_ids:
        - _payload: {entity}.company_id
      metadata: {}
```

**Serverless event** (Lambda/mongoTransforms):

```yaml
- $project:
    _id:
      $function:
        body: "function() { return UUID().toString().split('\"')[1] }"
        args: []
        lang: js
    date: $$NOW
    type: {event-type}
    '{app-name}':
      title:
        $concat:
          - 'Service updated '
          - $entity._id
    created:
      timestamp: $$NOW
      app_name: mongo_transforms
      user:
        name: Service Name
        id: service
    {entity}_ids:
      - $entity._id
- $merge:
    into: log-events
    on: _id
    whenMatched: fail
    whenNotMatched: insert
```

**Timeline display** (embedding on a detail page):

```yaml
- _ref:
    module: events
    component: events-timeline
    vars:
      reference_field: {entity}_ids
      reference_value:
        _url_query: _id
```

## Anti-patterns

- **Don't set `updated` on events** — events are immutable audit records. Only `created` stamp.
- **Don't forget entity reference arrays** — without `{entity}_ids`, the event won't appear on that entity's timeline. Always include all relevant entity ID arrays.
- **Don't log events for skipped actions** — if the insert/update was skipped (e.g., duplicate check), skip the event too using the same `skip:` condition.
- **Don't use plain string concatenation for titles** — use `_nunjucks` templates for conditional logic, safe HTML escaping, and rich formatting. In serverless, use `$concat`.
- **Don't hardcode the display key** in timeline queries — use `_module.var: display_key` or `_var: display_key` so the same timeline component works across apps.

## Reference Files

- `modules/events/module.lowdefy.yaml` — events module manifest: exports change_stamp, event_types, events-timeline, new-event API
- `modules/events/api/new-event.yaml` — module-level event insertion endpoint (assembles doc from payload)
- `modules/events/components/events-timeline.yaml` — timeline component: queries by reference field, extracts app-specific display
- `modules/events/connections/events-collection.yaml` — events collection connection with changeLog enabled
- `modules/contacts/api/create-contact.yaml` — module-level CallApi event logging with build-time display templates
- `modules/shared/enums/event_types.yaml` — shared event type enum composition (merges module-level enums)
- `apps/example-app/pages/lot-view/enums/lot_event_types.yaml` — app-level event type additions
- `apps/example-app/pages/lot-view/components/activity-tab.yaml` — timeline embedded in detail page with comment input
- `docs/data-design/app-schema-example/log_events.yaml` — full schema documentation with examples

## Checklist

- [ ] Event type string matches an entry in the event_types enum (or add a new one)
- [ ] `_id` set to `_uuid: true` (or `$function` UUID in serverless)
- [ ] `created` uses change_stamp (never `updated` — events are immutable)
- [ ] `date` set to `_date: now` (or `$$NOW` in serverless)
- [ ] All relevant entity reference arrays populated (`{entity}_ids`, `company_ids`, etc.)
- [ ] Display title uses `_nunjucks` with `| safe` filter for HTML content
- [ ] Event type enum entry added with color, title, icon (and optionally card_color)
- [ ] Timeline component wired on detail page with correct `reference_field` and `reference_value`
- [ ] Event insertion skipped when parent action is skipped (same `skip:` condition)
