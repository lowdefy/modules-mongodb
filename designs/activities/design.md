# Activities Module

## Problem

The monorepo models CRM entities (`companies`, `contacts`) and immutable audit (`events`) but has no place for **editable, user-owned records of work done with or for those entities** — calls made, meetings held, emails sent, notes taken, tasks to do.

Apps building on these modules need:

1. A standalone entity that users create, edit, and complete over time (unlike `events`, which is append-only).
2. Multi-entity linking — one activity often touches several contacts and a company, later a deal.
3. A per-entity activity feed surfaced inside contact/company detail pages, independent of the system-events timeline.
4. A foundation that later accepts automatically-captured activities from calendar events, forwarded/cc'd emails, and WhatsApp/voicenote channels — without re-shaping the data model.

This design introduces an `activities` module that sits alongside `events`, follows the `companies`/`contacts` entity-module pattern, and reserves the schema surface needed for future ingestion channels.

See [`decisions.md`](./decisions.md) for the log of resolved open
questions and why each choice was made.

## Key decisions

**Standalone entity module, not an extension of `events`.** Activities are user-editable and have a lifecycle; events are append-only audit. Keeping them in one collection would force every edit to either mutate audit history (wrong) or spawn a new event per save (cluttered). Two collections, each with a clear role.

**Typed linking arrays (`contact_ids`, `company_ids`, later `deal_ids`) on the activity doc, no reverse denormalization.** The link fields themselves mirror the `references` shape already used by `events`. Unlike the existing contact ↔ company relationship — where `update-company` maintains `global_attributes.company_ids` on contacts via `$pull`/`$addToSet` — activities are **not** denormalized onto contacts/companies. Reverse lookups (activities-for-this-contact) are served by indexes on `contact_ids` / `company_ids`, not by a denormalized `activity_ids` list on parent docs. This is a deliberate departure from the company-contact pattern: activities will grow far faster than either parent entity, and keeping a reverse list in sync across future automated ingestion channels (calendar, email, WhatsApp) would make every ingestion path a multi-collection write with more failure modes than benefits.

**Status modelled as a newest-first array of `{stage, created}` entries**, following the repo's status-array convention. Current stage = `status[0].stage`. Completion timestamp = `status.find(s => s.stage === 'done').created.timestamp`. One schema, full history, no separate `completed_at`/`cancelled_at` fields needed.

**Uniform status lifecycle across all types.** Every activity has a status stage: `open`, `done`, or `cancelled`. A note is created with `done`; a task is created with `open`. The initial stage is driven by a `default_stage` in the activity-type enum so the form can default sensibly per type.

**Extensible `activity_types` enum, same shape as `event_types`.** Core types shipped: `call`, `meeting`, `email`, `note`, `task`. Consuming apps add their own via the `activity_types` module var, merged with built-ins.

**Events still get emitted for lifecycle transitions.** `create-activity`, `update-activity`, `complete-activity`, `cancel-activity`, `reopen-activity`, `delete-activity` — each with `references` carrying the linked contact/company IDs so the system-events timeline on those entities reflects activity churn. The activity's own detail page shows its own system-events timeline.

**Separate `tile_activities` and `tile_events` on parent-entity detail pages.** Users see _what was done_ (activities) distinct from _what happened in the system_ (events). `tile_activities` is added as a new, parallel component titled "Activity". The existing `tile_events` on company/contact pages is retitled from "Activity" → "History" to resolve the name collision and align the UI labels with the user's mental model (activities = things users did; history = system audit log).

**Reserved `source` field for future auto-ingestion channels.** `source: { channel, external_ref, raw }` where `channel ∈ {manual, calendar, email-forward, whatsapp, voicenote}` and `external_ref` is the upstream ID (calendar event id, email message-id, WhatsApp message id). `raw` holds the original payload. Channel ingestion endpoints land in a later phase; the field is carved out now so the v1 schema is forward-compatible.

