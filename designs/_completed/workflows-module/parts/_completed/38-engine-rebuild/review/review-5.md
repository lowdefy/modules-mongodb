# Review 5 — Task 10 (action planners) input-contract completeness

Scope: `tasks/10-action-planners.md`, focused on the `planActionTransition` /
`planAutoUnblock` contracts and their consistency with tasks 2, 3, 9, 11, 12 and
the design's worked example (D3, D4, D12, D13; design.md §"Submit worked example"
lines 697–730). The recently-added `access` / `workflow_type` denormalisation
(task 10 lines 17, 26, 29, 46) is correct and the read-path justification
(visible_verbs reads persisted `access`) is sound — no issue there.

## Contract gaps

### 1. The declared input can't produce the declared doc — `event_id` / `created` / insert `_id` are missing

> **Resolved.** Added `event_id`, `now`, and an injected id source `newId` to `planActionTransition`'s input contract (task 10), with a note that all three are minted **once per invocation** and injected, never generated inside the pure planner. Task 15 now states the handler entry mints `{ event_id, now, newId }` (mirroring today's `context.eventId` / `context.changeStamp`) via a shared invocation-setup step and threads them into the plan inputs. Task 12 line 31 reworded from implying `planEventDispatch` _produces_ the id to "_receives_ the per-invocation `event_id` … uses it as the event doc `_id`," noting it's the same id `planActionTransition` stamps on the action `status[]` entries. design.md:740 test-strategy input list updated to match. Mint site chosen as the handler entry (not the load phase): the id/clock are invocation metadata, not loaded state; keeping them out of `load` preserves its "reads only" contract and deterministic tests; matches today's code.

`planActionTransition`'s input is `{ action, signal, payload, actionConfig, plannedWorkflowDoc }`
(line 11). But the doc it must compose includes a `status[]` entry
`{ stage, event_id, created }` (lines 14, 25) and, for inserts, `_id` / `created` /
`updated` (line 25). None of `event_id`, `created`/`now`, or a new `_id` are
derivable from the listed inputs.

The design already settled that `event_id` is minted **once per invocation** and
reused: the worked example stamps the _same_ `e1` onto multiple action docs and
the event doc in one submit (design.md:697–698, 730), and review-1 confirmed
`new-event` accepts a supplied `_id` so the engine passes `event_id` in as the
event doc `_id` (review-1 lines 179, 244). So the value exists before planning —
it is simply absent from task 10's input list.

This also collides with task 12: line 31 says `planEventDispatch` "produces" the
`event_id`, yet `planEventDispatch` consumes `plannedActionDoc` (D12 render
context `action: plannedActionDoc`), so it runs _after_ `planActionTransition`. If
the id were minted there it wouldn't exist when task 10 stamps the status entry.
The only consistent model — and the one D3/the worked example imply — is: mint
`event_id` (plus a `now` stamp and any insert `_id`s) up front per invocation and
thread it into both planners. This is also what keeps the planners pure
(task 10 line 62) and their tests deterministic: id/clock injected, never
generated inside.

**Fix.** Add `event_id` and `created`/`now` (and an injected id source for
insert `_id`s) to `planActionTransition`'s input contract. Reword task 12 line 31
from "produces" to "receives the per-invocation `event_id` (minted up front) and
uses it as the event doc `_id`." Add one line to task 9 or task 15 naming where
the id/clock is minted (handler entry or load phase).

### 2. `plannedWorkflowDoc` as an input is an ordering smell; `workflow_type` is immutable

> **Resolved.** Dropped `plannedWorkflowDoc` from `planActionTransition`'s input; the planner now takes `loadedWorkflow` and reads the immutable `workflow_type` off it (task 10 lines 11, 19, 28, with a note on why the recomputed doc can't be the source — it's composed _after_ action-transition planning inside the recompute fixpoint). design.md:740 input list renamed to match. Chose to pass the whole `loadedWorkflow` doc (not just the `workflow_type` string) for symmetry with the other planners' `loadedState.workflow` input.

