# Reporting chat surface: teaching both jobs, and the panel as artefact store

A sub-design of [`reporting/ux`](../design.md) — plates 1 and 2 of [`wireframes.html`](../wireframes.html), redrawn in real blocks in [`wireframes-blocks.html`](../wireframes-blocks.html).

The chat page is where both of the module's jobs happen, and today it teaches neither. The welcome names the results panel and the phrase "turn this into a report", which only works for a user who reads it, remembers it, and types it later. The panel itself is `visible: false` until a chart arrives, so a first-time user never learns it exists. A tabular answer — the single most common useful result — is stranded in the transcript as text. The conversations rail is titles only: no search, no timestamps, no rename, no delete. Neither side panel collapses, so the transcript can never run wide.

This sub-design reworks the page so the report path is a thing you can click, the panel is always present and explains its own shape, tables join charts and downloads as artefacts, and the rail becomes usable at more than a handful of conversations. It rests on **one block change** — a `setInput` method on `AgentChat` — without which the empty state cannot teach anything.

Result **selection** and the save sheet it feeds live in [save-as-report](../save-as-report/design.md). This sub-design builds the panel that hosts them.

## Proposed change

1. Rework the welcome into **two tracks of starters** — exploratory prompts and report-shaped prompts — plus a line naming what the assistant can see, derived from the catalog's collection descriptions. Clicking a starter fills the composer rather than sending it. Both halves of this are built _outside_ `AgentChat` and rest on one new block method — see [the one thing the blocks cannot do](#the-one-thing-the-blocks-cannot-do-fill-the-composer).
2. Make the **results panel visible when empty**, explaining its own shape, instead of `visible: false` until the first chart.
3. Make **both side panels collapsible**, with the state held for the session ([why not persisted](#collapse-state-is-session-scoped-not-persisted)) and both collapsed by default on a narrow viewport.
4. Give the conversations rail **search, recency grouping (Today / Previous 7 days / Older), rename, and soft delete**, which needs `list-conversations` to return `updated` and a snippet, plus a new `delete-conversation` endpoint.
5. Add a **`data-report-table` part** so tabular answers become panel artefacts, and scope the panel All / Charts / Tables / Exports.
6. **Prompt the agent to sketch inline with mermaid** where a shape is simple (one series, ≤6 categories) and to name the panel for the full chart. Prompt-only — no block change.

## Current state

- `modules/reporting/pages/chat.yaml` — three `Box` columns at spans 5 / 12 / 7. `AgentConversations` with `items` from `list-conversations` (titles only, no timestamps, no search, no per-row actions); `AgentChat` with a two-line `welcome` mentioning the panel and the phrase "turn this into a report"; `onDataPart` routing `data-report-chart` / `data-report-download` into `_state: charts` / `downloads`; the whole results column `visible:` false until one of those arrays is non-empty; Tabs Charts / Downloads; download runs `query-data` then `DownloadCsv`. No collapse, no selection, no tables.
- Conversations: `list-conversations`, `set-conversation-title`, `save-conversation`, `get-conversation-results`. **No delete of any kind.**
- `@lowdefy/blocks-antd-x` `AgentChat` — `messageParts.js` classifies only text / reasoning / tool / file / data-status and states outright that custom `data-*` parts are not handled inline; `schema.json` declares no block areas; `MessageBubble.js` renders Markdown and mermaid (11.16 via `@ant-design/x`, `renderMermaid` defaulting true).

## Key decisions and rationale

### The empty state teaches both jobs; a magic phrase teaches nobody

The current welcome names the panel and the phrase "turn this into a report", which only works for a user who reads it, remembers it, and types it later. Two tracks of starters make the report path a _thing you can click_, and the split itself is the teaching device: the left column is "ask a question", the right is "build a report". Starters fill the composer instead of sending, because a starter the user cannot edit is a demo, not a prompt.

Naming the collections the assistant can see (from the catalog's descriptions) is in the same spirit: the alternative is the "why can't it answer that?" dead end, which reads as the assistant being broken rather than the scope being bounded.

### The transcript is prose; the panel is the artefact store — and that is a ceiling, not a preference

`AgentChat` cannot host a Lowdefy block, a button, or a link inside a message: `messageParts.js` handles only text / reasoning / tool / file / data-status parts and says custom `data-*` parts are not handled inline, and the block schema has no areas. So the panel is the **only** place an `EChart` can live, and the in-thread vocabulary is exactly markdown plus mermaid.

That makes the division of labour honest rather than aesthetic: a simple shape can be a real inline sketch through a mermaid `xychart-beta` or `pie` fence (it carries mermaid's own theme, square marks, no hover — which is why it stays a _sketch_), and the transcript hands off in prose to the panel for the full chart. The agent is prompted to skip the sketch entirely for anything multi-series or long-labelled. A `partRenderers`-style property on the block would remove the ceiling; until one exists, this is the shape of the surface.

### Tables are results

Only charts and downloads stream back today, so a tabular answer — the single most common useful result — is stranded in the transcript where it cannot be reused, reread, or saved into a report. A `data-report-table` part fixes it with no new machinery: the same `onDataPart` route, the same panel, the same selection.

This is also the change that makes [save-as-report](../save-as-report/design.md) worth having on the most common answer shape. A report of charts only would have been a report of the minority case.

### Three columns, both sides collapsible

Left is history, middle is now, right is what you produced. Both side panels collapse to strips (the rail to icons, the panel to counts) so the transcript can run full-width when the user is reading rather than producing, and the two collapses are mirror images so they read as one pattern. Collapse state is kept for the session and follows the user between pages ([why not persisted](#collapse-state-is-session-scoped-not-persisted)); on a narrow viewport both start collapsed. The expanded layout is 232px / fluid / 348px with a ~62ch measure on the middle column, which is the chat block's own `maxWidth` — so prose stays readable at any width.

### The panel is visible when empty

An empty panel that explains its own shape — "charts, tables and exports you produce land here; tick them to save a report" — costs one Box of copy and removes the entire class of "I didn't know that was there". A panel that appears only after the first chart teaches nothing until the user has already succeeded without it.

This also makes the panel the stable home for the All / Charts / Tables / Exports scope, which would otherwise appear and disappear with the panel.

## Block feasibility

Checked against the blocks the demo actually installs, reading block source rather than docs.

### The one thing the blocks cannot do: fill the composer

A starter that **fills** the composer instead of sending it (plate 1, callout 3) is not reachable from config. `AgentChat`'s prompt handler calls `sendMessage({ text })` directly, the `@ant-design/x` `Sender` is mounted uncontrolled (a ref, cleared after send — no `value` prop), and the block's registered methods are `regenerate`, `setMessages`, `sendMessage`, `clearMessages`, `deleteMessage`, `stop`, `clearError`, `scrollToBottom`. None of them writes the input.

The fix is a **`setInput` method on `AgentChat`**: make the `Sender` controlled from local state and register the setter. It is small, and the package is already patched in this repo (`patches/@lowdefy__blocks-antd-x.patch`, which keys `useChat` by conversation), so patch-then-upstream is a proven path here.

That one method also settles the **two-track welcome**. `welcome` takes `{ title, description, icon, prompts[], variant }` and the block flattens `prompts` into a single row, mapping only `key` / `label` / `description` — the `children` that `@ant-design/x` uses for grouped columns are dropped, and the block declares no areas, so nothing can be composed inside it. Rather than grow the `welcome` schema, **leave `welcome` unset and render the empty state as ordinary blocks above the chat**, shown while `messages` is empty: two `Box` tracks, `Title` / `Paragraph` copy, starter chips as `Button`s calling `setInput`. That is more layout freedom than the schema would ever have given, and it is only viable because `setInput` exists. One change, both callouts.

### What the blocks already do, unchanged

The conversation rail carries more than the current page uses. `AgentConversations` takes a per-item `menu` and fires `onMenuClick` with the action key and the conversation key — that is rename and soft delete, with `danger: true` on the delete item. Recency grouping is `group` plus `timestamp` on each item with the `groupable` property, and group order follows first appearance in `items` (verified in `@ant-design/x`'s `useGroupable` — a plain reduce, no alphabetical sort), so ordering the items by recency yields Today → Previous 7 days → Older with no sort hook. There is no search property, but `items` is config-driven, so a `Search` block above the rail filtering the array _is_ the feature.

The results panel is all existing blocks: `SegmentedSelector` for All / Charts / Tables / Exports, a `List` of `Card`s, `CheckboxSwitch` bound to `charts.$.selected` for selection, `Modal` for expand, `AgGridBalham` for a table result, `EChart` for a chart, and the `ScrollTo` action for "the panel scrolls to the newest card".

`AgentConversations` has no collapsed mode of its own, so the rail's icon strip is a `Box` of `Button`s shown when the rail is hidden. The antd `Splitter` block — per-panel `collapsible` and `resizable` with an `onCollapse` event — could carry both edges instead, and is worth a look at build time if the hand-rolled strips read as two features rather than one pattern.

### Collapse state is session-scoped, not persisted

There is no client-storage action — the set is `CallAPI`, `CallMethod`, `CopyToClipboard`, `DisplayMessage`, `Fetch`, `Link`, `Login`, `Logout`, `Publish`, `Request`, `Reset`, `ResetValidation`, `ScrollTo`, `SetDarkMode`, `SetFocus`, `SetGlobal`, `SetLocale`, `SetState`, `Subscribe`, `Throw`, `Unsubscribe`, `UpdateSession`, `Validate`, `Wait` — and `SetGlobal` lives in memory for the session, not across reloads. So persisting the collapse per user, as plate 2's callout 1 draws it, costs a `ui_state` document and a write per toggle, for a preference that is re-expressed with one click.

**Decision: `SetGlobal`, session-scoped, with both panels collapsed by default on a narrow viewport.** The state follows the user between the chat, list and report pages within a session and resets on reload. If a real complaint appears, the endpoint is a later, additive change — nothing about the UI has to move.

### The trace line's title is the tool name

A tool call renders as a `ThoughtChain` item whose title is hard-coded to the raw tool name. The _description_ is authorable: when a tool returns `{ display: "…" }` the description becomes its first 80 characters and the full `display` markdown renders behind the collapse. So "4,812 rows · 0.4s" and "expanding shows the pipeline" are both real; "Read **orders**" as the heading is not, and `query_data` is an honest enough label to accept.

## Data model

Conversation documents already carry `user_id`, `created`, `updated`, `messages`, `data_parts` and `title`. The rail needs one addition:

| Field     | Type                   | Notes                                                                           |
| --------- | ---------------------- | ------------------------------------------------------------------------------- |
| `deleted` | `null` \| change stamp | Same shape and read predicate as everywhere else; `docs/shared/soft-delete.md`. |

Recency grouping and the rail's sort read the existing `updated.timestamp` — no new field. The stamp comes from `modules/reporting/defaults/change_stamp.yaml`, `_ref`'d like every other writer's — same reasoning as [ownership](../ownership/design.md#reporting-writes-the-change-stamp-inline).

`conversationId`, `messages`, `steps` and `toolResults` stay camelCase wherever they appear here: they are the `AgentChat` block's property and the agent framework's `onFinish` payload keys, not names this module chooses. Same for `dataParts` as the key the framework reads stream parts back from — the field it persists to is `data_parts`.

Conversations stay **own-only**. Nothing here gives a conversation an audience; the only cross-user link is the report's `conversation_id`, and following it is owner-gated on the [report page](../report-page/design.md).

## Endpoints

| Endpoint              | Status | Shape                                                             |
| --------------------- | ------ | ----------------------------------------------------------------- |
| `list-conversations`  | change | Own-only, returns `updated` and a snippet; excludes soft-deleted. |
| `delete-conversation` | new    | Soft, owner-scoped, same stamp shape.                             |
| `emit-data-parts`     | change | Emits `data-report-table` alongside chart and download.           |

## Vars

All optional, all app-specific copy: `welcome_title`, `starters_explore`, `starters_report`. The collection names in the welcome derive from the catalog's descriptions — no var. Full `description` / `type` / `default` in the manifest, then `pnpm docs:gen`.

## Files changed (anticipated)

- `modules/reporting/pages/chat.yaml` — fixed rail/panel widths with a fluid measure-capped middle; both panels collapsible with session-scoped state; panel visible-when-empty; the two-track empty state as ordinary blocks with `welcome` unset; starter chips filling the composer; rail search / grouping / per-item menu; the table part routed into a new state array; the panel scope control.
- `modules/reporting/api/list-conversations.yaml` — `updated` and the snippet, soft-delete filter.
- New `modules/reporting/api/delete-conversation.yaml`.
- `modules/reporting/api/emit-data-parts.yaml` — the table part.
- `modules/reporting/agents/reporting-assistant.yaml` — the mermaid-sketch prompt and the table-part contract, plus a `display` string on the query tool's output so the trace line reads as a summary rather than a key list.
- `patches/@lowdefy__blocks-antd-x.patch` — the `setInput` method on `AgentChat` (controlled `Sender` plus `registerMethod`), to be upstreamed.
- `modules/reporting/module.lowdefy.yaml` — the copy vars.
- `docs/reporting/` — the index's surfaces table.

## Demo consumers

- Starter prompts and welcome copy on the demo module entry, so both tracks render with real text and the vars are build-verified.
- A seeded conversation set spanning today, the last week and older, so recency grouping renders all three groups.
- At least one seeded conversation producing a **table** result, so the new part and the panel's Tables scope are exercised end to end.

Verify with `pnpm ldf:b` from `apps/demo` and inspect the generated `.lowdefy/server/build/pages/**` artefacts.

## Resolved questions

Resolved 2026-07-29:

1. **Can a chart, button or link live inside a chat bubble?** No. `AgentChat` handles only text / reasoning / tool / file / data-status parts, explicitly not custom `data-*` parts, and its schema has no block areas. Mermaid + markdown are the whole in-thread vocabulary; the panel is the only home for an `EChart`.

Resolved 2026-07-30, from reading the installed block source:

2. **Can a starter fill the composer instead of sending it?** Not today, and it is the only hard blocker in the deck. The `Sender` is uncontrolled and no block method writes the input — it needs a `setInput` method on `AgentChat`.
3. **Can the welcome show two tracks?** Not inside the block: `welcome.prompts` is flattened to one row and `AgentChat` has no areas. Render the empty state as ordinary blocks above the chat with `welcome` unset — which needs `setInput` to be worth anything, so it is the same change.
4. **Can the rail group by recency, rename and delete?** Yes, all three, with no block change: item `group` / `timestamp` plus `groupable`, and a per-item `menu` firing `onMenuClick`. Group order follows item order, so sorting by recency is the whole implementation. Search is a `Search` block above it filtering `items`.
5. **Can UI state persist across reloads?** No client-storage action exists, and `SetGlobal` is session-memory. Session-scoped is the decision; a `ui_state` document is the additive fallback.

## Deviations from the wireframes

1. **The tool trace line is titled with the tool name.** Plate 2's `Read orders · 4,812 rows · 0.4s` becomes a `query_data` heading with the row count and duration as its description, and the pipeline behind the collapse.
2. **Collapse state is session-scoped**, not persisted per user as plate 2's callout 1 draws it. No client storage action exists; see [above](#collapse-state-is-session-scoped-not-persisted).

## Risks

- **The `setInput` patch is ours until it is upstreamed.** The discoverability story rests on one method that does not exist in a released block. A version bump that reworks `AgentChat`'s sender re-opens it. Contained by the patch being small and by the same package already carrying one.
- **The mermaid sketch is prompt-enforced, not schema-enforced.** Nothing stops the agent emitting a twelve-series `xychart-beta` that renders as noise. The mitigation is prompt-side only; if it misbehaves in practice the fallback is to drop inline sketches entirely, which costs nothing structural.

## Non-goals

- **Inline blocks in the transcript.** Blocked by the block, not chosen — see [the ceiling](#the-transcript-is-prose-the-panel-is-the-artefact-store--and-that-is-a-ceiling-not-a-preference).
- **Persisting UI preferences.** Session-scoped, with a known additive fallback.
- **Giving conversations an audience.** They stay own-only.
- **A drag-to-reorder panel.** Nothing reorders results in the panel; ordering is arrival order, and the sheet reorders sections with ↑ / ↓ — see [save-as-report](../save-as-report/design.md).
