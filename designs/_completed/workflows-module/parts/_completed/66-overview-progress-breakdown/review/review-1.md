# Review 1

Scope: `66-overview-progress-breakdown/design.md`. Every factual claim in the design was verified against source and holds:

- `planWorkflowRecompute.js:75-80,109-116` composes `summary` + `groups`; auto-complete (`allTerminal`, `:92-99`) is computed from planned actions, not `summary`; the final `recomputeGroups` pass is documented persist-only.
- `StartWorkflow.js:178` seeds `summary: { done:0, not_required:0, total:0 }`.
- `CloseWorkflow.js:14-26` / `CancelWorkflow.js:14-26` — `RESERVED_WORKFLOW_KEYS` includes `summary` and `groups`.
- `planAutoUnblock.js:69` recomputes groups fresh in-memory each iteration; never reads persisted `groups[]`.
- Enum `modules/shared/enums/action_statuses.yaml` — all eight stages carry `titleColor`; `ActionSteps.js:23-24` `statusColor` reads `titleColor` and recomputes group status from `actions` (`:26-56`), never `.summary`.
- Both overview pages render an antd `Progress` line (`workflow_progress` / `group_progress`) with fill `(done + not_required)/total`; `summary`/`groups` are never `$match`ed/`$sort`ed anywhere.

The findings below are about consequences the plan under-specifies, not incorrect claims.

## Correctness

### 1. Dropping persisted `groups[]` breaks the hard `wfGroupEntry` guard in `GetWorkflowActionGroupOverview` — every group page would return `group: null`

> **Resolved.** Confirmed the bug at `GetWorkflowActionGroupOverview.js:198-216` — the existence guard, `id`, `status`, and `summary` all hang off `wfGroupEntry` from the deleted `wfDoc.groups[]`. Expanded the design (line-53 bullet + Files-in-play) to re-source all four: guard on `configGroup` (from `action_groups[]` config), `id` from `group_id`, `status`/`summary` from loaded actions. Guard swap is behaviour-equivalent since `groups[]` was only ever populated for declared config groups.

`GetWorkflowActionGroupOverview.js:198-200`:

```js
const wfGroupEntry = (wfDoc.groups ?? []).find((g) => g.id === group_id);
if (!wfGroupEntry) {
  return { workflow, group: null, actions: actionCards };
}
```

and `:210` builds `id: wfGroupEntry.id`. Once `groups[]` is no longer persisted, `wfDoc.groups` is `undefined`, so `wfGroupEntry` is **always** `undefined` and the resolver returns `group: null` for **every** group — the group-overview page renders no header and no bar.

The design (§Single source of truth, line 53) only says to "compute the group's `summary` + `status` from its loaded actions instead of reading `wfGroupEntry`." It does not call out that the **existence guard** (`:199`) and the **group `id`** (`:210`) also depend on `wfGroupEntry`. If an implementer swaps only the `summary`/`status` lines, the page silently 404s the group.

**Fix:** guard on `configGroup` — already looked up at `:205` (`configGroups.find(g => g.id === group_id)`) — instead of `wfGroupEntry`; take `id: group_id` (or `configGroup.id`); derive `status` + `summary` from `actionCards`/loaded actions. This is behaviour-equivalent for unseen groups: a group absent from `action_groups[]` is absent from both `configGroups` and the old persisted `groups[]`, so both the old and new guards return `group: null`. Add this to the design's file-level plan.

## Completeness

### 2. `StartWorkflow` seeds `groups: []` too — the plan only drops the `summary` seed

> **Resolved (auto).** Extended the `StartWorkflow` plan (both the "Stop persisting" bullet and Files-in-play) to drop the `groups: []` seed alongside `summary`. Confirmed at `StartWorkflow.js:178-179` — both are dead denormalised fields the recompute pass no longer writes.

`StartWorkflow.js:178-179`:

```js
summary: { done: 0, not_required: 0, total: 0 },
groups: [],
```

The design (§"Stop persisting" and §Files in play, line 87) says only "drop the `summary` seed" from `StartWorkflow`. The `groups: []` seed on the next line is left in place. Since `planWorkflowRecompute` will no longer write `groups`, that empty array would persist on every new workflow forever — a dead denormalised field, exactly what the part sets out to remove. Extend the plan to drop `groups: []` from the `StartWorkflow` seed as well.

### 3. After the change, `recomputeGroups`'s only caller consumes `.status` — computing `summary` through it is dead work, contradicting the "one counter" rationale

