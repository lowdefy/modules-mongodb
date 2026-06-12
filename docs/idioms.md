# Idioms

Cross-cutting patterns shared by the modules in this repo. Every per-module README links here instead of repeating these explanations.

- [Change stamps](#change-stamps)
- [Event display](#event-display)
- [Live action cards (timeline lookup)](#live-action-cards)
- [Fields, components, request_stages slots](#slots)
- [App name scoping](#app-name)
- [Avatar colors](#avatar-colors)
- [Secrets](#secrets)

---

## Change stamps

Audit metadata stamped onto every database write so we know **when** something changed and **who** changed it. The same shape is used across `events`, `files`, `companies`, `contacts`, `user-account`, and `user-admin`.

### Default schema

The default lives in `modules/events/defaults/change_stamp.yaml` and resolves to the `change_stamp` var on the `events` module entry:

```yaml
timestamp:
  _date: now
user:
  name:
    _user: profile.name
  id:
    _user: id
```

The operators (`_date: now`, `_user: profile.name`, `_user: id`) are **runtime operators** — they evaluate per request, not at build time. That's why the stamp is a configuration template rather than a literal value: the build inlines the template, and the request handler fills in the user and timestamp at the moment the write executes.

### How modules consume it

Modules don't reach for the stamp directly — they reference the `change_stamp` component exported by the `events` module:

```yaml
created:
  _ref:
    module: events
    component: change_stamp
```

Inside that component the body is a single line: `_module.var: change_stamp`. So the value the consumer sets via `vars.change_stamp` on the `events` module entry is what every other module ends up writing.

### Overriding

To extend the stamp (e.g. add `app_name` to track which app produced the write), set `change_stamp` on the `events` module entry:

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
```

Every module that writes via `events.change_stamp` will pick up the override automatically.

### Why a runtime template

A literal value baked at build time would freeze the user and timestamp at deploy. A function reference would be opaque to the build. A configuration template made of runtime operators is the smallest thing that lets us:

- inspect the shape statically (build can validate),
- evaluate it per request (request handler resolves `_user` and `_date`),
- override it from the consumer app without touching module code.

---

## Event display

Modules that write to the `log-events` collection store **per-app display titles** alongside each event document. The `event_display` var on each module is a map from `app_name → { event_type → Nunjucks template }`. The events module renders the template that matches the current `display_key`.

### Why per-app

Multi-tenant deployments share a single `log-events` collection but render events in different chrome per app. The same event document might appear as "Alex created Company X" in the CRM app and "C-0001 created by Alex" in the back-office app. Storing pre-rendered titles per app at write time keeps the timeline render path query-only (no template engine on read).

### Default file shape

Each module ships a default at `modules/{name}/defaults/event_display.yaml`:

```yaml
create-company: "{{ user.profile.name }} created {{ target.name }}"
update-company: "{{ user.profile.name }} updated {{ target.name }}"
```

- Keys are event types (matching the `type` field on event documents).
- Values are Nunjucks templates rendered against the event payload.

When the consumer doesn't override `event_display`, the build wraps these templates under the module's `app_name` var. The `new-event` endpoint flattens the rendered display block onto the event document's top level (keyed by app name), so an event written by a module with `app_name: my-app` ends up with a top-level `my-app.title` field set to the rendered template — and `display_key: my-app` on the events module reads it back (`$my-app.title`, not `$display.my-app.title`).

### Variables available to templates

- `user` — the full user object loaded via `_user: true` at the moment the event is written.
- `target` — the entity being changed. The shape is **module-specific** — each module's write API decides which fields to pass into the template. For example, `companies` passes `{ name }` where `name` is the field configured by the `name_field` var. Per-module READMEs document the exact `target` shape for each event type.

### Overriding

`event_display` is a **per-module var**, consumed only by that module's own write APIs. The keys you can put under each app name are restricted to the event types that module emits — other keys are silently ignored. Set `event_display` on the consuming module entry:

```yaml
- id: companies
  source: "github:lowdefy/modules-mongodb/modules/companies@v0.7.0"
  vars:
    event_display:
      my-app:
        create-company: "Created {{ target.name }}"
        update-company: "Updated {{ target.name }}"
```

**Override fully replaces the defaults — no merge.** Whatever you write under `event_display` is exactly what's stored on the event document. List every app and event type you want rendered. If you want only the override-the-wording case (single app), the file shape is just `{ [app_name]: { event-type: template } }`. To render titles for multiple apps, list them all explicitly.

### Display metadata vs templates

`event_display` covers titles only. Color, icon, and human-readable type names live in the separate `event_types` component on the events module — see [Events module README](../modules/events/README.md).

---

## Live action cards

<a name="live-action-cards"></a>

The **workflows module's `workflows-events-timeline`** component enriches each event with **live action cards** — real-time workflow action status, per-app message, and a single access-resolved navigation link. The generic [events module](../modules/events/README.md) timeline is **events-only**: it renders no action cards. Apps that want action-enriched timelines use the workflows-provided surface; apps without the workflows module use the events timeline as-is.

### How it works

`workflows-events-timeline` calls the `GetEventsTimeline` read method on the `workflow-api` connection (server-side plugin JS). The method:

1. `$lookup`s the `actions` collection, joining on each event's `action_ids` field.
2. Filters actions by card-worthiness (drops blocked actions and actions that have never been in an active stage).
3. Computes per-verb access for the current user (`computeAllowed`) and collapses the per-verb links map to the single link the card renders (`collapseLink`) — priority **edit > review > error > view**, taking the highest-priority verb whose link is both non-null and access-visible.
4. Reads `action.{app_name}.message` as the card's display message.
5. De-duplicates: each action card is attached only to its latest referencing event (earlier events show the card as history, the latest event carries it live).

The same server-side policy module ([`resolveActionAccess.js`](../plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js)) backs every workflows read method, so timeline cards, `actions-on-entity` rows, and the overview pages always agree on access and links — there is no client-side or YAML re-implementation.

**Safe with no workflows on the entity.** If a given entity has no workflows attached, the `$lookup` returns empty arrays — no cards render, and no errors occur.

### Status display

Action card colors, titles, and priority ordering come from the shipped action-statuses enum, exposed by the workflows module as the `action_statuses` component. The workflows module's `action_statuses_display` var (`object`, default `{}`) is merged onto the shipped enum via `_build.object.assign` for UI-only display overrides (the engine reads the shipped enum directly — overrides cannot affect transition logic):

```yaml
modules:
  - id: workflows
    vars:
      action_statuses_display:
        _ref: config/action_statuses_display.yaml
```

(The events module also still declares an `action_statuses_display` var, but since its timeline is events-only the var no longer affects anything — it is retained for manifest compatibility.)

### Link resolution

`collapseLink` (in the plugin's `resolveActionAccess.js`) resolves the single link a surface renders from the per-verb links map. The priority order is **edit > review > error > view**; the first verb that is both access-visible (user holds the role) and has a non-null link wins. This identical resolution runs server-side for the timeline cards, the `actions-on-entity` widget, the `workflow-overview` page, and the `group-overview` page.

---

## Slots

Modules that ship list / detail / edit pages expose **slots** so consumers can extend each page without forking the YAML. Three slot vars are conventional:

- `fields` — input blocks rendered in edit forms and as labelled rows in detail views.
- `components` — block arrays appended to specific page regions (table columns, filters, sidebar tiles, etc.).
- `request_stages` — MongoDB pipeline stages spliced into the module's read or write pipelines.

Used by `companies`, `contacts`, `user-account`, and `user-admin`.

### Why slots

Modules ship working list/edit/view pages straight away. Apps still need to add fields ("trading name plus internal code"), filter on extra columns, append sidebar tiles, or transform reads. Slots let you do that by passing config through `vars`, instead of copying the entire page YAML and editing it (which forks the doc and breaks the next module update).

### Conventions

**`fields`** is an object whose properties are named field groups. Each group is an array of input blocks. Groups vary per module (`attributes`, `profile`, `global_attributes`, `app_attributes`, …). Block ids must be prefixed with the group name (`attributes.industry`, `profile.email`, …) so they bind to the matching state path.

**`components`** is an object whose properties are named regions. Common regions:

- `table_columns` — extra columns on the list page.
- `filters` — extra filter blocks below the search bar on the list page.
- `main_slots` — extra blocks appended to the main column on detail pages.
- `sidebar_slots` — extra blocks appended to the sidebar.
- `download_columns` — extra columns in CSV / spreadsheet exports.

Modules document their full set of regions in their per-module README.

**`request_stages`** is an object whose properties are named pipeline points:

- `filter_match` — `$match` stage applied during list filtering.
- `get_all_*` — stages appended to the list-page read pipeline.
- `selector` — stages appended to the selector dropdown's read pipeline.
- `write` — stages appended to write pipelines (create/update).

### Worked example — companies

Add an "Industry" attribute to the company form and a matching column to the list:

```yaml
- id: companies
  source: "github:lowdefy/modules-mongodb/modules/companies@v0.7.0"
  vars:
    fields:
      attributes:
        - id: attributes.industry
          type: Selector
          properties:
            label: Industry
            options:
              - Manufacturing
              - Services
              - Retail
    components:
      table_columns:
        - field: attributes.industry
          headerName: Industry
          width: 160
```

The `attributes.industry` block binds to `state.attributes.industry`, the form persists it under `attributes.industry` on the company doc, and the list table renders the column directly from the same path.

---

## App name

Multi-app deployments share user, contact, and event collections across apps. Documents are scoped by **`app_name`** so each app sees only the data it owns.

Modules that require it: `notifications`, `user-account`, `user-admin`, `contacts`. (`user-admin` also writes per-app fields under `app_attributes.{app_name}`.)

### Where it appears

- `created.app_name` on event and notification documents — set by the writing pipeline so reads can filter by app.
- `user.app_attributes.{app_name}` on user documents — per-app profile fields and access flags.
- `display.{app_name}` on event documents — per-app pre-rendered titles (see [Event display](#event-display)).
- `events.display_key` — the `display_key` var on the `events` module is the same string; events render the title at `display.{display_key}`.

### Constraint: no dots

`app_name` becomes part of MongoDB field paths (`user.app_attributes.my.app` would be parsed as nested fields `user.app_attributes.my.app`, not as a single key `my.app`). Use letters, numbers, hyphens, and underscores — never `.`.

### Multi-app deployments

Pick a unique `app_name` per app and pass the same value to every module entry that needs it:

```yaml
modules:
  - id: events
    vars:
      display_key: ops-app
  - id: notifications
    vars:
      app_name: ops-app
  - id: user-account
    vars:
      app_name: ops-app
  - id: user-admin
    vars:
      app_name: ops-app
  - id: contacts
    vars:
      app_name: ops-app
```

Each app keeps its own scope of users-as-contacts, per-app access flags, notifications, and event display strings, while sharing the underlying `users`, `user_contacts`, `notifications`, and `log-events` collections.

---

## Avatar colors

Modules that render user/contact avatars (`contacts`, `user-account`, `user-admin`) deterministically pick an avatar gradient from a shared palette so the same person always shows the same colors across the app.

### Default palette

`modules/shared/profile/avatar_colors.yaml` is an array of `{ from, to }` gradient pairs:

```yaml
- from: "#c62828"
  to: "#ad1457"
- from: "#ad1457"
  to: "#6a1b9a"
# …
```

Modules reference this file as the default for the `avatar_colors` var.

### How modules pick a color

A hash of the user id is taken modulo the palette length to pick an index. Same id → same index → same gradient on every page. New users land on whatever index their hash produces, with the palette's distribution determining the spread.

### Overriding

To use a custom palette, write your own `{ from, to }` array and pass it as the `avatar_colors` var:

```yaml
- id: contacts
  vars:
    avatar_colors:
      - from: "#0d47a1"
        to: "#1565c0"
      - from: "#1565c0"
        to: "#0277bd"
      # …
```

For a single brand color, pass an array of length 1 — every user gets the same gradient.

---

## Secrets

Master list of every secret read by modules in this repo. Bucket names, keys, and connection strings live in secrets so they stay out of version control.

| Secret | Modules | Used for |
|---|---|---|
| `MONGODB_URI` | every module | MongoDB connection string |
| `FILES_S3_ACCESS_KEY_ID` | `files` | AWS access key for the file storage bucket |
| `FILES_S3_SECRET_ACCESS_KEY` | `files` | AWS secret access key for the file storage bucket |
| `FILES_S3_BUCKET` | `files` | Private S3 bucket for file uploads |
| `FILES_S3_BUCKET_PUB` | `files` | Public S3 bucket for files served without auth |

Email/SMTP and other transport secrets are not used by any module here — `notifications.send_routine` is a configurable routine on the consuming app and uses whatever secrets that routine requires.

### By category

**MongoDB.** Every module declares `MONGODB_URI`. A single connection serves the whole app — modules don't need separate URIs.

**File storage (S3).** Used by `files`. Two buckets: a private one (signed URLs, default for new uploads) and a public one (for assets served without auth).

### Region

`files.s3_region` is a **required** var — set it on the module entry. There's no default; the build will fail if it is missing.