## Data model

Collection: `activities` (configurable via `collection` var, default `activities`).

```yaml
_id: UUID # generated client-side
type: call | meeting | email | note | task # extensible string — keyed into activity_types enum
title: string # short subject line
description: string # longer body (plain text for v1; markdown later if needed)
status: # newest-first array
  - stage: open | done | cancelled
    created:
      timestamp: ISODate
      user: { name, id }
contact_ids: [UUID, ...] # linked contacts
company_ids: [UUID, ...] # linked companies
# deal_ids: [UUID, ...]                # reserved for later — not created in v1
attributes: object # consumer-defined extra fields (same pattern as companies.attributes)
# Attachments are stored in the `files` module's own collection, keyed by
# a reference to this activity — not inlined here. See "Attachments" below.
source:
  channel: manual | calendar | email-forward | whatsapp | voicenote
  external_ref: string | null
  raw: object | null
created: change_stamp
updated: change_stamp
removed: null | change_stamp # soft-delete, same pattern as companies
```

### Indexes

- `{ contact_ids: 1 }` — activities-for-contact lookup
- `{ company_ids: 1 }` — activities-for-company lookup
- `{ 'status.0.stage': 1, 'updated.timestamp': -1 }` — list filters + sort. **Fixed-position, not multikey** — we only ever query current stage; a multikey index on `status.stage` would incorrectly match "has ever been in stage X".
- `{ type: 1 }` — type filter on list page
- `{ 'source.channel': 1, 'source.external_ref': 1 }` with `partialFilterExpression: { 'source.external_ref': { $exists: true } }` — dedupe for ingestion channels. (Not `sparse`: on a compound index, `sparse` only skips docs missing _all_ indexed fields, and `source.channel` is always set — so `sparse` would index every doc. A partial index on `external_ref` existence is the correct shape.)

### Derived values (pipeline)

On reads, a shared pipeline stage projects derived fields:

- `current_stage: $arrayElemAt: [$status.stage, 0]`
- `completed_at: $arrayElemAt: [{ $filter: { input: $status, cond: { $eq: [$$this.stage, 'done'] } } }.created.timestamp, 0]`
- `cancelled_at`: same pattern for `cancelled`
- `opened_at`: timestamp of the most recent `open` stage (handles reopens)

Lives in `modules/activities/requests/stages/add_derived_fields.yaml` so list, selector, and detail all share one source of truth.

### IDs

Activities use plain UUIDs (`_id` generated client-side). No human-readable
consecutive ID (`A-0001`-style) is issued. Activities are high-volume, are
rarely referenced by humans individually, and will be created from automated
channels where monotonic ID coordination is more trouble than it's worth.

### Attachments

Files attached to an activity live in the `files` module's own collection,
not inlined on the activity doc. The file record carries an
`activity_id` reference; the activity's detail page queries the files
collection to list them. This matches how `companies` handles attachments
and keeps S3 lifecycle logic in one place.

`tile_files` (from the `files` module) is embedded in the activity detail
page's sidebar with `reference_field: activity_id`.

### Default sort

Lists and tiles sort by `updated.timestamp` desc by default. If a scheduled
time is introduced later (see "Deferred" below), the list can expose a
secondary sort or preset for pending items by schedule.

## Module surface

Follows the `companies`/`contacts` entity-module layout.

