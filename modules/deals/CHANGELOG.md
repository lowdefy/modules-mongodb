# @lowdefy/modules-mongodb-deals

## 0.29.0

### Minor Changes

- [#169](https://github.com/lowdefy/modules-mongodb/pull/169) [`c5e0ecc`](https://github.com/lowdefy/modules-mongodb/commit/c5e0ecc005a374c2ec922aab20420c9c765ab0a1) Thanks [@JohannMoller](https://github.com/JohannMoller)! - `deals` takes a `hooks` var with `pre_insert` and `post_insert` — routine steps spliced into the `create-deal` API around the deal insert. With the var unset (`[]`), the routine is unchanged.

  Deal creation was closed to host extension. `create-deal` persists host `fields` generically through `attributes`, so a host that only needs to _store_ something needs nothing more — but a host that needs create to also _do_ something had no way in. The motivating case: a create form that captures Company Size when the linked company has none on record, and writes it back to the company. The only workarounds were forking the API or bolting a second call onto the client, both of which re-fork the create path the module exists to own.

  Pick a slot by what the steps need to do, not by what they need to see:

  - `pre_insert` runs before anything is written, and is the only point at which a create can still be stopped. A `:reject: <message>` there surfaces the message on the page and writes no deal. This is what the slot is mainly for.
  - `post_insert` adds `_step: deals_insert_deal.insertedId`, and is the right slot for side effects — including ones that do not need the deal id. There is no transaction around the routine, so a write made from `pre_insert` stays behind if the insert then fails; from `post_insert` the deal is already committed and nothing can strand it. Nothing rolls back from here either, so keep these steps idempotent.

  `post_insert` runs **before** the workflow starts rather than after. That ordering is deliberate: a failing hook then leaves a deal with no workflow, which a host can detect and repair, instead of a workflow pointing at a deal that was never created, which it cannot.

  Host steps are spliced into the module's own routine and share its step namespace, so **step ids beginning `deals_` are reserved** — the module's own steps were renamed to that prefix. A host step reusing one builds without complaint and shadows the module's step at runtime.

  Hooks are host-supplied routine steps, so they run server-side inside the same request as the insert — not a client action list like the activities module's `hooks.on_created`. The naming follows that module's `hooks:` convention.

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.1

## 0.25.0

## 0.24.0

## 0.23.1

### Patch Changes

- [#150](https://github.com/lowdefy/modules-mongodb/pull/150) [`91d717f`](https://github.com/lowdefy/modules-mongodb/commit/91d717f5c866edfead9da46c84d1c0cb3cabe577) Thanks [@Yianni99](https://github.com/Yianni99)! - Related-deal names wrap to two lines, and both deal-detail grids keep even columns and equal-height cards.

  Two fixes to the related-deals grid, one visible and one structural.

  The grids used `grid-template-columns: 1fr 1fr`, which is `minmax(auto, 1fr)` — the `auto` minimum floors each column at its content's min-content width. The compact card's deal name was `white-space: nowrap`, so its min-content was the whole untruncated name: a long name widened its column instead of being clipped, leaving the pair uneven. Measured in a 556px container, the name rendered 467px and unclipped; `minmax(0, 1fr)` clips it at 256px with the columns even.

  The name now clamps to **two lines** rather than ellipsising on one. That matches the open-items card beside it and shows more of the name — the single line was a constraint of the earlier fixed-width scrolling strip, which pagination replaced, so it no longer bought anything. Related-deal cards gain `gridAutoRows: 1fr` and `height: 100%` so a one-line name doesn't sit shorter than a two-line neighbour, the same pairing the open-items grid already uses.

  Both grids get the column fix. Only related deals showed the symptom, since the open-items card already clamped rather than using `nowrap`, but the same floor would apply to any non-wrapping row added later.

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

### Minor Changes

- [#120](https://github.com/lowdefy/modules-mongodb/pull/120) [`5d94b31`](https://github.com/lowdefy/modules-mongodb/commit/5d94b3138e5e214ef023d546c6bd36fbd16287f0) Thanks [@Yianni99](https://github.com/Yianni99)! - Deals view surfaces are now host-controllable:

  - Add a `show_details` var (default `true`). Set it `false` to hide the read-only "Details" SmartDescriptions section — for hosts that render their domain fields through custom tiles (`components.info_grid_slots`) instead of the generic section.
  - Company is no longer a fixed row in the meta strip. Hosts that want it there add a `meta_fields` entry (the same way Value is added), so a host with a dedicated company tile isn't stuck with a duplicated name.
  - Info-grid layout regrouped: the read-only Details section is now full-width at the top (with a trailing divider that hides along with it), followed by a uniform tile grid — People, Files, then the host `info_grid_slots` tiles. Previously People sat alone above a divider, apart from the tiles.

## 0.16.0

## 0.15.0

### Minor Changes

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`1ed7317`](https://github.com/lowdefy/modules-mongodb/commit/1ed7317e64c27a40212f356ad3b5fc0fefed8f4a) Thanks [@Yianni99](https://github.com/Yianni99)! - Add the **deals** module: a workflow-driven deal/opportunity workspace (list,
  create, and a master-detail workspace) that orchestrates the workflows, events,
  activities, files, companies, and contacts modules. The pipeline is a workflows
  workflow selected via the `workflow_type` var; the `deals` collection is
  host-app-owned and mapped in. Ships pages `all`/`new`/`view`, a create/update/
  task/outcome API surface, a `deal-status-chip` component, and app-configurable
  stages/outcomes/reasons/filters/card-fields plus main/info-grid/sidebar/card slots.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`ab684ab`](https://github.com/lowdefy/modules-mongodb/commit/ab684abd2b7e9cb80dd3f964d1d97285e18b735a) Thanks [@Yianni99](https://github.com/Yianni99)! - Align the deals module with the sibling entity modules (companies / contacts /
  activities) for consistency: add `label` / `label_plural` vars so a host can
  relabel the entity (used across the menu, page titles, breadcrumbs, and the
  New button); extract the create-form body to a `form_deal` component and the
  list action to a `button_new_deal` component; adopt the `content_width` page
  var, vertical field labels, and the shared Cancel/Create button conventions on
  the create page; align the list "New" and filter "Clear" buttons; and
  genericize leftover "sales-pipeline" wording now that the module is
  workflow-agnostic.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`c772d6f`](https://github.com/lowdefy/modules-mongodb/commit/c772d6f582122200e3984b0bf330ed17f8f65ea3) Thanks [@Yianni99](https://github.com/Yianni99)! - Add an `entity_connection_id` var (default `deals`) replacing the hardcoded
  `deals` literal everywhere the module matches or passes a workflow doc's
  `entity.connection_id` — the list/detail aggregations (get_selected_deal,
  get_active_deals, get_deals_list, get_selected_deal_open_actions), the outcome
  modal's get-entity-workflows refetch, the deal view and compact list-item
  get-entity-workflows payloads, and the `entity_connection_id` passed to the
  embedded `actions-on-entity` component. Lets a host map its deals collection
  under any connection id, as long as it matches the workflow config's
  `entity.connection_id`.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`b9b47bc`](https://github.com/lowdefy/modules-mongodb/commit/b9b47bca96fd2ffc2c7780a33e054065ce59d6cb) Thanks [@Yianni99](https://github.com/Yianni99)! - Generalize the deals create/display surface: the module no longer bakes in
  domain-specific fields (material/SKU, product, sector, sub-sector,
  customer-type, project-type, packaging) or their taxonomy vars. Hosts now
  inject their own domain fields through a single `fields` var — rendered as
  inputs on the create form and read-only on the deal view via
  `SmartDescriptions`, matching how `companies.fields.attributes` works. The
  create-deal API writes a generic `attributes` passthrough, and `product`
  (previously a top-level field with its own `products` var and list/header
  rendering) becomes a plain `attributes.product` host field.

  **Breaking (config):** consumers must move their domain fields to the new
  `fields` var and drop the removed `products`/`product_hierarchy`/`sectors`/
  `sub_sectors`/`customer_types` vars. Existing deals keep their stored
  `attributes.*` — the generic passthrough and read side render whatever is
  there. `form.name` no longer auto-prefills (the shared company-selector has
  no onChange hook); hosts own any prefill via a `fields` block `onChange`.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`c772d6f`](https://github.com/lowdefy/modules-mongodb/commit/c772d6f582122200e3984b0bf330ed17f8f65ea3) Thanks [@Yianni99](https://github.com/Yianni99)! - Stop computing `deal_value`/`close_date` from host-specific workflow action
  fields in the list/detail aggregations (get_selected_deal, get_active_deals,
  get_deals_list) — read them as plain stored fields (`$value`/`$close_date`,
  each with an `$ifNull` fallback) the same way `deal.outcome` is already
  read back after being stamped on write. Also drops the module's inline
  volumes rounding/projection; the module ships no volumes tile of its own —
  hosts supply one through the existing `components.info_grid_slots` var. An
  unstamped deal now renders `0`/`—` for value/close date instead of an
  app-specific computed number.

### Patch Changes

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Close two reuse gaps in the deal view left over from adopting workflows'
  `actions-on-entity`: it never dropped the shared `check-action-modal`, so a
  `check`-kind action clicked in the phase view full-page-navigated to its own
  action page instead of opening in place; and the deal-outcome modal
  hand-rolled its own `get-entity-workflows` refetch + `entity_workflows`
  reseed after submitting the win/loss outcome action, instead of the exported
  `entity-workflows-refetch` sequence.

  The deal view (`pages/view.yaml`) now drops `check-action-modal` next to
  `actions-on-entity`, with an `on_complete` that runs `entity-workflows-refetch`
  plus a re-seed of the open-tasks card (mirroring the existing deal-switch and
  task-save refreshes) so both cards and the stepper stay live after a check
  action completes. `components/detail/deal_outcome_modal.yaml` now calls
  `entity-workflows-refetch` instead of its own copy of the same two actions.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Replace the single merged open-items card (`components/detail/section_actions.yaml`
  - `components/detail/action_card.yaml.njk`) with the two cards it used to
    combine, now composed side by side: the `workflows` module's `open-actions`
    and the `activities` module's new `open-tasks`. Deletes the merged card,
    its now-dead `open_actions_all`/`open_actions` seeding (`actions/compute_open_actions.yaml`
    and all its call sites), the `get_selected_deal_open_actions` request, and
    deals' own `actions-collection` connection (its only remaining reader) —
    the workflows engine keeps its own, separate actions collection. Task
    creation/edit now refetches `open-tasks`' own request instead.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Stop shipping a second, deal-only task implementation — delete
  `components/detail/task_modal.yaml`, `api/create-task.yaml`, and
  `api/update-task.yaml`, and consume activities' new exported `task-modal`
  component (with activities' `create-task`/`update-task` APIs underneath)
  instead. The deal view passes `entity_type: deal`, the deal id, and its
  `deal-task-created`/`deal-task-completed`/`deal-task-reopened` event
  config, so task creation still writes to the same `actions` collection,
  links to the deal, and emits the same event display markup as before.
  `get_task_assignee_options` stays in deals and is now passed to the shared
  modal as its assignee-options source.

- [#111](https://github.com/lowdefy/modules-mongodb/pull/111) [`8923ca1`](https://github.com/lowdefy/modules-mongodb/commit/8923ca1501e8ae7af3ee721bd9738134d0f03681) Thanks [@Yianni99](https://github.com/Yianni99)! - Stop shipping a second, deal-only note-capture modal — delete
  `components/detail/add_note_modal.yaml` and consume events' new exported
  `note-capture` component (writing through events' own `new-event` api)
  instead. The deal view passes its `get_mentionable_users` request as the
  mention source, the deal id under `reference_field: deal_ids`, the deal's
  `company_id`, and its `deal-note` event type/display template, so notes
  still emit the same event type, references, and display markup as
  before. `get_mentionable_users` stays in deals since it queries the
  app's own users.
