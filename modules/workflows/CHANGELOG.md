# @lowdefy/modules-mongodb-workflows

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