```
modules/activities/
├── module.lowdefy.yaml
├── package.json
├── VARS.md
├── CHANGELOG.md
├── README.md
├── menus.yaml
├── connections/
│   └── activities-collection.yaml
├── enums/
│   ├── activity_types.yaml          # call, meeting, email, note, task — built-in set
│   └── event_types.yaml             # create-activity, update-activity, complete-activity, cancel-activity, reopen-activity, delete-activity
├── defaults/
│   └── event_display.yaml           # Nunjucks templates for the events this module emits
├── pages/
│   ├── activities.yaml              # list
│   ├── activity-detail.yaml         # view
│   ├── activity-edit.yaml           # edit existing
│   └── activity-new.yaml            # create
├── api/
│   ├── create-activity.yaml
│   ├── update-activity.yaml
│   └── change-activity-status.yaml  # status transitions — prepends to status array, emits stage-specific event
├── components/
│   ├── activity-selector.yaml       # MultipleSelector, for other modules linking TO activities
│   ├── tile_activities.yaml         # embeddable tile for contact/company (and later deal) detail pages
│   ├── capture_activity.yaml        # button + modal bundle for creating an activity from anywhere (see "Capture entry points")
│   ├── open_capture.yaml            # exported action sequence — opens the capture modal or navigates to /activities/new
│   ├── form_activity.yaml           # shared form (used by new + edit + capture modal)
│   ├── view_activity.yaml           # SmartDescriptions view
│   ├── table_activities.yaml        # AgGridBalham list
│   ├── filter_activities.yaml       # filter block for list page
│   ├── contact_list_items.yaml      # contact chips (parallels companies pattern)
│   ├── company_list_items.yaml      # company chips
│   └── fields/
│       ├── core.yaml                # type, title, description field defs
│       └── links.yaml               # contact + company selectors
├── requests/
│   ├── get_activities.yaml          # list
│   ├── get_activity.yaml            # detail
│   ├── get_activity_options.yaml    # selector feed
│   ├── get_activities_for_entity.yaml   # parameterised by { field, id } — feeds tile_activities
│   └── stages/
│       ├── add_derived_fields.yaml  # current_stage, completed_at, etc.
│       ├── match_filter.yaml
│       ├── lookup_contacts.yaml
│       └── lookup_companies.yaml
├── actions/
│   ├── complete_activity.yaml
│   ├── cancel_activity.yaml
│   └── reopen_activity.yaml
└── validate/
    └── activity.yaml                # field validation shared between create + update
```

### Module vars

Mirrors `companies`/`contacts` for consistency, plus the activity-specific `activity_types`.

| Var                                 | Default                             | Purpose                                                                                                                                                   |
| ----------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collection`                        | `activities`                        | MongoDB collection name                                                                                                                                   |
| `label`                             | `Activity`                          | Singular display label                                                                                                                                    |
| `label_plural`                      | `Activities`                        | Plural display label                                                                                                                                      |
| `activity_types`                    | `{}`                                | App-level additions to the built-in type enum. Same shape as `event_types`: keys are type strings, values have `title`, `color`, `icon`, `default_stage`. |
| `event_display`                     | `_ref: defaults/event_display.yaml` | Per-app Nunjucks templates for emitted events                                                                                                             |
| `fields.attributes`                 | `[]`                                | Consumer field-block array for the `attributes` object                                                                                                    |
| `components.table_columns`          | `[]`                                | Extra AgGrid columns                                                                                                                                      |
| `components.filters`                | `[]`                                | Extra filter blocks                                                                                                                                       |
| `components.main_slots`             | `[]`                                | Detail-page main-column slot overrides                                                                                                                    |
| `components.sidebar_slots`          | `[]`                                | Detail-page sidebar slot overrides                                                                                                                        |
| `components.download_columns`       | `[]`                                | Excel export column overrides                                                                                                                             |
| `request_stages.get_all_activities` | `[{ $addFields: {} }]`              | List pipeline hook                                                                                                                                        |
| `request_stages.selector`           | `[]`                                | Selector pipeline hook                                                                                                                                    |
| `request_stages.filter_match`       | `[]`                                | List filter-match hook                                                                                                                                    |
| `request_stages.write`              | `[]`                                | Appended to create + update pipelines                                                                                                                     |
| `filter_requests`                   | `[]`                                | Extra filter-request injections                                                                                                                           |

### Dependencies

- `layout` — page layout wrapper (required)
- `events` — emits lifecycle events + pulls `change_stamp` component (required)
- `contacts` — contact selector, linking (required)
- `companies` — company selector, linking (required)
- `files` — file attachments (optional, same treatment as in `companies`)

`contacts` and `companies` are deliberately required rather than
optional. The module's whole value proposition is _CRM activities
linked to contacts and companies_ — a consumer without either entity
isn't the target; the right answer for project-management-flavoured
use cases is a separate `tasks` module that reuses the status-array
pattern but not the CRM linking. Making these deps optional would
layer conditional field, selector, and detail-page wiring across the
module for a consumer who doesn't exist yet. `files`, by contrast, is
genuinely auxiliary — activities are still useful without
attachments, so that dep is optional.

## Activity types enum (built-in)

`modules/activities/enums/activity_types.yaml`:

```yaml
call:
  title: Call
  color: "#1890ff"
  icon: AiOutlinePhone
  default_stage: done # typically logged after the fact
