# Task 1: Ship `api/get-action-group-overview.yaml` + manifest export + smoke

## Context

The Workflows module ships several operational Apis under `modules/workflows/api/`. The closest analogue to the new endpoint is [`api/get-workflow-overview.yaml`](../../../../modules/workflows/api/get-workflow-overview.yaml) (79 lines) — a Mongo aggregation routine that returns `{ workflow, actions }` for a single workflow, with a deliberate access-vs-existence collapse (`workflow: null` when no actions survive the access filter).

This task ships a new Api that does the same for a single `action_group` within a workflow: filters the action `$lookup` to one group id, drops the `_group_index` cross-group sort layer, and adds a `group` field to the return shape.

Manifest currently lives at [`modules/workflows/module.lowdefy.yaml`](../../../../modules/workflows/module.lowdefy.yaml) and is edited progressively by each part (parts 4, 15, 17, 18, 19 each touched it). `exports.api` currently lists `start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`. The `api:` block lists the `_ref`s.

## Task

### 1. Create `modules/workflows/api/get-action-group-overview.yaml`

Structure modeled on [`api/get-workflow-overview.yaml`](../../../../modules/workflows/api/get-workflow-overview.yaml). Differences:

- **Payload schema:** required `workflow_id`, required `group_id`.
- **`$lookup` inner pipeline:**
  - `$match` on `workflow_id` AND `action_group: <payload.group_id>`.
  - `_ref: stages/access_filter.yaml` (existing reusable stage at [`modules/workflows/api/stages/access_filter.yaml`](../../../../modules/workflows/api/stages/access_filter.yaml)).
  - `$sort` by `sort_order: 1`, `_id: 1` (drop `_group_index` — single group, the cross-group ordering layer is dead weight).
- **Return shape:**
  ```js
  // success
  { workflow: { _id, workflow_type, entity_id, entity_collection, status, summary, groups, ... },
    group:    { id, status, summary: { done, not_required, total } },
    actions:  [ <action_doc>, ... ] }

  // access-denied / missing
  { workflow: null, group: null, actions: [] }
  ```
- **`group` resolution:** look up `workflow.groups[]` entry where `id === payload.group_id` and project `{ id, status, summary }`. Do **not** include `title` — `groups[]` on the persisted doc carries only `{ id, status, summary }` and the static title lives in build-time `workflowsConfig.{type}.action_groups[]`, unreachable from Mongo. The page resolves the title client-side.
- **Access-vs-existence collapse:** when no actions survive the access filter, return `{ workflow: null, group: null, actions: [] }`. `workflow` collapses to `null` per the same `_if` test `get-workflow-overview.yaml` uses (`actions.length > 0`); `group` collapses alongside `workflow` (this Api's one deliberate divergence from `get-workflow-overview` — the group payload is only meaningful in the context of a visible workflow).

### 2. Wire the Api into `modules/workflows/module.lowdefy.yaml`

- Append to `exports.api`:
  ```yaml
      - id: get-action-group-overview
        description: Return one workflow + one action group's metadata + ordered + filtered actions in that group. Backs the shipped group-overview page.
  ```
- Append to the top-level `api:` block:
  ```yaml
    - _ref: api/get-action-group-overview.yaml
  ```
- Update the leading comment block at the top of the file to mention Part 25 alongside the other shipped parts (matching how the comment lists parts 4 / 15 / 17 / 18 / 19).

### 3. Handler-level smoke

There are no unit tests on Lowdefy Api YAML in this repo — `get-workflow-overview`, `get-entity-workflows`, and the other shipped Apis have no sibling tests. Behavioural coverage for the Api lands in Part 22's e2e suite, not here.

For this task, run a manual smoke against the demo app:

- `pnpm ldf:b && pnpm ldf:d` (or whatever the repo's local-dev command is).
- Hit the endpoint directly (via the page in Task 2, or via the demo app's request inspector if it exposes one) with a fixture workflow that has at least two groups and one accessible + one access-filtered group for the dev user.
- Confirm the response shape matches the `Return shape` block in design.md: `{ workflow, group, actions }` with `group.summary` populated for the requested `group_id`, and `{ workflow: null, group: null, actions: [] }` when the dev user can't see anything in the group.

Don't author a `.test.yaml` file — there's no infrastructure to run it.

## Acceptance Criteria

- `modules/workflows/api/get-action-group-overview.yaml` exists, structurally mirrors `get-workflow-overview.yaml` with the differences listed above.
- `modules/workflows/module.lowdefy.yaml` lists `get-action-group-overview` under `exports.api` and references the YAML under `api:`.
- `pnpm ldf:b` (or whatever build command this repo uses) succeeds without YAML errors. No Lowdefy warnings against the new file.
- Manual smoke against the demo app confirms the success-path return shape and the `{ null, null, [] }` access-denied collapse (see "Handler-level smoke" above).
- `git diff` shows no incidental edits beyond the Api file and the manifest.

## Files

- `modules/workflows/api/get-action-group-overview.yaml` — **create** — new Api routine, modeled on `get-workflow-overview.yaml`, with single-group filter + `group` projection + null-collapse.
- `modules/workflows/module.lowdefy.yaml` — **modify** — append `exports.api` entry + `api:` `_ref`; update leading comment.

## Notes

- The `_group_index` field in `get-workflow-overview.yaml`'s `$lookup` (`$addFields` then `$sort` then `$project: { _group_index: 0 }`) exists to order actions across multiple groups. Drop it here — there's a single group, so `sort_order` ASC + `_id` ASC tiebreak is enough.
- The deliberate divergence from `get-workflow-overview` is `group: null` in the collapse case. Add a one-line YAML comment near the `_return` block explaining why (the group payload has no meaning without a visible workflow).
- Don't model "unknown `group_id` while workflow exists" as a distinct case — it collapses to the same `null`/`null`/`[]` shape. The open question on whether to differentiate that is captured in `design.md` "Open questions" and deferred.
