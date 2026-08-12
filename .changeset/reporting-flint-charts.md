---
"@lowdefy/modules-mongodb-reporting": minor
"@lowdefy/modules-mongodb-plugins": minor
---

reporting: compile charts with `flint-chart` instead of hand-built ECharts options

Every chart the module renders — in the chat results panel and in a saved report
— is now assembled server-side by the `flint-chart` compiler (pinned exactly
`0.5.0`; its output shape is the contract, so it is not floated). The compiler
reads the actual result rows and derives axis names, label rotation, grid
padding, colours and pie labels from them, in place of the fixed option the
module used to build by hand.

The authoring contract does not move: a chart section still declares
`chart` / `x` / `y`, meaning exactly what it meant, and the agent still
contributes no chart config. **What changes is appearance — every existing
report's charts look different the next time they are opened.** Charts also no
longer sit at a fixed height: a chart's canvas is a constant plot area plus the
axis furniture its own labels need, so heights vary between sections and a
filter change can resize the section it re-queries. Two more visible
consequences are documented in
`docs/reporting/reference/presentation-contract.md`: bar charts over plain
category labels render sorted by value descending regardless of the pipeline's
`$sort`, and tooltips fall back to the ECharts defaults, because the compiler's
tooltip formatter is a function and the compiled option travels to the browser
as JSON.

Module: a new `chart-data` endpoint. A filtered chart section re-queries through
it rather than through `query-data`, since a chart now needs a compiled option
back rather than rows — a table section is unaffected and still calls
`query-data`.

Plugin: new `_analytics.buildFlintOption` (`{ chart, x, y, rows }` →
`{ option, height }`, JSON-safe); `buildEChartsOption` is removed, and
`compileReport` now requires a `chartEndpointId` alongside the existing
endpoint ids.