meeting:
  title: Meeting
  color: "#722ed1"
  icon: AiOutlineCalendar
  default_stage: done # v1: meetings are logged after the fact (like calls/emails). Flip to 'open' once scheduled_at lands.
email:
  title: Email
  color: "#13c2c2"
  icon: AiOutlineMail
  default_stage: done # logged after sending
note:
  title: Note
  color: "#8c8c8c"
  icon: AiOutlineFileText
  default_stage: done # instant
task:
  title: Task
  color: "#fa8c16"
  icon: AiOutlineCheckSquare
  default_stage: open # awaiting completion
```

Merging pattern copied from `events.event_types`:

```yaml
# module.lowdefy.yaml
components:
  - id: activity_types
    component:
      _build.object.assign:
        - _ref: enums/activity_types.yaml
        - _module.var: activity_types
```

Consumers extend via the `activity_types` var.

## Events emitted

`modules/activities/enums/event_types.yaml`:

| Event type          | When                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| `create-activity`   | New activity inserted                                                             |
| `update-activity`   | Activity edited (non-status fields, or status edit that isn't a stage transition) |
| `complete-activity` | Status transitions to `done`                                                      |
| `cancel-activity`   | Status transitions to `cancelled`                                                 |
| `reopen-activity`   | Status transitions to `open` after being `done` or `cancelled`                    |
| `delete-activity`   | Soft-deleted via `removed` field                                                  |

Every emitted event carries `references: { contact_ids, company_ids, activity_ids: [self] }` so:

- The activity's own detail page shows its system-events timeline (via `activity_ids` reference on the events-timeline component, same pattern as company/contact detail pages).
- Each linked contact's and company's existing `tile_events` reflects activity lifecycle alongside other system events.

The `event_display` default provides Nunjucks titles like `{{ user.profile.name }} logged a {{ target.type_label }} with {{ target.title }}`.

## Linking: how parent entities surface activities

### Forward: list of activities on company / contact detail

New component `tile_activities` added to the `activities` module, consumed by `companies` and `contacts` (and later `deals`) in their existing sidebar-tile slots.

```yaml
# inside company-detail.yaml, sidebar_slots area (or via components.sidebar_slots var)
- _ref:
    module: activities
    component: tile_activities
    vars:
      reference_field: company_ids
      reference_value:
        _url_query: _id # matches how tile_events resolves the detail-page entity
