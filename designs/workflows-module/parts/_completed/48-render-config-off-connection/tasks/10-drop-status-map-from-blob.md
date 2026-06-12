# Task 10: Drop `status_map` from the connection blob

## Context

This is the de-bloat payoff. The connection's `workflowsConfig` is operator-evaluated whole on every workflow request, and `status_map` (per-stage × per-app Nunjucks) is its one heavy action field — paid for all ~100 workflows on every call in a production app. With the merge-at-load seam live (task 3) and every write endpoint delivering `render_config` (tasks 8–9), the blob no longer needs to carry it: `planActionTransition.js:195` keeps reading `actionConfig.status_map?.[stage]`, but the value now arrives via the endpoint and the load-phase splice. The lean structural slice (`access`, `kind`, `tracker` linkage, `blocked_by`, `action_group`, `action_groups`, …) stays on the connection — the recompute/unblock fixpoint needs every sibling's structure for any workflow the cascade touches (Part 46 D3, narrowed not reversed).

`event_overrides` was never on the blob — nothing to drop there.

## Task

1. In `modules/workflows/resolvers/makeWorkflowsConfig.js`, remove `'status_map'` from `ACTION_FIELDS` (`:7–18`). Update the header comment: `status_map` is now delivered per-request via the write endpoints' `render_config` (Part 48), not via the blob; build-time validation of `status_map` cells (`validateStatusMapCells`) stays — the field is still validated here even though it's no longer picked.
2. Update `makeWorkflowsConfig.test.js`: the returned config must **not** contain `status_map`; validation tests for malformed `status_map` still pass (validation runs against the raw workflow, independent of picking).
3. Audit for blob-read regressions: `grep -rn "status_map" plugins/modules-mongodb-plugins/src` — every runtime read must be off a merged `actionConfig` (the seam) or a persisted doc, never assuming the blob carried it. `makeActionPages.js` reads the **raw workflow YAML** (`vars.workflows`), not the blob — unaffected, leave it alone.
4. Engine integration check: a submit/cascade test exercising a `status_map` render with the blob slice absent but `params.render_config` present renders the endpoint-delivered cell; with **both** absent it falls through to sticky/default behavior (the missing-key contract from task 3).

## Acceptance Criteria

- Connection blob entries carry no `status_map`; structural fields unchanged.
- Demo app: action transitions still render `status_map` messages (delivered via endpoints) — verifiable by the engine integration tests above and a demo build + manual submit if the e2e suite (Part 22) isn't available yet.
- `pnpm test` passes in `modules/workflows` and `plugins/modules-mongodb-plugins`.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — drop `status_map` from `ACTION_FIELDS`, comment update.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — picked-shape assertions.
- Engine test files as needed for the integration check — modify.

## Notes

- Must land **after** tasks 3, 8, and 9 — dropping the blob field before every write endpoint delivers `render_config` would break `status_map` rendering on whichever operation lags.
- Keep `tracker` in `ACTION_FIELDS`: `child_workflow_type` is structural (StartWorkflow's child gate, `planActionTransition`'s denormalization read it off the blob config).
