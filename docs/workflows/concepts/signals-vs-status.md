---
title: Signals vs Status
module: workflows
type: concept
concepts: [signals, status, fsm, transitions, force, submit, review]
---

# Workflows — Signals vs status

This page resolves the most common point of confusion when first working with the workflows module: **you don't set target statuses — you fire signals**, and the engine resolves where the action lands.

## The confusion

When you click "Submit" on a form action, you might expect to tell the engine "set this action to `in-review`." When you write a pre-hook, you might expect to write `{ type: send-quote, status: action-required }`. When an action goes wrong, you might look for a way to force it to `error`.

None of those are the right mental model. The module has no "set status" surface for consumers. It has **signals**.

## What a signal is

A signal is a named message fired against an action. The engine looks up the action's current status and the signal name in a per-kind table and resolves to a new status:

```
transitions[kind][currentStatus][signal] → newStatus
```

An entry in the table means the transition happens. A missing entry means the signal no-ops silently against that state.

Example: the `submit` signal fired against a form action at `action-required`:

- If the action's `access` block declares a `review` verb for any app → `action-required → in-review`.
- If no `review` verb is declared → `action-required → done`.

The engine resolves this from the action's static config at the time of the call. You don't pass a target; you fire `submit`.

## Why not direct status setting?

**There is no priority rule and no `force: true`.** The FSM table is the source of truth. A backward move like `done → changes-required` is legal because `done` has an entry for `request_changes` in the table. Common flows — resubmit after review, recover from error, re-open a done action — are all handled by signals with entries in the FSM table.

## How the `submit` signal determines its target

`submit` is the most important interaction signal. Its target depends on one thing: **whether the action declares a `review` verb in its `access` block**.

```yaml
# No review verb → submit lands at done
access:
  my-app:
    view: true
    edit: [account-manager]

# review verb present → submit lands at in-review
access:
  my-app:
    view: true
    edit: [account-manager]
    review: [account-manager]
```

This is an action-global property — one action doc is shared across every app that can see it. If any app's `access` block declares `review`, every `submit` from every app lands at `in-review`. The check happens against the action's static config, not the caller's app.

This is the only case where `submit`'s target depends on config. All other signals (`approve`, `request_changes`, `not_required`, `progress`, `resolve_error`) have a single fixed target.

## Signals in pre-hooks

When a pre-hook needs to signal another action, the return shape uses `signal:`, not `status:`:

```yaml
# In a pre-hook's :return:
actions:
  - { type: send-quote, signal: unblock }        # was: { type: send-quote, status: action-required }
  - { type: upload-po, signal: not_required }    # was: { type: upload-po, status: not-required }
  - { type: flagged-action, signal: activate }   # was: { ..., status: action-required, force: true }
  - { type: failed-action, signal: error }       # was: { ..., status: error }
```

Use `activate` to push an action back to `action-required` from any state.

**Important:** a pre-hook cannot re-signal the current action. The current action always lands per the signal the user fired. If you need conditional landing (e.g., "sometimes this submit should skip to done"), model it as a separate thin action with its own button.

## Terminal states and re-fires

`done` and `not-required` are terminal for the normal path, but not strictly terminal in the FSM. `done` accepts `submit`, `request_changes`, and `activate` — these are the re-open/revise/re-edit flows that previously needed `force: true`.

`not-required` on form and check actions has no outgoing transitions — once a form action is marked not required, the only recovery is a direct DB write (out-of-band admin action). Tracker actions are different: they accept `internal_mirror_child_*` signals from `done` and `not-required` so a parent can recover when a child re-activates.

## The `allow_not_required` guard

The `not_required` signal has a secondary gate: the action must declare `allow_not_required: true` at the action root. If the field is absent or `false`, the `not_required` button is hidden and the signal is rejected at the server even if a caller tries to fire it directly. This prevents accidental "mark not required" on actions that must always complete.

## Signal re-fire safety

A critical property of the signal model: **re-firing a signal against a state that's already past it no-ops silently.** This is structural — `unblock` only has an entry from `blocked`, so firing `unblock` against an already-unblocked `action-required` action does nothing. No error, no regression. This keeps `blocked_by` re-evaluation and pre-hook cascades safe by default.

## Full reference

The complete signal inventory, source-state lists, and FSM tables are in [FSM and signals](../reference/fsm-and-signals.md).
