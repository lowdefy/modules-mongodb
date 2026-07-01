# Overview progress breakdown

The two workflow overview pages render a single-colour antd `Progress` line whose fill is `(done + not_required) / total`. That collapses six distinct action states into "not yet filled" — a workflow with one action in review, one erroring, and one blocked looks identical to one with three untouched actions. This part turns that bar into a **segmented status bar**: one coloured segment per action state, coloured from the shared `action_statuses` enum, so the bar shows not just _how much_ is done but _what state the rest is in_. It also corrects the percentage to `done / (total − not_required)` and — because the numbers are now derived on read — **drops the denormalised `summary`/`groups[]` cache from the workflow doc**, making the action docs the single source of truth.

## Proposed change

1. **Segmented bar (Option B).** Replace the single `Progress` line on `workflow-overview` and `workflow-group-overview` with a shared segmented bar built from `Html` + `_nunjucks`: a contiguous flex track (antd-line proportions: ~8px, rounded) whose segments are sized by each state's count and coloured from the `action_statuses` enum. It reads like an antd progress line with more colours and segments.
2. **Segment order** (left → right): `done, in-review, changes-required, error, in-progress, action-required, blocked`. `not-required` is **excluded** from the bar.
3. **Segment colour = the enum's `titleColor`** — the saturated per-status colour the module already uses for non-Tag status display (`ActionSteps.js`'s `statusColor` helper reads `titleColor`). No new colour convention.
4. **Percentage → `done / (total − not_required)`**, guarded so a zero-size pool (no actions, or all `not-required`) reads 100%. This changes mid-flight behaviour: `not-required` is _removed from the pool_ rather than counted as filled. The number still reaches 100% exactly when every non-waived action is `done`.
5. **Caption** beneath the bar: `{done} of {pool} done` (where `pool = total − not_required`), plus `· {n} not required` when any action is waived. The green `done` segment's width therefore equals the percentage exactly — bar and number never disagree.
6. **Drop the stored `summary` and `groups[]`.** They are pure read-display caches, recomputed on every write and never queried, sorted, or read for engine logic. Every read now flows through a resolver that already loads the actions, so the counts are derived on read from the action docs — no denormalisation, no staleness, no migration (the module is unreleased). See "Single source of truth" below.

## Why the pool bar has no grey remainder

A normal antd progress bar is `filled | grey remainder`. Here the seven rendered segments (`done` … `blocked`) are exactly the non-`not-required` states, so together they sum to the pool (`total − not_required`) and fill the whole track. There is no empty remainder because undone work isn't shown as _absence_ — it's shown as the _colour of why it's undone_ (in review vs. blocked vs. error). The percentage number carries the "how complete" reading; the bar carries the "what state" reading.

## Segment fill vs. denominator — one subtlety

Two different quantities are in play and must not be conflated:

- **Segment widths** are proportions of the **pool** (`total − not_required`). The seven segments always fill the track.
- **The percentage** is `done / pool`. It equals the `done` segment's fractional width — by construction, since both divide by the same pool.

`not-required` never contributes width and never appears as a segment; it only shrinks the pool (and shows in the caption). So waiving an action _grows_ every remaining segment proportionally and nudges the percentage up — the intended "it's no longer work we owe" semantics.

## Single source of truth — drop the cache

Today the workflow doc stores two denormalised fields, rewritten on every action commit:

- `summary: { done, not_required, total }` — workflow-level, composed in `planWorkflowRecompute.js`, seeded in `StartWorkflow.js`.
- `groups: [{ id, status, summary }]` — per-group runtime state, composed via `recomputeGroups.js`.

Neither is read for engine logic and neither is ever queried or sorted on (confirmed by grep across `apps/`, `modules/`, and the plugin sources):

- **Auto-complete** in `planWorkflowRecompute.js` computes `allTerminal` directly from the planned actions, not from `summary`.
- **Auto-unblock** (`planAutoUnblock.js`) recomputes group state fresh from the in-memory action `view` every fixpoint iteration (`recomputeGroups({ declaredGroups, actions: view })`) — it never reads the persisted `groups[]`.
- The only readers are the three display resolvers, and each already loads the actions it would need.

The cache existed because reads once hit the DB directly with no server-side resolver; that era is over (Part 46 moved all reads behind `WorkflowAPI` resolvers). So:

