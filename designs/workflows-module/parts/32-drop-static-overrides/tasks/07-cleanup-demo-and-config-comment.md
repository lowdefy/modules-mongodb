# Task 7: Clean up demo workflow YAML + `makeWorkflowsConfig` field comment

## Context

Two pieces of cleanup remain after the engine-side changes:

1. **`makeWorkflowsConfig.js` head-of-file comment** lists `interactions, event` as build-time-only fields excluded from the runtime config:
   ```js
   // modules/workflows/resolvers/makeWorkflowsConfig.js:1
   // Engine-runtime needs + per-action UI lookups. Build-time-only fields
   // (form, form_review, form_error, pages, hooks, interactions, event) are
   // excluded — they're consumed by build-time resolvers (parts 12, 13, 15)
   // against the raw workflow YAML, not via workflowsConfig at runtime.
   ```
   After Part 32, `interactions` and `event` are not consumed by any resolver — they shouldn't appear in this comment. Note: the validator has no unknown-keys rejection (see `validateAction` in the same file — it only inspects known fields), so stale YAML fields are silently accepted; this comment is the only place they're mentioned.

2. **Demo workflow YAMLs** still carry `interactions:` blocks (no `event:` blocks per the design's grep verification):
   - `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` line 20–22 — `submit_edit: { status: done }` (redundant; matches engine default for a form with no `review` verb).
   - `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` lines 27–33 — three entries: `submit_edit: in-review` (redundant — engine default for a form with `review` in access), `approve: done` (redundant — engine default), `request_changes: action-required` (non-default — engine default is `changes-required`).

The design (§ Migration) accepts deleting all four entries — the `request_changes: action-required` is the only non-default semantic, and the design states: "the demo is happy with the engine default `changes-required` once Layer 2 is gone."

## Task

1. **Update `makeWorkflowsConfig.js` head comment** to drop `interactions, event` from the build-time-only field list. The comment becomes:
   ```js
   // Engine-runtime needs + per-action UI lookups. Build-time-only fields
   // (form, form_review, form_error, pages, hooks) are excluded — they're
   // consumed by build-time resolvers (parts 12, 13, 15) against the raw
   // workflow YAML, not via workflowsConfig at runtime.
   ```
2. **Delete the `interactions:` block** from `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` (lines 20–22 of the current file — verify with grep before editing).
3. **Delete the `interactions:` block** from `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` (lines 27–33 of the current file). No pre-hook port is required for `request_changes` — engine default `changes-required` is accepted by the design.
4. **Smoke-check the demo build**: run `pnpm --filter=demo build` (or the project's equivalent — check `apps/demo/package.json` `scripts:` for the build command) and confirm it completes without complaining about the missing fields.

## Acceptance Criteria

- `grep -rn "^interactions:" apps/demo/modules/workflows/workflow_config/` returns no matches.
- `grep -rn "^event:" apps/demo/modules/workflows/workflow_config/` returns no matches (design verified zero hits already; double-check post-edit).
- `grep -n "interactions, event\|interactions,event" modules/workflows/resolvers/makeWorkflowsConfig.js` returns no matches.
- Demo app build succeeds (no broken `_ref`, no validator complaint).
- Manually exercising the demo `send-quote` action's `request_changes` interaction lands the action at status `changes-required` (the engine default) rather than `action-required`. **This is a deliberate behavioural change** to the demo workflow — accepted per the design's § Parts touched / Worked-example row and § Use cases considered's `request_changes` analysis. No test fixture update needed unless an e2e test asserted the old value.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — strip `interactions, event` from the head-of-file comment.
- `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` — modify — delete the `interactions:` block (3 lines).
- `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` — modify — delete the `interactions:` block (7 lines).

## Notes

- This task is the only behavioural change visible to a demo user: `request_changes` on `send-quote` now resolves to `changes-required` instead of `action-required`. The design explicitly accepts this.
- If any Playwright / e2e test in `apps/demo` asserts the old `action-required` outcome, update it to `changes-required` — but only if such a test exists. Don't add fresh e2e coverage just for this.
- Do NOT add a `mongoTransforms` / migration for existing workflow docs in any deployed instance — the design's § Migration states "No real-world users or implementers. No data migration."
