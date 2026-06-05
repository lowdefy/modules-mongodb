# Review 4 — Behaviour-preservation gaps against the current engine

Scope: fourth review of Part 38, run after the task files (`tasks/01`–`20`) were
written (the prior reviews + consistency-4 predate them). Reviews 1–3 covered
architecture soundness, concept-doc consistency, and Part 34 absorption; this pass
verifies the rebuild against the **behaviour the current engine actually
implements**, to catch features that silently fall out of the phase-model rewrite.

Verified against `WorkflowAPI/SubmitWorkflowAction/handleSubmit.js`,
`computeAutoUnblocks.js`, `reevaluateBlockedActions.js`, `mergePreHookActions.js`,
`utils/shouldCreate.js`, `WorkflowAPI/schema.js`, the concept docs
(`state-machine.md`, `submit-pipeline` D4, `action-authoring`), the plugin
`package.json`, and the installed MongoDB driver. Findings are concrete losses of
existing behaviour that neither the design nor the task list carries forward.

## Correctness

### 1. The `upsert: true` mid-workflow spawn path has no home in the phase model — and D13 actively breaks it

> **Resolved.** Preserved the spawn — and folded creation *into the FSM* rather than carrying a `status`-seed exception. Confirmed the feature is heavily used out-of-repo (the reference app spawns keyed actions throughout: `site-visit-report`, `_uuid`-keyed child tickets, forced `request_changes`/`block` upserts), though the in-repo demo uses it nowhere — so "drop" was off the table. Added a **`none` creation source state** to `state-machine.md`: `none` is a transient resolution-time sentinel (never a stored status), and the spawning signal resolves through the `none` row to the birth stage (`activate → action-required`, `block → blocked`, `request_changes → changes-required`, `error → error`), extensible by adding edges. A pre-hook `actions[]` entry is now uniformly `{ target, signal }` with optional `upsert: true`; on a missing target, `upsert: true` resolves via `none` → `operation: "insert"`, while a missing target *without* `upsert` throws (D13 (2), reconciled with state-machine.md Open Question 1). Updated Part 38 D4/D5/D13, the data flow, Files-changed (gave `mergePreHookActions.js` + `utils/shouldCreate.js` a deletion disposition — logic folds into `planActionTransition`), the test strategy (spawn integration test), and tasks 02 (the `none` row), 09 (`PreHookResult.upsert?`), 10 (the insert trigger). `StartWorkflow` draft-birth is left as a possible future unification onto the same `none` mechanism, not done here.

The current engine supports a pre-hook `actions[]` entry that **spawns a new keyed
action instance** mid-submit. `handleSubmit.js` (step 4 loop) branches on
`entry.upsert === true` when no matching doc exists, calls `createAction`, and
inserts a new doc; `mergePreHookActions.js` + `utils/shouldCreate.js` carry the flag
through. This is a designed, concept-level feature, not vestigial:

- `action-authoring/design.md:884`: "A pre-hook return's `actions[]` array … can
  append `{ type: proof-of-installation, key: device-456, status: action-required,
  upsert: true }` to spawn a new instance. `status` here is the new doc's **initial
  status** (a creation seed), not an FSM transition — **the one place `actions[]`
  carries `status` instead of `signal`**, valid only with `upsert: true`."
- `submit-pipeline/design.md:258`–261 documents the same `upsert` + seed-`status`
  field on the `actions[]` shape.

Part 38 erases this in two ways:

1. **No phase owns it.** D5 and the data flow describe `preHookResult.actions[]` as
   uniformly `{ target, signal }` resolved through the FSM. `planActionTransition`
   "resolves a signal through the FSM"; but an `upsert` entry carries a *status seed*,
   **not** a signal, and there is no FSM lookup for a doc that doesn't exist yet.
   `plan.actions[].operation: "insert"` exists in the Plan type (D3), and the design
   says `planActionTransition` "handles both insert and update" — but the **Submit-time
   trigger for an insert is never described**. Every worked-example and data-flow
   insert is StartWorkflow's initial drafts; the mid-submit spawn is absent.
2. **D13 (2) contradicts it.** D13 says a pre-hook `actions[]` entry whose target
   doesn't exist → **planner throws** ("Unknown target … Planner throws (today's
   `actions[]` behaviour for missing targets)"). But an `upsert: true` spawn is *by
   definition* a target that doesn't exist yet — under D13 it would throw instead of
   creating. So the one rule Part 38 does state for missing targets directly defeats
   the spawn feature.

This is the most consequential gap: a shipped capability (spawn a new keyed instance
from a pre-hook) becomes unreachable, and the design doesn't flag it as either
preserved or dropped.

**Fix.** Decide explicitly:
- **Preserve:** state that `preHookResult.actions[]` entries are either
  `{ target, signal }` (FSM transition) **or** `{ type, key, status, upsert: true }`
  (insert with a seed status, no FSM lookup); `planActionTransition` routes upsert
  entries to `operation: "insert"` with the seed status; and D13 (2) only throws for
  a missing target on a **non-upsert** entry. Add a worked-example/integration test
  for the spawn path.
