# Activities Module

## Problem

The monorepo models CRM entities (`companies`, `contacts`) and immutable audit (`events`) but has no place for **editable, user-owned records of work done with or for those entities** — calls made, meetings held, emails sent.

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

**Uniform status lifecycle across all types.** Every activity has a status stage: `open`, `done`, or `cancelled`. v1's built-in types (`call`, `meeting`, `email`) are all logged after the fact and created `done`. The initial stage is driven by a `default_stage` in the activity-type enum so the form can default sensibly per type — consumer-added types (or a future `meeting` flip once `scheduled_at` lands) can default to `open` instead.

**Extensible `activity_types` enum, same shape as `event_types`.** Core types shipped: `call`, `meeting`, `email` — past-tense external interactions, all with future auto-ingestion channels. Consuming apps add their own via the `activity_types` module var, merged with built-ins. **`task` and `note` are deliberately not built-in types in v1** — see "Non-goals" and `decisions.md`. Tasks (forward-looking work items) belong in a separate module designed alongside due-date, assignee, and priority. Notes (text jotted against an entity) belong in the existing event-based comments pattern that production apps already implement (`*_comment` event types — comment text + author + timestamp + entity reference, surfaced in the events timeline) — append-only, attached via event `references`, no separate editable entity needed.

**Events still get emitted for lifecycle transitions.** `create-activity`, `update-activity`, `complete-activity`, `cancel-activity`, `reopen-activity`, `delete-activity` — each with `references` carrying the linked contact/company IDs so the system-events timeline on those entities reflects activity churn. The activity's own detail page shows its own system-events timeline.

**Separate `tile_activities` and `tile_events` on parent-entity detail pages, with activities as an optional dependency.** Users should see _what was done_ (activities) distinct from _what happened in the system_ (events). The activities module exports `tile_activities` as a self-contained, parameterised tile; apps that want activities surfacing on companies/contacts wire it via app-level `components.sidebar_slots` overrides. Companies and contacts do **not** depend on activities — same shape as how files-on-companies works (companies declares files as a dep but doesn't bake `tile_files` into its view). The existing `tile_events` on company/contact pages is retitled from "Activity" → "History" pre-emptively, so apps that DO add activities tiles don't hit the title collision; "History" is also the better label for the system-audit log regardless.

**Reserved `source` field for future auto-ingestion channels.** `source: { channel, external_ref, raw }` where `channel ∈ {manual, calendar, email-forward, whatsapp, voicenote}` and `external_ref` is the upstream ID (calendar event id, email message-id, WhatsApp message id). `raw` holds the original payload. Channel ingestion endpoints land in a later phase; the field is carved out now so the v1 schema is forward-compatible.

## Data model

Collection: `activities` — hardcoded in `connections/activities-collection.yaml` alongside the `databaseUri` and `changeLog` config (matches the convention in `modules/companies/connections/companies-collection.yaml` and `modules/contacts/connections/contacts-collection.yaml`). Apps wanting a different collection name override the `activities-collection` connection in their `modules.yaml`. There's no `collection` module var — the codebase has consolidated to one way of configuring this (override the connection), not two.

```yaml
_id: UUID # generated client-side
type: call | meeting | email # extensible string — keyed into activity_types enum
title: string # short subject line
description: string # longer body — rich-text HTML, edited and rendered via the Tiptap block (Lowdefy v5)
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
removed: null | change_stamp # null on insert (matches create-company); set to change_stamp by `delete-activity`
```

### Indexes

- `{ contact_ids: 1 }` — activities-for-contact lookup
- `{ company_ids: 1 }` — activities-for-company lookup
- `{ 'status.0.stage': 1, 'updated.timestamp': -1 }` — list filters + sort. **Fixed-position, not multikey** — we only ever query current stage; a multikey index on `status.stage` would incorrectly match "has ever been in stage X".
- `{ type: 1 }` — type filter on list page
- `{ 'source.channel': 1, 'source.external_ref': 1 }` with `partialFilterExpression: { 'source.external_ref': { $exists: true } }` — dedupe for ingestion channels. (Not `sparse`: on a compound index, `sparse` only skips docs missing _all_ indexed fields, and `source.channel` is always set — so `sparse` would index every doc. A partial index on `external_ref` existence is the correct shape.)
- **Atlas Search index** on `activities` covering `removed.timestamp`, `title`, `description`, `type`, `status.0.stage` (and any consumer-added filter fields via `request_stages.filter_match`) — feeds the list page's free-text search + filter clauses, mirroring how `get_all_companies.yaml` uses `$search`.

### Derived values (pipeline)

On reads, a shared pipeline stage projects derived fields:

```yaml
$addFields:
  current_stage: { $arrayElemAt: ["$status.stage", 0] }
  completed_at:
    $let:
      vars:
        done:
          $arrayElemAt:
            - $filter:
                input: "$status"
                cond: { $eq: ["$$this.stage", "done"] }
            - 0
      in: "$$done.created.timestamp"
  cancelled_at: # same shape as completed_at, cond: { $eq: ["$$this.stage", "cancelled"] }
  opened_at:    # same shape, cond: { $eq: ["$$this.stage", "open"] } — most recent open, handles reopens
```

Lives in `modules/activities/requests/stages/add_derived_fields.yaml` so list, selector, and detail all share one source of truth.

### IDs

Activities use plain UUIDs (`_id` generated client-side). No human-readable
consecutive ID (`A-0001`-style) is issued. Activities are high-volume, are
rarely referenced by humans individually, and will be created from automated
channels where monotonic ID coordination is more trouble than it's worth.

### Attachments

Files attached to an activity live in the `files` module's collection,
keyed by `(entity_type: 'activity', entity_id: <activity uuid>)` — the
same indexing surface every other entity module uses. Nothing is
inlined on the activity doc; S3 lifecycle stays in the files module.

The detail page's sidebar refs `files.file-card` directly:

```yaml
- _ref:
    module: files
    component: file-card
    vars:
      entity_type: activity
      entity_id:
        _url_query: _id
```

No local `tile_files.yaml` wrapper. `file-card` is already a
card-styled component (its own name says so) that takes
`entity_type` + `entity_id` as vars. A local wrapper that hardcodes
`entity_type` and forwards `entity_id` adds an indirection without
adding behaviour — Sam flagged this on PR #32 and we deleted the
unused wrappers in companies and contacts as part of the same change.
The `files` module's existing exports (`file-card`, `file-manager`,
`file-list`) are the canonical surface; consumers ref them directly.

