# Task 1: Module Skeleton

## Context

This is a brand-new Lowdefy module under `modules/activities/`. The skeleton declares the module's manifest (vars, exports, dependencies, plugins, secrets), the MongoDB connection, the activity-types and event-types enums, the event_display defaults, the validation config, and the menu — but no APIs, requests, components, or pages yet. After this task the module is build-clean (`pnpm ldf:b` succeeds) but does nothing functional.

Reference modules for shape: `modules/companies/module.lowdefy.yaml` and `modules/contacts/module.lowdefy.yaml` are the canonical structured-vars examples. `modules/events/module.lowdefy.yaml` is the canonical example for declaring a `_build.object.assign` enum component (which `activity_types` follows).

## Task

Create the module directory `modules/activities/` with the following files:

### `modules/activities/module.lowdefy.yaml`

Top-level structure (mirror companies'):

```yaml
name: Activities
version: 0.1.0
description: CRM activities — calls, meetings, emails linked to contacts and companies

dependencies:
  - id: layout
    description: Page layout wrapper
  - id: events
    description: Audit event logging and change_stamp
  - id: contacts
    description: Contact selector and linking
  - id: companies
    description: Company selector and linking
  - id: files
    description: File attachments (optional)

vars:
  label:
    default: Activity
    description: Singular display label
  label_plural:
    default: Activities
    description: Plural display label
  activity_types:
    type: object
    default: {}
    description: App-level additions to the built-in activity-type enum. Same shape as event_types — keys are type strings, values have title, color, icon, default_stage.
  event_display:
    default:
      _ref: defaults/event_display.yaml
    description: Per-app Nunjucks templates for emitted events
  fields:
    type: object
    description: Field block arrays rendered in the edit form and SmartDescriptions view
    properties:
      attributes:
        default: []
        description: Custom field blocks appended after the built-in sections in the form and view. Block ids must be prefixed with `attributes.` so they bind to `state.attributes.*`.
  components:
    type: object
    description: "Page slot overrides: table_columns, filters, main_slots, sidebar_slots, download_columns"
    properties:
      table_columns:
        default: []
      filters:
        default: []
      main_slots:
        default: []
      sidebar_slots:
        default: []
      download_columns:
        default: []
  request_stages:
    type: object
    description: Pipeline overrides
    properties:
      get_all_activities:
        default:
          - $addFields: {}
        description: Pipeline stages appended after filtering on the activities list and Excel export aggregations.
      selector:
        default: []
        description: Pipeline stages appended to the activity-selector aggregation.
      filter_match:
        default: []
        description: Atlas Search compound clauses appended to the list-page $search query.
      write:
        default: []
        description: Pipeline update stages appended to both create-activity and update-activity flows.
  filter_requests:
    default: []
    description: Additional requests for the custom filters section

exports:
  pages:
    - id: all
      description: Activity list with filtering, sorting, pagination, Excel download
    - id: view
      description: Activity detail
    - id: edit
      description: Edit existing activity
    - id: new
      description: Create new activity (accepts URL prefill query params)
  connections:
    - id: activities-collection
      description: MongoDB connection for activity records
  api:
    - id: create-activity
      description: Insert activity, emit create-activity event
    - id: update-activity
      description: Update activity editable fields, emit update-activity event
    - id: change-activity-status
      description: Transition activity stage, emit stage-specific event
    - id: delete-activity
      description: Soft-delete activity, emit delete-activity event
  components:
    - id: activity-selector
      description: Selector/MultipleSelector for picking activities
    - id: tile_activities
      description: Self-contained sidebar tile (layout.card + activities-timeline + capture_activity in header). For app-level slot wiring on companies/contacts.
    - id: activities-timeline
      description: Content-only block (list + filters + view-all link, no card). Building block for apps wanting custom wrappers.
    - id: capture_activity
      description: Button + modal capture flow with prefill vars
    - id: open_capture
      description: Action sequence — navigates to pageId:new with prefill in urlQuery
  menus:
    - id: default
      description: Activities navigation link

connections:
  - _ref: connections/activities-collection.yaml

# api: list will be filled in by Tasks 2-5
# pages: list will be filled in by Tasks 13-14
# components: list will be filled in by later tasks

components:
  - id: activity_types
    component:
      _build.object.assign:
        - _ref: enums/activity_types.yaml
        - _module.var: activity_types

menus:
  - _ref: menus.yaml

secrets:
  - name: MONGODB_URI
    description: MongoDB connection URI

plugins:
  - name: "@lowdefy/community-plugin-mongodb"
    version: "^2"
  - name: "@lowdefy/community-plugin-xlsx"
    version: "^1"
  - name: "@lowdefy/modules-mongodb-plugins"
    version: "^0.1.0"
```

### `modules/activities/package.json`

Minimal package.json. Mirror `modules/companies/package.json`'s shape — name `@lowdefy/modules-mongodb-activities` (or whatever the convention is — check companies). Set `version: 0.1.0`.

### `modules/activities/CHANGELOG.md`

Minimal — single `## 0.1.0` entry: "Initial activities module."

### `modules/activities/README.md`

Mirror `modules/companies/README.md`'s shape. Brief overview: "CRM activities — calls, meetings, emails. Past-tense external-interaction logs linked to contacts and companies. Lifecycle: open → done | cancelled, with reopen (built-in types are created `done` since they're logged after the fact). Reserved schema for future auto-ingestion (calendar, email, WhatsApp, voicenote). Forward-looking work items (tasks, action items) and ad-hoc text notes are deliberately out of scope — see `decisions.md` §5 (tasks → separate module designed alongside `scheduled_at`/`assigned_to`/priority) and §6 (notes → existing event-based comments pattern that production apps already implement via per-entity `*_comment` event types)."

