# Workflow Engine Concepts — Workflows Module

Reviewer notes on the engine's _concept model_ — what the model represents, what authors declare, how the runtime interprets it. Each section is a recommendation rooted in patterns from XState, BPMN engines (Camunda, Flowable), ServiceNow case management, and Temporal.

The unifying recommendation is: **describe the system with a finite-state machine, declared per action, with named transitions.** Several other recommendations fall out of that one.

## 1. Replace the priority rule with a per-state FSM transitions table

**Today.** Action status is governed by a global priority order (`blocked > action-required > ... > not-required`) plus a strict-less-than rule plus same-state self-exception plus `force: true` overrides. Common workflows (resubmit after `request_changes`, error recovery, tracker writes) require `force: true`.

**Recommended.** Each action declares a transitions table keyed by current state and event:

```yaml
transitions:
  action-required:
    submit_edit: in-review # or done if no review verb
    save_draft: in-progress
    not_required: not-required
  in-progress:
    submit_edit: in-review
    save_draft: in-progress # no-op transition; only form_data writes
    not_required: not-required
  in-review:
    approve: done
    request_changes: changes-required
    withdraw: action-required
  changes-required:
    submit_edit: in-review
    not_required: not-required
  error:
    resolve_error: in-review
  done: {} # terminal — no outgoing transitions
  not-required: {} # terminal
  blocked:
    unblock: action-required # engine-driven event
```

The engine ships defaults per `kind` (form / task / tracker); authors override per-action only when needed.

**What this buys you:**

- `force: true` shrinks to admin/migration use only.
- Auxiliary writes (engine unblock, tracker subscription) emit _events_ against the target action's FSM; if the current state doesn't declare a listener for the event, the write no-ops silently — the "A → done re-fires shouldn't regress B" guarantee is structural, not rule-based.
- Custom interactions (when added later) just add a row to the table.
- Resubmit flows are first-class (`changes-required → submit_edit → in-review`), no force needed.
- Recovery flows are first-class (`error → resolve_error → in-review`), no force needed.
- Tracker writes declare their own engine-internal events (see point 6), no force needed.

## 2. Separate user-driven interactions from auxiliary signals

**Today.** `SubmitWorkflowAction` payload carries `currentActionId` (user-driven) plus `actions: [...]` (auxiliary writes from pre-hook returns or auto-unblocks). Both go through the same priority check, distinguished by the self-exception.

**Recommended.** Make these two API paths with different semantics:

- **User-driven transition.** `interaction:` is the event name; FSM resolves `transitions[currentState][interaction] → newState`. Author can declare arbitrary interaction names. Templates render one button per legal transition from `currentState`.
- **Auxiliary signal.** Auto-unblocks, tracker propagation, pre-hook side effects emit a signal against a target action (e.g. `{target: B, signal: unblock}`). The target's FSM decides whether the signal triggers a transition. Signals against terminal-state targets are no-ops.

The split makes the engine's intent legible. Right now reading the engine code requires holding "is this the current action or an auxiliary write" in your head; with two paths the code documents itself.

## 3. Separate state-changing interactions from state-orthogonal operations

**Today.** Reassign, comment, update-due-date, update-description all ride inside the `submit_edit` payload's `fields` and metadata. To reassign, you must do a state transition. You can't update assignees on a `done` action.

**Recommended.** Three categories on an action's lifecycle surface:

1. **Transitions** — state-changing interactions (`submit_edit`, `approve`, etc.). Declared per state in the FSM table.
2. **Operations** — state-orthogonal lifecycle events that update universal fields. Examples: `reassign`, `update_due_date`, `update_description`, `comment`. Each runs hooks, emits a log event, writes the field — no `status` push.
3. **Read-only views** — `view`, `review` rendering only; no writes.

API surface:

