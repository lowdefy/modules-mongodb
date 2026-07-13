# Form Builder Module

**Scope:** A drop-in `form-builder` module that lets app users visually build parts of a form (a workflow step, a section of a company form, profile fields, …) as Lowdefy block config, stored in a MongoDB collection (default `dynamic-elements`), and served back into apps through Lowdefy's server-resolved **Dynamic page content** feature. Includes a per-block AI agent chat (AIGatewayAgent via Vercel AI Gateway, Sonnet) so users can model a block's full config — operators included — conversationally.

**Lowdefy dependency:** `0.0.0-experimental-20260710121634` (vite-hono generation; first experimental with Dynamic page content, PR #2235). The demo app and plugin peer deps currently pin `0.0.0-experimental-20260611102401` and must be bumped.

## Problem

Many apps need users (not developers) to customize *part* of a form — a step in a workflow, extra fields on a company or profile page — without a deploy. Lowdefy's new `Dynamic` block resolves block config per request from an API endpoint, so config stored in MongoDB can render inside any page. What is missing is an easy, user-facing way to *produce* that config: a visual builder with drag-and-drop blocks, a property inspector, live preview with realistic data, and an AI assistant for the long tail of config (operators, events, validation) that no form UI can cover.

## Verified platform contracts (research summary)

These were verified against the lowdefy repo at the experimental release commit; file pointers for the implementer.

**Dynamic page content** (`packages/docs/concepts/dynamic-page-content.md`, `packages/api/src/routes/page/dynamic/resolveDynamicContent.js`):

- There is **no built-in "dynamic-elements" storage** in Lowdefy. The `Dynamic` block (`@lowdefy/blocks-basic`) has properties `endpointId` (required), `params` (static only — operators are a build error), `required`, and `types` (block/action/operator type names the dynamic content may use, so they land in the client bundle). Slot `fallback` renders on resolution failure when `required != true`.
- The endpoint routine is invoked in-process on **every navigation** with payload `{ blockId, pageId, params, urlQuery }` and must `:return { blocks: [...] }` in **authored YAML shape** (`id`/`type`/`properties`/`events`/`blocks`). The server runs the returned config through the normal `buildBlock` pipeline (`@lowdefy/build/dynamic`), so `blocks:` shorthand is fine.
- **Operator semantics:** operators written literally in the routine YAML evaluate server-side at `:return`. Operators inside *data loaded from MongoDB* are not touched server-side (data is not config) — they reach the client and evaluate against page state as usual. We therefore **store authored config with operators unescaped** (`_state`, not `__state`).
- Resolved content may **not** define `requests:`. `Request` actions may only reference requests statically defined on the host page; `CallAPI` actions are allowed. Block `id`s share the host page's namespace.

**Agents** (`code-docs/architecture/agent-system.md`, `packages/utils/ai-utils/`): built into core (no plugin entry). Top-level `agents:` list; type `ClaudeAgent` with `connectionId` → an `Anthropic` connection (`apiKey: {_secret: ANTHROPIC_API_KEY}`). Tools are ordinary API endpoints with `description` + `payloadSchema`. `stopOnToolCall: <tool-name>` halts the loop and hands that tool call's input straight to the client (`onToolCall` event) — the mechanism for "chat returns a block config". `onFinish` hook (an endpoint) receives `{ messages, conversationId, usage, pageId, agentId, userId, ... }` for persistence; there is no built-in chat storage. The `AgentChat` block (`@lowdefy/blocks-antd-x`) streams via `/api/agent/{pageId}/{agentId}?conversationId=...`, takes `agentId`, `conversationId`, `messages` (external sync), `sharedState`, and fires `onToolCall`, `onConversationStart`, etc. **Modules may declare `agents:` in their manifest** — `buildModules.js` scopes them to `{entryId}/{agentId}` and validates their secrets against the module `secrets:` whitelist.

**Block plugins** (`packages/client/src/block/CategorySwitch.js`, `packages/utils/block-utils/`): blocks are plain React components wrapped in `withBlockDefaults` (+ `withTheme` for antd styling). Input blocks receive `value` + `methods.setValue/triggerEvent/registerMethod`; container children render via `content.<slot>()` functions. `@lowdefy/blocks-antd` and `@lowdefy/blocks-basic` export component barrels (`/blocks`) **and** meta barrels (`/metas`) whose `meta.properties` is the JSON Schema for each block's properties — this drives both our palette and the auto-generated property forms. `@lowdefy/operators-js/operators/client` exports the client operator functions and `@lowdefy/operators` exports `WebParser` (`new WebParser({context, operators})`, `parse({input, location, ...})`) — the context is a plain object we can stub for preview (see FormBuilder block below).

## Architecture

```
┌────────────────────────────── form-builder module ──────────────────────────────┐
│ pages/all      — list of editable elements (from module var `elements`)         │
│ pages/edit     — FormBuilder block  +  AgentChat block (page composition)       │
│ api/update-element    — MongoDBUpdateOne upsert → `dynamic-elements`            │
│ api/resolve-element   — Dynamic-block resolver: FindOne → :return {blocks}      │
│ api/set-block-config  — agent tool (stopOnToolCall): payloadSchema = block cfg  │
│ api/save-conversation — agent onFinish hook → conversations collection          │
│ agents/builder        — AIGatewayAgent (Sonnet) with the tool above             │
└───────────────────────────────────────────────────────────────────────────────--┘
          ▲ save / load                              ▼ per request
   MongoDB `dynamic-elements`        consumer page: Dynamic block → resolve-element
   MongoDB `dynamic-element-conversations` (chat history per element+block)

┌──────────────── FormBuilder block (plugins/modules-mongodb-plugins) ────────────┐
│  Palette (left)   │        Canvas (center)          │   Inspector (right)       │
│  antd/basic block │  real block components rendered │   Properties (schema form)│
│  types by category│  recursively; slots = drop zones│   Layout · Events · YAML  │
│  drag sources     │  selection overlay; operator    │   (selected block)        │
│                   │  preview via WebParser + mocks  │                            │
└───────────────────────────────────────────────────────────────────────────────--┘
```

The agent chat is deliberately **not** inside the FormBuilder block. The `AgentChat` block already does streaming, tool-call UI, and history; embedding it would duplicate core. Instead the edit page composes the two blocks through ordinary Lowdefy wiring: FormBuilder events → page state → AgentChat props, and agent tool calls → `CallMethod` back into FormBuilder. One correct way, no parallel chat implementation.

## Data model

Collection `dynamic-elements` (module var `collection`, connection owned by this module, `changeLog: log-changes`, `write: true`):

```yaml
_id: user-profile-fields          # element id — from module var `elements[].id`
config:
  blocks: []                      # authored-shape Lowdefy block config (operators unescaped)
created: { timestamp, user }      # change stamps via events module
updated: { timestamp, user }
```

Collection `dynamic-element-conversations` (module var `conversations_collection`):

```yaml
_id: "user-profile-fields:email_input"   # `${elementId}:${blockId}` = conversationId
elementId: user-profile-fields
blockId: email_input
messages: []                      # full UIMessage[] from the agent onFinish payload
usage: {}
created: { timestamp, user }
updated: { timestamp, user }
```

The conversationId scheme is the link the user asked for between chats and saved form updates: one thread per (element, block), reloaded whenever that block is selected again. Blocks deleted from the form keep their thread doc (harmless history; no cleanup complexity).

Simple upsert on save — no optimistic-concurrency guard. Elements start non-existent (first save inserts), and concurrent editing of the same element is not a concrete need yet; the change log records every write.

## Module: `modules/form-builder`

**Manifest** (structure follows `modules/companies/module.lowdefy.yaml`; every var carries `description`/`type`/`default` for `gen-var-docs`):

- `dependencies`: `layout` (page shell), `events` (change stamps).
- `vars`:
  - `elements` (array, required) — the editable targets: `[{ id, title, description }]`. Drives the `all` page listing and edit-page titles. `id` is the `dynamic-elements` document `_id`.
  - `collection` (string, default `dynamic-elements`).
  - `conversations_collection` (string, default `dynamic-element-conversations`).
  - `agent` (object) — `model` (string, default `anthropic/claude-sonnet-5` in the gateway's `creator/model` form), `max_steps` (number, default 10).
  - `palette` (object) — `blocks` (array of type names; default is the curated list in the plugin — leave unset to accept it). Passed through to the FormBuilder block and to consumers for `Dynamic.types`.
- `connections`: `dynamic-elements-collection`, `conversations-collection` (both `MongoDBCollection`, `_secret: MONGODB_URI`, changeLog → `log-changes`), and `ai-gateway` (`type: AIGateway`, `apiKey: {_secret: AI_GATEWAY_API_KEY}` — Vercel AI Gateway, so apps can route/monitor across providers). Consumers with an existing AIGateway connection can remap it via the module entry's `connections:` mapping.
- `secrets`: `MONGODB_URI`, `AI_GATEWAY_API_KEY`.
- `plugins`: `@lowdefy/modules-mongodb-plugins` `^0.9.2`.

**Pages:**

- `all` — layout `page` wrapper; renders the `elements` var as a card/list (title, description, Edit link → `edit?id=...`). Build-time data (`_module.var`), no requests.
- `edit` — layout `page` wrapper. `onInit`: `get_element` request (FindOne by `_url_query: id`) → `SetState config` (`{blocks: []}` default when missing). Blocks:
  - FormBuilder block, `id: config` (input block — value auto-binds to `state.config`), properties: `palette: {_module.var: palette}`, `mock: {_state: mock}` (see preview), height. Events: `onBlockSelect` → `SetState selected_block` + `Request get_conversation` + `SetState chat_messages`; `onChange` → nothing needed beyond the auto state binding.
  - Save `Button` → `CallAPI update-element` payload `{ id: {_url_query: id}, config: {_state: config} }`, then success `Message`.
  - `AgentChat` block (drawer or right column): `agentId: builder`, `conversationId: {_string.concat: [{_url_query: id}, ':', {_state: selected_block.blockId}]}`, `messages: {_state: chat_messages}`, `sharedState: { element: {_url_query: id}, selectedBlock: {_state: selected_block}, config: {_state: config} }`, `visible` only when a block is selected. Events: `onToolCall` — when the tool is `set-block-config`, `CallMethod` `config.setBlockConfig` with `{ path: {_state: selected_block.path}, config: <tool input.config> }`. Implementer: read `AgentChat/schema.json` + `useAgentEvents.js` in the lowdefy repo for the exact `onToolCall` event payload shape and the `messages` restore behaviour before wiring; adjust to `methods.setMessages` via a `CallMethod` if the `messages` prop proves to be initial-only.
- Requests (page-level, snake_case): `get_element`, `get_conversation` (FindOne on conversations by conversationId).

**API endpoints (kebab-case ids):**

- `update-element` — `MongoDBUpdateOne` upsert on `dynamic-elements-collection`: `$set: { config: {_payload: config}, updated: <change stamp> }`, `$setOnInsert: { created: <change stamp> }`. The payload config is data — operators inside it are not evaluated server-side. Null exclusion is handled by the FormBuilder block before the value ever reaches state (below), so the endpoint stores what it gets.
- `resolve-element` — the Dynamic resolver. Payload per the Dynamic contract; routine: FindOne `_id: {_payload: params.elementId}` → `:return { blocks: {_if_none: [{_step: get_element.config.blocks}, []]} }`. The stored blocks are step *data*, so their operators pass through to the client untouched.
- `set-block-config` — agent tool. `description`: "Set the full Lowdefy block config for the currently selected form block." `payloadSchema`: `{ config: object (required) — the complete block config: id, type, properties, events, ...; summary: string — one-line description of the change }`. Routine: `:return: {_payload: true}` (the loop stops before this matters — `stopOnToolCall`).
- `save-conversation` — agent `onFinish` hook: upsert conversation doc keyed by `{_payload: conversationId}`, storing `messages`, `usage`, elementId/blockId split from the conversationId, change stamps.

**Agent** (`agents:` in the manifest — scoped to the module entry):

```yaml
agents:
  - id: builder
    type: AIGatewayAgent
    connectionId: anthropic
    properties:
      model: { _module.var: agent.model }
      maxSteps: { _module.var: agent.max_steps }
      pageContext: true
      stopOnToolCall: set-block-config
      instructions: |
        <role: Lowdefy form-config assistant. sharedState carries the element id,
         the selected block's current config/yaml + path, and the full form config.
         Teach-nothing: return config via the set-block-config tool, never as text-only.
         Cover operators (_state, _if, _eq, ...), validation, events, layout;
         allowed block types are listed in sharedState. Rules: no `requests:` in
         config; ids snake_case and unique within the form.>
    tools:
      - set-block-config
    hooks:
      onFinish: [save-conversation]
```

**Exports:** pages `all`, `edit`; api `resolve-element`; component `dynamic-element`; menu `default` (link to `all`).

The `dynamic-element` component is the consumption story — a consumer page does:

```yaml
- _ref:
    module: form-builder
    component: dynamic-element
    vars:
      id: profile_custom
      elementId: user-profile-fields
      types: { blocks: [TextInput, Selector, Box, ...] }   # what the element may use
      fallback: []                                          # optional fallback blocks
```

and the component expands to a `Dynamic` block with `endpointId: {_module.endpointId: resolve-element}` (module-static scope — verified against `buildRefs` component-ref tests) and `params: {elementId: {_var: elementId}}`. `types` must be provided by the consumer because it determines their client bundle; default it to the palette default list.

## FormBuilder block (`plugins/modules-mongodb-plugins`)

**Block contract** — `meta.js` (schema inline under `properties`, following the blocks-antd convention, not the repo's legacy schema.json-on-the-side pattern):

- `category: input`, `valueType: object`. **Value** = `{ blocks: [...] }` in authored shape. Every mutation → deep-strip `null`/`undefined` values (the user requirement: nulls never reach the stored config) → `methods.setValue` → `triggerEvent onChange`.
- `properties`: `palette` (`{blocks: string[]}` — allowed types; default curated list), `mock` (`{state, requests, global, user, urlQuery}` — operator-preview inputs), `height` (default ~70vh).
- `events`: `onChange`, `onBlockSelect` — payload `{ path, blockId, type, config, yaml }` where `path` is the JSON path into `value.blocks` (e.g. `blocks.2.blocks.0`) and `yaml` is the block serialized for the agent/YAML tab.
- `methods` (via `registerMethod`): `setBlockConfig({path, config})` (replace the block at path — used by the agent round-trip; re-validates id uniqueness, strips nulls, setValue, reselects), `selectBlock({path})`.

**Dependencies added to the plugin package:** `@dnd-kit/core` + `@dnd-kit/sortable` (drag and drop), `yaml` (YAML tab / serialization for the agent), and peers `@lowdefy/operators`, `@lowdefy/operators-js`, `@lowdefy/blocks-antd-x` is *not* needed (chat lives on the page). All `@lowdefy/*` peer versions bump to `0.0.0-experimental-20260710121634`.

**React component breakdown** (`src/blocks/FormBuilder/`):

- `FormBuilder.js` — wrapper (`withTheme('FormBuilder', withBlockDefaults(...))`), three-pane layout, `DndContext`, builder state (`useBuilderState`: tree = the value, selection, preview toggle) and the null-strip/serialize boundary around `setValue`.
- `registry.js` — merges `@lowdefy/blocks-antd/{blocks,metas}` and `@lowdefy/blocks-basic/{blocks,metas}` into `{type: {Component, meta}}`, filtered by `properties.palette.blocks`. The **default palette** is a curated subset (form-relevant): inputs (TextInput, TextArea, NumberInput, Selector, MultipleSelector, RadioSelector, CheckboxSelector, DateSelector, DateTimeSelector, Switch, ParagraphInput, PhoneNumberInput, RatingSlider, Slider), containers (Box, Card, Collapse, Tabs, Label, Alert, Descriptions), display (Title, Paragraph, Html, Divider, Button, Statistic, Icon, Img). Grouped in the palette by `meta.category`.
- `Palette.js` — searchable, category-grouped list of draggable type cards (icon from `meta.icons`, type name).
- `Canvas.js` + `CanvasBlock.js` — recursive renderer. Each node renders the *real* block component from the registry with props `{blockId, properties (preview-parsed), methods (stubbed: setValue writes to a local previewState, triggerEvent no-ops with a toast/log), components (passed through from the FormBuilder's own props so Icon/Link work), value (previewState[blockId] ?? mock.state[blockId]), validation, required, content}`. `content.<slot>` renders a `CanvasSlot` per `meta.slots` — a dnd-kit droppable + sortable list of children with insertion indicators; empty slots render a dashed drop target. A selection/hover overlay (absolute-positioned, pointer-events layer) carries the block id chip, drag handle, and delete button, so canvas clicks select rather than interact; a per-block "interact" affordance is not needed — preview interaction happens through the rendered inputs themselves where it doesn't conflict with selection (single click selects, inputs receive events when the block is already selected).
- `operatorPreview.js` — builds one `WebParser` from `@lowdefy/operators` with `@lowdefy/operators-js/operators/client`, context stubbed as `{ _internal: { lowdefy: { apiResponses: {}, basePath: '', home: {}, i18n: identity, inputs: {preview: {}}, lowdefyApp: {}, lowdefyGlobal: mock.global, menus: [], pageId: 'form_builder_preview', theme: {}, user: mock.user, _internal: {globals: {window, document}} } }, id: 'preview', jsMap: undefined, eventLog: [], requests: <mock.requests mapped to engine shape [{response, loading:false}]>, state: {...mock.state, ...previewState}, websockets: {} }`. Parse each block's `properties` (and `visible`) before render; parse errors render as a small warning chip on the block rather than breaking the canvas. Unknown/server-only operators fall through as literals — acceptable; the preview is a model, not the runtime.
- `Inspector.js` — tabs for the selected block:
  - **Properties** — `SchemaForm.js`: walks `meta.properties.properties`, maps leaf schemas to antd controls (boolean→Switch, enum→Select, number→InputNumber, string→Input, color-ish→color input); object/array/oneOf and any property whose current value is an operator (single-key `_*` object) render as an inline mini-YAML field instead of a control. Description tooltips from schema `description`.
  - **Settings** — block `id` (uniqueness-validated), `layout`, `style`/`class`, `visible`, `required`, `validate` (YAML list field).
  - **Events** — one YAML field per `meta.events` key plus free-form additional events.
  - **YAML** — the whole selected block as editable YAML (monospace textarea + parse validation on blur; CodeMirror is a later nicety, not a dependency now).
- `ids.js` — id generation `{type_snake}_{n}` unique across the form; rename cascades nothing (block ids in dynamic content are leaf identifiers).

**What the block does *not* do:** no persistence (page/API concern), no chat (page composition), no undo history in v1, no import of app pages (it edits one element's `config.blocks` only).

## Demo app wiring

- Bump `apps/demo/lowdefy.yaml` + `apps/demo/package.json` to `lowdefy: 0.0.0-experimental-20260710121634`; bump plugin peer deps to match.
- Register `form-builder` in `apps/demo/modules.yaml` with `vars` in `apps/demo/modules/form-builder/vars.yaml`: 2–3 example elements (e.g. `profile-fields`, `workflow-step-review`) with titles/descriptions.
- Add a demo page (or extend an existing demo page) embedding the `dynamic-element` component for one example element, demonstrating the round trip. `AI_GATEWAY_API_KEY` joins the demo secrets (Infisical) — build check needs no real value.
- Menu entry via the module's exported menu.

## Decisions & constraints

- **Store operators unescaped.** Stored config is data end-to-end (payload → `$set`; FindOne → `:return`), verified against `resolveDynamicContent`/`unescapeOperators`: the client receives and evaluates them. The builder's YAML tab and agent both read/write plain `_state`-style operators.
- **`types` is the consumer's cost.** Dynamic content can only use block/action/operator types present in the consumer's client bundle; the `dynamic-element` component surfaces `types` as a var and the docs must state it plainly.
- **No `requests:` in built forms.** The builder does not offer request authoring; selector options etc. come from static option lists or operators over page state. (Future: `CallAPI`-backed options.)
- **Agent returns config only via the tool.** `stopOnToolCall` + `onToolCall` → `CallMethod setBlockConfig` keeps one correct path from chat to canvas; no YAML-pasting from chat text.
- **Chat is page composition, not part of the plugin block** — reuses `AgentChat` streaming/UI wholesale.
- **Simple upsert, no version guard** on `update-element` (first write creates the doc; concurrent-editor protection is not a concrete need; changeLog captures history).
- **Preview is a model.** WebParser with mock `state`/`requests`/`user`/`global` demonstrates behaviour; it does not execute actions or real requests.

## Implementation notes (deviations verified against framework source)

- **Agent tool declaration:** the `tools:` string shorthand does not work for module-scoped endpoints — the default tool name is the scoped endpoint id with `/` → `__` (`buildAgents.js:119-126`), which would break the `stopOnToolCall` match. The agent declares the tool as `{ name: set-block-config, endpointId: {_module.endpointId: set-block-config} }`.
- **Agent id on the page:** referenced via the `_module.agentId` operator (`buildRefs/walker.js:504-530`; fixture `95-module-agents`), mirroring `_module.endpointId`.
- **Endpoint types:** `resolve-element`, `set-block-config`, and `save-conversation` are `InternalApi` (invoked in-process only); `update-element` stays `Api` (called from the page via `CallAPI`).
- **AgentChat contracts verified:** `onToolCall` event payload is `{ toolName, toolCallId, input }` (`useAgentEvents.js:112-121`); the `messages` property re-syncs externally-set messages after mount (`AgentChat.js:186-200`), so thread restore on block re-select needs no `setMessages` CallMethod.
- **Config applies on `onMessageComplete`, not `onToolCall`.** Two field-tested defects forced this: (1) `onToolCall` fires while the tool input JSON is still streaming, delivering truncated config; (2) restoring a saved thread replayed historical `onToolCall`s, overwriting freshly dropped blocks. The edit page extracts the last complete `set-block-config` input from the finished turn's parts. Both defects are also fixed upstream in AgentChat (`input-streaming` parts skipped; externally-synced messages' event ids suppressed), landing with the next experimental release.
- **Layout `menu` var untyped:** the new build's `validateVarTypes` (`registerModules.js`) rejects runtime operators in typed module vars, and the layout module's `menu` var default is `{_menu: default}` — the `type: object` annotation was removed from that var.
- **Slots in the authored value:** the builder writes the default `content` slot as `blocks:` shorthand and named slots as `areas.<slot>.blocks` (matching build's `moveAreasToSlots`); blocks whose meta has `slots: false` are leaves in the canvas.
- `@dnd-kit/core` alone suffices for the drag model (per-node "insert before" droppables + per-slot append droppables); `@dnd-kit/sortable` is not a dependency.
- **Vercel AI Gateway instead of direct Anthropic** (user decision post-implementation): connection `ai-gateway` (`type: AIGateway`, secret `AI_GATEWAY_API_KEY` — the connection's `apiKey` is optional upstream, falling back to the env var, but the module passes it explicitly through the secrets whitelist), agent type `AIGatewayAgent`, model ids in the gateway's `creator/model` form (`anthropic/claude-sonnet-5`). `stopOnToolCall` and all other agent properties come from the shared `AISDKAgentSchema`, so the tool round-trip is unchanged.

## Verification

- `pnpm build` (plugin bundles compile under SWC), `pnpm ldf:b` in `apps/demo` (config compiles), `pnpm docs:gen && pnpm docs:check`.
- Runtime smoke (human / `/r:dev-test`, needs `MONGODB_URI` + `AI_GATEWAY_API_KEY`): build a small form on `edit`, save, confirm the doc in `dynamic-elements`; open the demo consumer page and see the form render via the Dynamic block; select a block, ask the agent for a change, confirm the tool call lands on the canvas and the conversation doc persists.
