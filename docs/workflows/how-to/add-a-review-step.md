---
title: Add a Review Step to an Action
module: workflows
type: how-to
concepts: [review, access, verbs, signals]
---

# Add a review step to an action

**Goal:** Make an action's submit land at `in-review` (awaiting approval) instead of going straight to `done`.

**Prerequisites:** An existing `kind: form` or `kind: check` action with an `access:` block. The `review` verb is available on both kinds.

## How it works

Whether `submit` lands at `in-review` or `done` is controlled by a single field in the action config: the presence of `review:` in at least one app's `access` block. This is action-global — if any app declares `review`, every `submit` from every app lands at `in-review`. See [Signals vs status](../concepts/signals-vs-status.md) for why the engine uses signals rather than direct status targets.

## Steps

### 1. Add the `review` verb to the action's access block

Open the action YAML and add `review:` under the relevant app entry. The value is either `true` (any authenticated user of that app) or a list of role strings.

The `send-quote` action in the demo's `onboarding` workflow adds a reviewer gate:

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
      - admin        # ← add this; roles that may approve the quote
form:
  - key: form.quote_total
    component: number
    title: Quote total
    required: true
  - key: form.notes
    component: text_area
    title: Quote notes
```

`review` and `edit` are independent — granting `review` does not grant `edit`. An author who wants "everyone submits, only managers review" needs both:

```yaml
my-app:
  view: true
  edit: true          # submitters
  review: [manager]  # reviewers
```

### 2. Add per-app reviewer roles (if role-gated)

Reviewer roles are strings checked against `_user.apps.{app_name}.roles`. The role names are app-local — `admin` in one app does not conflict with `admin` in another.

### 3. Verify `status_map` covers the new states

Once `review` is declared, actions can reach `in-review` and `changes-required`. Add copy for these states so users see meaningful messages in the action card:

```yaml
status_map:
  action-required:
    demo:
      message: Build and send the quote.
  in-review:
    demo:
      message: Quote awaiting approval.        # ← add
  changes-required:
    demo:
      message: Reviewer requested changes.     # ← add
  done:
    demo:
      message: Quote approved and sent.
```

### 4. (Optional) Add `form_review:` fields for reviewer input

If the reviewer needs to supply structured data alongside their decision, add a `form_review:` block to the action. The review page renders the submitter's `form:` values read-only above, then `form_review:` as writable inputs below. Reviewer fields land in the same flat `form_data.{action_type}` namespace — choose field names that do not collide with `form:` keys.

```yaml
form_review:
  - key: form.reviewer_notes
    component: text_area
    title: Reviewer notes
```

### 5. Rebuild and verify

Run `pnpm ldf:b` from `apps/demo` to confirm the config compiles. The module emits a `-review` page only when the `review` verb is present — the page did not exist before this change. Check the build output for the `{workflow_type}-{action_type}-review` page.

## What changes at runtime

| Event | Before (no `review`) | After (with `review`) |
|---|---|---|
| User clicks Submit | Action → `done` | Action → `in-review` |
| Reviewer clicks Approve | — | Action → `done` |
| Reviewer clicks Request Changes | — | Action → `changes-required` |
| User resubmits after changes-required | — | Action → `in-review` again |

## To remove a review step

Remove the `review:` key from the access block. The `-review` page is no longer emitted. All future submits will land at `done` directly.

## See also

- [Access](../concepts/access.md) — full verb model, the signal-to-verb mapping, and the three enforcement checkpoints.
- [Signals vs status](../concepts/signals-vs-status.md) — why `submit` targets `in-review` vs `done` based on config.
- [FSM and signals](../reference/fsm-and-signals.md) — the complete signal table showing all `in-review` and `changes-required` transitions.
- [Authoring grammar](../reference/authoring-grammar.md) — `access:` field reference.