- `update-action-{action_type}` for transitions (today's per-action endpoint).
- `update-action-fields-{action_type}` (or one shared `update-action-fields` if you keep it generic) for operations.

The existing proposal to split metadata edits from submissions is the same split. Worth landing it as a first-class category in the concept model rather than as an isolated patch.

## 4. Button vocabulary is derived, not hard-coded

**Today.** Templates ship a fixed five-button bar (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`).

**Recommended.** Templates ship a _button-bar component_ that reads the action's transitions table and renders one button per legal transition from the current state. The five interactions you ship today become defaults in the table, not hard-coded UI.

- An action in `action-required` with the default form-action table renders `submit_edit` + `save_draft` + `not_required`.
- An action in `in-review` renders `approve` + `request_changes` (+ `withdraw` if added, + `reject` if the author declares it).
- An action in `done` renders no transition buttons (operations like `reassign` still available via a separate menu).

Naming and ordering come from a button registry (engine-shipped defaults; authors register custom buttons per interaction with title/icon/style). The same registry feeds operations.

You explicitly noted that for current use cases (onboarding, device installation), `reject` and `escalate` haven't been needed. The recommendation isn't "add those now" — it's "make the model extensible so you don't need to redesign the engine when they're needed."

## 5. Save-draft as a first-class interaction (regression from v0)

**This is a regression, not a new feature.** The reference project had save-draft as a core lifecycle interaction — actions moved to `in-progress` while the submitter was working on them, and only transitioned to `in-review` / `done` on explicit submit. The current design lost this path during the redesign:

- `in-progress` is still in the status enum.
- The priority rule allows the transitions (`action-required(6) → in-progress(5)`; `in-progress → in-progress` via the same-stage self-exception).
- But no interaction targets `in-progress`. `submit_edit` always advances to `in-review` (or `done` if no review verb); there is no second interaction for "save without advancing."

The reference project relied on the `in-progress` state to let submitters work on long forms across multiple sessions without prematurely triggering reviewer workflows. Without it, every click on a form action either commits to review or loses work — that's a meaningful capability gap, not a polish item.

**Restore as a default interaction:**

- `from: action-required → to: in-progress` (start a draft)
- `from: in-progress → to: in-progress` (continue a draft; `form_data` writes persist)

The button is template-shipped (or rendered from the transitions table per point 4). `form_data` writes persist on save; `status` goes to `in-progress`; either no log event or a lightweight `draft_saved` event for audit (author's choice).

This works under the existing priority rule (no FSM refactor needed to restore the capability) — it's a missing entry in submit-pipeline Decision 3's interaction-to-status table, a missing template button, and a missing default transition in the per-action endpoint. Engine work is essentially nil. The capability gap is what matters; the FSM treatment in point 1 just makes it cleaner to declare.

**Action item.** Add to the design's "v0 → v1 deltas" list as a confirmed regression to fix before v1 ships, not a deferred enhancement.

## 6. Name the engine-internal events

**Today.** The engine has "interactions" (5 fixed names) and several engine-internal write paths (tracker subscription, auto-unblock, error recovery) that don't have interaction names — they're just engine code paths that call `updateAction` with `force: true`.

**Recommended.** Name the engine-internal events as first-class FSM events too:

- `unblock` — engine emits when an action's `blocked_by` becomes terminal.
- `mirror_child_active` / `mirror_child_completed` / `mirror_child_cancelled` — tracker subscription emits these.
- `cancel_action` — `CancelWorkflow` emits this on every open action.

Each is a declared transition in the default FSM. The engine _can't_ write a status that isn't declared as a transition.

This sounds like overhead but it's actually a reduction: today the engine has two write paths (priority-rule path + `force` path); with this you have one (FSM events), and the events have names. `force: true` shrinks to genuine admin/migration overrides.

## 7. Extensibility hooks (not for v1; design so you can add later)

Custom verbs and escalation are out of scope. Two design decisions affect whether adding them later is easy or breaking:

- **Custom interaction names per action.** The FSM transitions table accepts arbitrary string keys. Engine doesn't validate names against a fixed list. Templates render whatever's declared. Add `escalate` later by adding a row in one action's table; nothing else changes.
- **Custom statuses.** Currently locked at 8. Real extensibility means letting apps add domain statuses (`on-hold`, `pending-external`, `rejected`). Today the enum is hard-coded in the module package; the priority rule depends on it; the templates ship copy per status. Loosening this is bigger than v1 needs, but at minimum:
  - Make the status enum a manifest var (with module defaults).
  - Ensure templates render via lookup, not via literal switches.
  - The FSM model (point 1) doesn't depend on the enum being fixed — adding statuses is purely additive.

Then adding a status in v1.x is a one-line change in the consuming app's config, not an engine fork.

## 8. Time as a first-class concept (deferrable but worth noting)

`due_date` is a field. Real workflows want time-driven transitions:

- Overdue notification ("X days past due").
- Escalation on SLA breach ("auto-reassign to manager").
- Auto-`not-required` after deadline.

This isn't part of v1 by your scope. But the FSM model accommodates it cleanly when needed:

- Time-based events (`due_date_passed`, `sla_breached`) are FSM events emitted by a scheduler.
- Per-action declared transitions for those events drive whatever behaviour the author wants.

Recommendation: don't design timer mechanics now, but reserve the event vocabulary (`due_date_passed`, `overdue`, `sla_breached`) so apps don't redefine them inconsistently if you grow them later.

## Summary of the concept shift

| Concept                | Today                                            | Recommended                                                              |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ |
| Transition legality    | Global priority order + `force: true`            | Per-state FSM table; no force on normal paths                            |
| Interaction vocabulary | Fixed 5 buttons hard-coded in templates          | Derived from transitions table; engine ships defaults                    |
| Auxiliary writes       | Same payload as user writes; priority-rule gated | Separate `signal` path; FSM ignores signals to non-listening states      |
| Metadata edits         | Bundled into `submit_edit` `fields`              | Separate "operations" category with own endpoint                         |
| Engine-internal writes | Code paths with `force: true`                    | Named FSM events (`unblock`, `mirror_child_*`, `cancel_action`)          |
| Save-draft             | No path lands in `in-progress`                   | First-class `save_draft` transition                                      |
| Custom verbs/statuses  | Locked                                           | Engine ignores unknown interaction names; statuses become a manifest var |
| Time                   | Field only                                       | Reserve event vocabulary for v2                                          |

## Priority order

If you only tackle two, the **FSM transitions table** (point 1) and the **operations split** (point 3). Those two together remove most of the model's friction:

- Save-draft falls out (point 5 is a one-line add to the FSM table).
- The button-bar refactor (point 4) becomes mechanical.
- Engine-internal events (point 6) become a naming exercise.
- Extensibility (point 7) becomes additive instead of breaking.

The rest of the changes (timer events, custom statuses) are deferrable without locking the design out of them.
