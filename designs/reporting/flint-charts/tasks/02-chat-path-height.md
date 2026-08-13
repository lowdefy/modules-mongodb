# Task 2: Chat path — `buildDataParts` emits `height`, the panel binds it

## Context

Task 1 created `buildFlintOption({ chart, x, y, rows })` → `{ option, height }` in
`plugins/modules-mongodb-plugins/src/analytics/buildFlintOption.js`. The chat path still uses the
old builder: `buildDataParts.js:100-105` emits
`{ type: "data-report-chart", data: { title, option: buildEChartsOption(...), spec } }`, and the
results panel (`modules/reporting/pages/chat/components/chat_workspace.yaml:686-694`) renders each
part with `type: EChart` at a hardcoded `height: 300`.

This task migrates the chat path: the data part gains `height`, and the panel binds it. Flint's
`height` is the canvas the chart wants (plot pinned at 220 + label furniture); the block's height
follows it. Parts persisted before this change have no `height` key, so the panel falls back to
`300` — the old constant.

The per-chart `try` in `buildDataParts` (`:95-108`) already contains a builder throw by skipping
that chart — Flint can throw where the old builder could not, and that containment is exactly why
nothing else is needed here.

## Interfaces

- **Consumes:** `buildFlintOption({ chart, x, y, rows })` → `{ option, height }` (task 1; default
  export of `./buildFlintOption.js`).
- **Produces:** chart data parts of shape
  `{ type: "data-report-chart", data: { title, option, height, spec } }` — the `height` key is new
  and later consumers (persisted conversations, the panel binding below) rely on that exact name.

## Task

1. **`plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js`** — replace the
   `buildEChartsOption` import with `buildFlintOption` and, inside the existing per-chart `try`,
   destructure and emit both keys:

   ```js
   const { option, height } = buildFlintOption({ chart, x, y, rows });
   parts.push({
     type: "data-report-chart",
     data: { title, option, height, spec: { chart, query, x, y } },
   });
   ```

   Everything else in the function — validation order, budgets, the silent skip — stays as is.

2. **`modules/reporting/pages/chat/components/chat_workspace.yaml`** — the results-panel `EChart`
   (around `:686-694`, block id `charts.$.chart`) changes its hardcoded `height: 300` to:

   ```yaml
   height:
     _if_none:
       - _state: charts.$.height
       - 300
   ```

   The `option` binding and everything around it is untouched. (`onDataPart` at `:355` appends the
   whole `data` blob to state, so `charts.$.height` exists for new parts automatically; persisted
   parts predate the field and take the fallback.)

3. **`plugins/modules-mongodb-plugins/src/analytics/buildDataParts.test.js`** — update existing
   assertions that inspect the chart part's `data.option` shape (the option is now Flint's inlined
   form, not `dataset`+`encode`), and add an assertion that `data.height` is a number on an emitted
   chart part.

## Acceptance Criteria

- `buildDataParts` tests pass (sandbox off).
- A chart part fixture asserts `data.height` is a number and `data.option` carries no `_`-keys and
  no `dataset` key.
- `pnpm ldf:b` from `apps/demo` compiles (the yaml change is config-only; the build is the check
  that the `_if_none` binding parses).
- `buildEChartsOption.js` still exists — task 4 deletes it.

## Files

- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.js` — modify — import + emit
  `height`.
- `plugins/modules-mongodb-plugins/src/analytics/buildDataParts.test.js` — modify — option shape +
  `height` assertions.
- `modules/reporting/pages/chat/components/chat_workspace.yaml` — modify — height binding with
  `300` fallback.

## Notes

- Do not touch `get-conversation-results.yaml` — persisted parts flow through it opaquely, and the
  `_if_none` fallback is what handles their missing `height`.
- The `_if_none` operator (single underscore) is correct here — this yaml is page config evaluated
  at runtime, not a compiled-report definition (those use the `__`-deferred forms and are task 4's
  business).
