---
title: Activities
module: activities
type: index
---

# Activities

CRM activities — calls, meetings, emails. Past-tense external-interaction logs linked to contacts and companies. Activities have a lifecycle (`open → done | cancelled`, with `reopen`); built-in types (`call`, `meeting`, `email`) are created `done` since they are logged after the fact. Consumer-defined types extend the built-in enum via the `activity_types` var.

Forward-looking work items and ad-hoc text notes are out of scope — use a tasks module for the former and the events module's comment pattern for the latter.

## Dependencies

| Module                             | Why                              |
| ---------------------------------- | -------------------------------- |
| [layout](../layout/index.md)       | Page wrapper                     |
| [events](../events/index.md)       | Audit logging and `change_stamp` |
| [contacts](../contacts/index.md)   | Contact selector and linking     |
| [companies](../companies/index.md) | Company selector and linking     |
| [files](../files/index.md)         | Optional file attachments        |

Companies and contacts do **not** depend on activities. Apps that want activity tiles on companies/contacts wire `tile_activities` into the parent module's sidebar slots from app config.

## When to use

Add `activities` when an app needs a CRM-style log of past external interactions — calls, meetings, emails — linked to contacts and companies. Not for tasks, action items, or free-text notes.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: activities
    source: "github:lowdefy/modules-mongodb/modules/activities@v0.8.1"
    vars:
      app_name: my-app
      label: Activity
      label_plural: Activities
      activity_types:
        quote:
          title: Quote
          color: "#fa8c16"
          icon: AiOutlineFileText
          default_stage: open
          type: complex
```

Defaults work out of the box. To point the module at a different MongoDB collection, remap `activities-collection` via the entry's `connections` mapping.

## Type behavior flags

Form behavior is driven by optional flags on each activity-type enum entry (built-in or registered via `activity_types`), not by hard-coded type ids:

| Flag              | Effect                                       | Default        |
| ----------------- | -------------------------------------------- | -------------- |
| `agenda: true`    | Render the Agenda Topics section in the form | off            |
| `duration: true`  | Show the Duration meta field (form + view)   | off            |
| `direction: true` | Show the Direction meta field (form + view)  | off            |
| `contact_label`   | Title of the linked-contacts selector        | `Participants` |

The built-ins carry their previous behavior as defaults — `call` has `duration`, `email` has `direction` and `contact_label: CC`, and `meeting` has `agenda`, `duration`, and `contact_label: Attendees`. A consumer type gets meeting-like behavior by setting the same flags:

```yaml
activity_types:
  site_visit:
    title: Site Visit
    color: "#fa8c16"
    icon: AiOutlineEnvironment
    default_stage: done
    type: complex
    agenda: true
    duration: true
    contact_label: Attendees
```

Merging is by top-level key — overriding a built-in type replaces its whole entry, flags included.

## Per-type attribute fields

`fields.attributes` renders for every type. To scope custom fields to a type, use `fields.attributes_by_type.<type_id>` — a type with an entry renders that list (in both the form and the detail view) instead of the global array; types without an entry fall back to `fields.attributes`:

```yaml
fields:
  attributes:
    - id: attributes.outcome
      type: TextInput
      properties:
        title: Outcome
  attributes_by_type:
    site_visit:
      - id: attributes.site_ref
        type: TextInput
        properties:
          title: Site Ref
```

Block ids must be distinct from those in the global `attributes` list. When `attributes_by_type` is set, the module emits the global blocks (in a fallback box) and every per-type list side by side — they're mutually exclusive only at runtime via `visible`, so reusing an id across the global array and a per-type entry fails the build with a duplicate-id error.

## Attachment slots

The attachments UI is a pair of block-array slots defaulting to the files module — `components.form_attachments` (divider + `file-manager` at the bottom of the form) and `components.view_attachments` (`file-card` tile at the top of the detail sidebar). Apps that don't wire the files module supply their own blocks, or `[]` to drop the section. In the form, `state.activity_id` holds the activity id (minted before create); on the view page the id is at `_url_query: _id`.

## Post-create hook

`hooks.on_created` is an action list run after every successful create — in the new page's save flow and in the `capture_activity` modal — with the new activity's id at `_state: activity_id` and the captured fields (`type`, `title`, `contacts`, `company_ids`, `attributes`, `references`) still in state. On the new page the built-in tail (form reset + navigate to the view page) runs after the hook; a hook that routes somewhere else sets `state.on_created_handled: true` to skip it:

```yaml
hooks:
  on_created:
    - id: route_to_follow_up
      type: SetState
      params:
        on_created_handled: true
    - id: go_follow_up
      type: Link
      params:
        pageId: my-follow-up-page
        urlQuery:
          activity_id:
            _state: activity_id
