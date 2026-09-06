# Task 14: Table results in the panel

## Context

Only charts and downloads reach the panel today, so a tabular answer — the single most common
useful result — is stranded in the transcript where it cannot be reused, reread, or saved into a
report. The consumption half of fixing that is nearly free: the same `onDataPart` route, the same
panel, and `AgGridBalham` already renders it.

Task 6 made the production half real. `emit-data-parts` now emits and persists
`data-report-table` parts, and `get-conversation-results` returns them under a `tables` key.
Every part — chart, table and download — now carries `id` and `created` as well:

```
data-report-chart: { id, created, title, option, spec: { chart, query, x, y } }
data-report-table: { id, created, title, rows, row_count, spec: { query, columns } }
```

`rows` is capped at 200 and `row_count` holds the true total, so a card can say _first 200 of 964
rows_ instead of implying it is showing everything. A `row_count` that lands on the engine's own
1000-row cap was itself probably truncated, and the card says that in the same words the report
side already uses: `compileReport`'s `sectionHeading` heads a capped section
`— first 1000 rows`, because "a table silently showing its first 1000 rows reads as the complete
answer".

The page holds results in three places, and the table array must join all of them:

1. `onInit` seeds `charts: []`, `downloads: []`;
2. `onNew` and `onSelect`'s `select_conversation` clear them as the loading state;
3. `set_results` repopulates them from the fresh `get-conversation-results` read.

`created` also makes a card datable — the persisted `option` and `rows` stay baked, so a reopened
conversation shows the numbers from that turn, not today's. A chart sits directly under prose
quoting its numbers; a chart that silently re-ran would make the paragraph above it wrong.

All three new part fields are additive, so parts written before them read through `_if_none`.

## Interfaces

- **Consumes:** `data-report-table` parts (task 6); `get-conversation-results` returning
  `{ messages, charts, tables, downloads }` (task 6); the `results_scope` control (task 12).
- **Produces:** `_state: tables`, the third result array.

## Task

All in `modules/ai-reporting/pages/chat.yaml`.

**State wiring — all four places, or the array desyncs:**

- `onInit` `init_state` — seed `tables: []`;
- `onNew` `new_conversation` — clear `tables: []`;
- `onSelect` `select_conversation` — clear `tables: []`;
- `onSelect` `set_results` — populate `tables` from `…get-conversation-results.response.tables`,
  **inside the existing `skip:` race guard**. Do not add a second `SetState` step outside it.

**`onDataPart` — a third branch** beside `append_chart` and `append_download`, on the same shape:
`skip:` unless `_event: type` equals `data-report-table`, then `_array.concat` the event's `data`
onto `_if_none: [{ _state: tables }, []]`.

**The Tables section** in the results panel, visible when `results_scope` is `all` or `tables`
(task 12 left the option present and the section empty). A `List` over `_state: tables`, each item
a card carrying:

- a `Title` with `_state: tables.$.title`;
- **the truncation line** — a `Paragraph` in the same secondary style the download descriptions
  use, saying `first 200 of {row_count} rows` when `row_count` exceeds the persisted row count,
  and adding that the query itself was capped when `row_count` is at or above 1000 (the engine
  appends a trailing `$limit: 1000` silently). Reuse the report side's wording — `— first 1000
rows` — rather than inventing a second phrasing for the same fact. Render nothing when the part
  is complete.
- an `AgGridBalham` over `_state: tables.$.rows`, with its column definitions built from
  `_state: tables.$.spec.columns` — `{ key, label?, format? }` per column, in order, `label`
  falling back to `key`. `spec.columns` is the one copy; do not carry a second column array on the
  part.
- the **`created` date**, formatted with `_dayjs` — _as of 14 July_ — read through
  `_if_none` so a part written before task 6 renders without it. Same treatment for `id`.

Add the same date line to the **chart** cards, for the same reason: the option is a snapshot of
that turn, and the panel currently cannot answer as-of-when.

**AgGrid**: use `AgGridBalham`, never another theme. Read
`apps/demo/.claude/guides/aggrid-tables.md` before configuring it, and consult
`lowdefy_get_schema` for the block's column-definition shape rather than guessing.

Update the page's header comment: the panel accumulates charts, **tables** and downloads, each
part carrying its own id, a `created` stamp and the validated spec a saved report section is built
from.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds.
- Against a running app: asking the assistant for a table produces a card in the panel with the
  right columns in the declared order and the declared labels; it survives switching away and back
  to the conversation; it survives a reload.
- A seeded table result over 200 rows (task 16) shows 200 rows and says `first 200 of N rows`.
- A result landing on exactly 1000 rows says the query was capped too.
- Selecting the Tables scope shows only tables; All shows all three kinds.
- Starting a new chat clears the table cards along with the charts and downloads.
- A conversation whose parts predate `id` / `created` still renders — no blank date line, no error.

## Files

- `modules/ai-reporting/pages/chat.yaml` — modify — the `tables` state array in all four places, the
  `onDataPart` branch, the Tables section
- `modules/ai-reporting/pages/chat/components/*.yaml` — create, if the card is extracted

## Notes

**Nothing in this task selects a result.** Ticking results and the save sheet they feed belong to
[save-as-report](../../save-as-report/design.md); this task builds the panel that hosts them. Do
not add a `CheckboxSwitch`, a selection array, or a "Save as report" button.

Nothing reorders results in the panel — ordering is arrival order. Do not add drag handles.

Extract the card into a `_ref`'d component file if the nesting exceeds ~3–4 levels; component
files are snake_case.