**Stop persisting** (write path):

- `planWorkflowRecompute.js` — its composed doc no longer includes `summary` or `groups`. The final persist-only `recomputeGroups` pass is deleted; auto-complete (computed from `plannedActions`) is unchanged.
- `StartWorkflow.js` — drop the `summary: { done: 0, not_required: 0, total: 0 }` seed **and** the adjacent `groups: []` seed (line 179). Both are denormalised fields the recompute pass will no longer write; leaving either would persist a dead field on every new workflow.
- `CloseWorkflow.js` / `CancelWorkflow.js` — remove `summary` and `groups` from `RESERVED_WORKFLOW_KEYS` (they can no longer be overwritten because they no longer exist).
- `recomputeGroups.js` and `deriveGroupStatus.js` **stay** — `planAutoUnblock` still calls them in-memory for unblock logic; the result simply isn't written. `recomputeGroups` **drops its `summary` computation** and returns just `{ id, status }`: after this part its only caller (`planAutoUnblock`) reads only `.status` (`:84`, `groupById.get(entry)?.status === "done"`), so a per-group `summary` there would be dead work. `deriveGroupStatus` is retained for the `status` field.

**Derive on read**:

- New `shared/render/summarizeStatuses.js` — pure `summarizeStatuses(actions)` → `{ counts: { done, "in-review", "changes-required", error, "in-progress", "action-required", blocked, "not-required" }, total }`. The three read resolvers import it directly, so all counts flow through one counter. (It is **not** threaded through `recomputeGroups` — that path's sole caller consumes only `.status`, so a `summary` computed there would be discarded; see "Stop persisting" above.)
- `GetWorkflowOverview.js` — attach `summary` (from all raw actions) to the workflow response and `summary` + `status` to each group entry, computed from the grouped actions it already builds.
- `GetWorkflowActionGroupOverview.js` — the returned `group` object drew `id`, `status`, `summary` from the runtime `wfGroupEntry` (found in the now-deleted `wfDoc.groups[]`), and the existence guard collapsed the group to `null` when no such entry was found. All four uses must be re-sourced:
  - **Existence guard** — switch from `wfGroupEntry` to `configGroup` (already looked up from `wfConfig.action_groups[]`): `if (!configGroup) return { workflow, group: null, actions: actionCards }`. Behaviour-equivalent — `groups[]` was only ever populated for groups declared in `action_groups[]`, so an unknown `group_id` collapses to `null` under both the old and new guard.
  - **`id`** — take `group_id` (the param) directly.
  - **`status`** — derive from the loaded actions via `deriveGroupStatus`.
  - **`summary`** — derive from the loaded actions via `summarizeStatuses`.
  - The separate `visibleActions.length === 0` guard is unchanged.
- `GetEntityWorkflows.js` — **drop `summary`** from its group entries (confirmed unused: `ActionSteps.js` recomputes group status and per-action display straight from `actions` and never reads `.summary`). Recompute `status` via `deriveGroupStatus` from the grouped actions so that field's contract is unchanged.

### Counting scope

`summarizeStatuses` counts **all** actions on the workflow/group, not just the per-viewer visible subset — progress is an objective property of the workflow, not a function of who's looking. `GetWorkflowOverview` loads all `rawActions`; `GetWorkflowActionGroupOverview` loads all of the group's actions by query. This matches the old stored summary, which `recomputeGroups` computed over every action.

## The segmented bar

A shared component `modules/workflows/components/overview-progress-bar.yaml`, `_ref`-ed by both overview pages, taking the summary via `_var` and rendering with the `_nunjucks` operator (runtime; no `.yaml.njk` needed since vars only feed operator/`on:` positions).

The template receives `counts` and the `action_statuses` enum via `on:`, holds the seven-state order literally, computes `pool = total − not_required`, and emits one `<div>` per state with `count > 0`, `flex-grow` = the count and `background` = `enum[stage].titleColor`, inside a rounded flex track over the antd trail grey. A native `title` attribute per segment (`"In review: 2"`) gives hover detail without a legend block.

Each segment must be `flex: <count> <count> 0` (i.e. `flex-grow: <count>; flex-basis: 0; min-width: 0`) on a `gap: 0` track, with corners rounded via `overflow: hidden` on the **track** (not per-segment borders). This is what makes the "`done` segment width == percentage" invariant exact: with the default `flex-basis: auto` each segment first reserves its intrinsic/content width and only the remainder splits by grow factor, so any basis, gap, border, or padding would make widths non-proportional and drift the `done` width off the percentage. Pinning `flex-basis: 0` on a gapless, `overflow: hidden` track distributes the entire track purely by count.

```
[■■■■ done ■ in-review ■ error ■ in-progress]   57%
4 of 7 done · 2 not required
```

Rendering notes:

- **`pool === 0`** (no actions, or every action `not-required`): no segments render; show the empty grey track and `100%`. Caption reads `0 of 0 done` (+ the not-required count when non-zero).
- **Colour source** is `titleColor`, consistent with `ActionSteps.js`. If a future state slug is missing from the enum the segment falls back to the trail grey (defensive, not expected — the enum covers all eight stages).
- The bar is fed one object (`summary` = `{ counts, total }`); the page does no arithmetic, keeping both pages' call sites identical.

## Files in play

- `modules/workflows/pages/workflow-overview.yaml` — replace `workflow_progress` (+ the `workflow_summary` caption `_js`) with a `_ref` to `overview-progress-bar.yaml`, fed `_state: workflow.summary`.
- `modules/workflows/pages/workflow-group-overview.yaml` — replace `group_progress` with the same `_ref`, fed `_state: group.summary`.
- `modules/workflows/components/overview-progress-bar.yaml` — **new** shared segmented-bar component (Html + `_nunjucks`, reads the `action_statuses` enum).
- `plugins/.../GetWorkflowOverview/GetWorkflowOverview.js` — emit computed `summary` (workflow + per group).
- `plugins/.../GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` — move the existence guard off `wfGroupEntry` onto `configGroup`; take `id` from `group_id`; derive `status`/`summary` from loaded actions.
- `plugins/.../GetEntityWorkflows/GetEntityWorkflows.js` — drop `summary`; recompute `status` from grouped actions.
- `plugins/.../shared/render/summarizeStatuses.js` — **new** pure counter; imported directly by the three read resolvers.
- `plugins/.../shared/phases/planners/recomputeGroups.js` — drop the `summary` computation; return `{ id, status }` only.
- `plugins/.../shared/phases/planners/planWorkflowRecompute.js` — stop composing `summary`/`groups`; drop the persist-only recompute pass.
- `plugins/.../WorkflowAPI/StartWorkflow/StartWorkflow.js` — drop the `summary` **and** `groups: []` seeds.
- `plugins/.../WorkflowAPI/{CloseWorkflow,CancelWorkflow}/*.js` — drop `summary`/`groups` from `RESERVED_WORKFLOW_KEYS`.

Edit `src/`; the build regenerates `dist/`.

### Tests

- `planWorkflowRecompute.test.js` — assert the composed doc no longer carries `summary`/`groups`; auto-complete assertions unchanged.
- `StartWorkflow` test — no `summary` seed on the created doc.
- `GetWorkflowOverview` / `GetWorkflowActionGroupOverview` / `GetEntityWorkflows` tests — assert the computed `summary`/`status` (and `GetEntityWorkflows`' absence of `summary`).
- New `summarizeStatuses.test.js` — counts across all eight stages, empty input, missing-status actions.

## Resolved questions

1. **Store enriched summary vs. compute on read** — **compute on read.** The cache is unread by logic and unqueried; deriving on read makes the action docs the single source of truth and removes write-path work. Unreleased ⇒ no migration. (Aligned with user.)
2. **Segment colour field** — **`titleColor`**, matching `ActionSteps.js`'s existing `statusColor` helper.
3. **`not-required` in the bar** — **excluded** from segments (caption only), so the `done` segment width equals the percentage.
4. **Rendering block** — **`Html` + `_nunjucks`**, the sanctioned fallback when no native block fits (antd `Progress` can't render an arbitrary multi-colour stack — only success/primary/remainder or single-colour steps). No new plugin block: the bar appears in two server-fed places with no interactivity requirement beyond a hover title, so a `StatusBar` React block isn't justified yet.

## Depends on

- [Part 46 — debundle workflow config](../_completed/46-debundle-workflow-config/design.md) moved the overview reads to server-side `WorkflowAPI` resolvers (the `Get*Overview` handlers replaced the `get-*-overview.yaml` aggregations), which is what makes dropping the cache safe.
