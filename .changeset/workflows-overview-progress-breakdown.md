---
"@lowdefy/modules-mongodb-workflows": patch
"@lowdefy/modules-mongodb-plugins": patch
---

**Overview progress breakdown (Part 66)** — the two workflow overview pages now render a **segmented status bar** in place of the single-colour antd `Progress` line. One coloured segment per action state (`done, in-review, changes-required, error, in-progress, action-required, blocked`, `not-required` excluded), sized by each state's count and coloured from the shared `action_statuses` enum's `titleColor`, so the bar shows not just _how much_ is done but _what state the rest is in_. Built as a shared `Html` + `_nunjucks` component (`overview-progress-bar.yaml`) `_ref`-ed by both pages.

The percentage is corrected to `done / (total − not_required)` — waiving an action removes it from the pool rather than counting it as filled — and the caption reads `{done} of {pool} done · {n} not required`, so the green `done` segment's width equals the percentage exactly.

Because the counts are now derived on read, the denormalised `summary` / `groups[]` cache is **dropped from the workflow doc**, making the action docs the single source of truth. A new pure `summarizeStatuses(actions)` counter feeds the three overview resolvers; `GetWorkflowActionGroupOverview` re-sources its existence guard, `id`, `status`, and `summary` from the loaded actions / config, and `GetEntityWorkflows` recomputes group `status` from grouped actions. The write path stops persisting `summary` / `groups`, and `planSubmit`'s `completed_groups` diff recomputes both sides from actions via `recomputeGroups` (behaviour-equivalent, no staleness). No migration — the module is unreleased.
