# Task 6: `emit-data-parts` — table rows, minted ids, and a bounded parts array

## Context

`modules/ai-reporting/api/emit-data-parts.yaml` is the onFinish hook that turns a turn's tool
results into panel parts. Today it:

1. returns early when the payload carries no `conversationId`;
2. `:set_state`s `chart_specs` and `download_specs` by `_mql.expr`-filtering
   `_payload: toolResults` on `toolName` and `$slice`ing each to 8;
3. runs a `:for chart :in { _state: chart_specs }` loop, each iteration a `:try`-wrapped
   `AnalyticsPipeline` step `id: chart_rows` with only `query` and `roles` set — so it takes
   `connection.maxResultBytes` (8 MB) — and a `:catch` that logs and skips;
4. calls `_analytics.buildDataParts` with `charts`, `results: { _step: chart_rows }`,
   `downloads`, `roles`;
5. `$push`es the parts with `$each` and **no cap**, `upsert: false`, filtered on
   `{ _id: payload.conversationId, owner.user_id: _user.id }`;
6. returns `dataParts` (camelCase — the agent framework's key for stream parts).

Three gaps. There is no table loop, so a `data-report-table` part can never be produced. A part
carries no `id` and no `created`, so selection has nothing stable to bind to and a frozen chart
cannot be dated. And the array is unbounded per conversation — the 8-per-kind cap is per turn.

`get-conversation-results.yaml` reads the parts back on conversation select, splitting them by
`type` into `charts` and `downloads` via `_mql.expr` `$filter` + `$map` with `in: $$this.data`.

Task 3 widened `buildDataParts` to take `tables` / `tableResults` and to emit
`{ type: "data-report-table", data: { title, rows, row_count, spec: { query, columns } } }`.
Task 5 added `render-table`, acking `{ ok, title, spec: { title, query, columns } }`.

## Interfaces

- **Consumes:** `buildDataParts`' widened signature (task 3); `render-table`'s ack shape (task 5).
- **Produces:** persisted parts of shape `{ type, data: { id, created, … } }`, the array bounded
  at the most recent 50; `get-conversation-results` returning a third `tables` key.

## Task

**`modules/ai-reporting/api/emit-data-parts.yaml`:**

- **Add `table_specs`** to the existing `:set_state:` step, filtering `toolResults` on
  `toolName: render_table` and `$slice`ing to 8 — the same `_mql.expr` shape as the two beside
  it, reading `$$this.output.spec`.
- **Add a second `:for` loop**, after the chart loop, `:for table :in { _state: table_specs }`,
  with the same `:try` / `:catch` isolation and a step `id: table_rows`. Set only `query`
  (`_item: table.query`) and `roles` — **the same 8 MB fetch budget the chart loop uses.**

  Comment why it does not take the 200 KB budget task 4 added: projecting the part to the
  columns it displays and capping its rows already bounds what lands in the document, so a tight
  budget on the _fetch_ would only reject queries whose part would have been small anyway — a
  `$$ROOT` pipeline charting or tabulating two of its fields is fat to fetch and tiny to
  persist. And it would fail badly: the turn is over, so the agent cannot narrow anything, and
  the `:catch` logs and skips, meaning the user loses the artefact with no explanation. The 8 MB
  app-memory backstop is the right bound for a fetch nobody re-sends.

- **Pass `tables` and `tableResults`** to `_analytics.buildDataParts` beside `charts` /
  `results`.
- **Mint `id` and `created` here**, mapping over `buildDataParts`' return rather than inside it —
  that function is pure with a unit test file beside it, and a uuid or a clock read there would
  make it non-deterministic. The repo's precedent is the routine: `generate-report` mints a
  report `_id` with `_uuid`.

  Read one turn timestamp into state first (`_date: now`), because every part of a turn shares
  it — that is in fact what they share. Then map:

  ```yaml
  - :set_state:
      data_parts:
        _array.map:
          - _state: built_parts
          - _function:
              type:
                __args: 0.type
              data:
                __object.assign:
                  - id:
                      __uuid: true
                    created:
                      __state: turn_timestamp
                  - __args: 0.data
  ```

  Operators inside a `_function` callback take the `__` prefix so they resolve in the callback's
  `__args` scope — the page's existing `_array.map` over conversations has the same note.
  `_uuid` is declared `dynamic`, so it is re-evaluated per item and each part gets a distinct v4;
  a non-dynamic operator would resolve once and every part would share one id. Comment that.

  **`created` is a bare timestamp, not a change stamp.** Every _document_ this module writes
  carries the full `_ref`'d stamp; a part is not a document and has no author of its own — the
  conversation's `owner` answers who, one level up. Repeating a user id and display name on
  fifty array elements buys nothing and goes stale independently. Comment it, because it is the
  one place in this module that deliberately does not `_ref` `defaults/change_stamp.yaml`.

- **Bound the array on write:**

  ```yaml
  $push:
    data_parts:
      $each:
        _state: data_parts
      $slice: -50
  ```

  Comment what the 50 is for: panel length, not document size — the size bounds are the
  projection and the row cap. A panel with two hundred cards is not a panel, and an unbounded
  array under an id-keyed selection is a correctness problem as well as a UI one. It is a
  starting number, not a derived one.

**`modules/ai-reporting/api/get-conversation-results.yaml`:** add a third `tables` branch to the
`$let` beside `charts` and `downloads` — `$filter` on `type: data-report-table`, `in: $$this.data`
— and return it as a `tables` key. The new part fields need no projection work: `in: $$this.data`
already passes the whole `data` object through, so `id`, `created`, `row_count` and `spec` arrive
with it. Update the header comment: the parts come back split by type matching the page's three
state keys, and its existing "charts carry a baked ECharts option (a snapshot of the data as of
the turn)" sentence gains that each part now carries the `created` date that dates that snapshot
and the validated `spec` a saved report section is built from.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` builds; both `:for` loops and the `$slice` appear in the
  generated `.lowdefy/server/build/` artefact for `emit-data-parts`.
- A turn emitting two `render_table` calls persists two `data-report-table` parts, each with a
  distinct `id`, both sharing one `created` timestamp.
- A conversation already holding 50 parts, after a turn producing 3, holds 50 — the oldest 3
  dropped.
- A table whose pipeline fails at turn end loses only its own part; the turn's charts and
  downloads still reach the panel.
- `get-conversation-results` returns `{ messages, charts, tables, downloads }`.

## Files

- `modules/ai-reporting/api/emit-data-parts.yaml` — modify — table specs, the second `:for`, minted
  `id` / `created`, `$slice: -50`
- `modules/ai-reporting/api/get-conversation-results.yaml` — modify — the third branch

## Notes

`upsert: false` on the `$push` stays, and so does its comment: the prior onFinish hook
(`save-conversation`) owns the document lifecycle, and creating it here would leave a
title-less, created-less document if that hook had failed.

All three new part fields are additive, so parts written before them are read through
`_if_none` on the page side (task 14) — do not backfill.

`toolResults`, `toolName` and `dataParts` stay camelCase: they are the agent framework's
`onFinish` payload keys, not names this module chooses. The persisted field is `data_parts`.