```

## Form option requests

`fields.attributes` / `fields.attributes_by_type` blocks can be request-backed — e.g. a `Selector` whose `options` come from an app collection. Such a block needs its option request available on the page. `form_requests` is a list of request definitions the module splices into the new and edit page request lists and fires on page init:

```yaml
form_requests:
  - id: discussion_options
    type: MongoDBAggregation
    connectionId: discussions
    properties:
      pipeline:
        - $project: { _id: 0, value: $_id, label: $topic }
fields:
  attributes:
    - id: references.discussion_ids
      type: MultipleSelector
      # Hidden in the capture modal, where form_requests aren't loaded.
      visible:
        _eq:
          - _state: activity_form_context
          - page
      properties:
        options:
          _request: discussion_options
```

`form_requests` are **not** added to the `capture_activity` modal — a modal can't own page requests. The pages set a `state.activity_form_context` marker so request-backed fields can gate themselves to the full-page form: `page` on the new/edit pages, `view` on the detail page, `modal` in the capture modal. Gate on `activity_form_context == page` (as above) to keep such a field out of the modal and the detail view; if the field is wanted in a modal, the host page embedding `capture_activity` must supply the request itself.

## Agenda topics

Activity types flagged `agenda: true` (the built-in `meeting`, plus any consumer type that sets the flag) carry an Agenda Topics section in the form. Topics are stored as task documents in the `actions` collection (`kind: task`), stamped `metadata.task_type: agenda` to distinguish them from adhoc tasks, and linked back via `activity_ids`. See the `lookup_collections.actions` var if your app maps `actions-collection` to a non-default collection name. Any host-app per-workflow uniqueness index on `actions` must be **partial** (`partialFilterExpression: { type: { $exists: true } }`) to exclude untyped task docs.

## Adhoc task CRUD

`create-task` / `update-task` write/edit standalone `kind: task` docs in the same `actions` collection as agenda-topic tasks above, for hosts that need a task not tied to a meeting agenda (e.g. the `deals` module's task list). Two seams keep this generic rather than deal- or meeting-specific:

- **Entity link** — payload `entity_type` / `entity_id` (stored verbatim on the task doc), not a hardcoded reference, so a task can hang off a deal, a meeting, or any entity. An optional `company_id` stores a secondary link as the task doc's `company_ids` array. The link is set once at create and never rewritten by `update-task`.
- **Emitted event** — payload `event: { type, display, references }`, forwarded as-is into the events module's `new-event` (this API only adds the task's own `action_ids` reference). Each host supplies its own event type + Nunjucks display markup per transition.

The paired `task-modal` component builds both API payloads from its vars — see the file header in `components/task-modal.yaml` for the full list (`entity_type`, `entity_id`, `company_id`, `assignee_options`, `assignee_search`, `events`, `event_references`, `on_saved`). `assignee_options` is a var (not a hardcoded request), so each host wires its own assignee-options source (e.g. `deals`' `get_task_assignee_options`, which projects contacts server-side into the `{ contact_id, name }` shape the task doc's `assignees` field stores).

## Open-tasks card

`open-tasks` is a compact card listing an entity's open `kind: task` docs, reading activities' own `actions` collection — filtered by `entity_type` + `entity_id` (the same shape the adhoc task CRUD above writes) and an open status (current stage not `done`). It is the activities-owned sibling of the `workflows` module's `open-actions` card (a lighter summary than the full action stepper), styled to match it so a host composing both side by side gets one "what's open" row. Vars: `entity_type` (required), `entity_id` (required), `on_click` (optional action list, run after `state.selected_task` is set to the clicked task — wire this to open a host's `task-modal` instance). See the file header in `components/open-tasks.yaml` for details.

```yaml
- _ref:
    module: activities
    component: open-tasks
    vars:
      entity_type: deal
      entity_id:
        _state: selected_deal_id
      on_click:
        - id: open_task_modal
          type: CallMethod
          params:
            blockId: deal_task_modal
            method: toggleOpen
```

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [App name scoping](../shared/app-name.md) — how `app_name` keys event display data
- [Event display](../shared/event-display.md) — per-app Nunjucks title templates
- [Slots](../shared/slots.md) — `fields`, `components`, `request_stages` extension points
- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
