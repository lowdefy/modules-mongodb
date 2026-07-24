# @lowdefy/modules-mongodb-deals

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
