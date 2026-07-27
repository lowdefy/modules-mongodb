# Review 1 — Premise verification & engine seam

Verified the design's factual claims against `modules/workflows/resolvers/` and
`plugins/modules-mongodb-plugins/src/connections/`. The line-number citations in
"Current state" and D3 are accurate (handleSubmit.js:67, planAutoUnblock.js:102,
StartWorkflow.js:180/264, CancelWorkflow.js:76/166, CloseWorkflow.js:94/182,
planEventDispatch.js:43 all check out). But the central premise — that
**both** `status_map` and `event_overrides` ride the connection blob and the
de-bloat moves both off it — is half wrong, and that flows through the framing,
the cost argument, and OQ1.

## Correctness of the premise

### 1. `event_overrides` is not on the connection blob — it already rides the submit endpoint

> **Resolved.** Reframed the design as one delivery vehicle (per-workflow `render_config`) serving two distinct mechanisms: **de-bloat** (`status_map` only, the per-request cost story) and **reach extension** (`event_overrides` gaining a path to lifecycle handlers + tracker-mirror signals — net-new capability, since `event_overrides` was never on the blob and tracker-mirror events have no override channel at all today). Updated ¶3, ¶5 (now an explicit two-item list), ¶11 (drops `status_map` only), D1/¶21, and Current state (added an "already off the blob" bullet; corrected `ACTION_FIELDS` to `status_map` only). The tracker-action override channel is the essential capability this delivers.