If activities ever needs a wrapper that does real work — header
buttons, custom card title, additional blocks alongside the file
card — we add a local `tile_activity_files.yaml` THEN, mirroring how
`tile_events.yaml` wraps the cross-module `events-timeline` with a
`layout.card`. Until there's something to wrap, the inline ref is
the right shape.

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
│   ├── activity_types.yaml          # call, meeting, email — built-in set (no `task` or `note` in v1)
│   └── event_types.yaml             # create-activity, update-activity, complete-activity, cancel-activity, reopen-activity, delete-activity
├── defaults/
│   ├── event_display.yaml           # Nunjucks templates for the events this module emits
│   └── event_target.yaml            # shared `target` object built at every emit site (title/type/type_label lookup) — see "Events emitted"
├── pages/
│   ├── all.yaml                     # list (pageId: all)
│   ├── view.yaml                    # detail (pageId: view)
│   ├── edit.yaml                    # edit existing (pageId: edit)
│   └── new.yaml                     # create (pageId: new)
├── api/
│   ├── create-activity.yaml
│   ├── update-activity.yaml
│   ├── change-activity-status.yaml  # status transitions — prepends to status array, emits stage-specific event
│   └── delete-activity.yaml         # soft-delete — sets removed: change_stamp, emits delete-activity event
├── components/
│   ├── activity-selector.yaml       # MultipleSelector, for other modules linking TO activities
│   ├── tile_activities.yaml         # cross-module self-contained tile: layout.card + activities-timeline + capture_activity in header. Apps drop this into companies/contacts sidebar slots.
│   ├── activities-timeline.yaml     # cross-module content-only block: list + filters + view-all link, no card. Building block for apps wanting custom wrappers.
│   ├── capture_activity.yaml        # button + modal bundle for creating an activity from anywhere (see "Capture entry points")
│   ├── open_capture.yaml            # exported action sequence — navigates to `pageId: new` with prefill in urlQuery
│   ├── form_activity.yaml           # shared form (used by new + edit + capture modal)
│   ├── view_activity.yaml           # SmartDescriptions view
│   ├── table_activities.yaml        # AgGridBalham list
│   ├── filter_activities.yaml       # filter block for list page
│   ├── excel_download.yaml          # Excel export trigger on list page (mirrors companies/contacts)
│   ├── contact_list_items.yaml      # contact chips (parallels companies pattern)
│   ├── company_list_items.yaml      # company chips
│   └── fields/
│       ├── core.yaml                # type, title, description field defs
│       └── links.yaml               # contact + company selectors
├── requests/
│   ├── get_activities.yaml          # list
│   ├── get_activity.yaml            # detail
│   ├── get_activity_options.yaml    # selector feed
│   ├── get_activities_for_entity.yaml   # parameterised by { field, id } — feeds activities-timeline
│   ├── get_activities_excel_data.yaml   # Excel export aggregation (mirrors get_company_excel_data.yaml)
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

