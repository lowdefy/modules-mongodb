# Task 10: Action planners — `planActionTransition` + `planAutoUnblock`

## Context

The plan phase is pure (no I/O): it computes every consequence of a submit against the loaded state plus accumulating planned changes. This task builds the two action-level planners. They consume the FSM (task 2), the render layer (task 3), and the phase types (task 9). They replace the deleted `createAction.js` / `updateAction.js` / `computeAutoUnblocks.js` / `reevaluateBlockedActions.js`.

## Task

**Create `shared/phases/planners/planActionTransition.js`:**

Given `{ action, signal, payload, actionConfig, loadedWorkflow, event_id, now, newId }`, return the planned post-commit action doc + a change-log delta.

- **`loadedWorkflow` is the loaded workflow doc, not the recomputed one.** The planner reads only the **immutable** `workflow_type` (set at workflow start, never changed by a submit) off it to denormalise onto the action doc — so the loaded workflow carries the same value the recomputed doc would. Do **not** pass `plannedWorkflowDoc`: it is composed *from* the planned action states by `planWorkflowRecompute` (task 11), inside the auto-unblock⇄recompute fixpoint, so it doesn't exist yet when the first action transition is planned — a phantom chicken-and-egg dependency.

- **`event_id`, `now`, and `newId` are injected — never generated inside the planner.** This planner is pure (see Notes), so the nondeterministic values it needs are minted **once per invocation** at the handler entry (task 15, mirroring today's `context.eventId` / `context.changeStamp`) and threaded in: `event_id` (the single per-invocation id, reused on every action `status[]` entry and as the event doc `_id`), `now` (the change stamp written to `status[].created` and, for inserts, `created` / `updated`), and `newId` (an injected id source — e.g. `() => randomUUID()` — for an insert's `_id`, since upsert spawns are discovered *during* planning so the id count isn't known up front). Tests pass deterministic stubs for all three.

- Resolve `signal` → target stage via `resolveSignal` (task 2). For the **user-driven current-action** signal, if `resolveSignal` returns `null` (no FSM entry) → **throw** (D13 (3) / Q2: the user clicked a button that shouldn't have been available — actionable bug). For pre-hook auxiliary and engine cascade signals, a `null` resolution is a **silent no-op** (FSM structural safety).
- Compose the planned action doc: prepend a new `status[]` entry (`{ stage, event_id, created }`), merge the incoming `metadata` (from `payload.metadata`; metadata wins over action-doc-field collisions), and **set `payload.fields` verbatim** onto the doc.
  - **Field write is a generic passthrough.** This planner is the home of today's `updateAction` `...fields` spread. It is **kind-agnostic** — it does **not** name `assignees` / `due_date` / `description`; it passes the `fields` bag through verbatim, exactly as today. This is the behavior-preserving baseline so no submit (notably `kind: simple`, whose submission content *is* those fields) regresses. (Part 24 layers a kind-based universal-fields rule on top later; Part 38 stays ignorant of it.)
- Lookup `status_map[targetStage]` for the action's kind; render the cell via `renderStatusMap` (task 3) against the planned action doc + merged metadata; spread the rendered cell into the doc.
- **Denormalise `access` and `workflow_type` onto the planned action doc** (these are *persisted*, not synthesized at render time): set `action.access = actionConfig.access` and `action.workflow_type` from the loaded workflow doc (`loadedWorkflow.workflow_type` — immutable, set at workflow start). They are part of the salvaged on-disk action-doc shape (§ Schema additions + D14 / Part 34) and are **read back off the doc** by two consumers (see below), so they must actually be written to it.
- Compute the per-verb engine links map via `computeEngineLinks` (task 3) for built-in kinds; spread `<slug>.links: { view, edit, review, error }` into the doc. `computeEngineLinks({ action, entry_id })` reads `action.access`, `action.workflow_type`, and `action.type` **from the doc composed above** — do **not** pass a synthesized `{ ...doc, access, workflow_type }` view while leaving the persisted doc without those fields.
- Support both `operation: "insert"` (full draft — see **Planned action doc shape** below) and `operation: "update"` (loaded action + planned changes layered on).
- **Upsert spawn — the Submit-time insert trigger (D4 / D13 (2) / state-machine.md `none` row).** A pre-hook `actions[]` entry with `upsert: true` whose `(type, key)` matches no existing doc → build a pseudo-action `{ kind: actionConfig.kind, status: [{ stage: "none" }] }`, resolve the signal via the FSM `none` creation row, and produce `operation: "insert"` with the new doc seeded at the resolved birth stage (`activate` → `action-required`, `block` → `blocked`, `request_changes` → `changes-required`, `error` → `error`). A missing target *without* `upsert: true` → **throw** (D13 (2)). This is the rebuilt home of today's `handleSubmit` upsert branch (`utils/shouldCreate.js` + `createAction`, both deleted); the old `status` seed is gone — the birth stage comes from the signal.
- Build the change-log delta (`before` = loaded action doc, `null` for inserts; `after` = planned doc). This is **only** the raw `{ before, after }` pair, emitted on `plan.actions[i].changeLog`. It is **not** a community-schema `log-changes` entry — `planChangeLog` (task 12) is the single place that transforms these per-doc deltas into the full community-schema entries (`{ type, args, before, after, meta, blockId, … }`). Do not build community-schema entries here.

**Planned action doc shape** (the full draft for `operation: "insert"`; the update path layers the same planned changes onto the loaded doc). `createAction.js` is the *old* write path and is **missing** the new denormalised fields — reproduce its fields **plus** the additions below; do **not** treat it as a verbatim template:

- **Carried over from `createAction.js`:** `_id`, `workflow_id`, `type`, `kind`, `key`, `action_group`, `entity_id`, `entity_collection`, `assignees`, `due_date`, `description`, `tracker` (`{ workflow_type }` for `kind: tracker`, else `null`), `child_workflow_id` / `child_entity_id` / `child_entity_collection`, `created`, `updated`, and the prepended `status[]` entry (`{ stage, event_id, created }`).
- **New denormalised fields (Part 34 / Part 30 salvage — absent from `createAction.js`):** `access` (← `actionConfig.access`), `workflow_type` (← `loadedWorkflow`, immutable), and the per-verb `<slug>.links` map.
- **Rendered display:** the spread cell (`<slug>.message`, `status_title`) and the merged `metadata`.

**Read-path dependency — why `access` must be persisted, not synthesized.** The committed `modules/shared/workflow/visible_verbs.yaml` (task 7) resolves each verb off the **persisted** `action.access` — it is an aggregation over the `actions` collection and cannot see `actionConfig`. If the planner doesn't write `access` onto the doc, `visible_verbs_filter.yaml`'s `$match $anyElementTrue` drops **every** action from `get-entity-workflows` / `get-workflow-overview` / `get-action-group-overview`. This breakage is invisible to this task's unit tests (which can feed `computeEngineLinks` a synthesized view) and only surfaces at the Band 5 demo e2e — so persist `access` (and `workflow_type`) here.

**Create `shared/phases/planners/planAutoUnblock.js`:**

- A **fixpoint** loop over the in-progress action plan. When a planned transition satisfies a blocked action's `blocked_by`, the dependent action gains an `unblock` signal, resolved through the FSM (`FSM[kind]["blocked"]["unblock"] → action-required`).
- **A fired `unblock` is composed via `planActionTransition`, not `resolveSignal` alone.** An `unblock` is a real transition like any other: the unblocked action must get a fully composed planned doc — new `status[]` entry, re-rendered cell for its new stage, recomputed per-verb `links` map, change-log delta. So `planAutoUnblock` calls `planActionTransition` (operation `update`) for each fired unblock; it does **not** merely resolve the signal and leave the doc otherwise untouched (which would yield an unblocked doc missing its cell/links/status entry). The cascade `status[]` entry reuses the per-invocation `event_id` / `now` (finding #1), exactly like the current-action transition.
- **`blocked_by` resolves action types AND group ids** (restores `computeAutoUnblocks` + `reevaluateBlockedActions`, both deleted). Each entry is satisfied iff:
  - (**action type**) *every* doc of that type in the Plan is terminal — the keyed-action rule: a type isn't terminal until all its keyed instances are; or
  - (**group id**, declared in `action_groups[]`) the group's *planned/recomputed* status is `done`.
- **Interleaved with group recompute (D4 / data flow).** Group-id deps must read the *recomputed* group status, not the loaded one. Spec the cascade as an alternating fixpoint: the shared `recomputeGroups` helper (relocated to `shared/phases/planners/` by task 9; also consumed by task 11) recomputes planned groups from the current planned actions → unblock pass fires against blocked actions whose `blocked_by` is now satisfied → repeat until no new unblock fires; a **final** recompute feeds the workflow doc composed by `planWorkflowRecompute` (task 11). The fixpoint imports the shared helper directly — it does **not** depend on any `planWorkflowRecompute` export, which is what keeps tasks 10 and 11 parallel-safe. An `unblock` lands `action-required` (non-terminal) so it can't complete a *new* group, but it changes a group's label (`blocked → in-progress`), so the recompute must also run after the unblocks.
- **Unblock-only / monotonic:** the engine never auto-emits `block` on dep regression — once unblocked, an action stays unblocked unless an author re-blocks via a pre-hook. Pre-hook `block` entries arrive via `preHookResult.actions[]` and are planned by `planActionTransition`, **not** here.
- Termination: each action unblocks at most once; `unblock` no-ops from every non-`blocked` state. Iterate until no further unblocks fire (worst case N iterations for N actions; typically 1–2).

## Acceptance Criteria

- `planActionTransition` throws on a `null` FSM resolution for the user current-action signal; no-ops silently for auxiliary/cascade signals.
- `payload.fields` is passed through verbatim, kind-agnostic (no named universal fields).
- Planned action doc has: prepended `status[]` entry, merged metadata (metadata wins), rendered cell spread, per-verb `links` map spread; change-log delta with correct before/after (null before for inserts).
- Planned action doc **persists** the denormalised `access` (← `actionConfig.access`) and `workflow_type` (← workflow doc); a test asserts both are present on the composed doc (the read-path and `computeEngineLinks` both read them off the doc, not a synthesized view). The insert path produces the full draft (all `createAction.js` fields + the new denormalised fields), not a verbatim `createAction.js` copy.
- `planAutoUnblock` terminates (linear: 1 iter; chained: converges; cycles don't deadlock via FSM structural safety), emits `unblock` against the right targets, and **never** auto-emits `block`.
- `planAutoUnblock` resolves both **action-type** `blocked_by` (all docs of the type terminal) and **group-id** `blocked_by` (planned group status `done`), reading the *recomputed* group status via the interleaved fixpoint.
- Upsert spawn: an `upsert: true` entry with no matching doc produces `operation: "insert"` seeded at the `none`-resolved birth stage; a missing target without `upsert` throws.
- Tests: `planActionTransition.test.js` (per-kind variants, sticky display, FSM no-op null, change-log delta, **upsert spawn → insert at birth stage, and missing-target-without-upsert throws**), `planAutoUnblock.test.js` (fixpoint termination, correct targets, no-block assertion, empty case, **group-gated unblock: completing the last action in a group unblocks an action `blocked_by: [group-id]` in the same submit**, keyed-type all-docs-terminal rule).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planActionTransition.js` — create
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planAutoUnblock.js` — create
- `…/planners/planActionTransition.test.js` — create
- `…/planners/planAutoUnblock.test.js` — create

## Notes

- Q3 (sticky display for slugs leaving `access`): no cleanup — a departed slug keeps its stale `.message`/`.links`; display surfaces don't project it. Document, don't add cleanup logic.
- These planners are pure — a planner importing a Mongo driver is a review smell (D2/D8).