The design repeatedly states `event_overrides` is a connection-blob action
field that this part moves off (¶3 "Two of its action fields are heavy:
`status_map` … and `event_overrides`"; ¶11 "drops `status_map` and
`event_overrides` from `ACTION_FIELDS`"; ¶45 "`ACTION_FIELDS` (`:7–18`) includes
`status_map` (and the action carries `event_overrides`); **both** are picked …
into the connection blob").

This is not what the code does:

- `ACTION_FIELDS` (`makeWorkflowsConfig.js:7–18`) contains `status_map` but
  **not** `event_overrides`. It is `type, kind, key, tracker, blocked_by,
action_group, sort_order, required_after_close, access, status_map`. So there
  is no `event_overrides` to "drop from `ACTION_FIELDS`."
- `event_overrides` is emitted onto the **per-action submit endpoint** by
  `makeWorkflowApis.emitEventOverrides` (`makeWorkflowApis.js:42–55`, attached
  at `:68` as `event_overrides: eventMap`). It is read back at runtime from
  `params.event_overrides` (`planSubmit.js:200`,
  `yamlEventOverrides: params.event_overrides?.[params.signal]`).
- A repo-wide grep confirms `event_overrides` never appears in
  `makeWorkflowsConfig.js` and is never read off `context.workflowsConfig` /
  `actionConfig` anywhere in the engine.

Consequence: `event_overrides` is already off the blob, and already maximally
lean — the per-action submit endpoint carries only **that one action's**
overrides, not all ~100 workflows'. There is nothing to de-bloat there.

**This narrows the design to one real de-bloat target: `status_map`.** That
half is correct and well-evidenced — `status_map` is in `ACTION_FIELDS`, lands
in the blob, and is read from `actionConfig.status_map` at render time
(`planActionTransition.js:195`), so every per-request whole-blob evaluation pays
for every workflow's `status_map`.

**Fix:** Reframe the design as two distinct mechanisms that happen to share a
delivery vehicle, not one "single mechanism":

- **De-bloat** — moving `status_map` (only) off the blob onto per-workflow
  endpoints. This is the cost story.
- **Reach extension** — giving `event_overrides` a path to (a) the lifecycle
  handlers Start/Cancel/Close and (b) the tracker-mirror signals (D4). This is a
  new-capability story, _not_ a de-bloat; `event_overrides` was never on the
  blob. Today it reaches only the submit endpoint, so lifecycle + mirror events
  have no override channel — that gap is real and worth closing, but it should
  be motivated as new capability, not as removing per-request cost.

Update ¶3, ¶5 ("A single mechanism … de-bloats … **and** unlocks…"), ¶11, ¶21,
and the "Current state" ¶45–46 accordingly.

## Engine seam

### 2. The pure planners don't receive `params` — the "read from `params.render_config`" plan is under-specified and as stated contradicts the Part 38 architecture

> **Resolved.** Adopted the recommended merge-at-load seam. Rewrote proposed-change item 4: `loadWorkflowState` (originating load + each cascade level) splices `params.render_config[workflow_type][actionType].status_map` onto **every action** in `workflowConfig.actions` before returning, so the pure planners are untouched (`planActionTransition.js:195` keeps reading `actionConfig.status_map`). Stated the all-actions requirement explicitly (per `planAutoUnblock`'s sibling render, D3) and noted `event_overrides` threading is D4. Tightened D2's wording to "merges … onto that level's action config as it loads" so it doesn't contradict the named seam.

¶14 says "`planActionTransition` / `planEventDispatch` look up `status_map` /
`event_overrides` in `params.render_config[type]` instead of `actionConfig`."
But those are **pure planners with no `params` argument**:

- `planActionTransition({ action, signal, actionConfig, loadedWorkflow, … })`
  reads `actionConfig.status_map?.[targetStage]` (`:195`) — no `params`, no
  `context`. It is called from three places, none of which thread `params`:
  `planSubmit.js:98`, `planAutoUnblock.js:102` (per unblocked **sibling**), and
  `planTrackerLevel.js:93`.
- `planEventDispatch({ … yamlEventOverrides, … })` takes the already-resolved
  override slice as an arg; `planSubmit` is what reads `params.event_overrides`
  and passes it in. `planTrackerLevel.js:140` calls `planEventDispatch` **without**
  any override arg.

So "the engine reads render fields from `params.render_config`" cannot mean the
planners read `params` — they can't. The design needs to specify the seam, and
the cleanest one keeps the planners pure:

**Recommended fix — merge `render_config` back onto `actionConfig` at load.**
`loadWorkflowState` already resolves `actionConfig` from the blob
(`:134–142`) and has `context` (hence `context.params.render_config`) in scope.
Have it (and the per-level cascade load) splice
`params.render_config[workflow_type][action.type].status_map` onto each action
config it returns, so `planActionTransition.js:195` keeps reading
`actionConfig.status_map` unchanged. This localizes the change to the load phase
and the two resolvers, instead of re-plumbing three planners + `planSubmit` +
`planTrackerLevel`. Whichever seam is chosen, the design must name it — "read
from `params`" as written is not implementable against the current planners.

Note this also means the **whole workflow's** `status_map` (all actions, per
D3's `planAutoUnblock` sibling-render finding) must be merged, not just the
target action's — consistent with D3, worth stating at the seam.

### 3. D4 (internal-mirror overrides) needs two concrete changes the design doesn't name

> **Resolved.** Rewrote D4 to name both changes explicitly: (1) `planTrackerLevel` reads the parent tracker `actionConfig.event_overrides[internal_mirror_child_*]` and passes it to `planEventDispatch` (it currently passes no override arg, `:140–151`); (2) the `if (isSubmit)` merge gate (`planEventDispatch.js:197`) is widened to fire on the `tracker-mirror` path. Resolved the design decision the finding surfaced by adopting a **unified seam**: item 4's merge-at-load now splices the whole render slice (`status_map` **and** `event_overrides`) onto each action config, so `planSubmit` reads `actionConfig.event_overrides[signal]` instead of `params.event_overrides` and `event_overrides` has exactly one delivery path. Updated item 4, item 5, and the D4 heading (no longer "falls out for free" — framed as net-new capability).

D4 is sound in principle and the gap it closes is real:
`planTrackerLevel.js:140–151` calls `planEventDispatch` with no override arg,
and `planEventDispatch` only applies overrides when `isSubmit`
(`planEventDispatch.js:197`, `if (isSubmit) { mergedPayload = mergeEventOverrides(…) }`).
For a `tracker-mirror` handler the override path is dead today. To make
`event_overrides[internal_mirror_child_*]` take effect, the design must:

1. Thread the parent action's override slice into `planTrackerLevel` (via the
   same `render_config` seam as #2 — the cascade's `context.params` carries the
   originating render config through every level, since `runTrackerCascade`
   builds `levelContext = { ...baseContext, event_id }` and never replaces
   `params`), and have it pass that to `planEventDispatch`.
2. Extend the `if (isSubmit)` merge gate (`planEventDispatch.js:197`) to also
   fire on the `tracker-mirror` path. As written the planner would ignore the
   override even if it were passed.

State both in the design; "looks up … and uses it when present" hides a gate
change that's easy to miss at implementation time.

## Open question

### 4. OQ1 should be resolved here, not deferred to "before tasking"

> **Resolved — but not on the audit's reasoning.** OQ1 is converted to decision **D5: per-workflow Start/Cancel/Close, no generic endpoint, no hybrid.** The review's "no runtime-typed caller in the repo, so it's hypothetical" argument is rejected — the demo is not a usage census (new CLAUDE.md principle added this session), and dynamic-dispatch callers (category selector, polymorphic entity, data-driven mapping, triage, restart) are in fact legitimate and common. The decision instead rests on the **delivery mechanism**: a generic endpoint can't carry bounded `render_config` (all → re-bloat; none → Start can't render its seed `status_map`/fire the mirror override, verified `StartWorkflow.js:180`/`:239`), so it's architecturally incompatible regardless of callers. Those dynamic callers are served by deterministic endpoint-id construction (`{type}-start` via `_string.concat`/`_nunjucks`/`_switch`). Captured the intent as an agreed, justified ergonomic regression and named the only single-endpoint alternative (runtime dynamic config read → needs DB/CMS or an independent build step) as out of scope. Updated proposed-change item 3 (dropped the "pending" hedge) and the Related Part 19 line.

