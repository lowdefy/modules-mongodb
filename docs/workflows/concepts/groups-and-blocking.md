---
title: Groups and Blocking
module: workflows
type: concept
concepts: [action-groups, blocked-by, group-status, conditional-actions, blocking, phases]
---

# Workflows — Groups and blocking

Action groups are named phases. `blocked_by` declares dependencies. Together they let you express "Phase 2 starts when Phase 1 is done" declaratively instead of listing every cross-action dependency.

## Action groups

A workflow declares its groups at the top level. Every action's `action_group` field must reference a declared group.

```yaml
type: onboarding
# ...
action_groups:
  - id: discovery
    title: Discovery
    on_complete: workflow_config/onboarding/api/discovery-complete.yaml
  - id: follow-up
    title: Follow-up
  - id: setup
    title: Setup

actions:
  - _ref: ./qualify.yaml         # action_group: discovery
  - _ref: ./send-quote.yaml      # action_group: discovery, blocked_by: [qualify]
  - _ref: ./schedule-followup.yaml  # action_group: follow-up, blocked_by: [discovery]
  - _ref: ./track-installation.yaml # action_group: setup, blocked_by: [follow-up]
```

**Group status** is a derived three-value enum written back to the workflow doc:

| Group status | Rule |
|---|---|
| `done` | Every action in the group is terminal (`done` or `not-required`) |
| `in-progress` | At least one action is non-terminal AND at least one is active (`action-required`, `in-progress`, `in-review`, `changes-required`, or `error`) |
| `blocked` | Every non-terminal action in the group is `blocked` |

The engine recomputes and persists group status on the workflow doc as part of every `SubmitWorkflowAction` call — you don't maintain it yourself.

**`on_complete` hook.** When a group transitions to `done`, the engine calls the routine declared in `on_complete`. Use this to update entity fields, emit custom events, or trigger external integrations. The hook fires after notifications dispatch; the log event is already in the database when it runs. It does not fire when a workflow is cancelled.

## `blocked_by` — action-type and group references

An action's `blocked_by:` list accepts both action types and group IDs, mixed freely:

```yaml
# Wait on a specific previous action
blocked_by: [qualify]

# Wait for the entire discovery group to be done
blocked_by: [discovery]

# Mixed — wait for a group AND a specific action
blocked_by: [discovery, contact-customer]
```

**Resolution:**
- A **group ID** entry: satisfied when the group's status is `done`.
- An **action-type** entry: satisfied when at least one action of that type is terminal (`done` or `not-required`).
- The engine resolves by group-ID-first lookup precedence. A collision between a group ID and an action type within the same workflow fails the build.

The engine re-evaluates every blocked action's `blocked_by` list after each transition. When all entries are satisfied, the engine fires `unblock` against the blocked action — `blocked → action-required` — automatically. You don't write this in hooks.

**`blocked_by` on groups is ignored.** The `blocked_by` field is only meaningful on actions, not on group declarations.

## The conditional-action `blocked_by` anti-pattern

**Never put a conditional action type in another action's `blocked_by` list.**

A conditional action is one that may never exist — it's spawned mid-workflow by a pre-hook's `upsert: true` return only when runtime conditions warrant it. If it's never spawned, the engine's `blocked_by` re-evaluation finds no doc for that type, evaluates it as unsatisfied, and the dependent action **remains blocked forever** with no recovery path.

**Wrong:**
```yaml
# schedule-installation is a conditional action — may never be spawned
blocked_by:
  - schedule-installation   # WRONG: permanently blocked if never spawned
```

**Right — use the group ID instead:**
```yaml
# schedule-installation belongs to the discovery group when spawned
blocked_by:
  - discovery   # RIGHT: group status resolves as "done" once all existing members are terminal
                #        a never-spawned conditional simply has no presence in the member set
```

Group status derives from whatever member docs exist. A never-spawned conditional is absent from the member set and doesn't hold up group completion. A conditional action can itself carry `blocked_by` (it can depend on standard predecessors), but it must not be named as a blocking target.

**Summary:**

| Element | May carry `blocked_by`? | May be named in `blocked_by`? |
|---|---|---|
| Standard action (always present) | Yes | Yes |
| Conditional action (hook-spawned with `upsert: true`) | Yes | **No** |
| Group ID | No (ignored) | Yes |

For the how-to on working with conditional actions, see [Conditional actions](../how-to/conditional-actions.md).

## `starting_actions` — declaring the full standard scope

`starting_actions` seeds action docs when the workflow starts and declares the visible scope to users from the first moment. **Every standard action must be listed** — both entry actions (seeded at `action-required`) and downstream actions that start blocked (seeded at `blocked`).

```yaml
starting_actions:
  - { type: qualify, status: action-required }       # entry action — ready immediately
  - { type: send-quote, status: blocked }            # downstream standard action
  - { type: schedule-followup, status: blocked }     # downstream standard action
  - { type: track-installation, status: blocked }    # downstream standard action
  # site-visit is absent — conditional; spawned by qualify's pre-submit hook when needed
```

Seeding downstream actions as `blocked` means users see the full workflow shape up front — all steps are visible even before predecessors complete. The only legal seed statuses are `action-required` and `blocked`.

Conditional actions are not listed in `starting_actions`. They don't exist until a pre-hook spawns them.

## Persisted group state on the workflow doc

The workflow doc carries `groups: [...]` — an array of per-group objects with `id`, `status`, and per-group `summary: { done, not_required, total }`. This lets dashboards, analytics pipelines, and admin tools read phase progress directly from the workflow doc without going through the module's API.

The same drift risk as `summary` writeback applies: a direct DB write to an action bypasses the engine and may leave `groups[]` stale.
