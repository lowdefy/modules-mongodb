# Task 7: `visible_verbs` read path (Part 34)

## Context

Part 34 D12 replaces the binary `access_filter.yaml` (which dropped actions a user couldn't see) with a per-verb `visible_verbs` projection: each returned action carries a four-key `visible_verbs: { view, edit, review, error }` bag computed against the user's roles, and actions with no true verb drop out. The UI then applies the static priority `edit > review > error > view` on read.

This is a **read-path aggregation**, fully independent of the load-plan-commit write path (per D16). It must agree with the shared role-gate oracle (task 5).

## Task

**Create `modules/workflows/api/stages/visible_verbs_filter.yaml`** implementing the Part 34 D12 pipeline:

- Per-verb `$let` / `$or` resolution against `_user.apps.{app_name}.roles` (gate `true` → always true; array gate → role intersection).
- `$addFields visible_verbs: { view, edit, review, error }`.
- `$match` with `$anyElementTrue` over the four verbs → drop actions with no true verb.

Use the concrete pipeline from Part 34 D12 as the reference.

**Delete `modules/workflows/api/stages/access_filter.yaml`.**

**Swap the `_ref` in the three consuming APIs** from `access_filter.yaml` to `visible_verbs_filter.yaml`:

- `modules/workflows/api/get-entity-workflows.yaml`
- `modules/workflows/api/get-workflow-overview.yaml`
- `modules/workflows/api/get-action-group-overview.yaml`

Their existing `message` / `links` projections light up automatically once the engine writes the top-level per-app fields (no change needed to those projections here).

**Add a test** that runs the shared `gates.fixtures.js` (task 5) through this aggregation via `mongodb-memory-server` `$match`, asserting the gate semantics match the oracle.

## Acceptance Criteria

- `visible_verbs_filter.yaml` projects a four-key `visible_verbs` bag and drops actions with no true verb (`$anyElementTrue`).
- `access_filter.yaml` is deleted and no `_ref` points at it anymore.
- All three get-\* APIs reference `visible_verbs_filter.yaml`.
- The aggregation passes the shared `gates.fixtures.js` cases (`true` always-pass, array-intersection pass/fail, missing verb fail, empty roles fail).

## Files

- `modules/workflows/api/stages/visible_verbs_filter.yaml` — create
- `modules/workflows/api/stages/access_filter.yaml` — delete
- `modules/workflows/api/get-entity-workflows.yaml` — modify (`_ref` swap)
- `modules/workflows/api/get-workflow-overview.yaml` — modify (`_ref` swap)
- `modules/workflows/api/get-action-group-overview.yaml` — modify (`_ref` swap)
- aggregation fixture test — create (runs `gates.fixtures.js` through `$match`)

## Notes

- The `message` / `links` projections in the get-\* APIs read `actions_list.$.{app_name}.message` / `.links`; the UI applies the per-verb selection rule. The renamed `workflow-group-overview` page is handled in task 18.
- Follow the snake_case request-id and kebab-case API-id conventions already in these files.
