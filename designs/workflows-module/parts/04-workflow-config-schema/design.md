# Part 04 — Workflow config schema + `makeWorkflowsConfig`

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md). **Layer:** build-time config. **Size:** M. **Repo:** `modules/workflows/`.

## Goal

Commit the YAML grammar for workflows and actions, ship the fixed status enums, and ship the single resolver (`makeWorkflowsConfig`) that validates the app's workflow YAML at build time and emits the normalized runtime config the engine reads. No page or API generation — those land in parts 12, 13. No engine semantics — those land in parts 6, 7.

## In scope

- **Status enums (module-shipped, fixed).**
  - `enums/action_statuses.yaml` — 8 statuses with priorities: `not-required` (0), `error` (1), `changes-required` (2), `done` (3), `in-review` (4), `in-progress` (5), `action-required` (6), `blocked` (7).
  - `enums/workflow_lifecycle_stages.yaml` — `active`, `completed`, `cancelled`.
  - Exported as `global.action_statuses`, `global.workflow_lifecycle_stages`. Display attributes (title, color, etc.) merged with `vars.action_statuses_display` and `vars.workflow_lifecycle_stages_display` at build time.
- **Workflow YAML schema.**
  - Top-level: `type`, `title`, `entity_type`, `display_order`, `starting_actions[]`, `actions[]`, `action_groups[]`.
  - Per-action: required `kind: form | task | tracker`; universal fields (`assignees`, `due_date`, `description`); display fields (`action_group`, `sort_order`); `access.{app_name}: [view, edit, review, error]` + `access.roles: []`; `blocked_by: []` (mixed action types + group ids); `key:` for instanced actions; `tracker: { workflow_type }` for tracker kind; `interactions:`, `event:`, `hooks:`, `form:`, `form_review:`, `form_error:`, `status_map:`, `pages:`, `required_after_close`.
- **`makeWorkflowsConfig` resolver.**
  - Reads `vars.workflows_config` array; expands `_ref`s.
  - Validates (every rule has its own validator function):
    - Per-workflow: `type`, `entity_type`, `display_order` required; `starting_actions` non-empty; action types unique within workflow.
    - `action_groups[]`: every `id` unique; no `id` collides with any action `type` within the same workflow.
    - Per-action: `type` and `kind` required; `kind: form` requires `form:` and rejects `tracker:`; `kind: tracker` requires `tracker:` and rejects `form:`; `kind: task` rejects both.
    - `action_group` references a declared group id.
    - `blocked_by` entries resolve to either a declared action type or a declared group id.
    - `status_map` keys exist in the `action_statuses` enum.
    - `access.{app_name}` verb values are in `[view, edit, review, error]`.
    - `key:` and `tracker:` mutually exclusive on the same action.
    - Hook auth gate validation (`hook.auth.roles ⊇ action.access.roles`, reject `hook.auth.public: true`) deferred to part 13 (`makeWorkflowApis`) — that's where the hook config gets baked into endpoints.
  - Emits a normalized runtime config object the `workflow-api` connection reads. Shape committed here so parts 6, 7 can read it.
  - Build fails with a precise path-prefixed message on any violation.
- **Display-override merge.** Apply `vars.action_statuses_display` and `vars.workflow_lifecycle_stages_display` onto the shipped enums at build time; unknown keys silently dropped.

## Out of scope / deferred

- **`makeActionPages`** → [part 12](../12-resolver-pages/design.md).
- **`makeWorkflowApis`** → [part 13](../13-resolver-apis/design.md). Hook-auth validation lives there because the hook map is part of the endpoint config.
- **`makeActionsForm` + `makeActionFormConfigs`** → [part 15](../15-resolver-form-builder/design.md).
- **Form components library** → [part 14](../14-form-components-library/design.md).
- **Engine reading the normalized config** — engine handlers (parts 5, 6) consume the output shape this part commits to. This part publishes the shape; later parts read it.

## Depends on

Nothing. Runs in parallel with [part 3](../03-engine-plugin-shell/design.md).

## Verification

- Unit tests on `makeWorkflowsConfig`:
  - Every validation rule has a passing fixture and a failing fixture (with assertion on the error path).
  - Normalized output shape stable across the worked-example onboarding workflow.
- Fixture: the worked-example from [concept design.md](../../../workflows-module-concept/design.md) parses cleanly and round-trips to the normalized shape.
- The shipped enums import as `global.action_statuses` and `global.workflow_lifecycle_stages`; display-attribute overrides merge correctly.

## Open questions

- **Where the normalized runtime config lives at runtime** — global state object, env-injected blob, file read by the plugin? Concept spec calls for the `workflow-api` connection to read it; confirm the exact wiring during part 5 implementation.
- **Status-map validation strictness** — require entries for every status, only reachable statuses, or be permissive? Ship permissive in v1.

## Contract to neighbours

- **Parts 5, 6, 7** read the normalized config shape this part publishes.
- **Parts 12, 13, 15** also read it for build-time emission.
- **Part 4 commits the shape; everyone else consumes it.**
