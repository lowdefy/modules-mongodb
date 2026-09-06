# Task 9: The agent gains a table tool, a repointed read, and a sketching rule

## Context

`modules/ai-reporting/agents/reporting-assistant.yaml` holds the whole agent contract: a
`_build.string.concat` of instruction blocks (with the consumer's `app_context` var and the
catalog injected at build time), a `tools:` array that is pure wiring (`name` → `endpointId`),
and the two `onFinish` hooks.

Four tools today: `query_data` → `query-data`, `render_chart` → `render-chart`, `export_data` →
`export-data`, `generate_report` → `generate-report`. The "Answering in chat" section documents
each in one or two lines, and a "Presentation contract" section already documents the `table`
contract (`columns` — an array of `{ key, label?, format? }`) because report sections use it.

Three changes, all prompt-and-wiring:

1. **`query_data` moves to `query-data-tool`** (task 4), which carries the 200 KB result budget
   and the `display` summary. `query-data` keeps its 8 MB budget and bare-array return for panel
   downloads and report filter re-queries.
2. **`render_table` is new** (task 5) — a tabular answer becomes a panel artefact instead of
   being stranded as transcript text.
3. **The agent is prompted to sketch inline with mermaid** where a shape is simple. `AgentChat`
   cannot host a Lowdefy block, a button or a link inside a message — `messageParts.js` handles
   only text / reasoning / tool / file / data-status parts and states outright that custom
   `data-*` parts are not handled inline, and the block schema declares no areas. So the panel is
   the only place an `EChart` can live, and the in-thread vocabulary is exactly **markdown plus
   mermaid** (`MessageBubble.js` renders both; mermaid 11.16 via `@ant-design/x`, with
   `renderMermaid` defaulting true). A simple shape can be a real inline sketch; anything
   multi-series or long-labelled cannot.

## Interfaces

- **Consumes:** `query-data-tool` returning `{ display, rows }` (task 4); `render-table` acking
  `{ ok, title, spec: { title, query, columns } }` (task 5).
- **Produces:** `toolName: render_table` in the turn's `toolResults`, which `emit-data-parts`
  filters for (task 6).

## Task

**`tools:`** — repoint `query_data` to `_module.endpointId: query-data-tool`, and add

```yaml
- name: render_table
  endpointId:
    _module.endpointId: render-table
```

after `render_chart`. Add a comment on the `query_data` entry saying why it points at the second
endpoint: the agent's read carries a tighter result budget and returns a `display` summary, while
`query-data` keeps the bare-array return the panel download consumes.

**"Answering in chat"** — three edits to the bullet list:

- `render_table` gets an entry beside `render_chart`: `{ title, query, columns }`, the table
  renders in the panel beside the chat after the turn completes, tell the user to look there,
  and each column `key` must name a field the pipeline outputs.
- Say **when to use which**: a tabular answer worth keeping goes through `render_table` so the
  user can reread and save it; a short answer stays a markdown table in the reply. Both is fine
  for a headline plus the detail. Keep the existing "format tabular answers as markdown tables"
  guidance for the short case rather than deleting it.
- The `query_data` line stays as it is — it still returns rows; nothing about the tool's contract
  changed from the model's side.

**A new instruction block for the mermaid sketch**, in the "Answering in chat" section:

- sketch inline with a mermaid `xychart-beta` or `pie` fence **only** when the shape is simple —
  one series, at most 6 categories, short labels;
- skip the sketch entirely for anything multi-series, long-labelled, or many-category, and call
  `render_chart` instead;
- a sketch is a sketch, not the chart: it carries mermaid's own theme, square marks and no hover.
  Where both are wanted, sketch inline and name the panel for the full chart in prose;
- never put a link, a button or a block in a reply — the transcript renders markdown and mermaid
  and nothing else.

Keep it tight. This is prompt-side only and enforced nowhere: nothing stops the agent emitting a
twelve-series `xychart-beta` that renders as noise, and if it misbehaves in practice the fallback
is to drop inline sketches entirely, which costs nothing structural.

**"Presentation contract"** — the `table: columns` line already exists and is correct for both
report sections and the new tool. Add nothing; check the section reads sensibly now that a
non-report caller uses it.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds, and the generated agent artefact under
  `.lowdefy/server/build/` lists five tools with `query_data` bound to the `query-data-tool`
  endpoint id.
- Against a running app with `AI_GATEWAY_API_KEY` set: asking for a table of orders by region
  produces a `render_table` call and a table card in the panel; asking for a single-series
  breakdown of at most six categories produces an inline mermaid sketch that renders in the
  bubble; asking for a twelve-month multi-series trend produces a `render_chart` call and no
  sketch.
- The `query_data` trace line reads as a summary (`842 rows · 0.4s`), not a key list — that is
  task 4's `display` string arriving.

## Files

- `modules/ai-reporting/agents/reporting-assistant.yaml` — modify — `render_table` wiring,
  `query_data` repointed, the tool docs and the mermaid rule

## Notes

The trace line's **title** is the raw tool name and is not authorable — a tool call renders as a
`ThoughtChain` item whose title is hard-coded. So `query_data` is the heading a user sees, which
is honest enough to accept; the description is where the summary goes. Do not try to prompt a
nicer heading.

`maxSteps: 12` and `generateTitle: true` stay as they are.
