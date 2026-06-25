---
title: Use Instanced Actions
module: workflows
type: how-to
concepts: [instanced-actions, form-data, key, upsert, blocked-by]
---

# Use instanced actions

**Goal:** Create N instances of the same action type within one workflow — each with its own form data, status, and lifecycle — for example, one proof-of-delivery action per item in an order, each with its own file upload and sign-off.

**Prerequisites:** Understanding of [Action kinds](../concepts/action-kinds.md) — the instanced actions section. Familiarity with pre-hooks and the `upsert: true` spawn pattern from [Hooks](../concepts/hooks.md).

## What instanced actions are

A standard action has one doc per workflow: one `upload-po` action per `onboarding` workflow. An instanced action has a `key:` field — a symbolic placeholder resolved at spawn time — and can have multiple docs per workflow, one per distinct key value.

The `key:` value is the instance discriminator. It is part of the action doc's identity and changes where form data is stored.

**Note:** The demo workflows (`onboarding`, `company-setup`) do not include an instanced action. The grammar below is drawn from the authoring spec (`designs/workflows-module-concept/action-authoring/spec.md`) and from the [Action kinds](../concepts/action-kinds.md) concept page. The patterns are verified against the module's authoring grammar — not invented.

## Form data path change

This is the most important consequence of `key:`. For a standard action, form fields are written to:

```
form_data.{action_type}.{field}
```

For an instanced action with a key, they are written to:

```
form_data.{action_type}.{key}.{field}
```

If you read form data from a pre-hook or post-hook (via `_payload: form.{field}`), the path is the same — hooks receive the submitted form data directly. But if a post-hook reads back from the workflow doc (e.g., `_payload: context.workflow.form_data.proof-of-delivery.device-123.installation_files`), account for the extra key segment.

## Steps

### 1. Declare the action with a `key:` placeholder

The `key:` value in the action config is a symbolic placeholder. Use a `$` prefix by convention to signal it is resolved at spawn time, not a literal string:

```yaml
# workflow_config/installation/proof-of-delivery.yaml
type: proof-of-delivery
kind: form
key: $device_id        # symbolic — resolved to an actual key at spawn time
action_group: delivery
description: Capture proof of delivery for one device.
access:
  my-app:
    view: true
    edit: true
form:
  - key: form.installation_files
    component: file_upload
    title: Installation files
    required: true
  - key: form.notes
    component: text_area
    title: Delivery notes
status_map:
  action-required:
    my-app:
      message: Upload proof of delivery.
  done:
    my-app:
      message: Proof of delivery uploaded.
```

### 2. Do NOT list instanced actions in `starting_actions`

Instanced actions are always spawned by pre-hooks, never seeded at workflow start:

```yaml
starting_actions:
  - type: schedule-delivery
    status: action-required
  # proof-of-delivery is absent — instanced; spawned by the
  # schedule-delivery pre-submit hook with one entry per device.
```

### 3. Spawn instances from a pre-hook

In the spawning action's pre-hook, return one `upsert: true` entry per instance. The `key:` value is the runtime discriminator — a device ID, line-item ID, or any unique slug for that instance:

```yaml
# schedule-delivery.yaml
hooks:
  submit:
    pre:
      routine:
        - :return:
            actions:
              _array.map:
                - _payload: form.device_ids   # array of device ids from the form
                - _function:
                    args: [device_id]
                    body:
                      type: proof-of-delivery
                      key:
                        _var: device_id
                      signal: activate
                      upsert: true
```

The engine resolves `(none, activate) → action-required` via the FSM `none` creation row for each spawned instance. Each instance gets its own action doc with a distinct `(type, key)` pair.

Alternatively, pass `fields` to seed initial data onto each spawned instance:

```yaml
- type: proof-of-delivery
  key: device-123
  signal: activate
  upsert: true
  fields:
    description: Deliver to site A
```

### 4. Read per-instance form data in a post-hook

A post-hook receives the submitted fields directly under `_payload: form.{field}` — no key segment needed there. To read back from the workflow doc (e.g., to copy a field to an entity), account for the key segment:

```yaml
# post-hook for proof-of-delivery
- id: update_device_delivery
  type: MongoDBUpdateOne
  connectionId: devices-collection
  properties:
    filter:
      _id:
        _payload: context.action.key    # the instance's key = device id
    update:
      $set:
        delivery_confirmed: true
        delivery_notes:
          _payload: form.notes          # direct from payload — no key needed
```

### 5. Blocking on instanced actions

**A non-instanced action that references an instanced action type in `blocked_by` unblocks when all instances reach a terminal status** (`done` or `not-required`). The engine counts outstanding instances — if any remain non-terminal, the dependent stays blocked:

```yaml
# close-delivery.yaml
type: close-delivery
kind: check
blocked_by:
  - proof-of-delivery   # unblocks only when ALL proof-of-delivery instances are terminal
```

This is valid. Unlike the [conditional-action anti-pattern](conditional-actions.md), instanced actions are always seeded at spawn time with a known count — the engine has docs to count.

Do not mix this with conditional instances: if a later pre-hook could spawn additional instances, the `blocked_by` entry re-evaluation picks those up automatically.

### 6. Verify the form data path in downstream reads

When any downstream logic (hook, API, analytics) reads form data from the workflow doc for an instanced action, the path must include the key:

| Context | Path |
|---|---|
| Pre/post hook submitted data | `_payload: form.{field}` — no key |
| Reading from workflow doc | `form_data.{action_type}.{key}.{field}` |
| `_payload: context.workflow.form_data...` | Include key segment |

## See also

- [Action kinds](../concepts/action-kinds.md) — full instanced action grammar, `key:` semantics, `blocked_by` for instanced types, and form data path details.
- [Hooks](../concepts/hooks.md) — `upsert: true`, the pre-hook `:return:` shape, and `fields` seeding.
- [Conditional actions](conditional-actions.md) — the related pattern for actions spawned by runtime conditions (not quantity).
- [FSM and signals](../reference/fsm-and-signals.md) — the `none` creation row and `activate` signal.
- [Authoring grammar](../reference/authoring-grammar.md) — pre-hook `:return:` shape reference with `key`, `upsert`, and `fields`.