```

The tile:

- Pulls recent activities via `get_activities_for_entity` request, parameterised by `reference_field` + `reference_value`.
- Shows a compact list ordered by `updated.timestamp` desc, with type icon, title, current-stage badge, and relative time.
- Embeds `capture_activity` in its header, prefilled with the current entity linked (see "Capture entry points" below). The tile **auto-wires its own list refetch** as the embedded `capture_activity`'s `on_created`, so a freshly captured activity appears immediately without a page refresh. Consumers placing `capture_activity` elsewhere (their own panel with its own list) follow the same pattern explicitly.
- "View all" link navigates to the activities list page with a pre-applied filter.

### Backward: picking activities from elsewhere

`activity-selector` component exported the same way `company-selector` and `contact-selector` are exported — Multiple or single-select, with search and recent-first ordering. Not required for v1 (no module currently needs to link _to_ an activity), but included because the pattern is cheap once the selector pipeline stage exists and future modules (deals, tickets) will want it.

## Capture entry points

Users create activities from many places: contact/company detail tiles,
page headers, the home page, a keyboard shortcut, a deep-link in an email
or chat. Rather than each consumer reimplementing the "create activity"
flow, the module exports one reusable component plus URL-param support on
the `/activities/new` page.

### `capture_activity` — primary export

A self-contained button-plus-modal bundle. Drop it anywhere on a page
and it provides a capture flow that stays in context (no navigation).

```yaml
- _ref:
    module: activities
    component: capture_activity
    vars:
      # Prefill — all optional
      prefill:
        type: call
        contact_ids:
          - _url_query: _id # host is contact-detail; matches how tile_events resolves context
        company_ids: []
        title: ""
        description: ""
      # Appearance
      label: Log activity
      icon: AiOutlinePlus
      button_type: primary # primary | default | link | text
      size: middle # small | middle | large
      # Behaviour
      mode: modal # modal (default) | page
      on_created: # optional action sequence to run after successful create
        - id: refetch_list
          type: Request
          params: get_activities_for_entity
```

Internals:

- The component is a Button + Modal pair. Clicking the button sets local
  state (`state.capture.open = true`, plus the prefill fields) and opens
  the modal.
- The modal renders `form_activity` (same form as the `/activities/new`
  page) with prefill applied.
- Submit calls the `create-activity` API, closes the modal, clears state,
  runs the consumer-provided `on_created` action sequence if present.
- Multiple instances can coexist on a page (header + tile + row action);
  each carries its own state.

The `mode: page` variant skips the modal and navigates to
`/activities/new` with the prefill serialised as URL params. Useful for
main-nav buttons where users expect a dedicated page, and for contexts
where a modal would feel wrong.

### `open_capture` action — custom triggers

Not every trigger is a button. An app menu item, a command palette entry,
a list row action, or a keyboard shortcut might all need to open the
capture flow. The `open_capture` action is exported as a **component**
(Lowdefy's cross-module sharing mechanism — there is no `action:` key on
`_ref`; any config fragment shared across modules is a component):

```yaml
events:
  onClick:
    _ref:
      module: activities
      component: open_capture
      vars:
        prefill:
          type: note
