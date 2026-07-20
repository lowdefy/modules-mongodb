---
title: Form Builder
module: form-builder
type: index
concepts: [dynamic page content, form builder, ai agent]
---

# Form Builder

Visual form builder for dynamic page content. App users build parts of a form — a workflow step, extra profile fields, a custom company section — as Lowdefy block config, stored in MongoDB (default collection `dynamic-elements`) and rendered back into consumer pages through Lowdefy's server-resolved `Dynamic` block. A per-block AI assistant (ClaudeAgent) helps model the long tail of config — operators, validation, events — conversationally; one conversation thread per (element, block) is persisted to `dynamic-element-conversations`. The assistant verifies block properties against the official Lowdefy documentation (fetched at `docs.base_url`) before writing config.

## Dependencies

| Module                       | Why                              |
| ---------------------------- | -------------------------------- |
| [layout](../layout/index.md) | Page wrapper                     |
| [events](../events/index.md) | `change_stamp` audit metadata    |

## When to use

Add `form-builder` when app users (not developers) need to customize part of a form without a deploy. Declare each editable target as an entry in the `elements` var; users build it on the module's `edit` page, and consumer pages render the result with the `dynamic-element` component.

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: form-builder
    source: "github:lowdefy/modules-mongodb/modules/form-builder@v0.9.2"
    vars:
      elements:
        - id: profile-fields
          title: Profile Fields
          description: Extra fields shown on the user profile page.
```

Defaults work out of the box. To reuse an existing AI Gateway connection, remap `ai-gateway` via the entry's `connections` mapping.

## Consuming a built element

Embed the `dynamic-element` component where the built config should render:

```yaml
- _ref:
    module: form-builder
    component: dynamic-element
    vars:
      id: profile_custom
      elementId: profile-fields
      types:
        blocks: [TextInput, Selector, Box]
      fallback: [] # optional blocks rendered if resolution fails
```

> **`types` is your bundle cost.** Dynamic content can only use block, action, and operator types present in the consumer page's client bundle. The `types` var declares what the element may use so the build includes those types — every type listed lands in your client bundle, so list what the element needs, no more. When `types` is omitted, the component falls back to the module's `palette` var.

Resolved content may not define `requests:`, and block ids share the host page's namespace.

## Secrets

| Name                 | Used for                                        |
| -------------------- | ----------------------------------------------- |
| `MONGODB_URI`        | Elements and conversations collections          |
| `AI_GATEWAY_API_KEY` | The builder agent's Vercel AI Gateway connection |

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Change stamps](../shared/change-stamps.md) — audit metadata stamped on writes
- [Secrets](../shared/secrets.md) — `MONGODB_URI` and other connection secrets
