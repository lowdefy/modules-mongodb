---
title: Write a Hook
module: workflows
type: how-to
concepts: [hooks, pre-hook, post-hook, submit-pipeline, form-overrides, event-overrides]
---

# Write a hook

**Goal:** Run custom logic at a fixed point in an action's submit lifecycle — before engine writes (pre-hook) or after all writes and side effects (post-hook).

**Prerequisites:** An existing `kind: form` or `kind: check` action. Read [Hooks](../concepts/hooks.md) for the conceptual model before writing routines.

## When to use which phase

| Use pre-hook when… | Use post-hook when… |
|---|---|
| You need to validate and potentially abort the submit | You need to fire external integrations (Slack, CRM sync) |
| You need to spawn/signal other actions in this workflow | You need to copy data to another entity after the action commits |
| You need to normalize form data before it is written | You need to use `result.event_id` or `result.action_ids` |
| The write must happen atomically with the status transition | The write can tolerate being missed on retry |

Pre-hook failures abort the submit — no engine writes happen. Post-hook failures do not roll back engine writes; the action transition is permanent. Write post-hooks to be idempotent.

## Steps

### 1. Declare the hook in the action YAML

Hooks are declared at the action root, keyed by signal name. Each hook has optional `pre:` and `post:` phases. The phase value is either an inline `routine:` block or a reference to an external API file.

**Inline routine (recommended for simple hooks):**

The `qualify` action in the demo uses an inline pre-hook:

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

**External API file (recommended for complex hooks):**

```yaml
hooks:
  submit:
    pre: onboarding-qualify-pre-submit    # Lowdefy Api id
    post: onboarding-qualify-post-submit
```

Hook files typically live under `workflow_config/{workflow_type}/api/`:

```
workflow_config/
  onboarding/
    api/
      onboarding-qualify-pre-submit.yaml
      onboarding-qualify-post-submit.yaml
```

### 2. Write a pre-hook routine

A pre-hook receives the full submit context via `_payload`. Read form data at `_payload: form.{field}` (where `form.` is the `key` prefix used in the form block). Read workflow context at `_payload: context.workflow`:

```yaml
# onboarding/api/onboarding-billing-details-post-submit.yaml
# (from billing-details.yaml's submit post-hook)
id: update_company_billing
routine:
  - id: update_company_billing
    type: MongoDBUpdateOne
    connectionId:
      _module.connectionId:
        id: companies-collection
        module: companies
    properties:
      filter:
        _id:
          _payload: context.workflow.entity_id
      update:
        $set:
          billing.email:
            _payload: form.billing_email
          billing.vat_number:
            _payload: form.vat_number
          updated:
            _ref:
              module: events
              component: change_stamp
  - :return:
      company_id:
        _payload: context.workflow.entity_id
```

This is the `billing-details` action's inline post-hook from the `company-setup` workflow. It writes form data to the company entity doc after the action commits.

**Full pre-hook payload fields:**

```
workflow_id, workflow_type, action_id, action_type, current_key
signal
form              — submitted form data (keys without the form. prefix)
form_review       — submitted review form data
fields            — universal action fields (assignees, due_date, description)
current_status
user              — { id, profile, roles }
context:
  workflow        — full workflow doc before this submit's writes
  action          — full action doc before this submit's writes
```

### 3. Return from a pre-hook

A pre-hook's `:return:` can carry three optional keys:

```yaml
:return:
  actions:                           # signal other actions in this workflow
    - type: send-quote
      signal: unblock                # fire unblock against a blocked action
    - type: site-visit
      signal: activate
      upsert: true                   # spawn if not yet exists
  form_overrides:                    # merge into form_data (pre-hook wins on collision)
    contact_name: Normalized Name
  event_overrides:                   # merge into the default log-event shape
    type: lead-qualified
    display:
      my-app:
        title: Lead qualified
```

All keys are optional. A pre-hook can return nothing. A pre-hook **cannot re-signal the current action** — the current action always lands per the signal the user fired.

### 4. Abort from a pre-hook

Two abort modes:

- **`:reject`** — user-facing rejection. Use for business-logic validation.
- **`throw` (any error)** — infrastructure error; user sees a retry toast.

```yaml
routine:
  - id: check_credit
    type: MongoDBFindOne
    connectionId: accounts-collection
    properties:
      filter:
        _id:
          _payload: context.workflow.entity_id
  - :reject:
      skip:
        _gt:
          - _step: check_credit.credit_balance
          - 0
      message: Insufficient credit to proceed.
```

On `:reject`, no engine writes happen and the page surfaces the rejection message.

### 5. Write a post-hook routine

A post-hook runs after all engine writes. It receives the same context as the pre-hook plus the `result`:

```
result:
  action_ids        — ids of all actions written in this call
  completed_groups  — groups that transitioned to done
  event_id          — the log event id
  tracker_fired     — present when tracker subscription fired; null otherwise
```

Post-hook return value is surfaced as `post_hook_response` on the API return — the page can read it to navigate or show a message.

**Post-hook failures do not roll back engine writes.** If a post-hook throws, the action transition has already landed. Write post-hooks to be idempotent.

### 6. Declare hooks for other signals

You can attach pre/post hooks to any button-surfaced signal:

```yaml
hooks:
  submit:
    pre:
      routine: [...]
  approve:
    post:
      routine: [...]
  request_changes:
    post:
      routine: [...]
```

Valid signal keys: `submit`, `progress`, `not_required`, `resolve_error`, `approve`, `request_changes`. Engine-internal signals (`unblock`, `activate`, `block`, `internal_*`) have no hook-dispatch point.

### 7. Verify the hook runs via the build

Run `pnpm ldf:b` from `apps/demo`. Inline `routine:` hooks are emitted as `InternalApi` endpoints by the resolver: `{workflow_type}-{action_type}-{signal}-{phase}`. Check the build output for these endpoint names. External API-file hooks must be registered in `lowdefy.yaml` (`apis:` section) as with any other API endpoint.

## See also

- [Hooks](../concepts/hooks.md) — full conceptual explanation: pre vs post, the submit lifecycle sequence, abort modes, `form_overrides`, and out-of-band write failure modes.
- [Conditional actions](conditional-actions.md) — using pre-hook `upsert: true` to spawn conditional actions.
- [Signals vs status](../concepts/signals-vs-status.md) — why pre-hooks use `signal:` not `status:`.
- [Authoring grammar](../reference/authoring-grammar.md) — pre-hook `:return:` shape and signal key reference.
- [Exports](../reference/exports.md) — resolver-emitted hook endpoint naming (`{workflow_type}-{action_type}-{signal}-{phase}`).