- **Drop:** add it to Non-goals with the same "no in-repo consumer / re-addable"
  justification used for the `action_display` payload override (D14), and confirm the
  demo's pre-hooks don't rely on it.

Either way `mergePreHookActions.js` / `utils/shouldCreate.js` are current code with no
disposition in Files-changed (they're neither in the rewritten nor the deleted list).

### 2. Auto-unblock loses `blocked_by` group-id resolution and runs before group recompute

> **Resolved.** Confirmed all three sub-losses against `computeAutoUnblocks.js` / `reevaluateBlockedActions.js` (group-id resolution, the keyed-action all-docs-terminal rule, and the inverted ordering). Restored them as a single **interleaved fixpoint**: `planWorkflowRecompute` recomputes planned groups → `planAutoUnblock` fires `unblock` against blocked actions whose `blocked_by` is satisfied (action-type all-docs-terminal **or** group-id planned-status-`done`) → iterate to a fixpoint, with a final recompute feeding the workflow doc (an `unblock` lands non-terminal so it can't complete a new group, but it flips a group label `blocked → in-progress`, so the recompute must follow the unblocks too). Updated D4, the data-flow ordering (now `auto-unblock ⇄ group-recompute fixpoint` then `final recompute`), task 10 (`planAutoUnblock` resolution rules + interleave + group-gated-unblock and keyed-type tests), and task 11 (recompute participates in the fixpoint).

`computeAutoUnblocks.js` resolves each `blocked_by` entry as **either** an action
type **or a group id**:

```
1. Group id (declared in action_groups[]) → satisfied iff the group's
   persisted status is 'done'.
2. Action type → satisfied iff *every* doc of that type is terminal
   (keyed actions: a type is terminal only when all its docs are terminal).
```

Part 38 D4, the data flow, and task `10-action-planners.md:23` describe
`planAutoUnblock` as resolving **only** action references:

> "An action's `blocked_by` references other actions; when a planned transition makes
> those references terminal, the dependent action gains an `unblock` signal."

Two distinct losses:

- **Group-id `blocked_by` is dropped entirely.** An action `blocked_by: [install]`
  (a group id) is never unblocked by the rebuild, because the planner only inspects
  per-action terminality. This is a live feature (Part 7 group state machine;
  `computeAutoUnblocks` resolves `declaredGroupIds`).
- **Ordering is inverted.** Group-gated unblock needs the *recomputed* group status.
  The current engine runs unblock in **two passes**: `computeAutoUnblocks` pre-write
  (action-type deps), then `reevaluateBlockedActions` *after* `recomputeGroups`
  (group-status deps, reading the post-recompute `groups[]`). Part 38's data flow
  orders "auto-unblock fixpoint" **before** "recompute groups + summary"
  (design.md:456–457). So even if group resolution were added, the fixpoint would read
  the *loaded* (pre-transition) group status and miss the unblock.

Concrete failure: action C is `blocked_by: [install-group]`; a submit completes the
last action in `install-group`. Current engine: recompute flips the group to `done`,
then unblock fires C. Part 38 as specced: the fixpoint runs while the group is still
`in-progress` → C stays `blocked` → groups recomputed afterward → C is stranded until
an unrelated later submit triggers another recompute. Silent regression.

**Fix.** In D4 / `planAutoUnblock` (task 10) and the data flow:
(a) restore group-id resolution (a `blocked_by` entry satisfied iff the *planned*
group status is `done`) and the keyed-action "all docs of a type terminal" rule;
(b) interleave group recompute with the unblock fixpoint (recompute groups against
the planned actions, then unblock against the recomputed groups, iterating to a
fixpoint), or run the unblock pass after `planWorkflowRecompute` and feed the planned
`groups[]` into it. Add a group-gated-unblock case to `planAutoUnblock.test.js`.

### 3. The `required_after_close` submission exception is dropped from the load-phase gate

> **Resolved (auto).** Confirmed the carve-out is live in `handleSubmit.js` (the `actionConfig.required_after_close !== true` guard) and tested. Restored it explicitly: D2's load-phase invariant, the data-flow stage check, and task 09 (task + acceptance criteria) now state that a `completed`/`cancelled` workflow rejects the submit **unless** `actionConfig.required_after_close === true`, with a load-phase test for the allowed post-close case.

`handleSubmit.js` permits a submit on a `completed`/`cancelled` workflow **when the
action declares `required_after_close: true`**:

```js
if ((workflowStage === "completed" || workflowStage === "cancelled") &&
    actionConfig.required_after_close !== true) {
  throw new Error(`… workflow is ${workflowStage}; action … does not have
    required_after_close: true`);
}
```

This is a live, tested feature (`handleSubmit.test.js`, `CloseWorkflow.test.js`,
`makeActionPages.js`, `makeWorkflowsConfig.js`, `templates/view.yaml.njk` all
reference `required_after_close`). Part 38 D2 and task `09-load-phase-and-types.md:34`
reduce the load-phase invariant to a bare *"workflow stage doesn't accept
submissions."* That phrasing drops the `required_after_close` carve-out — under it,
**every** submit on a closed workflow throws, breaking the post-close required-action
path.

**Fix.** Spell out the gate in D2 / task 09: a submit on a `completed`/`cancelled`
workflow is rejected **unless `actionConfig.required_after_close === true`**. Add a
load-phase test for the allowed case (mirroring the current `handleSubmit.test.js`).

## Moderate

### 4. The engine's own `MongoClient` needs `mongodb` as a declared dependency — it isn't one

> **Resolved.** Confirmed: plugin `dependencies` are only `{ dayjs, dompurify }`, no `mongodb`; it resolves today only by pnpm-hoist (`mongodb@6.21.0` at the root `^6.10.0`), while the community plugin pins an exact `mongodb@6.3.0`. Added `mongodb: "^6"` to the plugin's **`peerDependencies`** (peer, not bundled `dependency`, so the consuming app dedupes to one v6 driver build rather than carrying a second copy — matching the existing `community-plugin-mongodb: ^3` peer). Recorded in task 01 (task text + Files-changed + AC), the design's Files-changed (new `mongo/` section), and a D8 note stating the single-driver-version expectation (the community plugin's exact 6.3.0 pin is an external choice; both being v6, `findOneAndUpdate` returns the doc/`null` directly as D15 assumes, so a skew is benign). The actual `package.json` edit lands when task 01 is implemented.

D8 and task `01-mongo-driver-layer.md` have `getMongoDb.js` *construct* a
`MongoClient` from `databaseUri` (`import { MongoClient } from "mongodb"`). But the
plugin's `package.json` declares **no** `mongodb` dependency — `dependencies` is only
`{ dayjs, dompurify }`, and `peerDependencies` lists `@lowdefy/community-plugin-mongodb`
but not `mongodb`. Today the community plugin owns the driver privately, so the engine
never imported it directly; the rebuild changes that.

It happens to resolve in this monorepo (`require.resolve("mongodb")` → the hoisted
`mongodb@6.21.0`), but that's a pnpm-hoist accident, not a contract — a published
plugin consumed by an external app could fail to resolve `mongodb`, or resolve a
different copy. Related skew: the community plugin pins `mongodb@6.3.0` while the
workspace root has `6.21.0`, so the engine's client and the community plugin's client
may be **two different driver instances** (separate `MongoClient`/`ClientSession`
classes) — benign for behaviour (both are driver v6, so `findOneAndUpdate` returns the
doc/`null` directly as D8 assumes) but it doubles the bundled driver and is worth pinning
deliberately rather than by accident.

**Fix.** Add `mongodb` to the plugin's `peerDependencies` (range matching the
community plugin's major, `^6`) — or `dependencies` if a bundled copy is intended —
and list the `package.json` edit in task 01's Files-changed. State the chosen
single-driver-version expectation so the two clients share one driver build.

## Minor

### 5. Change-log request-context fields may not exist on the engine handler context

> **Resolved (auto).** Verified against `@lowdefy/api`: `callRequestResolver.js` passes `{ blockId, connectionId, pageId, requestId, endpointId }` to **every** connection request resolver, so the WorkflowAPI handler receives them on the same `lowdefyContext` object the community plugin reads (`MongoDBUpdateOne` destructures the identical set). Parity is exact — when an invocation lacks a page/block, `pageId`/`blockId` are `undefined` for both, so an engine entry is never less-populated than a plugin entry. D7's "populated from the engine handler's request context" was correct; added the provenance + parity note to D7 and task 12 (the handler threads the fields from `lowdefyContext`).

D7 says each `log-changes` entry carries `blockId` / `connectionId` / `pageId` /
`requestId` "populated from the engine handler's request context." The community
plugin gets these because it executes as a Lowdefy *request* handler. The WorkflowAPI
**connection** handler may not have `pageId` / `blockId` in scope (a connection can be
invoked from contexts without a page/block). This is unverified in the design.

**Fix.** Confirm which request-context fields the WorkflowAPI handler actually
receives; for any that aren't reliably present, either omit them from the engine's
`log-changes` entries (and note the entries are a subset of the plugin's shape) or
document the fallback. Small, but it affects audit-log parity with plugin-written
entries — the explicit goal of D7.

## What checks out (verified this pass)

- **FSM tables** (state-machine.md:131–160) match D4's `resolveSignal`: `unblock` is
  `blocked → action-required` and `—` (no-op) from every other state; the `submit`
  cell is the only one reading `access`, consistent with the app-global `hasReview`
  rule. The data-flow transitions in the worked example are correct.
- **Unblock-only / monotonic cascade** (review-2 #1) is correctly propagated into
  task 10 — no `auto-block` framing survives.
- **CAS + workflow-first ordering** (review-1 #1/#5) is consistent across D9, D15,
  the data flow, and task 13.
- **`findOneAndUpdate` return shape** — driver v6 returns the document (or `null`)
  directly by default, so D8/D15's `null`-return CAS check is correct as written.
- **Notifications** are an existing concern (`dispatchNotifications` is a real
  step-8 today), so `plan.notifications[]` carries forward a real surface, and
  `notification_roles` is correctly deferred to Part 41 (review-3 #6).
</content>
</invoke>