### Exports

`module.lowdefy.yaml`'s `exports:` block (matches the shape companies/contacts use):

| Section       | Exported                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `pages`       | `all`, `view`, `edit`, `new`                                                                      |
| `connections` | `activities-collection`                                                                           |
| `api`         | `create-activity`, `update-activity`, `change-activity-status`, `delete-activity`                 |
| `components`  | `activity-selector`, `tile_activities`, `activities-timeline`, `capture_activity`, `open_capture` |
| `menus`       | `default`                                                                                         |

The other `components/` files (`form_activity`, `view_activity`, `table_activities`, `filter_activities`, `excel_download`, `contact_list_items`, `company_list_items`, `fields/*`) are internal — referenced by this module's own pages and not exposed to consumers.

The cross-module export surface is wider than companies (1 component) or contacts (2 components). Two reasons specific to this module:

- `tile_activities` (self-contained card + content drop-in) and `activities-timeline` (content-only block) mirror the files module's `file-card` (self-contained drop-in) + `file-manager` (content-only) pair. Apps drop `tile_activities` into companies/contacts sidebar slots for the standard "show activities for this entity" affordance; apps wanting custom layouts use `activities-timeline` as a building block. The shape follows the **files pattern** because activities is an optional dep for parent entities — there are no consumer-side files to wrap in, so the self-contained tile is the integration surface, just like `file-card` is for files. (Contrast: `events.events-timeline` is content-only and consumers ship local `tile_events.yaml` wrappers in companies/contacts — but events is a **required** dep for parent entities, so the consumer-wrapper pattern works there.)
- `capture_activity` and `open_capture` codify the "log activity from anywhere" flow, which is more involved than companies' "create company" flow. The capture modal carries form prefill, validation, action wiring, and `on_created` callbacks — all of which would have to be recreated by every consumer reaching for an inline create button. Companies/contacts can stay internal because their "create" flow is a page navigation (`_module.pageId: { id: new, module: companies }`) — replicable in any consumer with one Link action. Activities' equivalent is `open_capture` (page mode); `capture_activity` adds the in-context modal flow that page navigation can't deliver.

### Module vars

Mirrors `companies`/`contacts` for consistency, plus the activity-specific `activity_types`.

The table below is shorthand. The actual `module.lowdefy.yaml` declares vars in the structured form used by `modules/companies/module.lowdefy.yaml:15-99` — `type:`, `default:`, `description:`, with nested `properties:` for object-typed vars (`fields`, `components`, `request_stages`). Flattened keys like `request_stages.write` and `components.main_slots` expand to nested `properties:` blocks; defaults and descriptions sit on the leaves.

| Var                                 | Default                             | Purpose                                                                                                                                                   |
| ----------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
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

The required/optional distinction above is editorial — the manifest's `dependencies:` list (see `modules/companies/module.lowdefy.yaml:5-13`) doesn't carry a `required` flag; the runtime treats every declared dep the same. The labels here document which deps the module assumes present at runtime: a consumer omitting `contacts` or `companies` from its `modules.yaml` will get build-time errors when the activities module tries to ref `contacts.contact-selector` etc., while omitting `files` will only surface as a missing `files.file-card` ref in the activity detail page's sidebar — the rest of the module keeps working.

Symmetrically, **companies and contacts do NOT depend on activities** — apps that wire activities-tiles into companies/contacts ship the slot override at app config level. See "Linking → Forward" and "Integration with companies / contacts" sections.

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
| `update-activity`   | Activity's editable fields edited (title, description, contact_ids, company_ids, attributes) |
| `complete-activity` | Status transitions to `done`                                                      |
| `cancel-activity`   | Status transitions to `cancelled`                                                 |
| `reopen-activity`   | Status transitions to `open` after being `done` or `cancelled`                    |
| `delete-activity`   | Activity soft-deleted                                                             |

