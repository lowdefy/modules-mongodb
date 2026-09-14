# Task 4: Panel selection, section assembly, and mounting the sheet

## Context

This task turns the results panel on the chat page into a report-authoring surface: each result
card gains a tick, a **Save as report** button assembles the ticked cards into ordered sections
and opens the confirm sheet (task 3), and the sheet is mounted on the page.

The panel today (`modules/ai-reporting/pages/chat.yaml`) accumulates three state arrays — `charts`,
`tables`, `downloads` — rendered as `List`s in `charts_section`, `tables_section`,
`downloads_section` inside `results_panel`. Chart cards are inline blocks
(`charts.$.chart_title` / `charts.$.chart` / `charts.$.as_of`); table cards come from
`pages/chat/components/table_card.yaml`; download cards are inline (`downloads.$.item`). The
panel header (`results_header`) holds the title and collapse button; `results_scope` is a
segmented All/Charts/Tables/Exports selector. The empty-state copy already reads "Tick items to
save them as a report." — this task makes the tick real.

**Part identity is already in place** (shipped by the completed chat sub-design, PR #158):
`modules/ai-reporting/api/emit-data-parts.yaml` mints an `id` and a `created` onto every part
(`_array.map` + `__uuid`), and `buildDataParts.js` carries each part's `spec`. Both the live
stream (`onDataPart`) and the reload read (`get-conversation-results`) deliver them. So every
element already carries the fields this task binds to — selection keys on `id`, assembly reads
`spec`. No cross-design wait.

## Interfaces

- **Consumes:**
  - Part fields (shipped by the completed chat sub-design): `charts.$.id`, `charts.$.title`,
    `charts.$.spec {chart,query,x,y}`; `tables.$.id`, `tables.$.title`,
    `tables.$.spec {query,columns}`; `downloads.$.id`, `downloads.$.label`, `downloads.$.query`.
  - The sheet component (task 3): modal block id `save_report_modal`; state keys `sheet_title`,
    `sheet_sections` it reads.
  - `conversationId` — already set at the page `onInit`.
- **Produces:** the seeded state the sheet consumes (`sheet_title`, `sheet_sections`) and the
  per-card `selected` flags (`charts.$.selected`, `tables.$.selected`, `downloads.$.selected`).

## Task

**1. Selection on every card** — add a `CheckboxSwitch` to each of the three card types, bound to
`{array}.$.selected` so the flag lives per-part with no new machinery:

- Chart card: add to the `charts` `List` item (alongside `charts.$.chart_title`).
- Table card: edit `modules/ai-reporting/pages/chat/components/table_card.yaml` to add
  `tables.$.selected`.
- Download card: add to the `downloads.$.item` box (alongside `downloads.$.download`).
  Confirm `CheckboxSwitch` binding/props via the `lowdefy-docs` MCP. The tick is the card's only
  _marking_ affordance — do not add any other per-card marking control.

**2. Save-as-report button** — add a `Button` to `results_header` (or directly under
`results_scope`), title "Save as report". Disable it when nothing is selected across the three
arrays (no element has `selected: true`). Its `onClick` runs the assembly action then opens the
modal.

**3. Assembly action** — build `sheet_sections` from the ticked parts and seed `sheet_title`,
then open the sheet. Selection lives across three independent arrays but sections are one ordered
list; the initial order is **by kind — all ticked charts, then tables, then downloads** (read the
three arrays in that fixed sequence, so no cross-array order is tracked at tick time). For each
ticked part, produce a finished section:

- chart → `{ type: chart, label: <title>, chart: <spec.chart>, query: <spec.query>, x: <spec.x>, y: <spec.y> }`
- table → `{ type: table, label: <title>, query: <spec.query>, columns: <spec.columns> }`
- download → `{ type: download, label: <label>, query: <query> }`

The transform filters each array to `selected === true`, maps to the section shape (rename the
card's `title` → section `label`; spread the chart/table `spec` fields; downloads carry `label` +
`query` directly), and concatenates charts→tables→downloads. This shape-juggling across three
arrays is a reasonable `_js` case (per the js-operator guide); keep the JS simple, or express it
with `_array.filter`/`_array.map`/`_array.concat` if it stays readable.

Seed `sheet_title` from the **active conversation's title** where available — look it up in the
`conversations` sidebar state by `conversationId` — falling back to empty (the user types one).
Then `CallMethod { blockId: save_report_modal, method: setOpen, args: [ { open: true } ] }`.

Extract the assembly to `modules/ai-reporting/pages/chat/actions/save_as_report.yaml` and `_ref` it
from the button's `onClick`, following the existing `pages/chat/actions/` pattern
(`new_conversation.yaml`, `refresh_conversations.yaml`).

**4. Mount the sheet** — add `- _ref: pages/chat/components/save_report_sheet.yaml` to the
`results_panel` (or `chat_panel`) blocks, once, like the conversation modals are mounted in the
rail. It portals its dialog to the body, so it adds no visible chrome to the panel.

**5. Selection lifecycle** — the `select_conversation` / `set_results` handlers reset
`charts`/`tables`/`downloads` on conversation switch, which clears `selected` with them (the flag
lives on the parts). Confirm no stale `selected` survives a switch; no extra reset needed unless
the build shows otherwise.

## Acceptance Criteria

- Each chart, table and download card renders a `CheckboxSwitch` bound to `{array}.$.selected`.
- A **Save as report** button sits in the results panel, disabled with nothing ticked, enabled
  with ≥1 tick.
- Clicking it assembles `sheet_sections` (charts, then tables, then downloads; each a valid
  section for its type), seeds `sheet_title` from the active conversation title, and opens
  `save_report_modal`.
- The sheet is mounted once on the chat page.
- `pnpm ldf:b` from `apps/demo` builds clean; inspect `.lowdefy/server/build/pages/reporting/**`
  and confirm the chat page carries the selection controls, the button, and the mounted sheet.

## Files

- `modules/ai-reporting/pages/chat.yaml` — modify — chart/download card ticks, Save-as-report button,
  mount the sheet, `_ref` the assembly action.
- `modules/ai-reporting/pages/chat/components/table_card.yaml` — modify — table card tick.
- `modules/ai-reporting/pages/chat/actions/save_as_report.yaml` — create — the assembly + open action.

## Notes

- Selection is client page state only — no endpoint reads `selected`; the assembly reads it and
  produces the `create-report` payload. Do not add a persistence path for ticks.
- Keep the download section shape flat (`{ type, label, query }`) — download parts have no `spec`
  wrapper, unlike chart/table parts.
- Do not assemble KPI, markdown or filter sections — the panel renders no such card, and this
  route is chart/table/download only (§"the sheet assembles chart, table and download sections
  only"). Filterless-first.
- The part fields this task reads (`id`, `spec`, `title`/`label`, `query`) are already emitted
  by `emit-data-parts.yaml` and `buildDataParts.js` and read back by `get-conversation-results` —
  bind to them directly; no new part-shape work is needed here.
