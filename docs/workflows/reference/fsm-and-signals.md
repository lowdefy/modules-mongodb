---
title: FSM and Signals
module: workflows
type: reference
concepts: [fsm, signals, transitions, states, form, check, tracker]
---

# Workflows — FSM and Signals

The engine resolves every status change as a **signal** against a per-kind finite-state machine. A submission carries a signal name; the FSM looks up `(currentStatus, signal) → newStatus`. An unlisted `(status, signal)` pair no-ops silently. For the explanation of why this model exists, see [Signals vs Status](../concepts/signals-vs-status.md).

## Action statuses (8 canonical)

| Status             | Notes                                              |
| ------------------ | -------------------------------------------------- |
| `blocked`          | Waiting on `blocked_by` dependencies               |
| `action-required`  | Ready for work                                     |
| `in-progress`      | Work started (draft saved or "mark started")       |
| `in-review`        | Submitted; awaiting reviewer approval              |
| `changes-required` | Reviewer sent back for revision                    |
| `done`             | Completed                                          |
| `error`            | Error state — engine-internal or cascade-signalled |
| `not-required`     | Skipped / marked not applicable                    |

## Signal inventory

### Interaction signals — surfaced as buttons by at least one page template

| Signal            | Required verb | Source states (form kind)                                                             | Target                                                                |
| ----------------- | ------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `submit`          | `edit`        | `action-required`, `in-progress`, `changes-required`, `done`                          | `in-review` (if any app's `access` block declares `review`) or `done` |
| `progress`        | `edit`        | `action-required`, `in-progress`                                                      | `in-progress`                                                         |
| `not_required`    | `edit`        | `action-required`, `in-progress`, `changes-required`, `blocked`, `in-review`, `error` | `not-required`                                                        |
| `approve`         | `review`      | `in-review`                                                                           | `done`                                                                |
| `request_changes` | `review`      | `in-review`, `done`                                                                   | `changes-required`                                                    |
| `resolve_error`   | `error`       | `error`                                                                               | `in-review`                                                           |

### Engine and pre-hook signals — no button

| Signal                            | Source states                                                                         | Target            | Emitter                                        |
| --------------------------------- | ------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------- |
| `unblock`                         | `blocked`                                                                             | `action-required` | Engine (`blocked_by` satisfaction) + pre-hooks |
| `block`                           | `action-required`, `in-progress`, `in-review`, `changes-required`, `error`            | `blocked`         | Pre-hooks only                                 |
| `error`                           | `action-required`, `in-progress`, `in-review`, `changes-required`, `blocked`          | `error`           | Pre-hooks only                                 |
| `activate`                        | `blocked`, `in-progress`, `in-review`, `changes-required`, `error`, `done`            | `action-required` | Pre-hooks                                      |
| `internal_cancel_action`          | `action-required`, `in-progress`, `in-review`, `changes-required`, `error`, `blocked` | `not-required`    | Engine `CancelWorkflow` cascade                |
| `internal_mirror_child_active`    | `blocked`, `action-required`, `done`, `not-required` (tracker only)                   | `in-progress`     | Engine tracker subscription                    |
| `internal_mirror_child_completed` | `blocked`, `action-required`, `in-progress`, `not-required` (tracker only)            | `done`            | Engine tracker subscription                    |
| `internal_mirror_child_cancelled` | `blocked`, `action-required`, `in-progress`, `done` (tracker only)                    | `not-required`    | Engine tracker subscription                    |

**`unblock` vs `activate`.** Both land on `action-required`, but they differ in _which source states accept them_ — and that difference is the whole point:

- `unblock` accepts **only `blocked`**. It's the dependency-gate release: the engine fires it after every transition against actions whose `blocked_by` deps are now terminal, and pre-hooks fire it when a target is known-blocked. The narrow source list is a structural safety guarantee — because the engine re-walks `blocked_by` and re-fires `unblock` on every transition, an already-released sibling sitting in `in-progress` or `done` must not be dragged back to `action-required`. Since those states don't list `unblock`, the re-fire no-ops and the sibling is left alone.
- `activate` accepts **almost every non-actionable state** (`blocked`, `in-progress`, `in-review`, `changes-required`, `error`, `done`). It's the deliberate "make this actionable, whatever its current state" signal, emitted only by pre-hooks for cascades where the target's state is uncertain or being intentionally overridden (e.g. an issue-resolve hook re-opening a `done` action). The breadth is exactly what `unblock` refuses: `activate` _will_ pull a `done` or `in-progress` action back to `action-required`.

So: reach for `unblock` when the intent is "this dependency is satisfied, release it if (and only if) it was waiting" — it's safe to fire repeatedly and the engine does. Reach for `activate` when the intent is "force this back to actionable regardless of where it is" — a deliberate, author-driven reset, never auto-fired by the engine.

`internal_*` signals are engine-internal conventions. Pre-hooks should not emit them.

## FSM tables

### Form kind

| Current ↓ / Signal → | `submit`              | `progress`    | `not_required` | `approve` | `request_changes`  | `resolve_error` | `error` | `unblock`         | `activate`        | `block`   | `internal_cancel_action` |
| -------------------- | --------------------- | ------------- | -------------- | --------- | ------------------ | --------------- | ------- | ----------------- | ----------------- | --------- | ------------------------ |
| `none` (creation)    | —                     | —             | —              | —         | `changes-required` | —               | `error` | —                 | `action-required` | `blocked` | —                        |
| `blocked`            | —                     | —             | `not-required` | —         | —                  | —               | `error` | `action-required` | `action-required` | —         | `not-required`           |
| `action-required`    | `in-review` or `done` | `in-progress` | `not-required` | —         | —                  | —               | `error` | —                 | —                 | `blocked` | `not-required`           |
| `in-progress`        | `in-review` or `done` | `in-progress` | `not-required` | —         | —                  | —               | `error` | —                 | `action-required` | `blocked` | `not-required`           |
| `in-review`          | —                     | —             | `not-required` | `done`    | `changes-required` | —               | `error` | —                 | `action-required` | `blocked` | `not-required`           |
| `changes-required`   | `in-review` or `done` | —             | `not-required` | —         | —                  | —               | `error` | —                 | `action-required` | `blocked` | `not-required`           |
| `error`              | —                     | —             | `not-required` | —         | —                  | `in-review`     | —       | —                 | `action-required` | `blocked` | `not-required`           |
| `done`               | `in-review` or `done` | —             | —              | —         | `changes-required` | —               | —       | —                 | `action-required` | —         | —                        |
| `not-required`       | —                     | —             | —              | —         | —                  | —               | —       | —                 | —                 | —         | —                        |

The `submit` landing (`in-review` vs `done`) is action-global: `in-review` when **any** app's `access` block declares the `review` verb for the action; `done` otherwise.

### Check kind

Identical to the form-kind table. Check actions use the shared `workflow-action-*` pages and carry no `form:` body or author `hooks:`.

### Tracker kind

Tracker actions are never submitted by a user. The FSM is driven entirely by engine tracker subscription signals.

| Current ↓ / Signal → | `unblock`         | `activate`        | `block`   | `internal_mirror_child_active` | `internal_mirror_child_completed` | `internal_mirror_child_cancelled` | `internal_cancel_action` |
| -------------------- | ----------------- | ----------------- | --------- | ------------------------------ | --------------------------------- | --------------------------------- | ------------------------ |
| `none` (creation)    | —                 | `action-required` | `blocked` | —                              | —                                 | —                                 | —                        |
| `blocked`            | `action-required` | —                 | —         | `in-progress`                  | `done`                            | `not-required`                    | `not-required`           |
| `action-required`    | —                 | —                 | —         | `in-progress`                  | `done`                            | `not-required`                    | `not-required`           |
| `in-progress`        | —                 | —                 | —         | —                              | `done`                            | `not-required`                    | `not-required`           |
| `done`               | —                 | —                 | —         | `in-progress`                  | —                                 | `not-required`                    | —                        |
| `not-required`       | —                 | —                 | —         | `in-progress`                  | `done`                            | —                                 | —                        |

`activate` and `block` resolve only from `none` — they are birth signals for conditional pre-hook spawns, not live tracker transitions.

## Button visibility

Button visibility is resolved server-side. On mount, each action detail page calls `GetWorkflowAction`, which collapses the policy into a per-signal boolean map: `action.buttons: { submit, progress, not_required, approve, request_changes, resolve_error }`. A button is `true` only when **all** of the following hold:

1. **FSM source-stage** — the action's current stage is in the signal's source-stage list.
2. **Per-verb role gate** — the caller's roles satisfy `access.{app_name}.{verb}` for the signal's required verb.
3. **`allow_not_required`** (the `not_required` signal only) — the action-root boolean must be `true`.

In addition to the server booleans, form pages support a client-side author opt-out: `pages.{verb}.buttons.{name}.visible` (default `true` for edit-page buttons except `request_changes` on `view`). It accepts a boolean or any operator expression, and AND-combines with the server boolean — an author can only further restrict visibility.

## Template button bars

| Template | Signals surfaced                                                                     |
| -------- | ------------------------------------------------------------------------------------ |
| `edit`   | `submit`, `progress`, `not_required` (opt-in via `allow_not_required`)               |
| `view`   | `request_changes` (opt-in, default hidden), Edit-nav Link (navigation, not a signal) |
| `review` | `approve`, `request_changes`                                                         |
| `error`  | `resolve_error`                                                                      |

## `none` creation row

A pre-hook can spawn a new keyed action instance by including an `actions[]` entry with `upsert: true`. The absent doc's current stage is the sentinel `none`; the signal resolves through the `none` row to the birth stage. `none` is never stored — the created doc lands directly at the resolved birth stage.

Without `upsert: true`, a missing target throws. An unknown signal name always throws before FSM lookup.
