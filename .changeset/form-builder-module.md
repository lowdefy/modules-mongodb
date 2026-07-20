---
"@lowdefy/modules-mongodb-form-builder": minor
"@lowdefy/modules-mongodb-plugins": minor
---

Add the `form-builder` module: a visual, drag-and-drop editor for building parts
of an app's forms — a workflow step, extra profile fields, a custom section —
as Lowdefy block config. Built forms are stored in a MongoDB collection
(default `dynamic-elements`) and rendered back into consumer pages through
Lowdefy's server-resolved `Dynamic` block via the module's exported
`dynamic-element` component.

- New `FormBuilder` block in `@lowdefy/modules-mongodb-plugins`: a palette of
  curated `blocks-antd`/`blocks-basic` block types, a canvas that renders the
  real block components (including drag-and-drop into container slots and
  Tabs/Collapse's dynamic per-tab/per-panel slots), and a YAML editor for the
  selected block. Operator-valued properties preview live against mock
  `state`/`requests`/`global`/`user`/`url_query` inputs. Container types that
  crash without seed data (Tabs, Collapse) get safe default properties on
  drop and at render time.
- A per-block AI assistant (`AgentChat`, via a Vercel AI Gateway
  `AIGatewayAgent`) helps model a block's full config — properties, operators,
  validation, events — conversationally, scoped to only the selected block's
  own fields unless the user asks for more. It calls a `get-block-docs` tool
  to verify property names and shapes against the official Lowdefy
  documentation before writing config. One conversation thread per
  (element, block) is persisted to `dynamic-element-conversations`.
- Requires lowdefy `0.0.0-experimental-20260710121634` or later (server-resolved
  Dynamic page content). See `docs/form-builder/index.md` and
  `designs/form-builder/design.md`.