Lines 11 and 17 read `workflow_type` from `plannedWorkflowDoc`. But
`plannedWorkflowDoc` is recomputed _from_ planned action states by
`planWorkflowRecompute` (task 11), inside the auto-unblock⇄recompute fixpoint that
`planAutoUnblock` (this same task) drives — so it does not exist when the first
action transition is planned. `workflow_type` is immutable (set at workflow
start), so the denormalisation source should be `loadedState.workflow`, not the
planned doc.

**Fix.** Read the immutable `workflow_type` from the loaded workflow doc; drop
`plannedWorkflowDoc` from `planActionTransition`'s input (or rename it to make
clear only the stable loaded workflow is read). Removes a phantom
chicken-and-egg dependency between tasks 10 and 11.

### 3. `planAutoUnblock` → `planActionTransition` delegation is left implicit

> **Resolved.** Added an explicit bullet to task 10's `planAutoUnblock` section: each fired `unblock` is composed via `planActionTransition` (operation `update`) — not `resolveSignal` alone — so the unblocked doc gets its new `status[]` entry, re-rendered cell, recomputed `links` map, and change-log delta; the cascade `status[]` entry reuses the per-invocation `event_id` / `now` (finding #1). Task-only annotation; D4 and the worked example already implied it.

Lines 33–39 say an unblocked action "gains an `unblock` signal, resolved through
the FSM." But a fired `unblock` is a real transition: it must yield a fully
composed planned doc — new `status[]` entry, re-rendered cell, recomputed `links`,
change-log delta. That requires `planAutoUnblock` to call `planActionTransition`
(operation `update`) per fired unblock, not merely `resolveSignal`. As written, an
implementer could produce an unblocked doc missing the cell/links/status entry.
Unstated too: which `event_id` the cascade status entry carries (presumably the
same per-invocation id from finding #1).

**Fix.** State explicitly that each fired `unblock` is composed via
`planActionTransition`, and that its `status[]` entry reuses the invocation
`event_id`.

### 4. Change-log delta boundary with task 12 `planChangeLog` is uncross-referenced

> **Resolved.** Task 10's delta bullet now states it emits **only** the raw `{ before, after }` pair on `plan.actions[i].changeLog` and explicitly _not_ a community-schema entry; task 12's `planChangeLog` bullet now names its inputs (`plan.actions[i].changeLog` + `plan.workflow.changeLog`) and states it is the single owner of the community-schema transform, collecting finished entries onto `plan.changeLog[]`.
>
> **Adjacent fix (raised during review, not in the original finding).** The `Plan` type (D3 design.md:77–99 and task 9) declared only the per-doc `changeLog: ChangeLogDelta` deltas but no top-level field to hold `planChangeLog`'s finished entries — yet the data-flow (design.md:471, 480) and commit (task 13 step 5) both consume `plan.changeLog`. Added a top-level `changeLog: ChangeLogEntry[]` to the `Plan` type in both D3 and task 9, with comments distinguishing the per-doc raw delta from the transformed top-level entries.

Line 21 directs `planActionTransition` to "build the change-log delta," while
task 12's `planChangeLog` also builds `log-changes` entries (task 12 lines 33–42).
These are consistent under D3/D7 — task 10 emits the raw `{ before, after }` delta
on `plan.actions[i].changeLog`; task 12 transforms deltas into full
community-schema entries — but neither task points at the other. Without a note an
implementer could build full community-schema entries in both places.

**Fix.** In task 10, clarify it emits only the `{ before, after }` delta that
`planChangeLog` (task 12) consumes, not a community-schema `log-changes` entry.

### 5. Incoming `metadata` source is unnamed

> **Resolved (auto).** Task 10 line 14 now names the source: "merge the incoming `metadata` (from `payload.metadata`; metadata wins …)". Verified against the worked example (design.md:663 — caller submits `metadata: { physical_id: "D-42" }`) and the `planActionTransition` input contract, which includes `payload`.

Line 14 ("merge `metadata`, metadata wins over action-doc-field collisions") does
not say where the _incoming_ metadata comes from (presumably `payload.metadata`).
One word removes the ambiguity.

## Summary

Findings 2–5 are clarifications. Finding 1 is a genuine cross-task inconsistency
(task 10 input vs. tasks 11/12 and the worked example) that would surface as an
implementation blocker — the planner as specced cannot stamp the `status[]`
`event_id`/`created` or seed an insert `_id` from its declared inputs.