CLAUDE.md: "Resolve the open question; don't defer it … Don't punt with 'verify
at code time'." OQ1's call-site audit is doable now, and the in-repo evidence
points one way:

- Both generic `start-workflow` callers in the repo pass a **static**
  `workflow_type`: `apps/demo/api/leads-create.yaml:48` →
  `workflow_type: onboarding`, and `apps/demo/modules/companies/vars.yaml:34` →
  `workflow_type: company-setup`. Neither needs the type as runtime data; each
  would map cleanly to a per-workflow endpoint id known at author time
  (`onboarding-start`, `company-setup-start`).
- No call site in the repo derives `workflow_type` from runtime state.

The "generic caller that doesn't know the type until runtime" the hybrid is
meant to serve (OQ1(b)) is hypothetical — no instance exists in this repo. Under
CLAUDE.md "Build for what exists, not what might," and given the design itself
flags the hybrid as a "one correct way" violation, the recommendation is:

**Resolve OQ1 → per-workflow Start/Cancel/Close, no hybrid.** Production
callers live in consuming apps not in this repo, so the audit can't be 100%
exhaustive here — but the design should make the per-workflow decision the
default and require a _demonstrated_ runtime-typed caller before reintroducing a
generic endpoint, rather than leaving the question open and the hybrid on the
table. If the concern is migration ergonomics for downstream apps, address that
explicitly (e.g. a deprecation note), not with a permanent second endpoint
shape.

## Minor

### 5. "consumed only at render time" overstates `status_map`'s consumers

> **Resolved.** Covered under #1's D1/¶21 edit. The separability claim is now scoped to "not read by the recompute/unblock fixpoint off the blob," and a parenthetical names `makeActionPages.js:19` as a second consumer that reads `status_map` from the raw workflow YAML (not the blob), so this blob-only change leaves it unaffected.

¶21 argues `status_map` is separable from the structural slice because it is
"consumed only at render time (`planActionTransition` renders `status_map`)."
`status_map` has a second consumer: `makeActionPages.js:19` lifts it into each
client action-page template (`ACTION_FIELDS_FOR_TEMPLATE`). That consumer reads
the **raw workflow YAML** (`vars.workflows`), not the connection blob, so this
part's blob-only change doesn't affect it — but the separability claim should be
scoped to "not read by the recompute/unblock fixpoint _off the blob_," not "only
consumed at render time." The conclusion (status_map is separable from the
irreducible structural blob slice) still holds; just tighten the wording so a
later reader doesn't assume `makeActionPages` is unaffected without checking.
