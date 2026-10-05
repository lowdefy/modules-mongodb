# Task 1: Shared ECharts theme object, wired to all three EChart sites

## Context

Charts render at three sites: the compiled report chart blocks
(`compileReport.js` emits `type: EChart`), the chat result card
(`modules/ai-reporting/pages/chat/components/chat_workspace.yaml`, the
`charts.$.chart` block ~line 842), and the expand modal
(`modules/ai-reporting/pages/chat/components/expand_chart_modal.yaml`,
`expanded_chart_view` ~line 25). Today none sets a theme: `textStyle` is
undefined, so chart typography visibly differs from the page around it, and
axis labels render at ECharts' 10px default.

The `EChart` block accepts a theme object: `properties.theme` is registered via
`registerTheme('custom_theme_' + blockId, …)` (verified,
`@lowdefy/blocks-echarts` `EChart.js:100`; design "Where the styling lives" and
`findings.md` §3). ECharts merges a theme **under** the option, so the theme
may carry only what Flint leaves unset — typography, axis chrome, legend and
tooltip text, background. **Palette must NOT ride the theme** (Flint pins
`option.color` and per-series colours, which win — that's task 2's job).

The chat card and expand modal never pass through `compileReport`, so the theme
object is the only styling vehicle that reaches them. `compileReport` is plugin
JS and cannot `_ref` module YAML — so `api/resolve-report.yaml` loads the theme
and passes it as a parameter.

## Interfaces

- **Produces:**
  - `modules/ai-reporting/defaults/chart_theme.yaml` — the one theme file.
  - `compileReport({ spec, results, catalog, roles, …, theme })` — new optional
    `theme` parameter; when present, every emitted `EChart` block carries
    `properties.theme = theme`.

## Task

1. **Create `modules/ai-reporting/defaults/chart_theme.yaml`** — a plain
   ECharts theme object (light mode only; dark is out of scope):
   - `backgroundColor: transparent`
   - `textStyle.fontFamily`: the app's sans stack (the demo doesn't override
     Ant's default, so use Ant's stack:
     `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`)
   - `categoryAxis` / `valueAxis` / `timeAxis`: `axisLabel` fontSize 12 (up
     from the 10px default) in a muted ink (e.g. `rgba(0, 0, 0, 0.65)`),
     `axisLine` / `splitLine` in light greys, axis `nameTextStyle` matching.
   - `legend.textStyle` and `tooltip.textStyle` in the same family/ink.
   Compiled options stay free of font names and axis colours — if a later diff
   shows a font in an option, something regressed.
2. **Wire the two chat sites** — add to each EChart block's `properties`:
   ```yaml
   theme:
     _ref: defaults/chart_theme.yaml
   ```
   in `chat_workspace.yaml` (`charts.$.chart`) and `expand_chart_modal.yaml`
   (`expanded_chart_view`). Match the module's existing `_ref` path style for
   `defaults/` files (see `defaults/change_stamp.yaml` usages).
3. **Wire the report site** — in `modules/ai-reporting/api/resolve-report.yaml`,
   the `_analytics.compileReport` call (~line 148) gains
   `theme: { _ref: defaults/chart_theme.yaml }`.
4. **`compileReport.js`** — accept `theme` in the options object; in the chart
   section emitter (the `type: "EChart"` block, ~line 1476), set
   `properties.theme = theme` when provided. Filter re-queries need nothing:
   `chart-data` swaps only `option`/`height` through state bindings, so the
   theme set at compile time keeps applying.

## Acceptance Criteria

- `compileReport.test.js`: a compiled chart section carries `properties.theme`
  equal to the object passed in; absent `theme` param → no `theme` key
  (backwards compatible).
- `pnpm --filter @lowdefy/modules-mongodb-plugins build`, then `pnpm ldf:b`
  clean from `apps/demo`.
- `pnpm e2e` green — update `apps/demo/e2e/ai-reporting/` expectations if any
  assert the chart block's property shape.
- The theme file contains no `color:` palette array and no per-series styling.

## Files

- `modules/ai-reporting/defaults/chart_theme.yaml` — create
- `modules/ai-reporting/pages/chat/components/chat_workspace.yaml` — modify
- `modules/ai-reporting/pages/chat/components/expand_chart_modal.yaml` — modify
- `modules/ai-reporting/api/resolve-report.yaml` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify

## Notes

- Chat chart **parts persist the compiled option**, so a future theme change
  re-skins old chat cards too (the theme is applied at render, not persisted) —
  that is the point of the channel; keep it that way.
- Typography-matches-the-page is a visual claim: it is judged at PR review via
  `/r:dev-test` screenshots (design acceptance item 6), not by a build gate.
