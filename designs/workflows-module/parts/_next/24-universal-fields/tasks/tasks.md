# Implementation Tasks — Part 24: Universal-fields surface

## Overview

Implements the universal-fields surface (`assignees`, `due_date`, `description`): the `UpdateActionFields` engine operation (form kind), the kind-based submit-planner guard (check kind keeps writing fields on submit), the `universal_fields` authoring passthrough, the reusable `universal-fields` Lowdefy component, and the template/page integration. Derives from `designs/workflows-module/parts/24-universal-fields/design.md`.

**Sequencing precondition:** the whole part sequences after Part 38 (engine rebuild) — every plugin task amends or reuses Part 38's `shared/phases/` + `shared/render/` helpers, which already exist on this branch.

## Tasks

| #   | File                                  | Summary                                                                                      | Depends On |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-fields-updated-event-type.md`     | Extend `planEventDispatch` with the `UpdateActionFields` handler type → `action-fields-updated` event | —          |
| 2   | `02-load-phase-fields-mode.md`        | Add a signal-less, verb-gated load mode to `loadWorkflowState` (no stage check)               | —          |
| 3   | `03-commit-workflow-less-plan.md`     | `commitPlan` + `Plan` typedef accept plans with no workflow write (no CAS)                    | —          |
| 4   | `04-plan-fields-update.md`            | New pure planner `planFieldsUpdate.js` (fields `$set` + cell re-render + event + change-log)  | 1          |
| 5   | `05-update-action-fields-handler.md`  | `UpdateActionFields` handler + `WorkflowAPI` connection registration                          | 2, 3, 4    |
| 6   | `06-submit-kind-guard.md`             | Kind-based universal-fields rule in `planActionTransition` (write only for `kind: check`)    | —          |
| 7   | `07-universal-fields-passthrough.md`  | `universal_fields` authoring field: validation, allowlist passthrough, default normalization  | —          |
| 8   | `08-emit-update-fields-endpoint.md`   | `makeWorkflowApis` emits `{workflow_type}-{action_type}-update-fields` per form action        | 5 (runtime) |
| 9   | `09-binding-prerequisites.md`         | `user-multi-selector` id var, `get_action` assignee `$lookup`, `user-account` manifest dep    | —          |
| 10  | `10-universal-fields-component.md`    | The `universal-fields` component (replaces the stub; kind × mode behaviour + Update button)   | 7, 8, 9    |
| 11  | `11-template-sidebar-integration.md`  | Form-template sidebar column + display bindings + check-page verification (Part 16/17 follow-on) | 10     |
| 12  | `12-concept-spec-amendments.md`       | Concept-spec amendments (authoring reserved fields, `description` shape, handler docs)        | 5, 8       |

## Ordering Rationale

Three independent tracks converge on the handler, then the module layer builds on the resolver layer:

- **Engine plumbing (1–5).** Tasks 1–3 are independent amendments to Part 38's shared phase helpers (event planner, load phase, commit phase) and can run in parallel. Task 4 (the new planner) composes task 1's event type. Task 5 (the handler) is the convergence point — it wires load → plan → commit and registers the request type on the connection.
- **Submit guard (6).** Fully independent of 1–5: it narrows the existing generic `fields` passthrough in `planActionTransition.js` to the kind-based rule. It can land before or after the handler; nothing breaks in either order (the guard makes form submits ignore universal fields; the handler gives form kind its own write path).
- **Resolver layer (7–8).** Task 7 (authoring passthrough) and task 8 (endpoint emission) are build-time resolver changes, independent of each other and of the plugin tasks at build time. Task 8's emitted endpoints reference the `UpdateActionFields` request type, so they only *run* once task 5 has landed — sequence 8 after 5 for a continuously green demo app.
- **Module layer (9–11).** Task 9 ships the three small binding prerequisites the component needs (selector id var, assignee-doc lookup, manifest dependency). Task 10 replaces the component stub and needs 7 (the `show` contract), 8 (the endpoint id it calls), and 9. Task 11 is the template/layout integration — the design's mandated follow-on for the `_completed/` Parts 16/17 deviations — and lands last because it composes the finished component.
- **Docs (12).** Spec amendments document the shipped contract; sequenced after the handler + endpoint so the documented ids/shapes are final.

Parallelizable groups: {1, 2, 3, 6, 7, 9} → {4, 8} → {5} → {10} → {11, 12}.

## Notable decisions baked into these tasks

- **Endpoint id is `{workflow_type}-{action_type}-update-fields`** (user-approved deviation, design.md updated): action types are only unique per workflow, so the unprefixed id in the original draft would collide across workflows. Matches the `{workflow_type}-{action_type}-submit` pattern.
- **Access gate = `edit` verb.** The design's "role check (`access.roles` ⊇ user roles)" wording predates Part 34's per-app per-verb access model (action-wide `access.roles` no longer exists — `makeWorkflowsConfig.js` hard-errors on it). The shipped gate is `access.{app_name}.edit`, the verb that owns the page surface where the Update button renders, evaluated with the existing `gateAllows` semantics.
- **`_state.action_allowed` is a per-verb map** (`{ view, edit, review, error }` — see `components/action_role_check.yaml`), so the component gates on `action_allowed.edit`, not a bare boolean as the design snippet sketches.
- **Assignee display docs come from a `$lookup` in `requests/get_action.yaml`** (`from: user-contacts` — precedent: `modules/activities/requests/stages/lookup_contacts.yaml`). The design pins "no module-shipped requests *added*" and `user-avatar` consumption per assignee, but avatars need user docs, not ids; extending the existing shared request is the smallest conforming path.
- **`user-multi-selector` gains an `id` var** (default `user-multi-selector`, backward-compatible) so it can auto-bind to `fields.assignees` — Part 24a shipped it with a hardcoded id but its design explicitly states "Part 24 binds `_state.fields.assignees`".

## Scope

**Source:** `designs/workflows-module/parts/24-universal-fields/design.md`
**Context files considered:** Part 38 design + planner contract (`parts/38-engine-rebuild/design.md`), Part 24a design (`parts/_completed/24a-user-account-selector-avatar/design.md`), concept specs (`workflows-module-concept/action-authoring/spec.md`, `workflows-module-concept/engine/spec.md`), and the current code of every touched file (planners, phases, resolvers, templates, pages, manifests).
**Review files skipped:** `review/review-1.md`, `review/review-2.md`.
**Excluded:** Part 39's `fields`-payload drop + submit-Validate-regex narrowing (Part 39 is an active part with its own tasks folder); a fields endpoint for check actions; `universal_fields_required`; tracker universal-fields UI (all explicitly out of scope in the design).
