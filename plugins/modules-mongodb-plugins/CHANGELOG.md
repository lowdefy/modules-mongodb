# @lowdefy/modules-mongodb-plugins

## 0.17.0

## 0.16.0

### Minor Changes

- [#118](https://github.com/lowdefy/modules-mongodb/pull/118) [`cdd1772`](https://github.com/lowdefy/modules-mongodb/commit/cdd1772bdd70ac5d01f8cc6cab245924a07b8748) Thanks [@Saiby100](https://github.com/Saiby100)! - Add a checkable-tree multi-select field for workflow action forms. Report types (or any grouping) show as parent nodes and their items as checkable leaves; checking a group selects all its items. The selection now also renders on the read-only view page instead of showing nothing.

## 0.15.0

## 0.14.1

### Patch Changes

- [#115](https://github.com/lowdefy/modules-mongodb/pull/115) [`c75bad2`](https://github.com/lowdefy/modules-mongodb/commit/c75bad2bfbefde062b3e689618dffb9fcdfb7538) Thanks [@Yianni99](https://github.com/Yianni99)! - Align the suite to lowdefy 5.5.1 and migrate block stylesheets to CSS Modules.

  Blocks that shipped a global `style.css` — `ActionSteps`, `DataDescriptions`,
  `EventsTimeline`, `SmartDescriptions`, `WorkflowProgress` — now import a
  `style.module.css` whose selectors are wrapped in `:global(...)` inside
  `@layer components`, matching the convention used by the official
  `@lowdefy/blocks-antd` blocks. The Turbopack build in lowdefy 5.5.1 rejects
  global-CSS imports from transpiled first-party packages; the rendered class
  names are unchanged, so consumers see no visual difference.

## 0.14.0

### Minor Changes

- [#114](https://github.com/lowdefy/modules-mongodb/pull/114) [`f8b6d19`](https://github.com/lowdefy/modules-mongodb/commit/f8b6d197d010ce025a6e6443184f079d6170fe66) Thanks [@Saiby100](https://github.com/Saiby100)! - Add the WorkflowProgress block and the workflows module's `workflow-progress` component — a presentation variant of `actions-on-entity` that renders an entity's workflows as collapsible sections of grouped, status-colored action buttons, with progress rings, done-fractions, and the shared check-action click handling baked in.

## 0.13.0

### Minor Changes

- [#109](https://github.com/lowdefy/modules-mongodb/pull/109) [`ee7ee3c`](https://github.com/lowdefy/modules-mongodb/commit/ee7ee3c6371452876025e81b110f4df09fcfe626) Thanks [@Saiby100](https://github.com/Saiby100)! - Add the `require` signal: a narrow, pre-hook-only cascade that reopens a `not-required` form/check action back to `action-required`. It is the `not-required` counterpart of `unblock` (which narrowly reopens `blocked`) and is kept distinct from the broad `activate` so a cascade can re-enable a skipped action without accidentally reopening completed (`done`) work. Enables patterns like a boolean form field that toggles a dependent action between `action-required` and `not-required` indefinitely.

## 0.12.0

### Patch Changes

- [#105](https://github.com/lowdefy/modules-mongodb/pull/105) [`70622be`](https://github.com/lowdefy/modules-mongodb/commit/70622be1ff6e42e50f8e39474a520e9120aa4570) Thanks [@Saiby100](https://github.com/Saiby100)! - Center the ContactSelector row actions (verify/edit buttons) within their
  fixed-width container instead of right-aligning them.

## 0.11.0

### Minor Changes

- [#100](https://github.com/lowdefy/modules-mongodb/pull/100) [`dd309b8`](https://github.com/lowdefy/modules-mongodb/commit/dd309b83299d3f37d2fb2fd380ed288e42bdf97f) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Log file downloads for parity with upload/delete auditing. The `FileManager`
  block now fires an `onDownload` event (payload `{ fileDoc }`) when a download is
  initiated. The `file-manager` / `file-card` components expose a new `on_download`
  var (action list, default `[]`) for consumer-supplied handlers, and — when
  `log_events` is on — record a `download-file` event via the events module,
  matching how uploads and deletes are logged.

## 0.10.1

## 0.10.0

## 0.9.2

### Patch Changes

- [`384da61`](https://github.com/lowdefy/modules-mongodb/commit/384da6108b4c5ef599ff075ea6368eb95d2da050) Thanks [@JohannMoller](https://github.com/JohannMoller)! - **Fix: EventsTimeline inline card text invisible in dark mode** — the action card set a fixed light background tint but rendered its message with no explicit color, so the text inherited the theme foreground and washed out to light-on-light in dark mode. The message now uses the status's `titleColor` (the same dark accent already used for the badge dot), with an undefined `titleColor` for unknown statuses correctly falling back to inherited color.

- [`384da61`](https://github.com/lowdefy/modules-mongodb/commit/384da6108b4c5ef599ff075ea6368eb95d2da050) Thanks [@JohannMoller](https://github.com/JohannMoller)! - **Fix: group `on_complete` routines were never dispatched** — `makeWorkflowApis` emitted the `{type}-group-{id}-on-complete` InternalApis and `planSubmit` computed `completedGroups`, but nothing ever fired the endpoints, so an authored group `on_complete` silently never ran (the docs promised the engine fires it). A new `dispatchGroupOnComplete` phase now fires each completed group's routine post-commit, after the tracker cascade and ahead of the post-hook.

  Fan-out covers **both the submitted workflow and any parent workflow** reached by tracker propagation: when a child completes and a parent group thereby transitions to `done`, that parent group's `on_complete` fires too, with `context.workflow` set to the parent doc. `planTrackerLevel` computes each cascade level's completed-group diff; the submit endpoint carries a build-resolved `workflow_type → group_id → endpoint` bundle (own workflow + ancestors) on `params.group_on_complete`, and the dispatcher resolves each completion by its `workflow_type` (same `_module.endpointId` mechanism as hooks). The payload mirrors the post-hook `context` so a routine can reach the committed workflow doc. Failures propagate after writes have landed, so `on_complete` routines must be idempotent — the same contract as post-hooks. Does not fire on cancel or close.

- [`771d738`](https://github.com/lowdefy/modules-mongodb/commit/771d738a76c7981e73f758c913b13d6e04a7b403) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Action-card verb-default button labels** — the collapsed action link is now stamped with a label that names the action the _resolved verb_ performs: `edit → Complete`, `review → Review`, `error → Resolve`, `view → View`. So a view-only user on an `action-required` action reads "View", not "Complete". Previously every card fell back to the `EventsTimeline` default "View".

  An author-provided `title` on a custom-action `link:` / `view_link:` cell (or a tracker `start_link`) is preserved through `resolveCellLink` and wins over the verb default. Documented in `docs/workflows/how-to/custom-actions.md` (§ The action card button label) and `docs/plugins/events-timeline.md`.

- [`e87504a`](https://github.com/lowdefy/modules-mongodb/commit/e87504aeb6e125f0a9ec96ca5b1a249adf3572cc) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Smaller EventsTimeline avatars** — the timeline avatars are shrunk to sit better against the compact rows: compact 22→16px, default 32→26px (font size scaled to match).

## 0.9.1

### Patch Changes

- [#86](https://github.com/lowdefy/modules-mongodb/pull/86) [`1d7160c`](https://github.com/lowdefy/modules-mongodb/commit/1d7160cd75a13318c1405542bef791a1319fdda2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Overview progress breakdown (Part 66)** — the two workflow overview pages now render a **segmented status bar** in place of the single-colour antd `Progress` line. One coloured segment per action state (`done, in-review, changes-required, error, in-progress, action-required, blocked`, `not-required` excluded), sized by each state's count and coloured from the shared `action_statuses` enum's `titleColor`, so the bar shows not just _how much_ is done but _what state the rest is in_. Built as a shared `Html` + `_nunjucks` component (`overview-progress-bar.yaml`) `_ref`-ed by both pages.

  The percentage is corrected to `done / (total − not_required)` — waiving an action removes it from the pool rather than counting it as filled — and the caption reads `{done} of {pool} done · {n} not required`, so the green `done` segment's width equals the percentage exactly.

  Because the counts are now derived on read, the denormalised `summary` / `groups[]` cache is **dropped from the workflow doc**, making the action docs the single source of truth. A new pure `summarizeStatuses(actions)` counter feeds the three overview resolvers; `GetWorkflowActionGroupOverview` re-sources its existence guard, `id`, `status`, and `summary` from the loaded actions / config, and `GetEntityWorkflows` recomputes group `status` from grouped actions. The write path stops persisting `summary` / `groups`, and `planSubmit`'s `completed_groups` diff recomputes both sides from actions via `recomputeGroups` (behaviour-equivalent, no staleness). No migration — the module is unreleased.

## 0.9.0

### Minor Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`2076040`](https://github.com/lowdefy/modules-mongodb/commit/2076040218c3f932f54843ee1e54e06cdce81870) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Feature:** the action workspace now surfaces the reviewer's request-changes comment as a read-only callout while an action is in `changes-required` (Part 62). The callout sits in the middle column's bare-alerts slot — below the `workflow_closed_banner`, above the content card — as a `type: warning` Alert ("Changes requested" + the comment), so the reworker sees the "what to fix" brief without hunting the History timeline.

  The brief is resolved server-side in the `GetWorkflowAction` envelope as a new `changes_requested` field: a single gated read of the latest `action-request_changes` event (`sort date desc, limit 1`), projecting the calling app's `{app_name}.description` bucket. App-scoping is inherited from the multi-app comment-visibility model for free — an `internal` reviewer note resolves to `null` for an app that can't see it; the read is skipped (and `null`) in every other stage. Empty/whitespace-only HTML normalizes to `null` so the callout never renders blank. The Alert sanitizes the comment HTML at render (`renderHtml` → DOMPurify).

  The WorkflowAPI connection now declares `eventsCollection` (string, default `"log-events"`), and the request-changes comment inputs are now text-only (inline image uploads disabled), so the callout only ever renders a text brief.

  Host apps in a multi-app deployment must add a `{ action_ids: 1 }` index to the events collection (`log-events`) — see the workflows Indexes reference.

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`5dce3ba`](https://github.com/lowdefy/modules-mongodb/commit/5dce3bacb7f5e69d91454a2951eee94356d76e81) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Feature (Part 26):** workflows declare an inline `entity.data` routine on the `entity:` block (authored exactly like a hook — `{ routine: [...] }`) that returns host-shaped data about the entity instance. The module generates an engine-only `{type}-entity-data` InternalApi from the routine (`makeWorkflowApis`) and carries the resolved endpoint id on `entity.data_endpoint` (`makeWorkflowsConfig`, with the build-only `data` routine stripped from the runtime config). The single-workflow read handlers — `GetWorkflowAction`, `GetWorkflowOverview`, `GetWorkflowActionGroupOverview` — call the endpoint server-side via the engine's `callApi` (same authenticated user) through a shared `resolveEntityData` helper.

  The routine's reserved `name` key is lifted onto `entity_link.name` for the breadcrumb / back-link; all other keys are host-owned and merged onto the action response's `entity` object (consumed by the action page's `DataDescriptions` summary and the `entity_view` slot). Resolution never fails the read — a missing endpoint, a throwing routine, or a deleted entity all degrade to `name: null` (chrome falls back to the type label) and `entity: { id }`.

  This replaces the previous `entity.name_field` dot-path + the per-page `get_entity` request: the request file is deleted, all five action templates (`view`/`review`/`edit`/`error`/`action`) drop the `get_entity` request + onMount read and source the instance name from `entity_link.name` and entity fields from `get_workflow_action.entity`. The action-workspace shell stops blanking the page on the self-set `entity_id` — the middle/right content show content-shaped skeletons gated on the `get_workflow_action` request, and the entity-id mount gate is narrowed to just the `actions-on-entity` and History panels.

  `entity.data` must be an object with a `routine:` array; a string value (the legacy external-endpoint-id shape) hard-errors with a migration hint. The demo onboarding workflow declares an `entity.data` routine and its `entity_view` slot reads `get_workflow_action.entity.*`.

### Patch Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`fb190ff`](https://github.com/lowdefy/modules-mongodb/commit/fb190ff753b887c89fab689eb52a1dd19412b087) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Fix block styling never reaching the app. ActionSteps, EventsTimeline, DataDescriptions and SmartDescriptions each shipped their global CSS via a `style.module.css` imported only for side effects (`import "./style.module.css"`). Vite/Rollup tree-shakes such an import — the CSS-module proxy is treated as side-effect-free because its exported class map is unused — so none of the `:global(...)` rules were emitted into the client bundle (badge stacking, timeline rails, dataview value styling all silently missing). Every selector in these files was already `:global(...)`, so they were CSS modules in name only. Renamed each to a plain `style.css` and import it as a plain global stylesheet, which Vite always keeps.

  Also fix ActionSteps action items wrapping side-by-side: the per-group actions now render in a flex-column container so they stack regardless of stylesheet loading.

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`f1be116`](https://github.com/lowdefy/modules-mongodb/commit/f1be116224290306c358c2267bfb6c55d8d960ca) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Strip leftover `:global(...)` wrappers from the block stylesheets so their rules actually apply. When `ActionSteps`, `EventsTimeline`, `DataDescriptions` and `SmartDescriptions` were converted from `style.module.css` to a plain `style.css`, the rename kept the file content byte-for-byte — including the `:global(...)` wrapper around every selector. `:global()` is a CSS Modules construct, not valid CSS; in a plain stylesheet (processed with `modules: false`) css-loader passes it through verbatim, the browser sees an unknown pseudo-class, treats the whole selector as invalid, and drops the rule. So even though the side-effect import now reaches the production bundle, every styled rule was silently a no-op (badge layout, timeline rails, dataview value/link/tag/array styling).

  Removed the `:global(...)` wrapper from each rule, leaving the inner selector. These classes (`action-steps-*`, `dataview-*`, `events-timeline-compact`) are already namespaced, so there is no module scope to escape in a plain stylesheet. No other blocks are affected: `ContactSelector` and `FileManager` ship no stylesheet, and there are no remaining `.module.css` files in the package.

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`e0f646a`](https://github.com/lowdefy/modules-mongodb/commit/e0f646a1900269a245c6402ad9eda497319833f4) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Restore the `DataDescriptions` block.

## 0.8.1

## 0.8.0

### Minor Changes

- [#79](https://github.com/lowdefy/modules-mongodb/pull/79) [`afa3f13`](https://github.com/lowdefy/modules-mongodb/commit/afa3f1341af84c5bc7c8da5e26d0e67afef6212a) Thanks [@Saiby100](https://github.com/Saiby100)! - SmartDescriptions: render plain objects and arrays of objects instead of crashing (React error [#31](https://github.com/lowdefy/modules-mongodb/issues/31)).

  - New generic `object` field type in the registry (priority 99, after the specific object shapes): renders unknown objects as label/value rows, each value recursing through its own detected field type via a `renderNested` callback now injected into all registry renderers. Reference-style objects (`name` / `label` / `title`) display their label field only.
  - `processFields` now skips fields with `visible: false`, matching Lowdefy block semantics.
  - Empty state keeps rendering the Descriptions header (title / extra) with a muted "No data to display" item, instead of dropping the title.
  - Auto-discovery (data mode) behavior change: single unrecognized objects now render as one row of nested label/value rows instead of flattening into dotted-key rows.

## 0.7.0

## 0.6.0

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.2

## 0.4.1

## 0.4.0

## 0.3.0

### Minor Changes

- [#34](https://github.com/lowdefy/modules-mongodb/pull/34) [`cbe3d6d`](https://github.com/lowdefy/modules-mongodb/commit/cbe3d6d40c724c76da084cbb15fc7ac4bcc9cfa2) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Restructure the `companies` module's data shape so registration / contact / address / attribute fields move into opt-in section sub-objects instead of being hardcoded at the document root. Consumers wire any combination of shipped field-presets — or their own block arrays — through new `fields.{registration,contact,address,attributes}` slot vars.

  **Companies module — breaking shape changes:**

  - **Document root**: `trading_name` / `registered_name` / `registration_number` / `vat_number` / `website` removed from the document root. Display name is now `name`; the registration trio plus website / phone / email move under `registration.*` / `address.*` / `contact.*` sub-objects.
  - **`name_field` default**: flipped from `trading_name` to `name`. All read-side requests build `display_name` via `$getField` so the rename propagates without per-request edits. Apps whose collections genuinely use a different display field must set `name_field` explicitly.
  - **New `fields.X` vars**: `fields.contact`, `fields.address`, `fields.registration` (alongside existing `fields.attributes`). Each defaults to `[]` — apps that don't opt in render an empty section. Block ids inside each array must be prefixed with the section name (`contact.`, `address.`, etc.) so they bind to the matching state subtree.
  - **Field-preset library**: `field-presets/{contact-default,address-text,address-places,registration-sa}.yaml` ship under the module. `address-places.yaml` depends on a custom `PlacesAutocomplete` plugin that does not yet exist in this monorepo; consumers wiring it must supply the plugin themselves.
  - **Excel export**: fixed columns trimmed to the universal core (`id`, `name`, `description`, `updated_at`, `created_at`). Section columns move through the existing `components.download_columns` slot.

  **Migration (data):**

  ```
  trading_name              →  name
  registered_name           →  registration.registered_name
  registration_number       →  registration.registration_number
  vat_number                →  registration.vat_number
  website                   →  contact.website
  contact.primary_email     →  contact.primary_email   (unchanged)
  contact.primary_phone     →  contact.primary_phone   (unchanged)
  address.* (already nested)→  address.*               (unchanged)
  ```

  Run a one-off migration on the `companies` collection; `update-company`'s `$set` does not unset the legacy keys, so old fields will coexist with the new shape until explicitly removed.

  **Migration (apps wiring the module):**

  Add `fields.{contact,address,registration}` to your module-entry `vars` to opt into the sections. Either `_ref` the shipped presets or supply your own block arrays:

  ```yaml
  fields:
    contact:
      _ref: ../../modules/companies/field-presets/contact-default.yaml
    address:
      _ref: ../../modules/companies/field-presets/address-text.yaml
    registration:
      _ref: ../../modules/companies/field-presets/registration-sa.yaml
  ```

  `_ref` paths resolve from the consuming app's config root.

  **Contacts module:**

  `get_contact_companies` now projects `name` + `company_id` instead of the legacy `trading_name`. The contact view's linked-companies tile renders the new shape. Apps that rely on the old projection must update any custom consumers reading from this request.

  **Plugins (SmartDescriptions):**

  The `company` field-type detector signature changes from `"trading_name" in value` to `("name" in value && "company_id" in value)`, and the renderer reads `value.name` instead of `value.trading_name`. Any custom value shape that used to match on `trading_name` alone will now fall through to default rendering — pass `company_id` (or use the updated `get_contact_companies` projection) to keep the company link + icon.

## 0.2.1

### Patch Changes

- [#35](https://github.com/lowdefy/modules-mongodb/pull/35) [`930d7c1`](https://github.com/lowdefy/modules-mongodb/commit/930d7c18d1104fcc03e769907c4cae37ece3b771) Thanks [@Gervwyk](https://github.com/Gervwyk)! - Fix `@lowdefy/modules-mongodb-plugins` peer-version references in module manifests so they track the plugin's actual published version. The previous releases shipped with a hardcoded `^0.1.0` constraint inside every `module.lowdefy.yaml`, which Lowdefy's strict 0.x semver matching rejected once the plugin moved to `0.2.0` — apps that installed `@lowdefy/modules-mongodb-plugins@0.2.0` (the only version compatible with v0.2.0 modules) failed to build with `Module "events" requires plugin "@lowdefy/modules-mongodb-plugins" version "^0.1.0" but the app has version "0.2.0" installed`.

  Modules and the plugin live in the same Changesets `fixed` group, so they're always lockstep on release. `scripts/sync-module-versions.mjs` (run as part of `release:version`) now also rewrites the plugin reference in every module manifest to `^${pluginVersion}`, keeping the manifests' constraint aligned with the plugin's published version on every bump.

## 0.2.0

### Minor Changes

- [#14](https://github.com/lowdefy/modules-mongodb/pull/14) [`1c912ee`](https://github.com/lowdefy/modules-mongodb/commit/1c912eebc030b951ceb402a0d74a855982a37005) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Add `ContactSelector` block and wire it into the `contacts` module as a reusable picker (`contacts.contact-selector` component). Search runs against an Atlas `$search` + `$match` pipeline (`search_contacts`), enrichment via `get_contacts_data`, and add/edit go through the existing `create-contact` / `update-contact` APIs (patched to accept the picker's payload shape). The `companies` form now consumes the picker for linked contacts.

  **Breaking — contacts module vars renamed:**

  - `all_contacts` (module, default `false`, company-scoped) → per-call `company_only_contacts` (default `false`, **unscoped**). The default flipped: callers that relied on the old company-scoped default must now pass `company_only_contacts: true` explicitly.
  - `verified` (module enum `off|trusted|untrusted`) → `use_verified` (module boolean, default `false`) + per-call `verified` (boolean). The module flag toggles the verification UI/payload writes globally; per-call `verified` decides the value each picker instance writes.
  - Removed: module-level `phone_label` (no-op since Task 4) and the per-call `payload` var (deprecated by per-key var pass-through).

  **Migration:**

  ```
  all_contacts: false       →  company_only_contacts: true   (per-call)
  all_contacts: true        →  company_only_contacts: false  (per-call, or omit)
  verified: trusted         →  use_verified: true (module) + verified: true  (per-call)
  verified: untrusted       →  use_verified: true (module) + verified: false (per-call)
  verified: off             →  use_verified: false (module, default)
  ```

### Patch Changes

- [#25](https://github.com/lowdefy/modules-mongodb/pull/25) [`ac1d28a`](https://github.com/lowdefy/modules-mongodb/commit/ac1d28ac694167584a788ec0edd26ee65c2b0cb4) Thanks [@Yianni99](https://github.com/Yianni99)! - Bump `@lowdefy/block-utils`, `@lowdefy/blocks-antd`, `@lowdefy/blocks-basic`, `@lowdefy/helpers`, and `@lowdefy/nunjucks` peer-dep pins from `0.0.0-experimental-20260421070726` to `0.0.0-experimental-20260429140004`.

- [#27](https://github.com/lowdefy/modules-mongodb/pull/27) [`4d3eff1`](https://github.com/lowdefy/modules-mongodb/commit/4d3eff1318b77870f680b679d1d2e0632e663bd5) Thanks [@Yianni99](https://github.com/Yianni99)! - Improve the `EventsTimeline` block and `events-timeline` component:

  - **New block properties**: `compact` (boolean, default `false`) renders smaller avatars and tighter padding, and applies an `events-timeline-compact` class on the root for additional dense styling; `contactPageUrl` (string) is a URL template for linking each user avatar and timestamp to a contact page, supporting `{id}` substitution and falling back to appending `?_id=<userId>`; `disableContactLink` (boolean, default `false`) opts out of the contact-page wrapping per call. Avatars are also wrapped in a Popover showing the user's name on hover.
  - **Component vars**: the `events-timeline` component exposes the new properties via `contact_page_url` module var and per-call `_var` overrides (`contact_page_url`, `disable_contact_link`, `compact`). All defaults are off, so existing consumers see no change.
  - **Fix: `get-events` request never fired** because the component declared the request but had no `onMount` Request action to trigger it. Added the trigger.
  - **Fix: Avatar didn't render** for events without a description — the React `EventTimelineItem` only included `<Avatar>` inside the `EventDescription` branch. Restructured so the title-only branch also renders the avatar.

- [#19](https://github.com/lowdefy/modules-mongodb/pull/19) [`46234e1`](https://github.com/lowdefy/modules-mongodb/commit/46234e1fc925c64a848a660bb7bf16629114f946) Thanks [@JohannMoller](https://github.com/JohannMoller)! - Rewrite the two linked-record sidebar tiles — contacts on company-detail and companies on contact-detail — from a broken antd-style `List` (`properties.dataSource` + `properties.renderItem`) to a plain `Html` block. Both tiles previously rendered blank; both now list the linked records with name + email / display name and link through to the record's detail page using `_module.pageId`.

  Adds an optional `{ label, value }` extension slot per tile under each module's `components` var group:

  - `components.contact_card_extra_fields` on the companies module — appends rows under each contact's name/email on the company-detail tile.
  - `components.company_card_extra_fields` on the contacts module — appends rows under each company's display name on the contact-detail tile.

  `value` must be a top-level key on the document as projected by `get_company_contacts` / `get_contact_companies`. Falsy primitives (`0`, `false`, `""`) render; only `null`/`undefined` are skipped.

  Plugin housekeeping: declare `@lowdefy/nunjucks` as a peer dependency of `@lowdefy/modules-mongodb-plugins`. The plugin's `parseNunjucks.js` imports it but the package wasn't declared anywhere — Turbopack failed to resolve it on fresh installs.

- [#29](https://github.com/lowdefy/modules-mongodb/pull/29) [`cd7e574`](https://github.com/lowdefy/modules-mongodb/commit/cd7e5749956c6d5087726f53dbbcc34d722732b4) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Remove the unused `DataDescriptions` block from `@lowdefy/modules-mongodb-plugins`. The block was exported by the plugin but not referenced by any module or app in this repo; `SmartDescriptions` covers the in-repo use cases. Consumers still importing `DataDescriptions` from this plugin should switch to `SmartDescriptions` or pin to `^0.1.1`.

- [#28](https://github.com/lowdefy/modules-mongodb/pull/28) [`2c4aa70`](https://github.com/lowdefy/modules-mongodb/commit/2c4aa70f54840a33d5f21ea45539328a860d3525) Thanks [@Yianni99](https://github.com/Yianni99)! - Rename module pages from entity-prefixed IDs to semantic verbs to remove the redundant URL prefix (e.g. `/companies/companies` → `/companies/all`). Module pages now use `all`, `view`, `edit`, `new` consistently. Cross-module references via `_module.pageId:` and hardcoded scoped page IDs (`{entry-id}/{page-id}`) must be updated to the new IDs.

  Page ID changes per module:

  - `companies`: `companies` → `all`, `company-detail` → `view`, `company-edit` → `edit`, `company-new` → `new`
  - `contacts`: `contacts` → `all`, `contact-detail` → `view`, `contact-edit` → `edit`, `contact-new` → `new`
  - `user-admin`: `users` → `all`, `users-view` → `view`, `users-edit` → `edit`, `users-invite` → `new`, `check-invite-email` → `check`
  - `user-account`: `profile` → `view`, `edit-profile` → `edit`, `create-profile` → `new` (`login`/`logout`/`verify-email-request` unchanged)
  - `release-notes`: `release-notes` → `view`
  - `notifications`: `inbox` → `all` (`link`/`invalid` unchanged)

  Plugin defaults updated to match: `SmartDescriptions` now defaults `contactDetailPageId` to `contacts/view` and `companyDetailPageId` to `companies/view`; `EventsTimeline` schema example updated.

  Also includes two fixes to the contacts new page: removed a duplicate avatar render (the avatar block was included both directly and via `form_profile`), and fixed the post-create redirect that was navigating with a null `_id` because CallAPI return values are accessed at `_actions: <id>.response.response.<field>`, not `.response.<field>`. Same redirect fix applied to the companies new page.

- [#31](https://github.com/lowdefy/modules-mongodb/pull/31) [`fcd328b`](https://github.com/lowdefy/modules-mongodb/commit/fcd328b031df108450147a91b87d85a508c1f008) Thanks [@Yianni99](https://github.com/Yianni99)! - Small UX fixes across modules and the EventsTimeline block:

  - `release-notes`: Empty-state fallback now triggers when `content` is null OR an empty/whitespace-only string. The previous `_if_none` only caught null, so consumers with an empty `CHANGELOG.md` saw a blank Card instead of the "No release notes available yet" message.
  - `companies` / `contacts` / `user-admin` table components: Added a conditional `overlayNoRowsTemplate` that renders "Loading…" while the `get_all_*` request is in flight and "No rows" once the request completes empty. Previously AG Grid's default "No Rows To Show" appeared during the initial load, indistinguishable from a genuinely empty result.
  - `EventsTimeline` (plugin): Avatar hover swapped from `<Popover>` to `<Tooltip>` so it matches the timestamp's TimeAgo style — same name-on-hover, lighter dark-tooltip styling.

## 0.1.1

## 0.1.0

### Minor Changes

- [#11](https://github.com/lowdefy/modules-mongodb/pull/11) [`f969cdf`](https://github.com/lowdefy/modules-mongodb/commit/f969cdf833334cdf2182b1784ad8605835788f95) Thanks [@SamTolmay](https://github.com/SamTolmay)! - Initial release.
