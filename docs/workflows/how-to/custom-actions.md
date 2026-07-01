---
title: Build a Custom Action
module: workflows
type: how-to
concepts: [custom, action-kinds, app-owned-page, link-cell, sentinels, submit]
---

# Build a custom action

**Goal:** Drive a workflow step whose working surface is a page your app already owns — a domain document editor, a multi-screen wizard, a bespoke builder — instead of the module's shared check page or a flat `form:` block.

A `kind: custom` action is a [check action](../concepts/action-kinds.md) in every respect — same eight-status lifecycle, same nullary submit signals, same `fields:` channel, same per-workflow `{workflow_type}-submit` endpoint, same `blocked_by` / group rollup / tracker fan-up — with **one** difference: **you own the working page, and you author the navigation link.** The engine routes the link you write in `status_map` onto the action card, so a user who can act lands on your app page, while an observer falls back to a read-only status page.

Use `custom` when the per-action UX is dictated by an existing app page that doesn't fit the shared check page and shouldn't be forced into a `form:` block. For a lightweight task (assignees + due date + comment) use `check` instead.

## 1. Declare the action

`kind: custom` takes no `form:` or `tracker:` block (it rejects both). It takes the same `access`, `blocked_by`, `action_group`, `hooks:`, and `event:` as a check action. The new piece is a `link:` cell on each working stage of `status_map`:

```yaml
type: review-document
kind: custom
action_group: review
blocked_by: [collect-requirements]
access:
  my-team-app:
    view: true
    edit: [account-manager]
    review: [account-manager]
status_map:
  blocked:
    my-team-app: { message: Awaiting requirements. }
  action-required:
    my-team-app:
      message: Review the contract document.
      link: # the working page — routed to the `edit` slot at this stage
        pageId: contract-review # an app-owned page id (not a module page)
        urlQuery: { action_id: true } # sentinel → substituted with the action _id
      view_link: # optional in-flight observer page; omit to fall back to the shared status page
        pageId: contract-view
        urlQuery: { action_id: true }
  in-review:
    my-team-app: { message: In review. } # no link → observers get the shared status page
  done:
    my-team-app:
      message: Document approved.
      link: # view-only stage → routed to the `view` slot
        pageId: contract-view
        urlQuery: { action_id: true }
```

### How links route into slots

The engine routes the working `link` into the stage's **active working verb slot**, and `view_link` (or, absent it, the shared `{workflow_type}-action` page) into the `view` slot:

| Stage                                            | Working `link` lands in | `view` slot                                 |
| ------------------------------------------------ | ----------------------- | ------------------------------------------- |
| `action-required` / `in-progress` / `changes-required` | `edit`                  | `view_link` or shared `{workflow_type}-action` |
| `in-review`                                      | `review`                | `view_link` or shared `{workflow_type}-action` |
| `error`                                          | `error`                 | `view_link` or shared `{workflow_type}-action` |
| `done`                                           | `view` (no working verb) | the working `link` itself                  |
| `blocked` / `not-required`                       | (none — message-only)   | (none)                                      |

A user who holds the stage's working verb (e.g. `edit`) gets your app page; everyone else with `view` gets the read-only fallback. You never have to author the observer page — omit `view_link` and the shared `{workflow_type}-action` page covers it. At `done` the working `link` is the canonical closed-action destination, so it claims the `view` slot.

### Sentinels

In `urlQuery`, two reserved keys are **sentinels** that the engine substitutes per action at render time:

- `action_id: true` → the concrete action `_id`
- `entity_id: true` → the action's entity id

Every other `urlQuery` key must carry a static string, passed through verbatim. The `link.pageId` is a free-form app page id — it is **not** build-validated against your app's page tree, so a typo surfaces as a click-time 404.

## 2. Build the app page

Your page reads `?action_id=<id>` (the substituted sentinel), loads the action, lets the user do the work, and on save advances the workflow by calling the module's submit endpoint. Load the action with the module's `get_workflow_action` request — the same request the shared `{workflow_type}-action` page uses — keyed on the `action_id` query.

On submit, the recommended path is two requests: your domain write, then the module's `{workflow_type}-submit` endpoint with the action id and a nullary signal:

```yaml
# inside the app page's save event
- id: save_contract
  type: Request
  requestId: update_contract # your app-owned domain write

- id: submit_review
  type: CallApi
  params:
    endpointId:
      _module.endpointId: { id: account-review-submit, module: workflows }
    payload:
      action_id: { _url_query: action_id }
      signal: approve # or: submit, request_changes, not_required, …
      fields: # universal-fields update channel (same as check)
        description: { _state: review_summary }
      comment: { _state: review_note }
```

Submit through the **module's `{workflow_type}-submit` endpoint** (not a hand-rolled write): it carries the baked-in `render_config` that re-renders your `link:` / `message` cell onto the action doc, runs any declared `hooks:` / `event:` overrides, and resolves the target stage through the same FSM a check action uses. Compose whatever buttons your page needs; each calls the endpoint with a different nullary `signal`.

### Atomicity

The domain write and the workflow write above are two separate requests and are **not** atomic — the same posture as a check action whose pre-hook writes the entity. If they must be atomic-ish, move the domain write into a **`hooks.submit.pre`** routine on the custom action; the engine runs it inside the submit handler's flow, before the status commit.

## What you still get for free

Everything a check action gives you keeps working: the status array and FSM, `blocked_by` fan-out, group-status rollup, `required_after_close`, the independent `{workflow_type}-update-fields` endpoint, tracker fan-up to a parent, log events and notifications, and the action card on the overview pages. The only thing `custom` changes is that the card links to **your** page for a user who can act.