### `modules/activities/VARS.md`

Document each var declared in the manifest with default + purpose.

### `modules/activities/menus.yaml`

Mirror `modules/companies/menus.yaml` — single default menu with one MenuLink:

```yaml
- id: default
  links:
    - id: activities_link
      type: MenuLink
      pageId:
        _module.pageId: all
      properties:
        title:
          _module.var: label_plural
        icon: AiOutlineFlag
```

### `modules/activities/connections/activities-collection.yaml`

Mirror `modules/companies/connections/companies-collection.yaml` exactly. MongoDB connection wired to the `MONGODB_URI` secret with `collection: activities` hardcoded (not `_module.var: collection` — there's no `collection` var; per Sam's PR-32 review the codebase has consolidated to "override the connection" as the single configuration path). Include the same `changeLog` block (logs to `log-changes` with user metadata) and `write: true` flag.

### `modules/activities/enums/activity_types.yaml`

The built-in activity-type enum:

```yaml
call:
  title: Call
  color: "#1890ff"
  icon: AiOutlinePhone
  default_stage: done
meeting:
  title: Meeting
  color: "#722ed1"
  icon: AiOutlineCalendar
  default_stage: done # flip to 'open' once scheduled_at lands
email:
  title: Email
  color: "#13c2c2"
  icon: AiOutlineMail
  default_stage: done
```

No `task` or `note` types in v1 — past-tense external-interaction logs only. Tasks belong in a separate `tasks` / `actions` module (per `decisions.md` §5); notes belong in the existing event-based comments pattern (per `decisions.md` §6). Consumers needing either type before the proper home exists can add them via the `activity_types` consumer-extensibility hook on their app's `modules.yaml` entry.

### `modules/activities/enums/event_types.yaml`

Per-event metadata for the events the module emits:

```yaml
create-activity:
  title: Created activity
  color: "#52c41a"
  icon: AiOutlinePlusCircle
update-activity:
  title: Updated activity
  color: "#1890ff"
  icon: AiOutlineEdit
complete-activity:
  title: Completed activity
  color: "#52c41a"
  icon: AiOutlineCheckCircle
cancel-activity:
  title: Cancelled activity
  color: "#8c8c8c"
  icon: AiOutlineCloseCircle
reopen-activity:
  title: Reopened activity
  color: "#faad14"
  icon: AiOutlineRedo
delete-activity:
  title: Deleted activity
  color: "#ff4d4f"
  icon: AiOutlineDelete
```

### `modules/activities/defaults/event_display.yaml`

Per-app Nunjucks templates. Use `default` as the app key (matches `modules/companies/defaults/event_display.yaml`):

```yaml
default:
  create-activity: "{{ user.profile.name }} logged a {{ target.type_label }}: {{ target.title }}"
  update-activity: "{{ user.profile.name }} updated a {{ target.type_label }}: {{ target.title }}"
  complete-activity: "{{ user.profile.name }} completed a {{ target.type_label }}: {{ target.title }}"
  cancel-activity: "{{ user.profile.name }} cancelled a {{ target.type_label }}: {{ target.title }}"
  reopen-activity: "{{ user.profile.name }} reopened a {{ target.type_label }}: {{ target.title }}"
  delete-activity: "{{ user.profile.name }} deleted a {{ target.type_label }}: {{ target.title }}"
```

`target.type_label` is built at the API call site; see Task 2 for the lookup.

### `modules/activities/validate/activity.yaml`

Skeleton validation rules shared between `create-activity` and `update-activity`. Mirror `modules/companies/validate/`'s file shape. Validate at minimum: `type` is a non-empty string, `title` is a non-empty string. Other fields are optional. Used by both APIs as a `_ref` chain.

## Acceptance Criteria

- `pnpm ldf:b` from any app that consumes the activities module builds without errors.
- The module's `module.lowdefy.yaml` parses and registers all declared exports (visible in build output).
- The activity_types component resolves correctly when consumed via `_module.component: activity_types` from elsewhere in the module (will be exercised by later tasks).
- All listed files exist and are non-empty.
- No `api:`, `pages:`, or `components:` `_ref` lists in the manifest yet beyond `activity_types` and `change_stamp` — those grow as later tasks land.

## Files

- `modules/activities/module.lowdefy.yaml` — create — manifest as spec'd above.
- `modules/activities/package.json` — create — mirror companies.
- `modules/activities/CHANGELOG.md` — create — initial entry.
- `modules/activities/README.md` — create — module overview.
- `modules/activities/VARS.md` — create — vars documentation.
- `modules/activities/menus.yaml` — create — default menu with activities link.
- `modules/activities/connections/activities-collection.yaml` — create — MongoDB connection.
- `modules/activities/enums/activity_types.yaml` — create — built-in type enum.
- `modules/activities/enums/event_types.yaml` — create — event-type metadata.
- `modules/activities/defaults/event_display.yaml` — create — Nunjucks templates.
- `modules/activities/validate/activity.yaml` — create — shared validation.

## Notes

- Use the manifest structure exactly as spec'd — `vars` use the structured `type/default/description/properties` form, NOT a flat key-value table.
- The `_build.object.assign` pattern for `activity_types` exactly mirrors how `events.event_types` merges defaults with module-var additions (see `modules/events/module.lowdefy.yaml:63-67`).
- Don't pre-add `api:` / `pages:` / `components:` `_ref` lists for files that don't exist yet. Those get filled in as later tasks land — adding them now creates build errors.
- The activity_types `_module.var` merge pattern is the consumer-extensibility seam: an app with `vars: { activity_types: { quote: { title: Quote, ... } } }` gets all built-ins plus `quote`.
- The `actions/` and `components/` and other subfolders don't exist yet — they're created in their respective tasks. Empty subfolders aren't needed.
