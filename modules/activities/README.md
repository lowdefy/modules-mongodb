# Activities

CRM activities — calls, meetings, emails. Past-tense external-interaction logs linked to contacts and companies. Lifecycle: `open → done | cancelled`, with `reopen` (built-in types are created `done` since they're logged after the fact). Reserved schema for future auto-ingestion (calendar, email, WhatsApp, voicenote).

Forward-looking work items (tasks, action items) and ad-hoc text notes are deliberately out of scope — see `decisions.md` §5 (tasks → separate module designed alongside `scheduled_at`/`assigned_to`/priority) and §6 (notes → existing event-based comments pattern that production apps already implement via per-entity `*_comment` event types).

## Dependencies

| Module | Why |
|---|---|
| [layout](../layout/README.md) | Page wrapper |
| [events](../events/README.md) | Audit logging and `change_stamp` |
| [contacts](../contacts/README.md) | Contact selector and linking |
| [companies](../companies/README.md) | Company selector and linking |
| [files](../files/README.md) | Optional file attachments |

Companies and contacts do **not** depend on activities. Apps that want activity tiles on companies/contacts wire `tile_activities` into the parent module's sidebar slots from app config — same shape as how `files` integrates with companies.

## How to Use

```yaml
modules:
  - id: activities
    source: "github:lowdefy/modules-mongodb/modules/activities@v0.4.2"
    vars:
      label: Activity
      label_plural: Activities
      activity_types:
        # Optional consumer-defined extensions to the built-in enum.
        # Built-in types: call, meeting, email.
        quote:
          title: Quote
          color: "#fa8c16"
          icon: AiOutlineFileText
          default_stage: open
```

Defaults work out of the box. To point the module at a different MongoDB collection, remap `activities-collection` via the entry's `connections` mapping.

## Exports

### Pages

| ID | Description | Path |
|---|---|---|
| `all` | List with filtering, sorting, pagination, Excel download | `/{entryId}/all` |
| `view` | Activity detail | `/{entryId}/view` |
| `edit` | Edit existing activity | `/{entryId}/edit` |
| `new` | Create a new activity (accepts URL prefill query params) | `/{entryId}/new` |

### Components

- **`activity-selector`** — `Selector` / `MultipleSelector` block over all activities.
- **`tile_activities`** — Self-contained sidebar tile (`layout.card` wrapping `activities-timeline` content with `capture_activity` in the header). Drop into companies/contacts sidebar slots from app config.
- **`activities-timeline`** — Content-only block (list + filters + view-all link, no card). Building block for apps wanting custom wrappers.
- **`capture_activity`** — Button + modal capture flow with prefill vars.
- **`open_capture`** — Action sequence; navigates to `pageId: new` with prefill in `urlQuery`.

### API Endpoints

| ID | Description |
|---|---|
| `create-activity` | Insert activity, emit `create-activity` event |
| `update-activity` | Update editable fields, emit `update-activity` event |
| `change-activity-status` | Transition stage, emit `complete-activity` / `cancel-activity` / `reopen-activity` |
| `delete-activity` | Soft-delete activity, emit `delete-activity` event |

### Connections

| ID | Collection |
|---|---|
| `activities-collection` | `activities` |

### Menus

| ID | Contents |
|---|---|
| `default` | Single link to the activities list |

## Vars

See [`VARS.md`](./VARS.md) for the full list with defaults and descriptions.

## Secrets

| Name | Used for |
|---|---|
| `MONGODB_URI` | MongoDB connection |

## Plugins

- `@lowdefy/community-plugin-mongodb` — collection connections and read/write
- `@lowdefy/community-plugin-xlsx` — Excel download
- `@lowdefy/modules-mongodb-plugins` — `ContactSelector`, `SmartDescriptions`, `EventsTimeline`, `FetchRequest`

## Notes

Activities use plain UUIDs (`_id` generated client-side). No human-readable consecutive ID is issued — activities are high-volume and rarely referenced by humans individually.

Reverse lookups (activities-for-this-contact / activities-for-this-company) are served by indexes on `contact_ids` / `company_ids` on the activity doc. There is no denormalized `activity_ids` list on contact/company docs — a deliberate departure from the contact ↔ company linking pattern.
