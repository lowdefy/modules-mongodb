# Review 1

The design is accurate where it matters: every source line reference checks out
(`GetEventsTimeline.js:185`, `GetWorkflowOverview.js:82`, `GetEntityWorkflows.js:97`,
`GetWorkflowActionGroupOverview.js:70`, `makeWorkflowsConfig.js:23`,
`planActionTransition.js` 143–164/182–183), `sort_order` is indeed never written
on the insert path, and all three fields the comparator needs (`type`,
`action_group`, `workflow_type`) are persisted by `planActionTransition.js`
(lines 145, 149, 183). The core idea — kill the dead `sort_order` sort, order by
config declaration position — is sound and well-argued.

The findings below are about correctness gaps in the comparator's tiebreaker, the
timeline integration point, the test/doc inventory, and one diverged prior-design
decision.

## Correctness

### 1. The `_id` tiebreaker silently regresses keyed/repeated-action ordering from chronological to random

> **Resolved.** Valid — confirmed `_id` is `randomUUID()` (`createEngineContext.js:70`) and the two overview engines tiebreak by `created.timestamp` today (timeline by `updated.timestamp`). Rather than the review's `created.timestamp` key, the tiebreaker is the persisted `key` field (`planActionTransition.js:145`) — the value that distinguishes keyed instances; it's deterministic and stable across status changes, where timestamps churn and `_id` is random. Comparator key is now `[groupIndex, declIndex, key, _id]`, `_id` retained only as a final deterministic fallback. Updated the comparator pseudocode and the keyed-actions note.

The comparator's final key is `String(action._id)` (design "The comparator",
lines 72–74), and the design notes keyed actions "separated by `_id`" (line 80).
But action `_id` is `randomUUID()` (`createEngineContext.js:70`, injected as
`newId`), **not** a time-sortable id. So for multiple instances of the same
keyed action type in the same group — identical `(groupIndex, declIndex)` — the
display order becomes stable-but-arbitrary.

This is a behavior change, not just a no-op cleanup, on two of the four engines:

- `GetEntityWorkflows.js:100–102` and `GetWorkflowActionGroupOverview.js:73–75`
  currently tiebreak by `created.timestamp` — i.e. keyed siblings render in
  **creation order** today. The comparator drops that for random-UUID order.
- `GetEventsTimeline.js:185` currently tiebreaks by `updated.timestamp`.

The worked example (lines 87–95) is all unkeyed single-instance actions, so it
never exercises this — the regression is invisible in the example but real for
any workflow with keyed actions (e.g. multiple `upload-po` instances).

**Fix:** make `created.timestamp` (or `updated.timestamp` on the timeline) the
tiebreaker *before* `_id`, keeping `_id` only as the final deterministic
fallback. The comparator key becomes `[groupIndex, declIndex, created.timestamp,
_id]`. This preserves today's chronological ordering of repeated actions instead
of quietly randomizing it.

### 2. The comparator cannot run on the timeline's emitted card shape; the insertion point as described is wrong

> **Resolved.** Valid — confirmed cards carry only `{ _id, kind, status, link, message, sort_order, updated }` (lines 252–272) and the loop iterates `rawActions`, which retain `type`/`action_group`/`workflow_type`; the destructure at line 29 omits `workflowsConfig`. Reworded the `GetEventsTimeline` engine-change bullet to sort `rawActions` before the enrichment loop and to add `workflowsConfig` to the context destructure.

Design line 100 says: "In the JS post-processing loop that already builds cards,
sort each event's `enrichedActions` with the comparator before returning." But
the card objects built in that loop (`GetEventsTimeline.js:252–260` and
`264–272`) carry only `{ _id, kind, status, link, message, sort_order, updated }`
— they do **not** carry `type`, `action_group`, or `workflow_type`, which is
exactly what the comparator reads. Sorting `enrichedActions` would have nothing
to sort on.

The raw action docs *do* carry those fields (the `$lookup` sub-pipeline at lines
74–123 strips nothing — its own comment says "Keep all raw action fields"). So
the fix is to sort `rawActions` with the comparator **before** the enrichment
loop (lines 239–276), not the trimmed cards afterward.

Related: the timeline engine does not currently destructure `workflowsConfig` —
line 29 pulls only `{ params, mongoDb, connection }`. The value is on the context
(`createEngineContext.js:63`) but is unused by this engine today, so the design
should call out adding the destructure. (This also makes D2's phrasing "the
engine ... already holds `workflowsConfig` ... it uses it for ..." inaccurate for
the timeline specifically — see #5.)

## Tests

### 3. The timeline test fixture cannot actually exercise declaration order; the test-update scope is understated

> **Resolved.** Valid — confirmed the timeline test seeds `workflowsConfig: []` and a `seedAction` with no `type`/`action_group`/`workflow_type`, so its assertion passes lexically regardless of declaration order. Rewrote the test bullet to enumerate the fixture overhaul (populate `workflowsConfig` + add the three fields to `seedAction`) and to call out reworking the `GetEntityWorkflows`/`GetWorkflowActionGroupOverview` `sort_order`-framed tests, plus new cross-group/ungrouped/keyed coverage.

The design (line 110) names a single test to update — `GetEventsTimeline.test.js`
"cards are sorted by `sort_order` ascending within an event" — under an "e.g.".
Two problems:

- That test seeds `workflowsConfig: []` (line 60) and its `seedAction` helper
  sets **no** `type`, `action_group`, or `workflow_type` (lines 103–117). With an
  empty config, every action resolves `cfg → undefined → (∞, ∞)` and falls
  straight to the `_id` tiebreak. The existing assertion `['a-first', 'a-second']`
  then passes only because `'a-first' < 'a-second'` lexically — it would pass even
  if declaration-order were completely broken. To genuinely assert declaration
  order the timeline test needs a *populated* `workflowsConfig` **and**
  `type`/`action_group`/`workflow_type` written onto seeded docs — a fixture
  overhaul, not a one-line edit.
- Other tests beyond the named one also depend on `sort_order`:
  `GetEntityWorkflows.test.js:394` and `GetWorkflowActionGroupOverview.test.js:364`
  seed `sort_order: 0/1` and assert "action-required comes first despite a higher
  `sort_order`." These keep passing (the not-required sink is the primary key and
  the assertion only checks status), but their framing becomes misleading and they
  no longer test what they claim.

