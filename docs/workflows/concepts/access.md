---
title: Access
module: workflows
type: concept
concepts:
  [access, verbs, roles, per-app, review, request-changes, visible-verbs]
---

# Workflows — Access

The workflows module gates every user interaction at three checkpoints: build time, query time, and submit time. The access model is **per-app, per-verb** — each app names its own role gates for each interaction type independently.

## The `access` block

Every action declares an `access:` block:

```yaml
access:
  my-team-app:
    view: true # any authenticated user of my-team-app
    edit: [account-manager, account-rep] # role-gated
    review: [account-manager] # reviewer role only
  my-customer-app:
    view: [customer-lead] # customers can view but not interact
  # any other app → action invisible there
```

Each key under `access:` is an app name. Under each app name, the keys are **verbs**.

## Verbs

Four verbs exist, each with independent meaning:

| Verb     | Effect                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `view`   | Shows the action in the `actions-on-entity` component; renders read-only detail pages                                                         |
| `edit`   | Renders the submit form — form-action `-edit` page, or the `{workflow_type}-check` page in edit mode for check actions                        |
| `review` | Renders the review page — form-action `-review` page, or the `{workflow_type}-check` page in review mode. Ships `approve` / `request_changes` buttons |
| `error`  | Renders the recovery page for form actions in `error` state                                                                                   |

**Verbs are independent.** Granting `edit` does not grant `view`. An author who wants "everyone can see, only managers edit" writes both:

```yaml
my-app:
  view: true
  edit: [manager]
```

A missing verb key means no access to that verb in that app. The build emits a lint warning (not an error) when `edit`, `review`, or `error` is declared without `view`, since the common case is a forgotten read gate.

## Gate values

Each verb's value is either `true` (any authenticated user of that app) or a non-empty array of role strings:

```yaml
edit: true                          # any user
edit: [account-manager]             # single role
edit: [account-manager, ops-lead]   # role OR (intersection is non-empty)
```

Roles are checked against `_user.apps.{app_name}.roles` — that app's role list, never another app's. Cross-app role names don't interfere.

An empty array `[]` is invalid — omit the verb key instead.

## Three enforcement checkpoints

**1. Build time.** `makeActionPages` emits a page only when the verb key is present in `access.{host_app_name}`. Presence is the gate — role values are irrelevant at build time. A verb absent from the config has no page in that app.

**2. Query time.** `get-entity-workflows` evaluates every declared verb's gate against the caller's roles and returns the server-resolved `allowed` bag (`{ view, edit, review, error }`) on each action. If all four are `false`, the action is dropped from the response — invisible to that user. Page links rendered by `actions-on-entity` read these booleans to decide which links to show.

**3. Submit time.** `SubmitWorkflowAction` re-checks the required verb for the fired signal before writing anything. This is the authoritative gate — a role revoked between page load and submit is caught here.

The signal-to-verb mapping:

| Signal                               | Required verb |
| ------------------------------------ | ------------- |
| `submit`, `progress`, `not_required` | `edit`        |
| `approve`, `request_changes`         | `review`      |
| `resolve_error`                      | `error`       |

## The review-verb signal flip

**The `review` verb controls whether `submit` lands at `in-review` or `done`.** This is the most important consequence of the `review` verb's presence:

```yaml
# No review verb → submit always lands at done
my-app:
  view: true
  edit: [account-manager]

# review verb present → submit lands at in-review
my-app:
  view: true
  edit: [account-manager]
  review: [account-manager]
```

This is **action-global, not caller-specific**: if any app's `access` block declares `review`, every `submit` from every app routes to `in-review`. The action is either a review action or it isn't — there's no per-caller flip.

To add a review step to an action, declare `review:` in the access map — see [Add a review step](../how-to/add-a-review-step.md). To remove a review step, remove the `review` key. No other config change is needed.

## `request_changes` — a broad gate

`request_changes` passes on `view`, `edit`, **or** `review`:

```text
# interaction → accepted verbs
submit       → edit
not_required → edit
resolve_error → error
approve       → review
request_changes → view OR edit OR review   ← broad
```

`review` gates the reviewer's **judgement** (approve or reject). `request_changes` is "flag a problem, send it back" — anyone who can see or work on the action can do this. The `request_changes` button on the view template is opt-in (hidden by default) but unlocked for anyone with `view`.

## Multi-app access

One action YAML can serve multiple apps with different gates:

```yaml
access:
  my-team-app:
    view: true
    edit: [account-manager]
    review: [account-manager]
  my-customer-app:
    view: [customer-lead] # customers can only view
    edit: [customer-admin] # customer admins can submit
    # no review verb → submit lands at done for customer-admin
```

Role lists are evaluated per-app. `account-manager` in `my-team-app` is completely independent of `customer-admin` in `my-customer-app`.

For a step-by-step guide on multi-app configs, see [Multi-app access](../how-to/multi-app-access.md).

## `notification_roles`

Recipients for engine-emitted notifications live at the action root, outside the `access` block:

```yaml
notification_roles:
  - account-manager
  - ops-lead
```

`notification_roles` is a fan-out config, not an access decision — recipients need not have any verb access to the action. Keeping it separate from `access:` preserves the clean shape of the per-app verb-gate map.