Every emitted event carries `references: { contact_ids, company_ids, activity_ids: [self] }` so:

- The activity's own detail page shows its system-events timeline (via `activity_ids` reference on the events-timeline component, same pattern as company/contact detail pages).
- Each linked contact's and company's existing `tile_events` reflects activity lifecycle alongside other system events.

The `event_display` default provides Nunjucks titles like `{{ user.profile.name }} logged a {{ target.type_label }} with {{ target.title }}`.

The `target` object is built at each emit site (mirroring `update-company.yaml:128-138`'s `target.name = _payload[name_field]` pattern), with one extra step — `target.type_label` looks up the human label from the merged `activity_types` enum at runtime via `_get`:

```yaml
target:
  title: { _payload: title }
  type:  { _payload: type }
  type_label:
    _get:
      from:
        _build.object.assign:
          - _ref: enums/activity_types.yaml
          - _module.var: activity_types
      key:
        _string.concat:
          - _payload: type
          - .title
      default: { _payload: type }
```

`from` is build-time-resolved (the merged enum, including consumer-added types via `_module.var: activity_types`). `key` is runtime — `_payload.type` concatenated with `".title"` produces e.g. `"call.title"`, which `_get` resolves as a deep path into `from`. `default: _payload.type` falls back to the raw type string if the lookup misses, so the rendered title degrades to "logged a call" rather than erroring.

Same `target` shape used by every emitted event (`create-activity`, `update-activity`, `complete-activity`, `cancel-activity`, `reopen-activity`, `delete-activity`). Factored into `defaults/event_target.yaml` and `_ref`'d from each API call site so the lookup isn't duplicated across the six emit points.

## Linking: how parent entities surface activities

### Forward: list of activities on company / contact detail

**Activities is an optional dependency for companies and contacts.** Neither module declares `activities` in its manifest's `dependencies:`, neither ships a local `tile_activities.yaml`, neither embeds activities tiles in `view.yaml`. Apps that want activity tiles surfacing on companies/contacts wire them at app level via `components.sidebar_slots` overrides — same shape as how files-on-companies works today (companies declares `files` as a dep but doesn't bake `tile_files` into its view; apps that want files-on-companies slot the embed themselves; per `decisions.md` §4 we deleted the unused `tile_files.yaml` wrappers as part of this PR's `tile_files` consolidation).

This is a deliberate departure from how events couples to companies/contacts (where `events` is a required dep and `tile_events.yaml` lives in each entity module). Sam's PR-32 review flagged the question: *"Do these modules get a dependancy on activities now? Do we want this to be optional? I'm not sure"* — and we agreed that not every consumer of companies/contacts is doing CRM. A company-directory app shouldn't have to ship activities just to use companies.

**The activities module exports `tile_activities`** — a self-contained, parameterised tile (`layout.card` wrapping `activities-timeline` content + `capture_activity` in header buttons). Apps drop it into companies' / contacts' sidebar slots from their own config:

```yaml
# in apps/<app>/modules/companies/vars.yaml (or wherever the app overrides companies' vars)
components:
  sidebar_slots:
    - _ref:
        module: activities
        component: tile_activities
        vars:
          reference_field: company_ids
          reference_value:
            _url_query: _id
          # Optional: title override (defaults to "Activity")
          # Optional: prefill passthrough to the embedded capture_activity
          prefill:
            company_ids:
              - _url_query: _id
```

Same shape on the contacts side, swapping `company_ids` → `contact_ids`.

`tile_activities` accepts:

| Var | Default | Purpose |
| --- | --- | --- |
| `reference_field` | required | Which activity-link array to filter by — `contact_ids` / `company_ids` (and later `deal_ids`). |
| `reference_value` | required | The entity ID to filter on. Typically `{ _url_query: _id }` for detail-page hosts. |
| `title` | `Activity` | Card title. |
| `prefill` | `{}` | Forwarded to the embedded `capture_activity`'s `prefill` var so logged activities pre-link to the host entity. |
| `show_capture` | `true` | Set `false` to hide the header capture button (read-only sidebar tile). |

`tile_activities` also auto-wires its own list-refetch as the embedded `capture_activity`'s `on_created`, so a freshly captured activity appears in the tile immediately without a page refresh.

**Why `tile_activities` is self-contained, not a content-only block plus consumer wrappers.** This mirrors the files module: `file-card` is a self-contained card-styled drop-in that apps slot into companies/contacts sidebars; `file-manager` is the content-only building block for custom wrappers. Activities follows the same pair-of-exports shape — `tile_activities` (drop-in) + `activities-timeline` (content-only) — because it sits in the same architectural position: optional dependency for parent entities, app-level slot wiring, no consumer module to host a wrapper file in. The tile has to live in activities itself.

(This partially reverses review-5 #4's resolution, which had landed on the events-style pattern — content-only `activities-timeline` + local `tile_activities.yaml` wrappers in companies/contacts. That made sense when activities was a required dep. Once Sam's PR-32 #4 review pushed us toward optional, the whole topology flipped: no consumer modules to put wrappers in, so the tile centralises in activities and apps wire it themselves. See `decisions.md` §7 for the full chain of reasoning.)

The "View all" link inside `tile_activities`:

```yaml
events:
  onClick:
    - id: go_activities
      type: Link
      params:
        pageId: { _module.pageId: { id: all, module: activities } }
        urlQuery:
          # one of these — driven by reference_field
          contact_id: { _url_query: _id }
          # company_id: { _url_query: _id }
```

The activities list page (`pageId: all`) reads `_url_query: contact_id` and `_url_query: company_id` on `onInit` and pre-populates its filter state — see the list page section below.

### Backward: picking activities from elsewhere

`activity-selector` component exported the same way `company-selector` and `contact-selector` are exported — Multiple or single-select, with search and recent-first ordering. Not required for v1 (no module currently needs to link _to_ an activity), but included because the pattern is cheap once the selector pipeline stage exists and future modules (deals, tickets) will want it.

## Capture entry points

Users create activities from many places: contact/company detail tiles,
page headers, the home page, a keyboard shortcut, a deep-link in an email
or chat. Rather than each consumer reimplementing the "create activity"
flow, the module exports one reusable component plus URL-param support on
the new-activity page (`pageId: new`).

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
- The modal renders `form_activity` (same form as the new-activity
  page) with prefill applied.
- Submit calls the `create-activity` API, closes the modal, clears state,
  runs the consumer-provided `on_created` action sequence if present.
- Multiple instances can coexist on a page (header + tile + row action);
  each carries its own state.

The `mode: page` variant skips the modal and links to `pageId: new`
with the prefill carried in `urlQuery`. Useful for main-nav buttons
where users expect a dedicated page, and for contexts where a modal
would feel wrong.

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
          type: call
```

**Behaviour:** always links to `pageId: new` with the prefill carried
in `urlQuery` — equivalent to `capture_activity`'s `mode: page`. Never
opens a modal. Consumers wanting an in-context modal flow use
`capture_activity` directly.

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

### `pageId: new` query params — deep-link capture

The new-activity page accepts URL query params so deep-links work.
Lowdefy URLs don't carry path params, so the contract is purely the
query string — the path itself is set by the consuming app's page
config:

```
?type=call&contact_id=<uuid>&company_id=<uuid>
?type=meeting&contact_ids[]=<uuid>&contact_ids[]=<uuid>
?type=email&title=Quick%20follow-up
```

Supported params: `type`, `title`, `contact_id`, `contact_ids[]`,
`company_id`, `company_ids[]`. Missing params leave form fields empty.
This is what `mode: page` serialises to (via `Link → pageId: new`,
`urlQuery: { … }`), and what external links (emails, chat messages,
Slack unfurls) target.

`description` is deliberately not URL-prefillable. The field renders
through the Tiptap block (rich-text HTML), and round-tripping HTML
through URL params is awkward enough — and the use cases thin enough —
to leave the field blank on landing. Channels that genuinely need to
seed body content (calendar/email/WhatsApp ingestion) bypass the URL
contract and call `create-activity` directly with `source: { … }` set.

### Built-in placements

Set up once by the module; consumers get these for free.

- **`tile_activities` header** — the cross-module `tile_activities` export embeds `capture_activity` in its `header_buttons`, forwards the host's entity as prefill (via the consumer-passed `prefill` var), and auto-wires `on_created` to refetch the embedded `activities-timeline`. Apps that slot `tile_activities` into companies/contacts get a "Log activity" button on the tile pre-linked to the host entity, with the new activity appearing immediately without a page refresh — no per-app wiring needed beyond the slot ref.
- **Main nav entry** — the module's `menus.yaml` includes a "New
  activity" item triggering `open_capture` (or linking to
  `pageId: new` directly if the consumer prefers).

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

Four endpoints: `create-activity`, `update-activity`, `change-activity-status`, `delete-activity`. The three files under `actions/` (`complete_activity.yaml`, `cancel_activity.yaml`, `reopen_activity.yaml`) are CallApi wrappers around `change-activity-status` with the target stage hardcoded — they let UI elements (Mark done, Reopen, Cancel buttons) trigger the transition without rebuilding the call site each time.

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
2. Insert activity doc with `status: [{ stage, created: change_stamp }]`, `created` + `updated` stamps, and `removed: null` (matching `create-company.yaml`). List requests filter soft-deletes via Atlas Search `compound.filter.mustNot: exists: path: removed.timestamp` (the shape used by `get_all_companies.yaml`). Detail and tile requests use plain `$match: { 'removed.timestamp': { $exists: false } }`. Don't copy `get_company.yaml`'s `removed: { $ne: true }` — it's a bug (the `removed` change_stamp object is `≠ true`, so deleted docs match).
3. Apply `request_stages.write` hook.
4. Emit `create-activity` event via `events.new-event` with:
   - `references: { contact_ids, company_ids, activity_ids: [new id] }`
   - `metadata: { activity_id: new id }` (matches the per-entity `metadata` pattern used by `create-company` / `create-contact` / `update-*`)
5. Return `{ activityId }`.

The same `metadata: { activity_id }` shape is included on every event
this module emits (`update-activity`, `complete-activity`,
`cancel-activity`, `reopen-activity`, `delete-activity`).

### `update-activity`

Updates editable fields (title, description, contact_ids, company_ids, attributes). Does **not** handle stage transitions (`change-activity-status`) or soft-delete (`delete-activity`).

Routine mirrors `update-company.yaml`:

1. `MongoDBUpdateOne` filtered on `_id` and `updated.timestamp` — optimistic concurrency. If the timestamp moved between load and write, the update misses and the API returns a stale-state error; client retries with the fresh stamp.
2. `$set` editable fields plus `updated: change_stamp`. Apply `request_stages.write` hook.
3. Emit `update-activity` with `references: { contact_ids, company_ids, activity_ids: [_id] }` carrying the **post-update** linked IDs only (matching `update-contact` / `update-company`) and `metadata: { activity_id }`.

> **Future consideration — delink visibility.** If a user removes contact X from an activity, contact X's events timeline sees nothing; as far as that timeline is concerned, the activity silently disappeared. Making delinks visible would require loading the pre-update doc, diffing old vs new link arrays, emitting `references` as the union (and potentially a dedicated `unlink-contact-from-activity` event type). Left out of v1 to match existing modules and avoid churn from future automated ingestion channels re-linking on every poll — revisit if user feedback shows the silent-unlink is confusing.

### `change-activity-status`

Input:

```yaml
{ activity_id: UUID, stage: open | done | cancelled }
```

Routine:

1. Load activity, read `status[0].stage` and `updated.timestamp`. (This is a deliberate departure from `update-company.yaml`, which trusts the client to send `updated.timestamp`. The load step buys idempotency on concurrent same-direction flips: if user A marks done and user B clicks "Mark done" before refetching, B silently succeeds in step 2 instead of getting a stale-state error. For interactive status buttons on a multi-user CRM the smoother UX is worth one extra Mongo round-trip.)
2. If `loaded.status[0].stage === stage`, no-op (return).
3. `MongoDBUpdateOne` with optimistic concurrency on both the loaded
   stage and timestamp — both must still match at write time:

   ```yaml
   filter:
     _id: { _payload: activity_id }
     status.0.stage: { _step: load.0.status.0.stage }
     updated.timestamp: { _step: load.0.updated.timestamp }
   update:
     $set:
       updated: { _ref: { module: events, component: change_stamp } }
     $push:
       status:
         $each: [{ stage, created: change_stamp }]
         $position: 0
   ```

   `$each` is required whenever `$position` is specified — without it
   MongoDB rejects the update. Bumping `updated.timestamp` keeps default
   sort (`updated.timestamp desc`) reflecting status flips per
   `decisions.md` §3. The filter on `status.0.stage` and
   `updated.timestamp` prevents two simultaneous "Mark done" clicks
   from each pushing a `done` entry — only the first lands; the
   second's filter misses.

4. Emit the matching event (`complete-activity` / `cancel-activity` / `reopen-activity`) with full references.
5. Return `{ previous_stage, new_stage }`.

Split from `update-activity` so the UI can expose one-click "Mark done" / "Cancel" / "Reopen" actions without a full form submit, and so the correct event type fires without the API having to diff input against current state.

### `delete-activity`

Input:

```yaml
{ activity_id: UUID }
```

Routine:

1. Update doc with `$set: { removed: change_stamp, updated: change_stamp }`,
   filtered on `_id` and `updated.timestamp` (optimistic concurrency, same
   as the other writes).
2. Emit `delete-activity` event with `references: { contact_ids,
   company_ids, activity_ids: [_id] }` and `metadata: { activity_id }`.
3. Return `{ success: true }`.

Dedicated single-purpose endpoint, mirroring the
`change-activity-status` precedent and the `files` module's
`delete-file`. Keeps `update-activity`'s editable-fields list clean
(no `removed` smuggled in) and makes the event-emission contract
obvious from the call site — the detail page's "Delete" button calls
`delete-activity`, end of story.

## Pages

Page IDs follow the entity-module convention (`all`, `view`, `edit`,
`new`). Lowdefy doesn't support nested URL paths or path params, so
entity IDs travel as `?_id=<uuid>` query params; cross-module
navigation goes via `pageId` rather than hard-coded URLs. The actual
URL slug for each page is set by the consuming app's page config.

### `pageId: all` — list

Standard list page: AgGridBalham table, filters panel (type, current stage, date range, linked contact, linked company, assignee-style), Excel download, pagination. Follows `.claude/guides/list-pages.md`. Row click links to `pageId: view` with `urlQuery: { _id }`.

**URL param hydration.** On `onInit`, `SetState` on `filter` from
`_url_query: contact_id` and `_url_query: company_id` (singular,
optional). When present, the list mounts with the corresponding
linked-entity filter pre-applied — feeds `tile_activities`'s "View
all" link and works as a deep-link contract for external triggers
(reminder emails, dashboards, Slack unfurls landing on
"activities for this contact"). Mirrors `pageId: new`'s URL-prefill
contract — same query-string-only convention, no path params.

### `pageId: view` — detail

Layout mirrors company-detail. Resolves the activity from `_url_query: _id`.

- **Main column** — `view_activity` (SmartDescriptions: type, title, description, current stage, linked contacts/companies as chips). Plus a status-history timeline (reading the status array). Plus the events-timeline scoped to this activity.
- **Sidebar tiles** — files, linked contacts, linked companies, events.
- **Header actions** — Edit, Mark done / Reopen / Cancel, Delete.

### `pageId: edit` — edit

`form_activity` wrapped in the standard edit-page layout. Resolves the activity from `_url_query: _id`. Submits to `update-activity`.

### `pageId: new` — create

`form_activity` wrapped in the standard new-page layout. Submits to
`create-activity`.

Accepts URL query params for prefill — see "Capture entry points →
`pageId: new` query params" for the full list. Used by
`capture_activity` in `mode: page` and by external deep-links (emails,
chat messages, shortcuts).

## Integration with companies / contacts

No schema changes to `companies` or `contacts` — linking is one-way on the activity doc. Companies and contacts do not declare `activities` as a dependency; activities is genuinely optional for any consumer of these modules.

Two touch points:

1. **Apps that want activity tiles on companies/contacts wire `tile_activities` into the parent module's sidebar slots** at app config level — e.g., in the app's `modules/companies/vars.yaml` (or wherever the app overrides companies' vars):

   ```yaml
   components:
     sidebar_slots:
       - _ref:
           module: activities
           component: tile_activities
           vars:
             reference_field: company_ids
             reference_value:
               _url_query: _id
   ```

   No changes to companies' or contacts' module manifests; no new files in companies' or contacts' `components/`. The wiring lives where it makes sense — at the app level where activities + companies are both wired together.

2. **Rename `tile_events`'s card title from "Activity" to "History"** in companies and contacts. Pre-emptive collision protection for apps that wire `tile_activities`; also a better label for the system-audit log regardless of whether activities is wired.

**No changes to `events`.** The events module is consumed as-is for event emission and change-stamp generation.

Apps that want companies/contacts without activities ship neither the activities module nor the slot override — companies/contacts work standalone. Apps that want activities-without-companies-or-contacts won't compile (activities still depends on contacts and companies for its own selectors and form fields, per the Dependencies section above), but the inverse is fully supported.

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

- `modules/companies/components/tile_events.yaml` — rename card `title` from `Activity` to `History`. Pre-emptive collision protection for apps that wire `tile_activities` via slot overrides; also a better label for the system-audit log regardless.
- `modules/contacts/components/tile_events.yaml` — same `title: Activity` → `title: History` rename.
- `modules/companies/components/tile_files.yaml` — **deleted** (unused dead-indirection wrapper; per `decisions.md` §4 / Sam's PR-32 review).
- `modules/contacts/components/tile_files.yaml` — **deleted** (same reason).
- `modules/shared/enums/event_types.yaml` — include `_ref: ../activities/enums/event_types.yaml` in the assign chain, so app-level `event_types` aggregations pick up activity events.

**No changes to** companies' or contacts' module manifests (no new dependency on activities), `view.yaml` files (no new sidebar embeds — apps wire `tile_activities` themselves), or any other companies/contacts production files.

**Demo app:**

- `apps/demo/modules.yaml` — register the `activities` module entry, wire `layout`/`events`/`contacts`/`companies`/`files` dependencies. Plus: in the `companies` and `contacts` module entries' vars overrides, add `tile_activities` to `components.sidebar_slots` so the demo app's company / contact detail pages show the activities tile. Working reference for consumers wiring activities into a CRM-flavored deployment.
- `apps/demo/menus.yaml` — add nav link to activities list (via the module's `menus` export).
- `apps/demo/pages/` — home page embeds a prominent `capture_activity` (no prefill) as a working reference for consumers.

**No changes to:** `events`, `notifications`, `layout`, `user-admin`, `user-account`, `release-notes`, `data-upload`.

## Non-goals (v1)

- **Scheduled / due dates** — no `scheduled_at` field in v1. Adding it later is cheap (append a field, extend the form, extend indexes) and we avoid guessing the right shape now. See "Deferred" below.
- **Consecutive human IDs** (`A-0001`) — UUIDs only.
- **`task` as a built-in activity type** — deferred. Activities are past-tense external interactions (calls made, emails sent, meetings held). Forward-looking work items — to-dos, action items — depend on supporting features (`scheduled_at` / due-date, `assigned_to`, priority) that aren't in v1, and folding them into the activity grammar without those fields makes "task" a thin entity. A separate `tasks` (or `actions`) module is the right home, designed alongside scheduling and assignment. Consumers needing a v1 stop-gap can add `task: { default_stage: open, ... }` via the `activity_types` consumer-extensibility hook, accepting the limitations.
- **`note` as a built-in activity type** — deferred. Notes (text jotted against an entity) structurally resemble events more than activities — append-only, immutable, attached via `references`. Existing production apps already implement notes-as-events (per-entity `*_comment` event types — comment text + author + timestamp + entity reference, surfaced in the events timeline) and that pattern continues to be the right home for note-taking. Activities reduces to types with strong external-interaction grammar (`call`, `meeting`, `email`) and clean ingestion-channel mapping (calendar / email / WhatsApp / voicenote). Consumers wanting an editable activity-shaped note in v1 can add `note: { default_stage: done, ... }` via the `activity_types` consumer-extensibility hook.
- **Priority field** — not a first-class field. Consumers needing it can add it via `attributes`; can be promoted later if demand is proven.
- **File attachments inlined on the activity doc** — handled by the `files` module's own collection, keyed by `activity_id`.
- **Auto-ingestion from calendar / email / WhatsApp / voicenotes** — schema reserves space; implementation is a later phase.
- **Recurrence** — no "repeats weekly" modelling. A recurring meeting is N separate activities until we need otherwise.
- **Reminders / notifications for upcoming activities** — the `notifications` module can be wired in by a consumer, but the activities module doesn't push reminders itself in v1.
- **Assignment to multiple users** — activities have a creator (via `created.user`). A dedicated `assigned_to` field is not in v1; can be added as an attribute by consumers, and promoted to a first-class field later.
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
