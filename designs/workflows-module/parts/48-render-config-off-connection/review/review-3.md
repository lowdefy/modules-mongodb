# Review 3 — Endpoint collapse completeness & invariant enforcement

Verified the design's claims against the engine and resolvers after the review-1
resolutions. The merge-at-load seam is sound as specified: `createEngineContext`
composes `params` onto the engine context (per `handleSubmit.js:22–27`), the full
context is the cascade's `baseContext` (`handleSubmit.js:67`), and
`runTrackerCascade` never replaces `params` per level (`runTrackerCascade.js:91`)
— so `context.params.render_config` is genuinely in scope at every cascade
level's `loadWorkflowState`. Citations re-checked and accurate
(`planEventDispatch.js:22/43/197`, `planTrackerLevel.js:80–82/140–151`,
`planActionTransition.js:181–191/195`, `StartWorkflow.js:143/180/239`,
`types.js:59`, `makeActionPages.js:19`, `ACTION_FIELDS` in
`makeWorkflowsConfig.js:7–18`).

The findings below are about what the design _doesn't_ say: the submit collapse
drops the `hooks` delivery on the floor, the cycle-free claim is an unenforced
assumption the build walk depends on, and superseding Part 47 lost its
call-site/sequencing story.

## Completeness of the endpoint collapse

### 1. The per-workflow submit endpoint drops `hooks` — Part 47's re-keying was lost in the supersession

> **Resolved.** Carried Part 47's hooks treatment into Part 48 verbatim, as a new decision **D7** plus engine/config detail in proposed-change item 3. `hooks` rides `{type}-submit` as a **sibling** property keyed by action type (`hooks: { {action_type}: { {signal}: { pre, post } } }`), **not** under `render_config` and **not** on the merge-at-load seam — D7 records the two reasons (hooks are build-resolved endpoint refs read off `params`, not Nunjucks config read off `actionConfig`; and the "one path, not two" argument that moved `event_overrides` to the seam doesn't apply since hooks only ever reach submit). `handleSubmit` re-slices `params.hooks = params.hooks?.[targetAction.type]` after `loadWorkflowState` resolves the target and before any phase runs, so `invokePreHook`/`invokePostHook` see today's signal-keyed shape unchanged. Carried both adjacent notes: all-`tracker` workflows emit no submit endpoint (`makeWorkflowApis.js:117–118`), and the Part 34 D10 reserved-type guard now also protects `{type}-start/cancel/close`. Updated item 3, added D7, the endpoint-shape example, and a Current-state bullet.

Proposed-change item 3 retires per-action `{type}-{action}-submit` in favour of
`{type}-submit`, superseding Part 47. But the per-action endpoint carries a
second per-action property besides `event_overrides`: **`hooks`** — the
signal→phase map of pre-scoped hook endpoint refs
(`makeWorkflowApis.js:18–40`, attached at `:67`), read at runtime as
`params.hooks?.[params.signal]?.{pre|post}` (`invokePreHook.js:82`,
`invokePostHook.js:43`). Today the flat shape works because the endpoint is
scoped to one action; on a per-workflow endpoint a flat `hooks` map is ambiguous
across actions — two actions with hooks on the same signal collide, and the
wrong action's pre/post hook would fire.

Part 47 specified exactly this: `hooks` (and `event_overrides`) become maps
keyed by action type, and `handleSubmit` re-slices them by
`targetAction.type` after `loadWorkflowState` resolves the target, before any
phase runs. Part 48 mentions `hooks` nowhere — not in proposed-change item 3,
not in the "Endpoint / config shape" example (which shows only `render_config`),
and not in the engine changes (item 4 covers only the render slice).
`event_overrides` got a new home (the merge-at-load seam); `hooks` got none.

