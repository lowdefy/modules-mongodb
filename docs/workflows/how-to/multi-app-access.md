---
title: Configure Multi-App Access
module: workflows
type: how-to
concepts: [access, verbs, roles, per-app, multi-app]
---

# Configure multi-app access

**Goal:** Grant different verbs and role gates to different apps on the same action — for example, a team-facing app where managers submit and approve, and a customer-facing app where customers can only view.

**Prerequisites:** An action YAML with an `access:` block. Basic familiarity with [Access](../concepts/access.md).

## How multi-app access works

One action YAML can declare access for any number of apps. Each key under `access:` is an app name. The `app_name` var on each module entry determines which key the engine reads for build-time page emission and runtime gate evaluation.

Role names are fully scoped to each app: `admin` in `team-app` is completely independent of `admin` in `customer-app`. See [Access](../concepts/access.md) for the full three-checkpoint enforcement model.

## Steps

### 1. Add a second app entry under `access:`

Open the action YAML and add a new key under `access:` for the second app. Each app's entry is a flat map of verb → gate:

```yaml
type: send-quote
kind: form
action_group: quoting
blocked_by:
  - qualify
access:
  demo:                         # existing team app
    view: true
    edit: true
    review:
      - admin
  customer-portal:              # ← add this
    view: true                  # customers can view the quote status
    edit:
      - customer-admin          # only customer admins can submit (e.g. accept quote)
    # no review verb → customer-admin's submit lands at done directly
```

In the demo's `send-quote.yaml`:

```yaml
# onboarding/send-quote.yaml
type: send-quote
kind: form
action_group: quoting
blocked_by:
  - qualify
access:
  demo:
    view: true
    edit: true
    review:
      - admin
```

### 2. Decide the review verb per app independently

**The `review` verb is action-global** — if any app declares `review`, every `submit` from every app routes to `in-review`. This is deliberate: one action doc is shared across all apps. You cannot have `submit → in-review` for one app and `submit → done` for another on the same action.

If you need two different submission paths, model them as two separate actions. To remove the review requirement entirely, remove `review:` from every app's entry.

### 3. Control page emission per app

Pages are emitted **per app at build time**. The `app_name` var on the module entry determines which access keys apply. A page is emitted only when its verb is present in `access.{host_app_name}`:

- `team-app` with `edit: true, view: true, review: [admin]` → emits `-edit`, `-view`, `-review` pages.
- `customer-portal` with `view: true, edit: [customer-admin]` → emits `-view`, `-edit` pages; no `-review`.

### 4. Verify status_map covers both apps

Each app key in `status_map` provides the message string shown in that app's action card. Add copy for each app independently:

```yaml
status_map:
  action-required:
    demo:
      message: Build and send the quote.
    customer-portal:
      message: Your quote is being prepared.
  in-review:
    demo:
      message: Quote awaiting approval.
    customer-portal:
      message: Quote under review.
  done:
    demo:
      message: Quote approved and sent.
    customer-portal:
      message: Quote accepted.
```

A missing app key in `status_map` is not an error — the action card simply shows no message for that status in that app.

### 5. Set `notification_roles` for cross-app notifications (optional)

`notification_roles` lives at the action root, outside `access:`, and is a flat list of role strings. Recipients need not have verb access — it is a fan-out config, not an access decision:

```yaml
notification_roles:
  - account-manager
  - ops-lead
```

Role names in `notification_roles` are resolved by the notifications module's `send_routine` var.

### 6. Check-action multi-app access

Multi-app access works identically for `kind: check` actions. Check actions use the shared `workflow-action-*` pages (addressed by `?action_id=`). The engine evaluates the caller's app against `access.{app_name}` at submit time:

```yaml
type: assign-account-manager
kind: check
action_group: setup
access:
  demo:
    view: true
    edit: true
  admin-panel:
    view: true
    edit:
      - ops-admin
```

## Summary

| Scenario | Config |
|---|---|
| Second app view-only | Add app entry with `view: true`; omit `edit` and `review` |
| Second app submits to `done` | Add `edit:`; omit `review:` on all apps |
| Second app submits to `in-review` | The action already has `review:` declared — it applies globally |
| Second app needs different reviewer | Not supported on one action — use two actions |

## See also

- [Access](../concepts/access.md) — full verb model, the three enforcement checkpoints, gate values, `request_changes` broad gate, and `notification_roles`.
- [Authoring grammar](../reference/authoring-grammar.md) — `access:` and `status_map:` field reference.
- [Add a review step](add-a-review-step.md) — adding the `review` verb for the first time.
