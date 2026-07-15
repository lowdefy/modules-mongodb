# @lowdefy/modules-mongodb-workflows

## 0.13.0

## 0.12.0

### Minor Changes

- [#105](https://github.com/lowdefy/modules-mongodb/pull/105) [`b853551`](https://github.com/lowdefy/modules-mongodb/commit/b85355143b18f2a76d7f8ff77fdd7080acf6a619) Thanks [@Saiby100](https://github.com/Saiby100)! - Extend the form-field library. Add a `phone` field (wraps `PhoneNumberInput` —
  the form-side counterpart to the `phoneNumber` view field type), add
  `disabled`/`extra` vars to `text_input`, and `disabled`/`theme` vars to
  `button_selector`. Also migrate `location` off the deprecated
  `layout.contentGutter` (→ `layout.gap`), which newer Lowdefy builds reject.
  Together these let consuming apps author read-only text, themed toggles, and
  phone inputs as first-class library components instead of raw blocks.

### Patch Changes

- [#105](https://github.com/lowdefy/modules-mongodb/pull/105) [`d913ed6`](https://github.com/lowdefy/modules-mongodb/commit/d913ed626c972f103ce297ade1db425a3c0e864d) Thanks [@Saiby100](https://github.com/Saiby100)! - Fix outer-card suppression on the form-action edit/error pages. The templates
  dropped the outer form card whenever the first form entry declared a sub-form,
  assuming it owned its own card chrome — but only the `section` field renders a
  Card. A form led by a `controlled_list` (or `box`/`label`/`file_upload`) thus
  rendered with no card, and its comment input fell outside any card. Suppression
  now triggers only when the first entry's component is `section`.

## 0.11.0

## 0.10.1

## 0.10.0

### Patch Changes

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`18d8876`](https://github.com/lowdefy/modules-mongodb/commit/18d8876916b21bad8690861ddf60f6c1d02bfeb6) Thanks [@Yianni99](https://github.com/Yianni99)! - Make action edit-page button titles configurable

  The edit page's progress ("Save Draft") and submit ("Submit") button titles can
  now be overridden per action via `page_config.buttons.progress.title` /
  `page_config.buttons.submit.title` (defaults unchanged). This lets an app relabel
  e.g. a perpetual-log action's "Save Draft" button to "Save".

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`466e976`](https://github.com/lowdefy/modules-mongodb/commit/466e976d9cdc31d63585cd4a825c9cd8d9b7cc93) Thanks [@Yianni99](https://github.com/Yianni99)! - Add `on_change` event support to workflow form field components

  The `button_selector`, `number`, `radio_selector`, `checkbox_selector`,
  `checkbox_switch`, `text_input`, `text_area`, `enum_selector`, `date_selector`,
  `date_range_selector`, and `tiptap_input` field components now accept an
  `on_change` var (mirroring `selector` / `yes_no_selector`) that wires to the
  block's `events.onChange`. Previously these fields silently dropped any authored
  field-level change handler, so form logic like "clear dependent field when this
  one changes" only worked on a handful of field types.

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`f1d8f6c`](https://github.com/lowdefy/modules-mongodb/commit/f1d8f6cefa4cee19f838795d91403851fea4027d) Thanks [@Yianni99](https://github.com/Yianni99)! - Add a role-filtered simple contact selector

  New `role-contact-selector` contacts component: a Selector (or MultipleSelector
  via `mode`) of active contacts scoped to one or more roles (matched against
  `apps.<app_name>.roles`), storing a denormalized `{ contact_id, name, email }`
  value — object in single mode, array in multiple — so read-only views render it
  as a contact (name + link). New `role_contact` and `role_contact_multiple`
  workflows form fields wrap the single- and multiple-select cases. A lighter
  alternative to the rich contact picker (`contact`) when a form only needs to pick
  existing contacts in a given role.

- [#94](https://github.com/lowdefy/modules-mongodb/pull/94) [`c93ad39`](https://github.com/lowdefy/modules-mongodb/commit/c93ad39a0a0c65c2a4ee21e4e49d013f037a7681) Thanks [@Yianni99](https://github.com/Yianni99)! - Edit-page Save Draft now sends the `comment` / `comment_visibility` inputs with the progress call and clears them after a successful save, matching the check page's progress reseed — so a draft comment is no longer folded into a later event on the next Save Draft.

## 0.9.2

### Patch Changes

- [`384da61`](https://github.com/lowdefy/modules-mongodb/commit/384da6108b4c5ef599ff075ea6368eb95d2da050) Thanks [@JohannMoller](https://github.com/JohannMoller)! - **Fix: group `on_complete` routines were never dispatched** — `makeWorkflowApis` emitted the `{type}-group-{id}-on-complete` InternalApis and `planSubmit` computed `completedGroups`, but nothing ever fired the endpoints, so an authored group `on_complete` silently never ran (the docs promised the engine fires it). A new `dispatchGroupOnComplete` phase now fires each completed group's routine post-commit, after the tracker cascade and ahead of the post-hook.

  Fan-out covers **both the submitted workflow and any parent workflow** reached by tracker propagation: when a child completes and a parent group thereby transitions to `done`, that parent group's `on_complete` fires too, with `context.workflow` set to the parent doc. `planTrackerLevel` computes each cascade level's completed-group diff; the submit endpoint carries a build-resolved `workflow_type → group_id → endpoint` bundle (own workflow + ancestors) on `params.group_on_complete`, and the dispatcher resolves each completion by its `workflow_type` (same `_module.endpointId` mechanism as hooks). The payload mirrors the post-hook `context` so a routine can reach the committed workflow doc. Failures propagate after writes have landed, so `on_complete` routines must be idempotent — the same contract as post-hooks. Does not fire on cancel or close.

- [`ad5bf9f`](https://github.com/lowdefy/modules-mongodb/commit/ad5bf9fd599ad4c4a82641562e45ca73d22029e6) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Check-action modal header restructure** — the compact modal header is split into two rows: status pill · message title · in-flow close on the top row, and the assignee / due-date chips on their own right-aligned row below (a long title no longer fights the chips for width). The modal sets `closable: false` — an in-flow close button replaces the native floating X, which had no title strip to live in and overlapped the header; mask-click and Esc still close.

  The workflow-closed banner moved below the header (title-then-notice reading order), and the signal button bar now hides wholesale on a closed workflow instead of showing disabled buttons.

- [`378c216`](https://github.com/lowdefy/modules-mongodb/commit/378c2166ed3eb3ee56aa1f780c7441a2ae356d45) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Entity-context overview eyebrow** — the two workflow overview pages (`workflow-overview`, `workflow-group-overview`) now render an eyebrow that names the entity the workflow hangs off (`{type}: {name}`, e.g. "Company: Acme Corp") above the title, instead of the static "Workflow" label. Sourced from the `workflow.entity_link` on the overview responses via a shared `overview-entity-eyebrow` component, with a `title`-only fallback until the instance name resolves.

## 0.9.1

### Patch Changes

- [#86](https://github.com/lowdefy/modules-mongodb/pull/86) [`1d7160c`](https://github.com/lowdefy/modules-mongodb/commit/1d7160cd75a13318c1405542bef791a1319fdda2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Action fields header polish (Part 67)** — the universal-fields chips row is relabelled and restructured into a labelled two-field strip: an **Assignees** list (with `Unassigned` / `+N` overflow states, each assignee's avatar linking to the contact) and a due-aware pill (`No due date` placeholder, overdue styling). The templates and `check-action-surface` now pass `assignee_docs` as a path string and expose the action's `stage` leaf to the header. `contacts` becomes a build-time dependency of the always-present chips (for the avatar link).

- [#86](https://github.com/lowdefy/modules-mongodb/pull/86) [`1d7160c`](https://github.com/lowdefy/modules-mongodb/commit/1d7160cd75a13318c1405542bef791a1319fdda2) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Overview progress breakdown (Part 66)** — the two workflow overview pages now render a **segmented status bar** in place of the single-colour antd `Progress` line. One coloured segment per action state (`done, in-review, changes-required, error, in-progress, action-required, blocked`, `not-required` excluded), sized by each state's count and coloured from the shared `action_statuses` enum's `titleColor`, so the bar shows not just _how much_ is done but _what state the rest is in_. Built as a shared `Html` + `_nunjucks` component (`overview-progress-bar.yaml`) `_ref`-ed by both pages.

  The percentage is corrected to `done / (total − not_required)` — waiving an action removes it from the pool rather than counting it as filled — and the caption reads `{done} of {pool} done · {n} not required`, so the green `done` segment's width equals the percentage exactly.

  Because the counts are now derived on read, the denormalised `summary` / `groups[]` cache is **dropped from the workflow doc**, making the action docs the single source of truth. A new pure `summarizeStatuses(actions)` counter feeds the three overview resolvers; `GetWorkflowActionGroupOverview` re-sources its existence guard, `id`, `status`, and `summary` from the loaded actions / config, and `GetEntityWorkflows` recomputes group `status` from grouped actions. The write path stops persisting `summary` / `groups`, and `planSubmit`'s `completed_groups` diff recomputes both sides from actions via `recomputeGroups` (behaviour-equivalent, no staleness). No migration — the module is unreleased.

## 0.9.0

### Minor Changes

- [#82](https://github.com/lowdefy/modules-mongodb/pull/82) [`bf0015f`](https://github.com/lowdefy/modules-mongodb/commit/bf0015f6db25223ba8c0160b27acfcb40d9385f3) Thanks [@SamTolmay](https://github.com/SamTolmay)! - **Initial release of the `workflows` module** — a multi-workflow engine for entity-scoped business processes (sales pipelines, onboarding checklists, compliance reviews, service orders, and any entity with a structured, role-gated lifecycle).

  Apps declare workflow YAML (`workflows_config`, one entry per workflow type); the engine renders entity-scoped action lists and submits lifecycle transitions through engine-managed handlers. Highlights:

  - **Signal-driven FSM** — a submission carries a _signal_ that the engine resolves against a per-kind finite-state machine, so authors never hand-write status transitions.
  - **Resolver-emitted surface** — two static overview pages, six operational APIs, and a dynamic surface derived from the app's config: a per-verb page set per form action, one `{workflow_type}-action` page per workflow, and one submit endpoint per form/check action. Every action page renders in the same three-tier workspace.
  - **Authoring grammar** — action kinds, role-gated `access` (multi-app scoped via `app_name`), inline `hooks` and `trackers`, action groups with blocking, and an inline `entity.data` routine that returns host-shaped data about the entity instance.
  - **Built-in form components** and a universal-fields surface wrapping the `contact`, `user`, file, and event components from sibling modules.

  Depends on the `layout`, `events`, `notifications`, `contacts`, and `user-account` modules, and on the `@lowdefy/modules-mongodb-plugins` `WorkflowAPI` connection.

  Full documentation lives under `docs/workflows/` — start with the module index and the mental-model concept, then the authoring grammar, FSM-and-signals, and required-indexes references.
