# Review 1

## Factual errors

### 1. D1's "no new plumbing — only the typedef widens" is false: neither insert path persists `start_link`

> **Resolved.** D1 rewritten: the planner refreshes `doc.tracker = { workflow_type, start_link }` on every plan, joining the existing `doc.access` refresh. Rationale is consistency of mechanism only — D1 explicitly notes the refresh is not a config-versioning path (the review's "config edit propagates at next transition" framing was dropped: stale config on live docs stays external-migration territory per v1 policy). `planActionTransition.js` added to Files changed.

D1 claims the `tracker:` block "is already persisted on action docs (`getActionFields.js:28`, typed at `types.js:59`), so `computeEngineLinks` reads `action.tracker.start_link` off the composed doc with no new plumbing — only the typedef widens."

Both action-insert paths **narrow** the persisted `tracker` field to `{ workflow_type }` only:

- `plugins/modules-mongodb-plugins/src/connections/shared/createAction.js:49-52` (legacy path, deleted by Part 38 task 15):
  ```js
  tracker:
    actionConfig.kind === 'tracker'
      ? { workflow_type: actionConfig.tracker.workflow_type }
      : null,
  ```
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js:117-121` (the Part 38 target-state path) — identical narrowing.

So `action.tracker.start_link` is `undefined` on every doc the planner composes, and the new `computeEngineLinks` arm never fires. The read projection (`getActionFields.js`, `tracker: 1`) is fine — the field just never contains `start_link` to begin with.

**Fix:** mirror the `access` denormalisation pattern. `planActionTransition.js:144` already refreshes `doc.access = actionConfig.access` on **every** plan (insert and update) precisely so `computeEngineLinks` reads config off the composed doc; do the same for the tracker block (`doc.tracker = actionConfig.kind === 'tracker' ? { workflow_type, start_link } : null`, or read `start_link` straight from `actionConfig` in the planner and pass it to `computeEngineLinks`). The refresh-each-plan variant also means a config edit to `start_link` propagates at the next transition rather than being frozen at insert time — consistent with how `access` edits behave. Either way, add `planActionTransition.js` to the Files changed table and rewrite D1's "no new plumbing" sentence.

### 2. The "Read-side dependency (Part 38)" paragraph is stale — Part 42 owns verb selection, and there are three link-projecting APIs, not two

> **Resolved (auto).** Paragraph retitled "Parts 38 + 42": lists all three read APIs, points to Part 42 D5 / `resolve_action_link.yaml` for the selection rule instead of restating it, and states Part 44 needs no read-API change of its own beyond a tracker-row test case. The `get-entity-workflows.yaml` Files-changed row replaced with a "Read APIs — no change" row.

Line 137 says "both read APIs (`get-entity-workflows.yaml:75-79`, `get-workflow-overview.yaml:51-55`) still project the legacy singular `{slug}.link`" and that "the selection rule the read side must implement is: render the most-privileged visible verb's link — `links.edit` when `visible_verbs.edit` is true and `links.edit` is non-null, else `links.view`."

Three problems:

- **Three APIs, not two.** `get-action-group-overview.yaml:61-65` projects the same legacy singular link, and tracker rows do appear in group overviews (the design's own authoring example puts the tracker in `action_group: setup`).
- **The selection rule is Part 42's, not Part 38's.** Part 42 D5 (`42-timeline-action-cards/design.md:83-90`) explicitly supersedes Part 38's "UI applies the per-verb selection rule": a shared `modules/shared/workflow/resolve_action_link.yaml` stage does the priority pick (`edit > review > error > view` over non-null cells ∩ `visible_verbs`) and is adopted by **all three** read APIs. Part 44's restated two-verb rule ("`links.edit` … else `links.view`") should be replaced by a pointer to Part 42 D5's rule — restating it invites drift (the same drift Part 42's consistency-2 review already had to clean up once for Part 38).
- **The `get-entity-workflows.yaml` Files-changed row is a no-op.** Once Part 42's `resolve_action_link.yaml` lands, the generic priority pick already surfaces `links.edit` for a pre-child tracker — no Part 44 change to any read API is needed (the design's own closing sentence concedes this: "any correct selection surfaces it"). Replace the row with "no change — covered by Part 42's `resolve_action_link.yaml`; add a tracker-row case to its tests" or drop it.

## Cross-part consistency

### 3. The demo Files-changed row conflicts with Part 45's demo rebuild

> **Resolved.** Demo edit dropped from Part 44's scope; the Files-changed row now lists tests only, with a pointer to Part 45's `track-company-setup` as the demo exercise of both sentinels.

The table says "Demo `workflow_config` + tests — `track-installation` gains a `start_link`". Part 45 (`45-demo-rebuild/design.md:3,10,151,244`) deletes the current demo config outright — `track-installation` included — and ships `track-company-setup` with a `start_link` exercising both sentinels as part of the rebuilt config. Since Part 45 references Part 44 (so 44 lands first), editing `track-installation` in Part 44 produces throwaway work on a config that's about to be deleted — and the current `track-installation.yaml` is already invalid against the post-Part-34 engine anyway (shorthand `access.demo: [view]` list form, `link:` in built-in-kind cells, both hard errors in `makeWorkflowsConfig.js:164,247`).

**Fix:** drop the demo edit from Part 44's scope — `computeEngineLinks.test.js` + `makeWorkflowsConfig.test.js` cases cover the mechanics; Part 45's `track-company-setup` is the demo exercise. Keep only the test row.

## Minor

### 4. Proposed change 4 and change 5 disagree on non-string static params

> **Resolved (auto).** Change 4 now reads "all other string values pass through verbatim"; change 5 rejects non-string statics explicitly and rejects unknown keys in `start_link` itself (with `title:` called out).

Change 4: "All other values pass through verbatim as static params." Change 5: "`urlQuery` values must be strings, or `true` on exactly the `action_id` / `entity_id` keys." A static `count: 3` or `flag: false` passes per change 4's wording and fails per change 5's validation. Strings-only is the right call (URL params are strings); fix change 4 to say "all other **string** values pass through verbatim." While there, have change 5 state the policy on unknown keys in `start_link` itself (recommend strict reject — in particular `title:`, which authors know from custom-kind cell links, is not part of the engine-link shape).

### 5. Known-limitation section covers the cancelled child but not the cancelled parent

> **Resolved (auto).** Added a cancelled-parent paragraph to the Known-limitation section: stale-tab `start-workflow` can resurrect a swept tracker `not-required` → `in-progress` under a cancelled workflow; same trust posture as D7, stage precondition stays out of v1.

`StartWorkflow` checks only kind / null child / `workflow_type` match (`StartWorkflow.js:54-72`) — not the parent tracker's stage. If the **parent workflow** is cancelled, Cancel sweeps the pre-child tracker to `not-required` (child still null), but a user with a stale tab on the destination page can still call `start-workflow` with the old `action_id`: the FSM permits `internal_mirror_child_active` from `not-required` → `in-progress` (`fsm/tables.js:125-128`), so the tracker resurrects to `in-progress` under a cancelled workflow. This pre-exists under the trigger pattern (same trust posture as D7), but the start link makes long-lived stale tabs the normal case rather than the exception. Worth one sentence in the Known-limitation section; an actual stage precondition in `StartWorkflow` is its own decision and can stay out of v1 per D7's reasoning.