```

**Behaviour:** always navigates to `/activities/new` with the prefill
serialised as URL params — equivalent to `capture_activity`'s
`mode: page`. Never opens a modal. Consumers wanting an in-context
modal flow use `capture_activity` directly.

Why not "open the modal if `capture_activity` is on the page, else
navigate"? Because multiple `capture_activity` instances can coexist on
a page (header + tile + row action, each with its own state), and a
shared `open_capture` trigger has no way to pick which modal to open.
Single-purpose exports — `capture_activity` = modal, `open_capture` =
navigate — keep the mental model clean.

The file lives at `components/open_capture.yaml` and is declared in the
manifest's `components:` list, same as the other exports.

> **Future consideration — modal-from-link triggers.** Some flows want
> a link or table row that opens capture in a modal without leaving the
> current page (e.g., clicking a "+ log activity" link in a list cell).
> The always-navigate behaviour above is wrong for that case. If this
> surfaces as a real need, an additional export (`capture_activity_link`
> or similar — a link-styled trigger that carries its own modal instance
> with it) would be the cleanest extension, without having to reinstate
> the cross-instance targeting problem on `open_capture`.

### `/activities/new` page inputs — deep-link capture

The existing new-activity page accepts URL params so deep-links work:

```
/activities/new?type=call&contact_id=<uuid>&company_id=<uuid>
/activities/new?type=meeting&contact_ids[]=<uuid>&contact_ids[]=<uuid>
/activities/new?type=note&title=Quick%20follow-up
```

Supported params: `type`, `title`, `description`, `contact_id`,
`contact_ids[]`, `company_id`, `company_ids[]`. Missing params leave
form fields empty. This is what `mode: page` serialises to, and what
external links (emails, chat messages, Slack unfurls) target.

### Built-in placements

Set up once by the module; consumers get these for free.

- **`tile_activities` header** — embeds `capture_activity` prefilled with
  the tile's `reference_field` and `reference_value`. So a contact
  detail page renders the tile, and its "Log activity" button is
  pre-linked to that contact.
- **Main nav entry** — the module's `menus.yaml` includes a "New
  activity" item triggering `open_capture` (or linking to
  `/activities/new` if the consumer prefers).

Home-page placement is left to the consuming app — it drops
`capture_activity` wherever makes sense, usually a prominent
dashboard tile or header action.

### Why one component and not separate per-context buttons?

A single `capture_activity` that takes prefill vars keeps the capture
flow consistent across every entry point. If the form changes (new
field, new validation, new event), it changes in one place. Consumers
don't choose between `button_new_activity_for_contact` vs
`button_new_activity_for_company` vs `button_new_activity_quick` —
they just pass prefill.

## API surface

### `create-activity`

Input:

```yaml
{
  type: string, # required, from activity_types enum
  title: string, # required
  description: string, # optional
  initial_stage: string, # optional — overrides the type's default_stage
  contact_ids: [UUID], # optional
  company_ids: [UUID], # optional
  attributes: object, # optional — consumer fields
  source: { channel, external_ref, raw }, # optional, defaults to { channel: 'manual' }
}
```

Attachments are uploaded separately via the `files` module, keyed by an
`activity_id` reference — not included in this payload.

Routine (high-level):

1. Resolve initial stage (`initial_stage` || type's `default_stage`).
2. Insert activity doc with `status: [{ stage, created: change_stamp }]`, `created` + `updated` stamps, and `removed: null` (matches `create-company.yaml`; consumers downstream filter `{ removed: null }` on list queries).
3. Apply `request_stages.write` hook.
4. Emit `create-activity` event via `events.new-event` with:
   - `references: { contact_ids, company_ids, activity_ids: [new id] }`
   - `metadata: { activity_id: new id }` (matches the per-entity `metadata` pattern used by `create-company` / `create-contact` / `update-*`)
5. Return `{ activityId }`.

The same `metadata: { activity_id }` shape is included on every event
this module emits (`update-activity`, `complete-activity`,
`cancel-activity`, `reopen-activity`, `delete-activity`).

### `update-activity`

Updates editable fields (title, description, contact_ids, company_ids, attributes). Does **not** handle stage transitions — those go through `change-activity-status`. Emits `update-activity` with `references: { contact_ids, company_ids, activity_ids: [_id] }` carrying the **post-update** linked IDs only, matching the pattern used by `update-contact` and `update-company`.

> **Future consideration — delink visibility.** If a user removes contact X from an activity, contact X's events timeline sees nothing; as far as that timeline is concerned, the activity silently disappeared. Making delinks visible would require loading the pre-update doc, diffing old vs new link arrays, emitting `references` as the union (and potentially a dedicated `unlink-contact-from-activity` event type). Left out of v1 to match existing modules and avoid churn from future automated ingestion channels re-linking on every poll — revisit if user feedback shows the silent-unlink is confusing.

### `change-activity-status`

Input:

```yaml
{ activity_id: UUID, stage: open | done | cancelled }
```

Routine:

1. Load activity, read `status[0].stage` as current.
2. If `current === stage`, no-op (return).
3. Prepend the new stage entry to the status array:

   ```js
   { $push: { status: { $each: [{ stage, created: change_stamp }], $position: 0 } } }
   ```

   `$each` is required whenever `$position` is specified — without it,
   MongoDB rejects the update.

4. Emit the matching event (`complete-activity` / `cancel-activity` / `reopen-activity`) with full references.
5. Return `{ previous_stage, new_stage }`.

Split from `update-activity` so the UI can expose one-click "Mark done" / "Cancel" / "Reopen" actions without a full form submit, and so the correct event type fires without the API having to diff input against current state.

### Soft delete (no dedicated endpoint)

Delete is a status-like lifecycle event but rare enough that it's a button on the detail page calling `update-activity` with `removed: change_stamp`. The `delete-activity` event is emitted by the update API when it sees `removed` move from `null` to a stamp. (This matches how `companies.update-company` handles `removed`.)

## Pages

### `/activities` (list)

Standard list page: AgGridBalham table, filters panel (type, current stage, date range, linked contact, linked company, assignee-style), Excel download, pagination. Follows `.claude/guides/list-pages.md`. Row click → detail page.

### `/activities/<id>` (detail)

Layout mirrors company-detail:

- **Main column** — `view_activity` (SmartDescriptions: type, title, description, current stage, linked contacts/companies as chips). Plus a status-history timeline (reading the status array). Plus the events-timeline scoped to this activity.
- **Sidebar tiles** — files, linked contacts, linked companies, events.
- **Header actions** — Edit, Mark done / Reopen / Cancel, Delete.

### `/activities/<id>/edit` (edit)

`form_activity` wrapped in the standard edit-page layout. Submits to `update-activity`.

### `/activities/new` (create)

`form_activity` wrapped in the standard new-page layout. Submits to
`create-activity`.

Accepts URL params for prefill — see "Capture entry points → `/activities/new` page inputs"
for the full list. Used by `capture_activity` in `mode: page` and by
external deep-links (emails, chat messages, shortcuts).

## Integration with companies / contacts

No schema changes to `companies` or `contacts` — linking is one-way on the activity doc.

Two touch points:

1. **Add `tile_activities` to `company-detail.yaml` and `contact-detail.yaml`** — belongs in the sidebar. Wired with the appropriate `reference_field`. Done in each entity module, not on the activities side, since that's where the sidebar slot lives.
2. **No changes to `events`**. The events module is consumed as-is for event emission and change-stamp generation.

If an app wants activities but doesn't want the tile on companies by default, it can omit the tile from its `components.sidebar_slots` override.

## Future channels (reserved, not implemented in v1)

The `source` field on the activity doc is the seam for future auto-ingestion. Planned shape for each channel:

| Channel         | Trigger                                                                | External source     | `raw` contents                                          |
| --------------- | ---------------------------------------------------------------------- | ------------------- | ------------------------------------------------------- |
| `calendar`      | Calendar event created/updated (Google/Outlook via webhook or polling) | iCal UID            | Full calendar event JSON                                |
| `email-forward` | Email forwarded/cc'd to an app-specific address                        | Message-ID          | Parsed email (from, to, cc, subject, body, attachments) |
| `whatsapp`      | Message/voicenote to a bot number                                      | WhatsApp message ID | Message payload + transcription                         |
| `voicenote`     | Uploaded audio file to a capture endpoint                              | S3 key              | Transcription + audio reference                         |

Ingestion will land as separate Lambda functions (via `splice-lambda`) that call a new internal `ingest-activity` API. That API is not built in v1 but will be implemented by reusing `create-activity` with a non-manual `source` and contact/company resolution done in the Lambda (match sender email → contact → derive company linking).

Design decisions this phase locks in:

- `source.external_ref` is covered by a partial index (see "Indexes" above) to enable idempotent ingestion — a replay of the same calendar event updates the existing activity rather than inserting a duplicate.
- `source.channel` is a free string rather than a strict enum, so apps can add proprietary channels without changing the module.
- The `type` enum is independent of the `source` channel — a `calendar`-sourced activity can be of type `meeting` (expected) or `call` (a scheduled phone call).

## Files changed / added

**New module:**

- `modules/activities/` — full module tree as above.

**Touched modules:**

- `modules/companies/pages/company-detail.yaml` — add `tile_activities` to sidebar slots.
- `modules/contacts/pages/contact-detail.yaml` — add `tile_activities` to sidebar slots.
- `modules/companies/components/tile_events.yaml` — rename card `title` from `Activity` to `History`. The existing system-events tile is currently labelled "Activity" in the UI, which collides with the new `tile_activities`. Activities (user-created) keep the "Activity" label; the system-audit log becomes "History".
- `modules/contacts/components/tile_events.yaml` — same `title: Activity` → `title: History` rename.
- `modules/shared/enums/event_types.yaml` — include `_ref: ../activities/enums/event_types.yaml` in the assign chain, so app-level `event_types` aggregations pick up activity events.

**Demo app:**

- `apps/demo/modules.yaml` — register the `activities` module entry, wire `layout`/`events`/`contacts`/`companies`/`files` dependencies.
- `apps/demo/menus.yaml` — add nav link to activities list (via the module's `menus` export).
- `apps/demo/pages/` — home page embeds a prominent `capture_activity` (no prefill) as a working reference for consumers.

**No changes to:** `events`, `notifications`, `layout`, `user-admin`, `user-account`, `release-notes`, `data-upload`.

## Non-goals (v1)

- **Scheduled / due dates** — no `scheduled_at` field in v1. Adding it later is cheap (append a field, extend the form, extend indexes) and we avoid guessing the right shape now. See "Deferred" below.
- **Consecutive human IDs** (`A-0001`) — UUIDs only.
- **Priority field on tasks** — not a first-class field. Consumers needing it can add it via `attributes`; it can be promoted later if demand is proven.
- **File attachments inlined on the activity doc** — handled by the `files` module's own collection, keyed by `activity_id`.
- **Auto-ingestion from calendar / email / WhatsApp / voicenotes** — schema reserves space; implementation is a later phase.
- **Recurrence** — no "repeats weekly" modelling. A recurring meeting is N separate activities until we need otherwise.
- **Reminders / notifications for upcoming activities** — the `notifications` module can be wired in by a consumer, but the activities module doesn't push reminders itself in v1.
- **Assignment to multiple users** — activities have a creator (via `created.user`). A dedicated `assigned_to` field is not in v1; can be added as an attribute by consumers, and promoted to a first-class field later.
- **Rich-text description** — plain text for v1. Markdown or rich-text can land later without migration (field is already a string).
- **Activity templates / canned responses** — out of scope.
- **Deals linking** — `deal_ids` is reserved in the design but not added to the schema/pipeline/UI until the `deals` module exists.

## Deferred

### Scheduled / due dates

`scheduled_at` is deferred until a real need emerges — most likely when
calendar-channel ingestion lands, since that's where planned times become
unavoidable. When we add it, the shape choice is between:

**A. Top-level `scheduled_at: ISODate` field.** Simple to query, sort, and
display. Clear separation — status tracks lifecycle, schedule tracks planned
time. Reschedules overwrite the field; reschedule history is captured by
`update-activity` events.

**B. `scheduled` stage inside the status array**, with the timestamp on the
entry: `{ stage: 'scheduled', scheduled_for: ISODate, created: change_stamp }`.
Single history structure; reschedules produce new entries. But mixes
"current state" and "planned time" semantics — `current_stage` then
includes `scheduled`, which downstream queries ("show me open work") have to
special-case.

**Lean when we revisit:** A. B unifies two things that aren't really the
same — a planned time and a lifecycle stage — and forces every filter and
sort to branch on `scheduled` as a pseudo-state.

Migration path is clean either way: the status-array pattern already
records history, and adding a scalar field or a new stage type doesn't
invalidate existing docs.
