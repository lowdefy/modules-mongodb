# @lowdefy/modules-mongodb-activities

## 1.4.1

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.0

### Patch Changes

- [#305](https://github.com/lowdefy/modules-mongodb/pull/305) [`0931d8e`](https://github.com/lowdefy/modules-mongodb/commit/0931d8e7af1a86655ae6cdfe6131c8a237636603) Thanks [@puffin-mrm](https://github.com/puffin-mrm)! - Apps on Lowdefy 7 no longer get build warnings from the deal page's pagers, the task modal's person picker or the file list. Each of these, and the deals list's loading placeholders, set a block property Lowdefy 7 doesn't have; nothing changes on screen.

## 1.0.0

### Major Changes

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the modules need Lowdefy 7.** This release moves every module and the plugins package to Lowdefy 7 and its auth engine, page paths, tenant wall, websockets and Lucide icons. Apps on Lowdefy 5 or 6 stay on the previous release.

  To upgrade, move the app to Lowdefy 7 (`lowdefy upgrade` applies the framework codemods), then work through the breaking entries in this release, chiefly:

  - **Icon names** are Lowdefy 7 semantic and Lucide names; icon names an app passes into module vars need the same rewrite.
  - **`app_name` is gone.** Declare `slug:` on the root of `lowdefy.yaml` and drop the var from every module entry.
  - **`user-account` and `user-admin` run on the Better Auth engine**, with contacts linked to their auth user and organization authority separate from app roles.
  - **Search:** `request_stages.filter_match` takes plain `$match` clauses, the new `atlas_search` var picks Atlas `$search` or a regex fallback, and the Atlas Search index contract changes.
  - **Events:** `contact_page_url` is replaced by `contact_page_id`.
  - **ai-reporting:** the app lists the module's `report-policy` in `policies.dynamicBlocks`, and the report endpoints return `report_id` without `url`.
  - **`profile.picture`** is derived by every write, and `create-contact` mints the contact `_id` itself.

### Minor Changes

- [#127](https://github.com/lowdefy/modules-mongodb/pull/127) [`b8a2ef6`](https://github.com/lowdefy/modules-mongodb/commit/b8a2ef697323f432926ba784b2e49ff88a599140) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: the `app_name` module var is replaced by Lowdefy's `_app` operator.** Apps now declare their identity once, as `slug:` on the root of `lowdefy.yaml`, and every module reads it directly with `_build.app: slug`.

  Migration for consumers:

  - Add `slug: <your-app-slug>` to the root of `lowdefy.yaml` if it isn't there already. It must be kebab-case (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) — Lowdefy validates it, and referencing an undeclared slug fails the build.
  - Remove the `app_name:` var from every module entry. `activities`, `companies`, `contacts`, `deals`, `notifications`, `user-account`, `user-admin` and `workflows` no longer declare it.
  - `events.display_key` is now optional, defaulting to the app's own slug. Drop it unless the app deliberately renders another app's event display strings.
  - If a `change_stamp` override baked in an app-attribution literal (`app_name: my-app`), change the value to `{ _build.app: slug }`. The stamp field keeps the name `app_name`.
  - Any shared config file that existed only to hold `app_name` (e.g. an `app_config.yaml`) can be deleted.

  No data migration is required — the slug produces the same string the `app_name` var did, and no stored field or key is renamed. `created.app_name` keeps its name on event and notification documents.

  Connection schema changes in `@lowdefy/modules-mongodb-plugins`: the `WorkflowAPI` connection property `app_name` is renamed to `slug`, and the `EventsTimeline` connection property `app_name` is renamed to `display_key` (it carries the events module's `display_key`, which may legitimately differ from the slug). Apps wiring these connections directly must rename the property keys.

- [#242](https://github.com/lowdefy/modules-mongodb/pull/242) [`9e083dc`](https://github.com/lowdefy/modules-mongodb/commit/9e083dc8a2696abeee3c91004c75fdc2606196d8) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: icon names are Lowdefy 7 semantic and Lucide names.** Lowdefy 7 replaces react-icons with Lucide and fails the build on a react-icons name, so every `AiOutline*`, `AiFill*` and `Lu*` name in the modules and the plugin blocks is rewritten with the `@lowdefy/codemods` `v7-0-0/react-icons-to-lucide.json` table: a semantic name (`edit`, `delete`, `mail`) where one fits, otherwise the Lucide name (`Waypoints`, `FileSpreadsheet`).

  The modules now need a Lowdefy version with Lucide icons. Glyphs the table marks for review: filled status icons (`check-circle`, `close-circle`, `CircleAlert`) are outline, the FileManager's PDF and Word icons are both `FileText` and its Excel icon is `FileSpreadsheet`, and the Cluster icon is `Waypoints`.

  Apps that pass icon names into module vars (menu entries, enum `icon` fields, `event_types`) need the same rewrite; `lowdefy upgrade` applies it.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`f7659a7`](https://github.com/lowdefy/modules-mongodb/commit/f7659a77af93cd37291a62869accf0cfcd123f7d) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Module links follow Lowdefy page paths and `basePath`.** No module builds a page URL by hand any more, so nothing breaks when a page has a `path` or the app has a `basePath`.

  - **Pages with paths.** The layout `page` component takes a `path` var, such as `tickets/{ticket_id}`, to serve the page at a URL pattern.
  - **Record links.** Links in HTML (company and contact lists, the activities timeline, the company hierarchy, the deal card and the deal's people, the workflow open-actions card and the overview subtitle) are `data-page-id` links, so they move within the app without a full page load. `DataDescriptions` and `SmartDescriptions` render contact and company links with Lowdefy's `Link`, and `ActionSteps`, `WorkflowProgress` and `EventsTimeline` pass a link's `pathParams` to it. The sign-in, sign-up, forgot-password and accept pages link to each other by page id.
  - **Workflows.** A workflow's `entity:` block takes `id_path_key`, the entity page's path placeholder for the entity id (for a page at `deals/{deal_id}`, `id_path_key: deal_id`); the entity link then carries the id in `pathParams`. `id_query_key` defaults to `_id` only when `id_path_key` is not set, so set both to also pass the id in the query. `tracker.start_link` and the custom-kind `status_map` `link:` / `view_link:` cells take `pathParams` next to `urlQuery`, with the same `action_id: true` / `entity_id: true` sentinels. Breadcrumbs, the return to the entity after a terminal signal, the events timeline and the deal's open items pass `pathParams` too.
  - **Breaking (events): `contact_page_url` is replaced by `contact_page_id`.** Set it to the contact page's id, such as `contacts/view`. The contact id goes in the query as `contact_id_query_key` (default `_id`), in the path value `contact_id_path_key` names when the page has a path like `contacts/{contact_id}`, or both. The events-timeline component takes the same three vars per call, and the `EventsTimeline` block takes `contactPageId`, `contactIdQueryKey` and `contactIdPathKey` in place of `contactPageUrl`. The timeline's avatar, timestamp and note @mentions link to the contact page; `note-capture` stores each @mention as a `#contact-<id>` link, and mentions in notes saved before this show unlinked.
  - **Breaking (ai-reporting): `generate-report`, `create-report` and `duplicate-report` return `{ ok, report_id }` without `url`.** Open a report with a `Link` to the `report` page and `urlQuery: { report_id }`. The reporting agent points the user to the panel's "Reports from this chat" list instead of replying with a link.
  - **Fix (deals):** deal event titles name the user as plain text. The old link pointed at `/contacts/view` with the user's id, which is not a contact id.

- [#303](https://github.com/lowdefy/modules-mongodb/pull/303) [`b4aad44`](https://github.com/lowdefy/modules-mongodb/commit/b4aad4444fe14a4ad47dc22c2ec1e24c8cc4fe65) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking: `request_stages.filter_match` takes plain MongoDB `$match` clauses instead of Atlas Search `compound` clauses.** In `contacts`, `companies` and `activities` the structural filters moved out of `$search` into a standard `$match`, so the consumer filter hook is now standard query syntax and applies in both search modes. The var stays an **array**; only each element's syntax changes, and the clauses are composed via `$and` rather than shallow-merged, so a clause using `$or` is safe.

  These modules also gain a boolean **`atlas_search`** var (default `true`). Leave it `true` and text search runs through Atlas `$search` as before. Set it `false` — on `contacts`, `companies`, `activities` and `deals` — and text search falls back to a case-insensitive `$regex` `$or` over the same fields, which runs on any MongoDB: identical substring matching, but no relevance ranking and an unindexed collection scan, so it suits development and small collections rather than production at scale.

  With `atlas_search: true` the `$search` stage is **unconditional** — it runs on every list load, empty search box included, and only its contents vary. This is required by the tenant wall rather than chosen: `$search` must be a pipeline's first stage, so the wall cannot prepend its organization filter and the request declares `tenant: authored` and carries the clause in `compound.filter` instead. That declaration is static per request while the search term is runtime, so a `$search` emitted only when a term happened to be present would be audited on the search path and refused on the browse path. The term clauses therefore sit in `compound.must` (a `should` alongside a `filter` clause ranks without narrowing, which would return every row for any term), and `compound.filter` always carries one clause — the audited `organizationId` equality under `tenant`, an `exists` match-all on `_id` under `pinned`, since Atlas refuses a compound whose clause lists are all empty. With `atlas_search: false` there is no `$search` at all and the wall scopes the leading `$match` mechanically.

  **This version changes the Atlas Search index contract**, so a consumer upgrading must update their cluster's `default` index to match the requirement documented in the version they move to. The mappings narrow to the text fields **plus the two paths `compound.filter` needs** — `organizationId` as a `token` (the authored tenant clause; a string `equals` requires that mapping specifically and no `dynamic` setting creates it) and `_id` (the `pinned` match-all). The structural filters are no longer evaluated by `mongot`, so their old `token`/`date` mappings are unused. `storedSource` now differs per collection: whole-document stored source is **required** on `user-contacts` and `companies`, and **not required** on `activities` and `deals`, whose requests read live documents so their post-write refetches do not show stale rows.

  Migration for consumers:

  - Rewrite any `request_stages.filter_match` clauses in MongoDB query syntax — `{ equals: { path: region, value: "x" } }` becomes `{ region: "x" }`, `{ range: { path: score, gte: 10 } }` becomes `{ score: { $gte: 10 } }`. The default `[]` is unaffected, so an app that never set the var has nothing to do.
  - For a non-Atlas deployment, set `atlas_search: false` on each searchable module entry (`contacts`, `companies`, `activities`, `deals`). Hold the value once in a shared app config file and `_ref` it from each entry, so the app has one source of truth for which mode it is in.
  - Create or update the `default` Atlas Search index per collection, following the module index references (`docs/{contacts,companies,activities}/reference/indexes.md` and `docs/deals/index.md`): whole-document `storedSource: true` on `user-contacts` and `companies`, no `storedSource` on `activities` and `deals`. **Map `organizationId` as a `token` and `_id` in every one of them**, whichever organizations policy the app runs — they are inert under `pinned`, and an index missing the `organizationId` mapping blanks every list page the moment a deployment flips to `tenant`, silently. **`deals` needs a `default` index created from scratch**: none existed before, so its search box has never worked, and the unconditional `$search` means the deal list now needs one to load at all. If `companies.name_field` is overridden, map that field in the companies index instead of `name` — otherwise Atlas `$search` silently returns no text matches on it while the regex fallback still works.
  - Before running the fallback at any size, add the regular `mongod` indexes the module index references list. They serve the filter, not the sort; without them a fallback deployment performs acceptably only at small scale.

  `user-admin` is not affected by the `filter_match` change — its clauses were already plain `$match`. Two non-breaking improvements land there: its **members and invitations** searches now treat regex metacharacters typed into the search box as literals (previously a `(` made MongoDB reject the regex and `.*` matched every row), and both filter stages compose their clauses with `$and` so no two can collide on a key.

  The same escaping fix lands on `deals`' task **Person Responsible** selector, whose contact search had the same defect. All four search boxes now route through one shared clause builder, so escaping has a single home.

### Patch Changes

- [#266](https://github.com/lowdefy/modules-mongodb/pull/266) [`97ba374`](https://github.com/lowdefy/modules-mongodb/commit/97ba37430af68d9d488d69703378ff2d9a2b1bf1) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **A contact with one name part is labelled correctly in contact lists.** The `ContactSelector` block's `appendContact` method named a newly created contact by joining the given and family names as written, so a contact with only one of them was added to the selection as `Thandi undefined` or `undefined Nkosi`. It now uses the trimmed non-empty parts joined by a space, and no name when both are empty, in which case the list item shows the email. The activities and companies contact lists, when a contact has no stored picture, now build the initials with the same rule as the shared profile derivation: the first letter of each part when both are set, otherwise the first two letters of the part that is set, and `?` when neither is.

- [#277](https://github.com/lowdefy/modules-mongodb/pull/277) [`8ca77a4`](https://github.com/lowdefy/modules-mongodb/commit/8ca77a4b4a7752ac344d69bf6e44dd65434d12a1) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Pages whose title comes from a runtime operator no longer show "[object Object]" as the browser-tab title.** The server writes the tab title without evaluating operators, so the layout page component now uses `title` only when it is a string at build time, and otherwise the page's `type` (for example "Company"), or the page id when there is none. The new and edit pages of activities, companies, contacts and deals build their `type` at build time, so their tab reads, for example, "Edit Company".

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.2

## 0.44.1

## 0.44.0

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.0

## 0.40.0

## 0.39.1

## 0.39.0

## 0.38.0

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.1

## 0.32.0

## 0.31.1

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.1

## 0.25.0

## 0.24.0

### Minor Changes

- [#152](https://github.com/lowdefy/modules-mongodb/pull/152) [`dafe769`](https://github.com/lowdefy/modules-mongodb/commit/dafe769046677977e20f367018edb8d397dd543c) Thanks [@Yianni99](https://github.com/Yianni99)! - **Activities** — `open_capture` and `capture_activity` in `mode: page` now carry `prefill.attributes` and `prefill.references` through to the new-activity page, where attributes merge over the page's own defaults exactly as they do in the capture modal. Previously both keys were dropped on the navigate path, so a deep-linked activity was created with no `references` and therefore unattached to the host entity it was logged against.

  This is the route a host page takes when it wants its own capture entry point: a page cannot embed a second `capture_activity`, because `form_activity` hardcodes the contacts selector's request id and two instances collide. The demo's deal workspace has a "Log site visit" button showing the pattern.

  Consumer guidance added alongside it: prefer a field's own `requests` over `form_requests` where the field must appear on every surface — `form_requests` are page-only, so a field relying on them is silently absent from the capture modal — and never `visible`-gate a field that writes into `references`, since hiding a block deletes its state and would discard the host's prefilled link.

## 0.23.1

## 0.23.0

### Minor Changes

- [#147](https://github.com/lowdefy/modules-mongodb/pull/147) [`28e48ec`](https://github.com/lowdefy/modules-mongodb/commit/28e48ec6db7026d5d3cf647f6ef945c2d77777dc) Thanks [@Yianni99](https://github.com/Yianni99)! - deals: rework the workspace layout, and key workflow form data by workflow type

  **Breaking (config):** `get_selected_deal` now exposes workflow form data as
  `workflows.{workflow_type}.{action_type}.{field}`. It was
  `workflows.{action_type}.{field}`.

  The request no longer joins one workflow — it joins **all** of the deal's
  workflows and keys their form data by workflow type, so a deal carrying a
  chained lifecycle exposes every workflow's form data rather than only the one
  matching the `workflow_type` var.

  A stale read **fails silently**: `workflows.volumes.annual_volume` simply
  resolves to null, so any `$ifNull` or `_if_none` fallback behind it takes over
  and the wrong value renders with no error anywhere. There is no build failure to
  catch this. Grep your config for `workflows.` reads — the likely sites are
  `request_stages.get_selected_deal` stages and any tile injected through
  `components.info_grid_slots` — and insert the workflow-type key. A host stage
  that builds its own `workflows` field from its own `$lookup` is unaffected.

  Two notes on the keying. Action types are namespaced per workflow by the engine,
  which enforces uniqueness only _within_ a workflow, so a flat merge keyed by
  action type would silently truncate a legal config — hence the workflow-type
  key. And the key is the workflow _type_, not the instance: a deal carrying two
  workflows of the same type exposes only one of them.

  **Info-grid tile order changed.** Blocks injected through
  `components.info_grid_slots` now render **before** the built-in People and Files
  tiles, where they previously appended after them. No var was renamed and no host
  config needs changing, but the rendered order shifts. Tiles are span-12, so the
  row pairing depends on how many are injected: with two, the injected pair takes
  the first row and People/Files the second.

  Layout and presentation:

  - The deal detail panel's open actions and open tasks are now **one merged
    list**, ordered overdue tasks → open actions → upcoming tasks, under a single
    "Actions" heading, two per row and paginated at four per page. They were two
    half-width columns with a heading and an empty state each. Tasks and workflow
    actions are both docs in the same `actions` collection, so one heading covers
    both, and there is now one empty state judged on the whole list. Ownership is
    unchanged — `workflows` still resolves actions and `activities` still owns the
    task query; only the rendering moved to the consumer, because a merged row
    needs per-row events (an action navigates, a task opens a modal).
  - `activities/open-tasks` gains two vars, both defaulted so existing consumers
    are unaffected. `render: false` fetches and seeds `open_tasks` without drawing
    any cards, for a host that renders the rows itself; `on_loaded` runs an action
    list once that seeding completes. `render` is applied at build time, because
    the card list _is_ `open_tasks` — hiding it would delete the state it seeds.
  - The related-deals strip is bounded by pagination: two per row, four per page,
    with the deal name ellipsised to one line and the lookup returning 10 rather
    than 20. Previously up to twenty content-width cards wrapped into several
    ragged rows and pushed the timeline tabs below the fold.
  - The workspace columns are evened to 12/12; the pipeline column was previously
    narrower than the detail column beside it.
  - The deals list panel gains a "New deal" button in its header and a chevron
    that collapses the panel to a fixed 36px rail, widening the workspace. The rail
    is a fixed width rather than a grid share, so it stays sized to its chevron
    instead of tracking the viewport — which also means it applies at every width,
    including below 768px where the expanded panel is full width.
  - The deal topbar's action bar now shrinks, so its buttons wrap to a second line
    on a narrow screen instead of spilling the topbar and giving the page a
    horizontal scrollbar. The bar could not shrink before; collapsing the panel on
    a ~375px phone is what made it overflow.
  - The workflow card's header keeps its natural height when the workflows are
    expanded. It was a flex item being squeezed by the growing body, losing ~11px —
    enough to clip a two-line title.
  - Card numbers flagged `round: true` in `card_fields` render at two decimal
    places on both the list-page card and the workspace panel card. Both
    previously rendered through Nunjucks `round`, which rounds to whole numbers
    (12.6 → 13) and cannot pad trailing zeros.

  `button_new_deal` gained `size` and `visible` vars, both defaulted to preserve
  its current rendering on the deals list page.

  activities: comment-only corrections, no behaviour change. `capture_activity`'s
  docblock documented five `prefill` keys where the component has always supported
  seven, omitting `attributes` and `references`, and did not record that those two
  apply in `mode: modal` only. `open-tasks` described itself as composing with
  `open-actions` into one row, which stopped being true once the deals panel
  stacked them.

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.15.0

### Minor Changes

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Add the **open-tasks** component — a compact card list of an entity's open
  `kind: task` docs, reading activities' own `actions` collection filtered by
  `entity_type`/`entity_id` (the shape `create-task`/`update-task` write) and
  an open status (current stage not `done`). It's the activities-owned
  sibling of the `workflows` module's `open-actions` card, styled to match
  it so a host can compose both side by side into one "what's open" row.
  Takes `entity_type` + `entity_id` vars and an optional `on_click` action
  list for wiring a host's `task-modal` instance. Reads no workflow-engine
  data.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Add exported task CRUD — `create-task` / `update-task` APIs writing
  `kind: task` docs into activities' `actions-collection`, and a paired
  `task-modal` component. Two seams keep this from being a lossy
  generalization of deals' original deal-only implementation: an arbitrary
  entity link (payload `entity_type`/`entity_id`, not a hardcoded reference,
  so a task can hang off a deal, a meeting, or any entity) and a
  consumer-supplied emitted event (`task-modal`'s `events` var supplies the
  `type` + Nunjucks display template per create/complete/reopen transition,
  forwarded through to the events module's `new-event`). `task-modal` also
  takes the assignee-options source as a var (`assignee_options` +
  optional `assignee_search`) instead of hardcoding a request.

## 0.14.1

## 0.14.0

## 0.13.0

## 0.12.0

## 0.11.0

## 0.10.1

## 0.10.0

### Minor Changes

- [#93](https://github.com/lowdefy/modules-mongodb/pull/93) [`ce955c2`](https://github.com/lowdefy/modules-mongodb/commit/ce955c285e9abdec66ba059ae5c292c99862a3e4) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Six backwards-compatible extension points in the activities module:

  - **Type behavior flags** — the meeting-specific form behavior is no longer keyed to the literal `meeting` type id. Activity-type enum entries (built-in or registered via the `activity_types` var) now carry optional flags: `agenda: true` renders the Agenda Topics section, `duration: true` / `direction: true` show those meta fields in the form and view, and `contact_label` titles the linked-contacts selector (default "Participants"). The built-ins keep their previous behavior as defaults (`call`: duration; `email`: direction + CC; `meeting`: agenda + duration + Attendees), so a consumer type can now be fully meeting-like.
  - **Per-type attribute fields** — new `fields.attributes_by_type.<type_id>` var. A type with an entry renders that block list (form and detail view) instead of the global `fields.attributes` array; types without an entry fall back to the global array.
  - **Attachment slots** — the attachments UI is now a pair of overridable block-array slots: `components.form_attachments` (defaults to the files module's file-manager at the bottom of the form) and `components.view_attachments` (defaults to the files file-card sidebar tile on the detail page). Apps that don't wire the files module can supply their own blocks or `[]`.
  - **Post-create hook** — new `hooks.on_created` var: actions run after every successful create (new page and `capture_activity` modal) with the new activity's id at `state.activity_id` and the captured fields still in state. On the new page, setting `state.on_created_handled: true` in the hook skips the built-in reset + navigate-to-view tail so the hook can route elsewhere.
  - **Agenda origin marker** — task docs created from activity agenda topics are stamped `metadata.task_type: agenda` (create flow, and backfilled by the edit flow's upsert), so host apps can distinguish them from adhoc tasks without relying on the `activity_ids` back-link.
  - **Form option requests** — new `form_requests` var: request configs spliced into the new/edit page request lists and fired on page init, so request-backed consumer `fields.*` blocks (e.g. a selector whose options come from an app collection) have their option sources available. The pages set a `state.activity_form_context` marker (`page` on new/edit, `view` on the detail page, `modal` in the `capture_activity` modal) so such fields can gate themselves to the full-page form and stay out of the modal, where page requests aren't available.

## 0.9.2

## 0.9.1

## 0.9.0

### Patch Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`163529c`](https://github.com/lowdefy/modules-mongodb/commit/163529cd6063914ff715b37934feea595967ee86) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Breaking:** the `layout` `floating-actions` component now lays its buttons out with `direction: row` + `justify: flex-end` + `wrap: nowrap` instead of `direction: row-reverse`. Buttons are now listed in natural left-to-right order (the last one renders rightmost), and the bar never wraps onto a second line.

  Migration: reverse the order of buttons in each `floating-actions` `actions:` array — what used to be listed first (and rendered rightmost under `row-reverse`) must now be listed last. Every action button must set `layout: { flex: 0 1 auto }` so it is content-sized rather than a full-width grid column; a button without it stretches full width and stacks onto its own line. Any `spacer` Box or `width` var previously used to coax right-alignment is no longer needed and should be removed.

  All in-repo callers (contacts, activities, companies, user-account, user-admin) have been updated to the new order. The workflows action-page templates (edit/view/review/error) and the shared `check-action-surface` signal bar (used by the in-context action modal and the `workflow-action-*` pages) now set `flex: 0 1 auto` on every signal button and order them so the primary action lands rightmost, fixing buttons that previously stacked onto multiple lines and left-aligned. The signal bar's `justify` was also corrected from the invalid `flex-end` token to `end` (Lowdefy's justify map only accepts `end`; `flex-end` silently fell back to left alignment).

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`c4e1000`](https://github.com/lowdefy/modules-mongodb/commit/c4e100087969a67336fc071a0183198c57fd46c2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - The shared page title bar (`modules/shared/layout/title-block.yaml`, threaded through the `layout` `page` component) gains three capabilities:

  - **`type` eyebrow** — a small uppercase entity-type label rendered directly above the title (e.g. `COMPANY`, `EDIT COMPANY`, `INVITE ACME USER`). The `title` prop now holds just the entity name; pages stop hand-concatenating `"{type}: {name}"` into the heading. The eyebrow renders immediately and is never skeletoned.
  - **`status` + `status_enum` pill** — the caller passes a status slug (runtime) and a status-enum map (build-time `_ref`); the title block resolves the label and the three-colour contract (`color`→fill, `borderColor`→border, `titleColor`→text) internally and renders a chunky, vertically-centred pill. Status resolution lives in the component now, not in each caller.
  - **opt-in `loading` skeleton** — when `loading` is truthy, the title, subtitle, and status pill render as shimmer skeletons (via Lowdefy's native `loading:`/`skeleton:` pair). Defaults to `false`, so static list/index titles are untouched.

  **Breaking:** the raw `badge_text` / `badge_color` props are **removed** (replaced by `status` + `status_enum`). Any external/consumer title-bar override that passed `badge_*` silently loses its badge and must migrate to a status enum with the standard `{ color, borderColor, titleColor, title }` entry shape. The wholesale `title_block` override path is unaffected — it replaces the block entirely and never used these props.

  All in-repo callers are migrated: workflow overview and group overview (badge → status pill), and contacts / activities / user-admin view, edit, and new pages (entity type split out of the title into the eyebrow; `loading` added on the request-backed view pages). A new `modules/workflows/enums/action_group_statuses.yaml` enum backs the group-overview rollup status (done / in-progress / blocked), preserving its previous green / blue / grey colours. The title-bar prop interface is now documented in the layout module README.

## 0.8.1

### Patch Changes

- [#80](https://github.com/lowdefy/modules-mongodb/pull/80) [`c079a0d`](https://github.com/lowdefy/modules-mongodb/commit/c079a0d8e143b0b0764d1c7b79a1024ef836d855) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities list: stop scoping the table via url-query params, and fix free-text search over the rich-text description.

  - The list page (`pages/all.yaml`) no longer hydrates `contact_id` / `company_id` from `_url_query`. The page renders no visible entity (contact/company/deal) filter control, so url-driven scoping produced a silently filtered, uncloseable table — and the `activities-timeline` "View all" link, when mounted on a deal (`reference_field: deal_ids`), passed neither branch so both resolved to `null`. "View all" now navigates to the full list with a clean url; the entity-scoped subset is already shown in the timeline tile itself.
  - `get_activities.yaml` still honours `state.filter.contact_id` / `company_id` as a request-side extension point for consumers that add their own _visible_ picker via `components.filters`; only the hidden url hydration is removed.
  - `get_activities.yaml` free-text search now targets `description.text` instead of `description`. The description field is Tiptap rich text stored as `{ html, text }`, so the previous path against the object never matched; searching the plain-text subpath (not the html markup) keeps results free of tag noise.

## 0.8.0

### Minor Changes

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`2e9c67c`](https://github.com/lowdefy/modules-mongodb/commit/2e9c67cc77215032f059d597371866c9783ce001) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: built-in meeting agenda topics, stored as tasks in the actions collection.

  - New built-in Agenda Topics section on the activity form (meeting only): topic, details, action, person responsible (options from the activity's attendees), and due date, with an info alert explaining that agenda changes create/update tasks. Previously this lived in consumer `fields.attributes` config writing to `attributes.agenda_topics`.
  - Topics are no longer stored on the activity doc. `create-activity` and `update-activity` accept a new `agenda_topics` payload array and persist each topic as a task document in the actions collection — `kind: task`, `title` = topic, `description` = details, `attributes.action`, `assignees` = [person responsible], `due_date`, app-keyed `{app_name}.message`, initial stage `action-required` — linked back via `activity_ids` and stamped with the activity's `company_ids` + `references` payload (e.g. `deal_ids`) so they surface in host-app task lists.
  - `update-activity` diffs incoming topics against the activity's existing tasks by `_id`: new rows insert (upsert), existing rows get field edits only (status untouched), and removed rows get a `not-required` status entry pushed — never deleted. `delete-activity` marks the activity's open (`action-required`) tasks `not-required`.
  - No per-task events: the existing `create-activity` / `update-activity` / `delete-activity` events carry affected task ids in `references.action_ids`, and task status entries reference that event's id.
  - `get_activity` gains a `lookup_agenda_tasks` stage (`_id` → `activity_ids`, excluding `not-required`) feeding a new read-only Agenda Topics section on the view page and the edit form's seeded rows (hidden task `_id` per row round-trips through the ControlledList).
  - New `actions-collection` connection (default collection `actions`, write enabled) and `lookup_collections.actions` var (default `actions`) — consumers mapping the actions collection to another name must set both.
  - Activity docs now also store the create `references` payload verbatim under a `references` field, so tasks added later from the edit page inherit the same references.

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`f2d1386`](https://github.com/lowdefy/modules-mongodb/commit/f2d138632a0afa03f440ab6e17be4c14b939aa8e) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: built-in file upload on the activity form.

  - The activity form (new page, edit page, and quick-capture modal) now renders an Attachments section with the files module's `file-manager`, so users can attach files while logging an activity. Files bind to `entity_type: activity`, `entity_id: activity_id`, `file_category: activity-attachment` — the same keys the detail view's file sidebar reads.
  - To give uploads a stable id before the activity exists, `activity_id` is minted (`_uuid`) on form open — capture-modal `onOpen` and new-page `onInit` — and reused as the create payload's `_id` instead of minting a fresh id at submit. The modal's `onClose` reset clears it; the edit page seeds it from the loaded `_id` so the file-manager resolves identically on new, edit, and capture. This also gives consumer attachment-style `fields.attributes` blocks a stable `_state: activity_id` to bind against.
  - The form embeds the file-manager unconditionally, so hosts must wire the module's `files` dependency (previously only needed for the optional detail-page file sidebar).

- [#68](https://github.com/lowdefy/modules-mongodb/pull/68) [`b7f8ca8`](https://github.com/lowdefy/modules-mongodb/commit/b7f8ca83a3fb553bb7b68aca0a3bbd79b02823b0) Thanks [@Yianni99](https://github.com/Yianni99)! - Activities: add basic/complex type gating, clean up the detail view, and fix runtime + warning issues surfaced by demo testing.

  **Activities**

  - New `type: basic | complex` field on each `activity_types` entry. Basic activities (built-in: `call`, `email`) are created in `default_stage` and have no transition UI; complex activities (built-in: `meeting`) keep the full Mark done / Reopen / Cancel lifecycle. Existing consumer-defined types without an explicit `type` default to `complex` (full UI).
  - Type gating enforced at three layers: table action-column cell renderers (em-dash for basic), CallAPI skip conditions (defence in depth for empty-cell clicks), and view-page button visibility. Stage chip on the detail view header is also hidden for basic activities.
  - **Breaking: linked contacts are now stored as reference objects.** Activity docs store a `contacts` array of `{ contact_id, name, email, verified }` reference objects (written by the contacts module's `contact-selector`) instead of the old `contact_ids` plain-id array. `create-activity` / `update-activity` accept a `contacts` payload in place of `contact_ids`, and the `activities-timeline` component's `reference_field` var takes `contacts` (matched internally on `contacts.contact_id`) instead of `contact_ids`. Emitted events still flatten the references to plain ids under `references.contact_ids`, so event reverse-lookups are unchanged. Existing data written with `contact_ids` needs a migration to the new shape.
  - Read pipelines join contact docs into a separate `contacts_enriched` field (`lookup_contacts` now matches on `contacts.contact_id`), keeping the stored reference objects intact for the edit form to round-trip back into the selector. The list table's Contacts column, detail-page contact chips, and view pages all read the enriched docs.
  - New `lookup_collections` var configures the real Mongo collection names used by the read-pipeline `$lookup` stages: `lookup_collections.contacts` (default `user-contacts`) and `lookup_collections.companies` (default `companies`). Override when an app points its connections at differently-named collections (`$lookup` `from` takes a collection name, not a connectionId).
  - New `components.contact_card_extra_fields` / `components.company_card_extra_fields` vars: extra `{ label, value }` rows rendered under each linked contact's name/email and each linked company's name on the activity-detail chips. `value` is a top-level key on the projected doc — extend the lookup stage's `$project` to surface nested source fields.
  - Form rework: the type picker is now a `SegmentedSelector` (was a dropdown `Selector`), and the linked-contacts selector relabels per type — Attendees (meeting), CC (email), Participants (otherwise). The "Additional Details" divider above consumer `fields.attributes` is removed; attribute fields now render directly after the built-in fields.
  - View detail page main column: removed the Status History section (duplicates the events timeline in the History card) and the inline Linked Contacts / Linked Companies sections (duplicates the dedicated sidebar cards).
  - View detail header: collapsed the separate type-chip / title / description blocks into a single header (title + rich-text description) with refined typography, and moved the type + current-stage pills into the wrapping card's `extra` slot. Captured date, duration (call / meeting), and direction (email) now render via a field-driven `SmartDescriptions` block whose `fields` config is the form's meta-row field defs, extracted to the shared `components/activity_meta_fields.yaml` so the form and the read-only view stay in sync.
  - Description rendering reads `description.html` instead of the whole TiptapInput value object (fixes `[object Object]` in the view). Excel export reads `description.text` for plain output.
  - `get_activities.yaml` now runs `lookup_contacts` + `lookup_companies` stages so the list table's Contacts/Companies columns populate. Dropped `returnStoredSource: true` so post-write refetches return the live doc immediately instead of waiting on Atlas Search index replication.
  - `updated_at` / `created_at` date formatting moved into the shared `add_derived_fields.yaml` stage — every consumer (detail, list, tile, options) now gets the formatted strings, not just the list page.
  - New optional `references` payload on `create-activity` and `update-activity`: any keys passed in this object are `_object.assign`'d onto both the inserted/updated doc and the emitted event's `references:` block. Lets consumers link activities to entities the module doesn't know about (e.g. `deal_ids` from a CRM app) without forking the module — existing callers passing only `contacts` / `company_ids` are unaffected.
  - `capture_activity` now forwards `prefill.references` through `onOpen` state seeding and into the create payload, and seeds `cycle_check_self_id` / `cycle_check_ids` so the embedded company-selector's `get_companies_for_selector` request doesn't `ConfigWarning` on hosts that don't otherwise declare those state keys. `pages/new.yaml` mirrors the same `references` state init and payload pass-through.
  - **Fix event display app_name keying.** Activities was writing per-event display titles under a hard-coded `display.default.title` instead of `display.{app_name}.title`, so the events module's `display_key` could never read them back (blank timeline titles). The module now declares a required `app_name` var and follows the same pattern as `companies` / `contacts`: `defaults/event_display.yaml` ships bare event-type keys, and the four write APIs wrap them under `app_name` via `_build.if_none` (override fully replaces — no merge) instead of the old `_build.object.assign`. **Breaking:** consumers must now pass `app_name` to the activities module entry.
  - `get_activities.yaml` stage filter targets `status.stage` instead of `status.0.stage` — Atlas Search can't address array elements by position, so the old path never matched and a stage filter returned zero rows.
  - Edit page fetches the activity in `onInit` instead of `onMount`, so block-level mount fetches (e.g. the file-manager's files request) see `activity_id` seeded before they fire.
  - View page mirrors the loaded activity's `type` into `_state: type` (init `null` in onInit, set on hydrate). Consumer `fields.attributes` `visible` conditions are written against `_state: type` (e.g. meeting-only fields); the key existed on the form pages via the type input block but was never set on the view page, so those conditions always evaluated false once `SmartDescriptions` started honoring `visible: false`.
  - `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on every activity page that uses `company-selector` — silences the build-time `ConfigWarning` from companies' implicit `_state` references in `get_companies_for_selector.yaml`. Runtime unchanged (request `_if_none` defaults already covered it).

  **Companies / contacts**

  - `cycle_check_self_id` / `cycle_check_ids` initialised in onInit on the view pages. Any sidebar slot that hosts a `company-selector` (e.g. via the activities `tile_activities` slot-wired from the app) triggers companies' `get_companies_for_selector` request, which reads those `_state` keys. The build's `_state` validator warns when keys are referenced but undeclared on the page; the init silences the warning. Runtime unchanged (`_if_none` defaults take over).

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`a56d14a`](https://github.com/lowdefy/modules-mongodb/commit/a56d14aff3bf01dc014871ee51f38a30e96288e6) Thanks [@Saiby100](https://github.com/Saiby100)! - Lock linked-company edits on the activity edit page.

  - Companies: `company-selector` accepts a new `disabled` var (default `false`) that renders the selector read-only.
  - Activities: new `disable_company_edit` var (default `false`). When `true`, the edit page renders the linked-companies selector disabled, so linked companies stay visible but can't be changed after creation. The new page and quick-capture prefill still set companies; detail-page chips and list-table tags are unaffected.

### Patch Changes

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`0f2f9a3`](https://github.com/lowdefy/modules-mongodb/commit/0f2f9a3abaa8680edca433cdde3d816655b4e659) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: make the linked-company display field configurable instead of hardcoding `trading_name`.

  The `lookup_companies` read stage and the `company_list_items` / `table_activities` templates hardcoded `trading_name`, which matched neither the companies module's `name_field` default (`name`) nor any consumer that left that default in place — linked-company chips and list-table tags rendered blank (table fell back to `_id`).

  - New `company_name_field` var (default `name`) mirrors the companies module's `name_field`. Set both to the same value when an app stores its company display name under a non-default field (e.g. `trading_name`).
  - `lookup_companies.yaml` now projects the configured field under the stable alias `name` via `$getField`, so `company_list_items` and `table_activities` read `company.name` regardless of the source field.

  No action needed for consumers on the `name` default. Apps that store the company display name under another field should set `company_name_field` to match their companies `name_field`.

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`f2d1386`](https://github.com/lowdefy/modules-mongodb/commit/f2d138632a0afa03f440ab6e17be4c14b939aa8e) Thanks [@Saiby100](https://github.com/Saiby100)! - Activities: restyle the `activities-timeline` rows for scannability.

  Rows are restructured into a column layout: the activity title leads, with a smaller type-label pill on its right (the pill previously sat left of the title). The activity description renders as muted two-line-clamped text under the title (Tiptap HTML stripped, empty `<p></p>` docs hidden). The stage pill is replaced by plain stage-coloured text bottom-left, and the date bottom-right now shows the activity's scheduled date (`attributes.date`) instead of `updated.timestamp`. Rows get horizontal padding, rounded corners, and a hover background (theme-token based, works in light and dark).

## 0.7.0

## 0.6.0

### Minor Changes

- [`ad80095`](https://github.com/lowdefy/modules-mongodb/commit/ad800955415ff9e5858a0ce3d8fc6ddd5b241046) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Bump `@lowdefy/community-plugin-mongodb` peer requirement from `^2` to `^3` across all modules that depend on it (`activities`, `companies`, `contacts`, `notifications`, `user-account`, `user-admin`). Consumer apps must update their plugin install to the v3 line; module config and exports are otherwise unchanged.

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.2

### Patch Changes

- [#50](https://github.com/lowdefy/modules-mongodb/pull/50) [`2ea6148`](https://github.com/lowdefy/modules-mongodb/commit/2ea6148f1cdfd22e0a8059c598420dbd7daa7006) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Use the AgGrid block's native `loading` property for the list tables (`activities_table`, `companies_table`, `contacts_table`, `users_table`) instead of swapping the `overlayNoRowsTemplate` between `Loading...` and `No rows` via `_if`. The block now enters its built-in loading state while the list request is pending and falls back to a static `No rows` overlay once it resolves empty — the previous wiring conflated "loading" with "empty" through a single text overlay.

## 0.4.1

## 0.1.0

### Minor Changes

- Initial activities module.
