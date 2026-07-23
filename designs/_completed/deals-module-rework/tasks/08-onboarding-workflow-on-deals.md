# Task 8: Author the onboarding workflow on deals (demo)

## Context

Workstream C (workflow half). The demo currently ships a thin `sales-pipeline` workflow (3 flat actions) at `apps/demo/modules/workflows/workflow_config/sales-pipeline/*`. Replace it with the richer **onboarding** workflow — recoverable from `git show main:apps/demo/modules/workflows/workflow_config/onboarding/*` — repointed from leads onto deals. Onboarding brings blocked_by sequencing, a group `on_complete` status advance, a reviewable action, a custom-page action, and a conditional spawned action — a far better engine demo.

Task 2 made the module read stored `value`/`close_date`, so this workflow's actions must **stamp** them on write (same pattern as the existing `deal.outcome` stamp).

## Task

Create `apps/demo/modules/workflows/workflow_config/onboarding/` on deals:

- **Entity block:** `connection_id: deals`, `ref_key: deal_ids`, `page_id: deals/view`, `list_page_id: deals/all`, `list_title: Deals`, `title: Deal`. Rewrite the `entity.data` routine to load deal fields. **`_id` is a string — the `$match` compares `_id` directly, no ObjectId coercion.**
- **`lead-detail-slot` → deal detail slot:** swap lead fields for deal fields (model on the existing `deal-detail-slot.yaml`).
- **Actions** (per the design's per-action fate table): keep `qualify` (retarget post-hook connection to deals), `site-visit`, `send-quote` (custom-page action linking to the quote-builder page from task 9), `schedule-followup`, `upload-po`. **Drop `track-company-setup`** (lead→company conversion — lead-specific).
- **Value stamping:** wire action hook(s) to stamp `deal.value` / `deal.close_date` on write (e.g. from `qualify`'s `estimated_value` and/or `upload-po`), so task 2's stored-field reads resolve to real values.
- **Outcome action:** carry over the working `deal-outcome` action from `sales-pipeline` (captures won/lost + reason, stamps `deal.outcome.{type,reason}`, already wired to the module's outcome modal + `record-loss`); keep `outcome_action_type: deal-outcome`.
- **Group `on_complete`:** retarget the `qualification` group's status-advance to the deals collection with a valid deal stage slug.
- **Register** the workflow in `apps/demo/modules/workflows/workflow_config/workflows.yaml` (`sales-pipeline/sales-pipeline.yaml` → `onboarding/onboarding.yaml`); **delete** the `sales-pipeline/` config.

## Acceptance Criteria

- Onboarding workflow exists on deals; `sales-pipeline/` deleted; `workflows.yaml` registers onboarding (+ existing `company-setup`).
- Creating a deal and advancing the workflow stamps `deal.value`/`deal.close_date` (visible via task 2's reads) and `deal.outcome` on the outcome action.
- `track-company-setup` is absent.
- `CI=true pnpm ldf:b` green.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/*` — create — onboarding on deals (root + actions + detail slot + deal-outcome).
- `apps/demo/modules/workflows/workflow_config/sales-pipeline/*` — delete.
- `apps/demo/modules/workflows/workflow_config/workflows.yaml` — modify — register onboarding.

## Notes

Depends on task 2 (value seam). `send-quote` references the quote-builder page built in task 9. Demo deals module vars (`workflow_type: onboarding`, stages/groups/outcomes) are set in task 10 — until then the demo may not fully render; that's expected, task 10 integrates.