**Fix:** carry Part 47's hooks treatment over explicitly. Hooks are _not_ render
config (they are build-resolved endpoint refs, not Nunjucks display config), so
they should not ride `render_config` — give the endpoint a sibling
`hooks: { {action_type}: { {signal}: { pre, post } } }` property and re-slice in
`handleSubmit` by the loaded action's type (Part 47's engine change, verbatim).
While here, also carry over Part 47's two adjacent notes: a workflow whose
actions are all `kind: tracker` emits no submit endpoint
(`makeWorkflowApis.js:117–118` skips trackers), and the Part 34 D10 `workflow`
reserved-type guard (`makeWorkflowApis.js:109–112`) now also protects
`{type}-start/cancel/close` ids.

### 2. "Tracker cycles are disallowed" is an assumption, not an enforced invariant — the build-time closure can hang

> **Resolved.** Added an acyclicity check to D6's `makeWorkflowsConfig` validation: the collected `parent_type → child_workflow_type` edge set is walked once and hard-errors on any cycle, naming the path (matching the builder's loud-failure style). Updated D2's "Cycles / depth" note to state the build enforces acyclicity (rather than asserting it), so the closure legitimately skips its own guard, and clarified that the runtime `MAX_DEPTH = 10` backstop is a separate concern (instance parent-chain, set at runtime). Updated both D6 validation references (the rename-scope "Build" bullet and the schema-example "Validation" note). Noted in passing: not expected to bite in practice — developers don't author cyclic workflows — but cheap to enforce at build time.

D2 says: "Tracker cycles are disallowed (a workflow cannot transitively track
itself), so the closure needs no cycle guard." Nothing enforces this. The
proposed `child_workflow_type` validation (D6) checks only non-empty +
resolves-to-a-declared-type; a config where A tracks B and B tracks A passes it.
The engine guards the _runtime_ equivalent with `MAX_DEPTH = 10` precisely
because cycles are reachable — its own comment says "possible cycle in workflow
parent linking" (`runTrackerCascade.js:8–11, 83–87`). At build time, a naive
transitive walk over a cyclic edge set doesn't terminate (or, with a visited
set, silently produces a self-including ancestor set that masks the config
bug).

