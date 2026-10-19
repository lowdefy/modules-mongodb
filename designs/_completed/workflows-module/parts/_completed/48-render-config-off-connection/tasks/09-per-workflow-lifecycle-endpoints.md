# Task 9: Per-workflow Start/Cancel/Close endpoints; retire the Part 19 generics

## Context

Start/Cancel/Close are today **generic** single endpoints taking `workflow_type` (Start) / `workflow_id` (Cancel/Close) in the payload — `modules/workflows/api/{start,cancel,close}-workflow.yaml`, referenced from `module.lowdefy.yaml:142–144`. Part 48 D5 retires them: a generic endpoint can't carry bounded `render_config` (it doesn't know its type until runtime, so its static property would have to be all ~100 workflows' config — the exact bloat this part removes — or none, and Start genuinely needs render config: it renders the seed-stage `status_map` and fires `internal_mirror_child_active` to its parent where a mirror override applies).

`makeWorkflowApis` (extended in task 8 for submit) now also emits, per workflow: `{type}-start`, `{type}-cancel`, `{type}-close`. Each carries:

- **`render_config`** — same own-plus-ancestors bundle as `{type}-submit` (task 8's builder is reused).
- **`lifecycle_event_override`** — a sibling property (not under `render_config`, same reasoning as `hooks`) = the workflow-level `event[<the one lifecycle signal this endpoint fires>]` slice (task 7 validates the map; task 6's handlers consume `params.lifecycle_event_override`). Own workflow only — lifecycle events fire exactly once at the originating handler and never cascade. Shape per task 6's resolution: the per-action payload-override shape, e.g. `{ display: { demo: { title: "…" } } }`. Omit the property when the workflow declares no `event` or no entry for that signal.
- **No `hooks`** — start/cancel/close have no user-action hooks.

This is a deliberate, accepted ergonomic regression (D5): callers that hit one fixed endpoint and passed the type as data now construct the endpoint id from the type (`_string.concat` / `_nunjucks` / `_switch` — the id is deterministic). Flag the breaking change for downstream consumer apps in release notes / changelog if the repo keeps one.

## Task

**1. `makeWorkflowApis.js` — emit the three lifecycle endpoints per workflow** (every workflow, including all-tracker ones — they can still be started/cancelled/closed):

- `{type}-start` → routine step `type: StartWorkflow`, `connectionId: { _module.connectionId: workflow-api }`. Properties: `workflow_type: workflow.type` **as a static literal** (the endpoint is type-scoped; callers no longer pass it), plus the generic yaml's passthroughs (`entity_id`, `entity_collection`, `parent_action_id`, `actions`, `references`, `metadata` — carry over the `actions:` grammar comment from `api/start-workflow.yaml`), plus `render_config`, plus `lifecycle_event_override` (the `event.started` slice). `:return` keys verbatim from the generic yaml (`workflow_id`, `action_ids`, `event_id`).
- `{type}-cancel` / `{type}-close` → `CancelWorkflow` / `CloseWorkflow`. Properties: `workflow_id`, `reason`, `references` passthroughs (from the generic yamls), plus `render_config`, plus `lifecycle_event_override` (the `event.cancelled` / `event.closed` slice). `:return` keys verbatim (`action_ids`, `event_id`, `tracker_fired`).
- These are `type: Api` (HTTP-callable, like the generic ones they replace) — not `InternalApi`.
- Extend the Part 34 D10 reserved-type guard comment (`:109–112`): it now also protects `{type}-start/cancel/close` from colliding with the module's fixed page/endpoint space (the throw itself already covers it since it rejects the whole workflow type).

**2. Retire the generics:**

- Delete `modules/workflows/api/start-workflow.yaml`, `cancel-workflow.yaml`, `close-workflow.yaml`.
- Remove their three `_ref` entries from `modules/workflows/module.lowdefy.yaml` (`:142–144`); the per-workflow endpoints now come out of the `makeWorkflowApis` resolver ref that follows.

**3. Tests (`makeWorkflowApis.test.js`):**

- Each workflow emits exactly `{type}-start/cancel/close` with the right routine step types, static `workflow_type` on start, correct passthroughs, and `:return` shapes.
- `render_config` on all three matches the submit endpoint's bundle for the same workflow.
- A workflow with `event: { started: …, closed: … }` → `{type}-start` carries the `started` slice, `{type}-close` the `closed` slice, `{type}-cancel` has **no** `lifecycle_event_override`.
- No `hooks` property on any of the three.
- All-tracker workflow: start/cancel/close emitted, no submit (task 8 invariant).

## Acceptance Criteria

- The demo app builds with no `_ref` errors; built output contains `onboarding-start`, `company-setup-start`, etc., and no `start-workflow`/`cancel-workflow`/`close-workflow`.
- `pnpm test` passes in `modules/workflows`.
- (Demo start callers still point at the deleted generic id until task 11 — the build's endpoint-ref resolution failure mode for that, if any, is acceptable mid-sequence; tasks 9 and 11 should land together if the build hard-fails on a dangling `_module.endpointId`.)

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — emit `{type}-start/cancel/close`.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — lifecycle-endpoint tests.
- `modules/workflows/api/start-workflow.yaml` — delete.
- `modules/workflows/api/cancel-workflow.yaml` — delete.
- `modules/workflows/api/close-workflow.yaml` — delete.
- `modules/workflows/module.lowdefy.yaml` — modify — drop the three `_ref`s.

## Notes

- Grep confirmed no in-repo callers of the generic `cancel-workflow`/`close-workflow`; the two `start-workflow` callers (`apps/demo/api/leads-create.yaml:48`, `apps/demo/modules/companies/vars.yaml:34`) re-point in task 11.
- The breaking change for downstream consumer apps calling the generic ids is D5's accepted regression — note it wherever this repo tracks release notes.
