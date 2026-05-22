# Review 2 — `ActionSteps`-based widget shape

Captured after review-1's action review was complete. Two user-supplied design notes triggered a substantive shape change to Part 18 that was applied directly to design.md; this file records what changed and why so the action-review trail stays complete.

Source: user notes during the review-1 action-review session — "we need to replace the DataView block with the DataDescriptions block" (cross-design, applies to parts 17 and 25) and "expose a component that looks like dist/workflows-module/action_groups.yaml" (the v0 ticket-view widget at `apps/prp-team/pages/tickets/ticket-view/components/action_groups.yaml`, multi-workflow per entity). The `DataView` → `DataDescriptions` swap is logged here for tracking but lands in parts 17 and 25's designs, not part 18.

## Findings

### 1. `actions-on-entity` should render an `ActionSteps` block per workflow, not a hand-composed group/row tree

> **Resolved.** Rewrote the `actions-on-entity` section of design.md to feed a single [`ActionSteps`](../../../../plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md) block as the collapsible slot under each workflow's `workflow-header`. The component owns the data transform (build `items: [{ action_group, actions: [{ status, message, link? }] }]` from `workflow.actions` + `workflow.groups[]`; build `actionGroupConfig: { [group.id]: { order, title, icon? } }` from the `_global.workflows_config[workflow.workflow_type].action_groups[]` join already committed by review-1 #1); `ActionSteps` owns the rendering (Antd `Steps` view, per-group status rollup, per-action `Link`). Replaces the previous hand-composed per-group section + per-action row design. Multi-workflow shape preserved — one `ActionSteps` instance per workflow in the iteration, wrapped in `workflow-header`.

`ActionSteps` is already shipped from `plugins/modules-mongodb-plugins/src/blocks/ActionSteps/` (verified during action-review; v0 used the same block from `apps/prp-team/pages/tickets/ticket-view/components/action_groups.yaml`). No new plugin work.

Knock-on changes folded in:

- Updated the `blocks` var description on `workflow-header` to commit to "a single `ActionSteps` block" on the `actions-on-entity` side, distinct from the action card list `workflow-overview` passes.
- Tracker actions are not special-cased in the new shape — they flow through the same `ActionSteps` item with `link` resolved from `status_map`, matching review-1 #9's resolution.
- Refresh-after-submit behaviour unchanged (remount-on-back-nav per review-1 #8); no `SocketIoSubscriber` added.
- Added the `ActionSteps` block to the "Depends on" line (`plugins/modules-mongodb-plugins`).

### 2. `workflow-header` needs a workflow-overview link button, suppressed when the host page is itself the overview

> **Resolved.** Added a Tooltip-wrapped icon button (`LuWorkflow`) to `workflow-header`'s rendered strip that navigates to `workflow-overview?workflow_id=<workflow._id>`. Added a new `is_overview_page` boolean var (default `false`) to suppress the button when the host page is itself `workflow-overview` — otherwise the page would link to itself. `actions-on-entity` passes `false`; part 17's `workflow-overview` passes `true`. Mirrors v0's `apps/prp-team/pages/tickets/ticket-view/components/action_groups.yaml` chrome.

Updated the `workflow-header` vars table, call-shape examples (both `actions-on-entity` and `workflow-overview` blocks), the "what the component renders" list, and the Verification section to cover the new button.

### 3. `actions-on-entity` does not render `form_data` — per-action drill-downs go through `ActionSteps`'s `Link`

> **Resolved.** Tightened the design.md wording in two places (the runtime-behaviour bullet and the `blocks` var description) to commit explicitly: the slot under `workflow-header` is **only** the `ActionSteps` block — no form-data rendering, no per-action card body, no `DataDescriptions`. Per-action drill-downs are reached by clicking the row's `Link`, which routes to the action's `-view` / `-edit` / `-review` / `-error` page per the action's `status_map.{stage}.{app_name}.link`. The `DataDescriptions` swap (note #1 from the same user notes) is therefore strictly a part-17 / part-25 concern; not a part-18 concern.

## Cross-design follow-ups (out of scope for part 18)

- **Part 17 (`workflow-overview` page)** — swap `DataView` → `DataDescriptions` for the per-action form-data cards. Affects [part 17 design.md:50, 173, 191](../../17-shared-pages/design.md). Part 17 is partially implemented, so the swap needs to land in the design + any shipped YAML in one pass.
- **Part 25 (`group-overview` page)** — same swap. Affects [part 25 design.md:35, 93](../../25-group-overview-page/design.md). Part 25 is not yet implemented; design-only update.
- **Part 17 design.md:182 open question on tracker action linking** — already flagged in review-1 #9's annotation; should be closed in the same direction (links allowed via `status_map`).

## Next steps

All three findings resolved during the same session. Run `/r:design-consistency-review workflows-module/parts/18-entity-components` to verify the rewrite reads coherently against the parts it talks to (parts 17, 19, 20, 24, the `ActionSteps` block README), then spin out the cross-design follow-ups against parts 17 and 25.
