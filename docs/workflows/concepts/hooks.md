---
title: Hooks
module: workflows
type: concept
concepts:
  [
    hooks,
    pre-hook,
    post-hook,
    submit-pipeline,
    out-of-band,
    failure,
    form-overrides,
  ]
---

# Workflows — Hooks

Hooks are author-supplied Lowdefy APIs that the engine invokes at fixed points in the submit lifecycle. They are the extension surface for custom logic — entity updates, conditional cascades, external integrations — without leaving the engine's lifecycle.

## Where hooks fit in the submit lifecycle

When a button fires a signal, the engine runs this sequence inside a single `SubmitWorkflowAction` handler invocation:

1. Validate payload and access gate
2. **Pre-hook** (if declared for this signal)
3. Stage auto-unblocks from `blocked_by`, merge with pre-hook signals
4. Resolve and write action transitions via FSM
5. Write `form_data`
6. Recompute summary and group status
7. Write log event
8. Dispatch notifications
9. Fire group `on_complete` hooks (if any groups transitioned to `done`)
10. Fire tracker subscription (if workflow status changed)
11. **Post-hook** (if declared for this signal)
12. Return result

Pre-hooks run **before any engine writes**. Post-hooks run **after all writes and side effects**.

## Declaring hooks

Hooks are declared at the action root, keyed by button-surfaced signal name:

```yaml
type: qualify
kind: form
hooks:
  submit:
    pre: lead-onboarding-qualify-pre-submit # Lowdefy Api id
    post: lead-onboarding-qualify-post-submit
  approve:
    pre: lead-onboarding-qualify-pre-approve
  request_changes:
    post: lead-onboarding-qualify-post-request-changes
  # progress / not_required / resolve_error omitted — engine runs the default path
```

Both `pre:` and `post:` are optional per signal. Hook declarations are `hooks.{signal}.pre` and `hooks.{signal}.post`. Only button-surfaced signals can carry hooks — engine-internal signals (`unblock`, `internal_*`) have no hook-dispatch point.

**Hooks are internal-only APIs.** They have no HTTP entry point of their own. They are callable only via the engine's internal `context.callApi` from the submit endpoint. The submit endpoint's access check is the sole gate — if you can fire the signal, you can run its hooks.

Hook files typically live under `workflow_config/{workflow_type}/api/`:

```
workflow_config/
  onboarding/
    api/
      lead-onboarding-qualify-pre-submit.yaml
      lead-onboarding-qualify-post-submit.yaml
```

## Pre-hook contract

A pre-hook runs before any engine writes. It receives the full submit context:

```
workflow_id, workflow_type, action_id, action_type, current_key
signal         — the signal the user fired
form           — submitted form data
form_review    — submitted review form data
fields         — universal action fields (assignees, due_date, description)
current_status — the action's current stage (read-only; not the target)
user           — { id, profile, roles }
context:
  workflow     — full workflow doc before this submit's writes
  action       — full action doc before this submit's writes
```

A pre-hook may return:

```yaml
:return:
  actions: # optional — signals against other actions in this workflow
    - { type: send-quote, signal: unblock }
    - { type: upload-po, signal: not_required }
    - { type: site-visit, signal: activate, upsert: true } # spawn a new keyed instance
  event_overrides: # optional — merged over the engine's default log-event shape
    type: lead-qualified
    display:
      my-app: { title: Lead qualified }
    metadata:
      custom_field: value
  form_overrides: # optional — written to form_data alongside user's submission
    contact_name: Normalized Name
```

**The current action always lands per the signal the user fired.** A pre-hook cannot redirect the current action. It can emit signals against other actions via `actions[]`, or influence the current action through `event_overrides` and `form_overrides`. Conditional landing for the current submit is modelled as a separate thin action with its own button.

**Pre-hook `actions[]` entries take precedence** over engine-computed auto-unblocks. If both the engine and a pre-hook would emit `unblock` against the same action, the pre-hook signal wins.

### Aborting a submit from a pre-hook

Two abort modes:

- **`:reject`** — propagates as a user-facing rejection. The calling page surfaces the message via the platform's reject UI. Use for business-logic validation: "this account has insufficient credit."
- **`throw`** (any error) — classified as an infrastructure error. The user sees a transient error toast and can retry. Use for technical failures the user can't fix.

The engine catches neither. A thrown pre-hook aborts the submit; no engine writes happen.

## Post-hook contract

A post-hook runs after all engine writes and side effects. It receives the submit context plus the result:

```
workflow_id, workflow_type, action_id, action_type, current_key, signal
form, form_review, fields          — as submitted
result:
  action_ids                       — ids of all actions written in this call
  completed_groups                 — groups that transitioned to done
  event_id                         — the log event id
  tracker_fired                    — present when tracker subscription fired; null otherwise
    parent_action_id
    parent_workflow_id
    new_status
user, context                      — same as pre-hook; context reflects post-write state
```

A post-hook may return arbitrary data, surfaced as `post_hook_response` on the API return value. The page can read this to decide what to do next.

**Post-hooks cannot abort or rewrite engine writes** — those have already landed. Use cases: firing external integrations (Slack, CRM sync, CI trigger), follow-up writes the engine doesn't own, logging extra context.

### Out-of-band writes and failure modes

Post-hooks are the right place for writes that live outside the engine's lifecycle — updating a separate entity collection, calling a third-party API, sending a custom notification. These writes happen after the engine's committed writes, so:

- A post-hook failure does not roll back the engine's writes. The action transition is permanent; only the post-hook's side effects are missed.
- Post-hook failures are logged but don't surface to the user as a submission failure.
- Write post-hooks to be idempotent where possible. The engine's retry model assumes idempotency — a retried submission produces the same result, but the post-hook may have already run.

For writes that **must** happen atomically with the status transition, use a pre-hook and perform the writes there (before the engine writes anything). If the pre-hook throws, no engine writes happen. If the engine writes succeed but a follow-up pre-hook write fails, the submit is aborted and the user retries.

## `form_overrides` semantics

The pre-hook return's `form_overrides` is merged into the user's submitted form data before the engine writes `form_data`:

- Pre-hook wins on collision. If the user submitted `contact_name: "alice"` and the pre-hook returns `form_overrides: { contact_name: "Alice" }`, the workflow doc lands `contact_name = "Alice"`.
- `form_overrides` writes to the same flat namespace as user submission: `form_data.{action_type}.{field}` (or `.{key}.{field}` for instanced actions).
- There is no `form_overrides` on abort paths — `:reject` / `throw` propagate before the engine writes anything.

## How-to

For a step-by-step guide on writing a hook routine, see [Write a hook](../how-to/write-a-hook.md).
