# @lowdefy/modules-mongodb-workflows

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