**Fix:** since D6 adds tracker validation to `makeWorkflowsConfig` anyway,
enforce acyclicity there — walk the collected `parent_type → child_workflow_type`
edges once and hard-error on any cycle, naming the cycle path (matching the
builder's existing loud-failure style, e.g. the legacy-shape errors). That turns
D2's assumption into an invariant, lets the closure legitimately skip the guard,
and catches at build time what the runtime depth guard only catches after ten
levels of committed cascade writes.

## Reach-extension scope

### 3. "A path to the lifecycle handlers" overpromises — lifecycle events get no override channel, and none is specified

Intro item 2 says this part gives `event_overrides` "a path to the **lifecycle
handlers** (Start/Cancel/Close) and the **tracker-mirror signals**." The
concrete changes deliver only the latter. D4 widens the
`planEventDispatch` merge gate for the `tracker-mirror` path only; the
lifecycle events themselves (`workflow-started` / `-cancelled` / `-closed`,
`planEventDispatch.js:137–148`) keep rendering engine defaults — the gate stays
closed for `isLifecycle`, and the design proposes no change there.

Structurally it can't be otherwise under the chosen seam: a lifecycle event has
no target action (`isActionEvent = false`, no `actionConfig` —
`StartWorkflow.js:205–213` calls `planEventDispatch` with neither), and
`event_overrides` is per-action config, so the merge-at-load seam has nowhere
to hang a lifecycle override. What Start/Cancel/Close actually gain from this
part is (a) render config for the `status_map` they render via
`planActionTransition`, and (b) the mirror events _they cause_ gaining
overrides — at the parent's tracker action, via D4.

**Fix:** reword intro item 2 (and the corresponding ¶8 sentence) to claim what
is delivered: the lifecycle handlers gain `status_map`/render-config delivery
and their _mirror fires_ gain an override channel; the lifecycle events
themselves remain engine-default (consistent with "build for what exists" — no
second need has surfaced). If lifecycle-event overrides _are_ intended, the
design must specify their authoring home (they cannot live under an action) and
a lifecycle gate widening — but recommend not: that's a new workflow-level
config surface with no demonstrated need.

## Migration / sequencing

### 4. No call-sites section — the supersession of Part 47 dropped its sequencing story

> **Resolved.** Added a "Call sites and sequencing" section (Part 47's, enlarged for the retired generic lifecycle endpoints). Table covers: the stale `update-action-{type}` form-page templates / legacy simple pages owned by Parts 39/40 (re-point once to `{type}-submit`); the two demo `start-workflow` callers (`leads-create.yaml:48`, `companies/vars.yaml:34`) → `{type}-start`; the generic `cancel-workflow`/`close-workflow` with no in-repo callers but breaking for downstream consumers (D5's accepted regression); and the `module.lowdefy.yaml:142–144` `_ref` removals + api-file deletions. Added a sequencing note (land before/with Parts 39/40; Part 39 completed, Part 40 active). All call sites verified against the repo.

This part changes every write-endpoint id: `{type}-{action}-submit` →
`{type}-submit`, and generic `start-workflow`/`cancel-workflow`/`close-workflow`
→ `{type}-start/cancel/close`. Part 47 had a "Call sites and sequencing"
section enumerating who must re-point and who owns it; Part 48 inherits the
problem (enlarged — it also retires the generic lifecycle endpoints) but has no
equivalent section. Verified call sites today:

- **Submit:** the form-page templates still call the **legacy**
  `update-action-{type}` ids (`templates/edit.yaml.njk:250–253`,
  `_build.string.concat: [update-action-, action_config.type]`), as do the
  legacy simple pages (`pages/workflow-action-edit.yaml:199–202`, runtime
  `_string.concat`). Part 47 recorded that Parts 39/40 own reworking these;
  Part 48 must restate that coordination so the buttons re-point **once**, to
  `{type}-submit` — otherwise the implementer of this part has no instruction
  that the templates are stale and someone else's re-point target just moved.
- **Start:** `apps/demo/api/leads-create.yaml:48–51` and
  `apps/demo/modules/companies/vars.yaml:34–36` call the generic
  `start-workflow` with static types (`onboarding`, `company-setup`) — both
  re-point to `{type}-start`. No in-repo callers of `cancel-workflow` /
  `close-workflow` exist (production apps may have them — note the breaking
  rename for consumers, as D5 already frames it as an accepted regression).
- **Module manifest:** `module.lowdefy.yaml:142–144` `_ref`s the three generic
  api files; those files are deleted and the per-workflow endpoints come out of
  the `makeWorkflowApis` resolver instead.

**Fix:** add a short "Call sites and sequencing" section (Part 47's, updated):
the demo start callers, the Parts 39/40 coordination for submit buttons, the
manifest `_ref` removals, and the downstream-consumer breaking note.

## Minor

### 5. The merge seam's missing-key contract should be stated — runtime parent chains can outlive config edges

D2 asserts "every ancestor's render config is in scope at the level that loads
it." That holds when runtime parent links agree with _current_ config edges —
but the parent↔child instance link is persisted at Start
(`StartWorkflow.js:155–174`, from the parent doc gated at `:143`) and survives
later config edits. Retarget or remove a tracker's `child_workflow_type` and an
existing child still cascades to a parent whose type is absent from
`params.render_config` (D6's build validation can't catch this — it checks
edges, not live instances; same window as D6's stale-doc note). The behaviour
degrades gracefully — missing key → `undefined` → sticky `status_map`, default
event display — but only if the merge treats missing keys as legal.

**Fix:** one sentence at the seam (item 4): a missing
`render_config[workflow_type]` or `[action_type]` is legal and means
engine-default rendering — never a throw. While there, state whether the splice
mutates the `workflowConfig` entries found in `context.workflowsConfig` or
clones them: per-call connection evaluation makes in-place merge safe within an
invocation, but cascade levels re-load the same `workflowConfig` object on CAS
retries (`runTrackerCascade.js:93–110`), so the merge must at least be
idempotent — say which.
