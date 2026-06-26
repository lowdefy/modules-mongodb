---
title: Add a Conditional Action
module: workflows
type: how-to
concepts: [conditional-actions, hooks, pre-hook, upsert, blocked-by, groups]
---

# Add a conditional action

**Goal:** Spawn an action mid-workflow only when a runtime condition warrants it — not at workflow start.

**Prerequisites:** An existing workflow with at least one form action that has a submit pre-hook (or is ready to have one). Understanding of [Groups and blocking](../concepts/groups-and-blocking.md) before naming `blocked_by` targets.

## What a conditional action is

A conditional action does not exist at workflow start. It is spawned by a pre-hook's `upsert: true` return only when runtime conditions warrant it. In the `onboarding` demo workflow, `site-visit` is the canonical example: it is spawned by the `qualify` action's pre-submit hook only when the lead flags a site visit is required.

Key properties:

- Not listed in `starting_actions` — it has no doc until a pre-hook spawns it.
- The spawning hook returns `{ type: site-visit, signal: activate, upsert: true }`.
- **Must not be named in any action's `blocked_by` list** — see the anti-pattern below.

## Steps

### 1. Define the conditional action YAML

Write the action config as normal. The `kind:` can be `form`, `check`, or `tracker`. In the demo, `site-visit` is a `kind: check`:

```yaml
# onboarding/site-visit.yaml
type: site-visit
kind: check
action_group: quoting
description: Visit the site before quoting.
access:
  demo:
    view: true
    edit: true
status_map:
  action-required:
    demo:
      message: Complete the site visit.
  done:
    demo:
      message: Site visit completed.
```

The action carries no `blocked_by` — it is spawned already at `action-required` via the `activate` signal.

### 2. Add the action to the workflow's `actions:` list

```yaml
# onboarding/onboarding.yaml
actions:
  - _ref: modules/workflows/workflow_config/onboarding/qualify.yaml
  - _ref: modules/workflows/workflow_config/onboarding/site-visit.yaml # ← add
  - _ref: modules/workflows/workflow_config/onboarding/send-quote.yaml
  # ...
```

The action is in the config but **not** in `starting_actions`. No doc is seeded at workflow start.

### 3. Do NOT list it in `starting_actions`

```yaml
# onboarding/onboarding.yaml
starting_actions:
  - type: qualify
    status: action-required
  - type: send-quote
    status: blocked
  - type: schedule-followup
    status: blocked
  - type: upload-po
    status: blocked
  - type: track-company-setup
    status: blocked
  # site-visit is deliberately absent — conditional, spawned by the
  # qualify pre-submit hook when the user flags a site visit.
```

### 4. Write the spawning pre-hook

In the `qualify` action, add a `hooks.submit.pre` routine that reads the submitted form data and conditionally returns an `activate + upsert` entry:

```yaml
# onboarding/qualify.yaml
type: qualify
kind: form
action_group: qualification
hooks:
  submit:
    pre:
      routine:
        - :return:
            actions:
              _if:
                test:
                  _eq:
                    - _payload: form.site_visit_required
                    - true
                then:
                  - type: site-visit
                    signal: activate
                    upsert: true
                else: []
```

`upsert: true` authorizes spawning a doc that does not yet exist. The engine resolves `(none, activate) → action-required` via the FSM `none` creation row. Without `upsert: true`, a missing target throws.

The pre-hook form data path is `_payload: form.{field}` — the `form.` prefix matches the form block's `key` prefix (`key: form.site_visit_required`). See [Hooks](../concepts/hooks.md) for the full pre-hook payload shape.

### 5. The `blocked_by` anti-pattern — avoid it

**Never put a conditional action type in another action's `blocked_by` list.**

If `site-visit` is never spawned, the engine finds no doc for that type, evaluates the `blocked_by` entry as unsatisfied, and the dependent action remains blocked forever with no recovery path.

**Wrong:**

```yaml
# send-quote.yaml
blocked_by:
  - site-visit # WRONG: send-quote is permanently blocked if site-visit is never spawned
```

**Right — use the group ID instead:**

```yaml
# send-quote.yaml
blocked_by:
  - quoting # RIGHT: group status is "done" once all existing quoting members are terminal
    #         a never-spawned site-visit is simply not in the member set
```

Group status derives from whatever member docs actually exist. A never-spawned conditional is absent from the member set and doesn't hold up group completion. See [Groups and blocking](../concepts/groups-and-blocking.md) for the full anti-pattern explanation.

### 6. Verify the group assignment

When `site-visit` is spawned, it lands in `action_group: quoting`. Any action that should run after all quoting actions complete should `blocked_by: [quoting]`, not `blocked_by: [site-visit]`.

## Summary of the pattern

| Step                  | File                              | What to do                                                      |
| --------------------- | --------------------------------- | --------------------------------------------------------------- |
| Define action         | `site-visit.yaml`                 | Normal action config; no `blocked_by` needed on the conditional |
| Reference in workflow | `onboarding.yaml` `actions:`      | Add `_ref` — but do NOT add to `starting_actions`               |
| Spawn from pre-hook   | `qualify.yaml` `hooks.submit.pre` | Return `{ type: site-visit, signal: activate, upsert: true }`   |
| Downstream blocking   | Any downstream action             | Use the group ID, never the conditional action type             |

## See also

- [Groups and blocking](../concepts/groups-and-blocking.md) — the `blocked_by` anti-pattern explained in full; `starting_actions` semantics.
- [Hooks](../concepts/hooks.md) — pre-hook contract, `:return:` shape, `upsert: true` semantics.
- [Signals vs status](../concepts/signals-vs-status.md) — `activate` signal and the `none` creation row.
- [FSM and signals](../reference/fsm-and-signals.md) — `none` creation row in the FSM tables.
- [Authoring grammar](../reference/authoring-grammar.md) — `starting_actions:` and pre-hook `:return:` shape reference.