> **Resolved.** Confirmed `recomputeGroups`'s sole surviving caller (`planAutoUnblock.js:84`) reads only `.status`. Reworded the design so `summarizeStatuses` is imported directly by the three read resolvers (the real "one counter"), and `recomputeGroups` drops its `summary` block, returning `{ id, status }` only (keeping `deriveGroupStatus`). Updated the "Stop persisting" bullet, the `summarizeStatuses` bullet, and Files-in-play (added a `recomputeGroups.js` entry).

The design (line 51) wires the new `summarizeStatuses` into `recomputeGroups.js` "so per-group and workflow-level counts go through one counter." But after this part:

- `planWorkflowRecompute.js:70`'s call to `recomputeGroups` is deleted (the persist-only pass, line 44).
- The **only** remaining caller is `planAutoUnblock.js:69`, and it reads **only** `group.status` (`:84`, `groupById.get(entry)?.status === "done"`) — never `.summary`.
- Per-group counts for the read path are computed directly by the resolvers from grouped actions (design lines 52-53), **not** via `recomputeGroups`.

So threading `summarizeStatuses` through `recomputeGroups` produces a per-group `summary` that nobody reads. The genuine "single counter" is `summarizeStatuses` consumed by the three read resolvers; `recomputeGroups` after this part needs to return only `{ id, status }` for the unblock fixpoint. Recommend: have the read resolvers call `summarizeStatuses` directly and let `recomputeGroups` drop its `summary` computation (keeping `deriveGroupStatus`), rather than importing the counter into a path that discards its output.

## Rendering

### 4. The "done segment width == percentage" invariant requires `flex-basis: 0`, not the default

> **Resolved.** Added the flexbox spec to "The segmented bar": each segment `flex: <count> <count> 0` (`flex-basis: 0; min-width: 0`) on a `gap: 0` track, corners rounded via `overflow: hidden` on the track (not per-segment borders). Pins the proportionality the "done width == percentage" invariant relies on rather than leaning on empty divs having zero intrinsic width.

The design's central promise — "the green `done` segment's width therefore equals the percentage exactly … bar and number never disagree" (line 11, §subtlety) — only holds if the flex segments distribute the **entire** track by grow factor. With `flex-grow: <count>` and the default `flex-basis: auto`, each segment first reserves its content/intrinsic width and only the _remainder_ is split by grow factor; any inter-segment gap, border, `min-width`, or padding then makes widths non-proportional and the `done` width drift off the percentage.

The design says "`flex-grow` = the count" (line 64) but doesn't pin the basis. Specify `flex: <count> <count> 0` (or `flex-grow:<count>; flex-basis:0; min-width:0`), a `gap: 0` track, and round the corners via `overflow: hidden` on the track (not per-segment borders) so the segments remain contiguous and exactly proportional. Otherwise the invariant the whole design leans on is only approximately true.

### 5. Illustrative example is internally inconsistent — undermines the "bar equals number" thesis

> **Resolved (auto).** Rewrote the example to a self-consistent case: `done=4, in-review=1, error=1, in-progress=1` (segments sum to 7 = pool), caption `4 of 7 done · 2 not required`, percentage `57%` — all three now express the same 4/7 quantity.

Lines 67-68:

```
[■ done ■■ in-review ■ error ■■■ in-progress ■ blocked]   57%
3 of 7 done · 2 not required
```

The caption says "3 of 7 done" (⇒ 3/7 = 43%) while the percentage reads 57% (= 4/7), and the ASCII shows a single `done` block. For a part whose thesis is that the `done` segment width, the caption count, and the percentage are all the _same_ quantity, the worked example shows them disagreeing three ways. Correct it to a self-consistent case (e.g. `4 of 7 done → 57%`, with the done segment 4/7 of the track). Cosmetic, but this is the design's headline illustration.

## Minor / acknowledged

### 6. Progress counts all actions while the shown list is access-filtered — confirm the mismatch is intended

> **Accepted.** Intentional and already documented in §Counting scope: progress is an objective property of the workflow, counted over all actions (matching the old stored `summary`), not scoped to the viewer's visible subset. Confirmed the mechanic at `GetWorkflowOverview.js:52-72` (all `rawActions` loaded; `visibleActions` access-filtered for the row list). No change.

`GetWorkflowOverview.js:59-72` drops actions the viewer can't access (`continue` at `:67`); the rendered `groups` are built from `visibleActions`. `summarizeStatuses` counts **all** `rawActions` (design §Counting scope, line 56-58), so the caption "N of M done" and the per-group segment counts can reference more actions than the viewer actually sees listed. The design explicitly chooses objective counting and notes it matches the old stored summary — so this is **not a regression** and is a defensible call. Flagging only so it stays a conscious decision: a viewer seeing "3 of 7 done" above four visible rows may read it as a bug. No change required if the objective-progress reading is intended.