The design should enumerate the fixture changes (config population + doc fields)
rather than implying a re-assert of one test.

## Documentation

### 4. Files-changed inventory misses live documentation that states `sort_order` is engine-read

> **Resolved (auto).** Verified all four references exist (`README.md:85`, `view.yaml.njk:5`, `spec.md` row + snippets at 343/378/417/446, `action-authoring/design.md` 275/277/310/872). Expanded the Files-changed table with rows for `README.md`, the `spec.md` prose/snippets, the `action-authoring/design.md` row/rationale/snippets, and the `view.yaml.njk` comment.

The Files-changed table (lines 112–125) lists only `action-authoring/spec.md:190`
(the field row). It misses:

- `modules/workflows/README.md:85` — explicitly lists `sort_order` among "the
  action-level fields the engine reads at runtime." This becomes false. CLAUDE.md
  mandates updating the per-module README when field schema changes.
- `action-authoring/spec.md` prose immediately after the table: "Engine treats
  these as opaque display metadata; UI consumes them" — `sort_order` no longer
  qualifies.
- `action-authoring/design.md:275/277/310/872` — a field-table row plus a
  rationale paragraph (see #6) and two example snippets.
- `modules/workflows/templates/view.yaml.njk:5` — a comment listing engine
  fields (cosmetic, but for completeness).

Confirmed safe and *not* needing changes beyond the picked-field removal:
no `.njk` template actually reads `action_config.sort_order` (only the line-5
comment matches), so dropping it from `makeActionPages.js:16` is inert.

### 5. D2 cites the wrong reason `workflowsConfig` is on the context

> **Resolved (auto).** Confirmed: `GetWorkflowOverview` uses `workflowsConfig` for the workflow `title`/`form_meta`, group display, and the `groupIndex` helper; access gates and link collapse read persisted `action.access` / `<app>.links`. Reworded D2 to cite the correct usages and clarify the config is present regardless, so no DB lookup is needed.

D2 (line 25) says the comparator can run server-side because the engine "uses
[`workflowsConfig`] for access gates, link collapse, and group rollups today."
That's inaccurate: access gates (`computeAllowed`) read the **persisted**
`action.access`, and link collapse (`collapseLink`) reads the persisted
`<app>.links` — neither touches `workflowsConfig`. The config is actually used
for workflow `title`, `form_meta`, group display (`title`/`icon`), and the
`groupIndex` helper (`GetWorkflowOverview.js:45–55`). The conclusion (config is
available, no DB lookup needed) holds; the justification is wrong and should be
corrected so it isn't carried forward as fact.

## Design divergence

### 6. Pure declaration order silently drops the originally-specified `blocked_by` topological order

> **Resolved.** Valid — confirmed `blocked_by` topological ordering was never implemented (no engine reads it for ordering; it exists only as a config-validation check in `makeWorkflowsConfig.js:544–552`). Rather than treat it as a dropped base case, it's explicitly rejected as dead/unwanted: added a "Rejected alternative — `blocked_by` topological order" block to D1 stating declaration order is *the* model (not a fallback), and prepended a "Superseded" note to `action-authoring/design.md:277` so the contradicting prose can't be relitigated.

`action-authoring/design.md:277` documents the *intended* fallback when
`sort_order` is absent: "the UI falls back to `blocked_by` topological order with
ties broken by `actions[]` declaration order." Design 54 replaces `sort_order`
with **pure declaration order** (group index, then `actions[]` index) and does
not mention `blocked_by` at all. So it isn't just retiring `sort_order` — it's
also discarding the topological-order model the prior design treated as the base
case.

In practice this is probably fine: authors who declare actions in dependency
order get identical results, and topological sorting adds real complexity
(`blocked_by` can reference groups or types — `makeWorkflowsConfig.js:544–552`)
for no concrete need yet. That aligns with CLAUDE.md's "build for concrete needs."
But the divergence is currently unstated. The design should explicitly note it is
choosing declaration order *over* the documented `blocked_by` topological model
and why (and ideally update `action-authoring/design.md:277` so the two designs
don't contradict), rather than leaving a reader to discover the conflict — per
CLAUDE.md, "when they disagree, update the design first or flag the mismatch."

## Verified accurate (no action needed)

- All cited line numbers across the four engines, `makeWorkflowsConfig.js`,
  `makeActionPages.js`, and `planActionTransition.js` are correct.
- `sort_order` is never written on the canonical insert path
  (`planActionTransition.js:143–164`); the `...payload.fields` spread (line 162)
  is the only theoretical write vector and no creation path uses it for this.
- Removing `'sort_order'` from `ACTION_FIELDS` is safe: `pick()`
  (`makeWorkflowsConfig.js:97–103`) silently drops unknown fields and no validator
  rejects extra keys, so configs that still declare it keep building.
- D4 is correct that only `GetEntityWorkflows` and `GetWorkflowActionGroupOverview`
  apply not-required-sinks-last; `GetWorkflowOverview.js:78–89` has no such key,
  and the design preserves that asymmetry.
- The Part 51 F12 pointer (line 136) is real and unchecked
  (`51-ui-fix-sweep/tasks-build.md:16`).
