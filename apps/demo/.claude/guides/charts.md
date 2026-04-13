# Charts & Reports

How to build data visualizations using EChart, Statistic blocks, and the reporting card wrapper.

## Pattern

All charts use the `EChart` block type (Apache ECharts via Lowdefy). Charts are wrapped in a **reporting card** component (`reporting_card.yaml`) that provides: title, loading skeleton, no-data empty state, optional header buttons, and a content area for the chart itself.

**Reporting card wrapper** — a shared component that handles the boilerplate:
```yaml
_ref:
  path: ../shared/reporting/components/reporting_card.yaml
  vars:
    id: {chart_id}
    title: {Chart Title}
    no_data_type: bar_chart    # icon: pie_chart, line_chart, bar_chart, table, statistic
    height: 500                # skeleton + no-data placeholder height
    data:                      # array to check for empty state
      _request: get_{data}
    extra: []                  # header buttons (drill-down back, export)
    content:                   # the EChart block(s)
      - id: {chart}
        type: EChart
        properties:
          height: 500
          option: {echart_config}
```

The wrapper shows a skeleton while `data` is null, a "No data" result icon when the array is empty, and the chart content when data exists.

**EChart configuration** follows the standard Apache ECharts `option` structure: `dataset`, `xAxis`, `yAxis`, `series`, `tooltip`, `legend`, `toolbox`, `grid`, `color`, `visualMap`. Data comes from `_request` results, usually shaped by the aggregation pipeline into the format the chart expects.

**Colors from enums** — chart series colors should reference status enum colors via `_get` from `_ref: ../shared/enums/{type}.yaml` or `_global: enums.{type}`. This keeps charts semantically consistent with tables and badges.

**Click-to-filter interactivity** — charts emit `click` events with `_event: data`. The handler typically sets filter state and either re-fetches requests (same page drill-down) or navigates to a list page with URL query filters:
```yaml
events:
  click:
    - id: set_filter
      type: SetState
      params:
        filter.status:
          - _event: data.name
    - id: refresh
      type: Request
      params: [get_data_1, get_data_2]
```

**Statistics blocks** — `type: Statistic` for single KPI numbers (counts, totals). Placed in Cards with `textAlign: center`, using `loading` + `skeleton` for progressive display. Often clickable — navigate to a filtered list page on click.

## Data Flow

```
Report page onMount → filter state initialized → Request fires aggregation
  → Pipeline: $match (date range, filters) → $group/$project → shaped data array
  → EChart reads _request as dataset.source or series.data
  → Colors mapped from _global: enums.{type} or _ref to enum files
  → User clicks chart segment → click event → SetState filter → Request re-fetches → charts update
  → Or: click → Link to list page with filter in urlQuery
```

## Variations

**Stacked bar chart** — multiple series with `stack` and enum-derived colors:
```yaml
series:
  - type: bar
    name: Closed
    stack: status
    encode: { y: _id, x: closed }
    itemStyle: { opacity: 0.8, borderWidth: 1 }
  - type: bar
    name: Open
    stack: status
    encode: { y: _id, x: open }
```
Add `type: line` with `lineStyle: { opacity: 0 }` as a "total" overlay with labels.

**Time-series line chart** — `xAxis: { type: time }` with `dataset.dimensions`:
```yaml
xAxis:
  type: time
  axisLabel: { formatter: '{d} {MMM}' }
series:
  - type: line
    encode: { x: _id, y: created }
    connectNulls: true
```
Add confidence bands with paired upper/lower line series using `areaStyle`.

**Heatmap** — agent × status grid, `visualMap` for color intensity:
```yaml
xAxis:
  type: category
  data:
    _array.map:
      on:
        _mql.aggregate:
          on: { _request: get_heatmap_data }
          pipeline: [{ $group: { _id: $status } }]
      callback:
        _function: { __args: 0._id }
yAxis:
  type: category
  data: {same pattern for agents}
visualMap:
  min: 0
  max: {computed from data}
  inRange:
    color: ['#fff', { _ref: { path: app_config.yaml, key: colors.primary } }]
series:
  type: heatmap
  data:
    _array.map:
      on: { _request: get_heatmap_data }
      callback:
        _function:
          value: [{ __args: 0.x }, { __args: 0.y }, { __args: 0.count }]
```
Use `_mql.aggregate` client-side to extract axis categories from the same dataset.

**Pie/donut chart** — `series.radius: ['40%', '70%']` for donut:
```yaml
series:
  type: pie
  radius: ['40%', '70%']
  padAngle: 4
  itemStyle: { borderRadius: 10 }
  selectedMode: single
```

**Treemap** — for hierarchical breakdowns (causes, categories):
```yaml
series:
  type: treemap
  data:
    _array.map:
      - _request: get_data
      - _function:
          __object.assign:
            - __args: 0
            - name: { __get: { key: ..., from: _global: enums.{type} } }
              itemStyle: { color: { __get: { key: ..., from: _global: enums.{type} } } }
  breadcrumb: { show: false }
```

**Sparkline/micro-chart** — minimal trend line in a small area, no axes:
```yaml
xAxis: { type: time, show: false }
yAxis: { type: value, show: false, min: dataMin }
grid: { left: 0, top: 0, right: 0, bottom: 20 }
series:
  - type: line
    areaStyle: { opacity: 0.3 }
    symbol: none
    smooth: true
    encode: { x: month, y: {field} }
```

**KPI statistics row** — clickable cards with single numbers:
```yaml
- id: kpi_card
  type: Card
  layout: { span: 5 }
  properties:
    style: { border: '1px solid #8484844c', textAlign: center, height: 100px }
  events:
    onClick: [set filter + link to list page]
  blocks:
    - id: stat
      type: Statistic
      loading: { _eq: [_request: get_stats, null] }
      properties:
        title: Tickets Created Today
        value: { _request: get_stats.0.created_today }
        precision: 0
        valueStyle: { fontSize: 32, fontWeight: 500 }
```

## Anti-patterns

- **Don't hardcode colors** — reference enum colors via `_get` from `_global: enums` or `_ref` to enum files. Hardcoded hex values drift from the design system and break semantic consistency.
- **Don't skip the reporting card wrapper** — building custom loading/empty states per chart is repetitive and inconsistent. Use the shared `reporting_card.yaml`.
- **Don't forget `toolbox.saveAsImage`** — every chart should include `toolbox: { show: true, feature: { saveAsImage: { show: true } } }` so users can export.
- **Don't put heavy data transforms in the chart config** — shape data in the aggregation pipeline or a dedicated request. Use `_array.map` and `_mql.aggregate` client-side only for axis category extraction or light reshaping.
- **Don't build charts that just show data** — every chart should answer a question or drive an action. Add click handlers that filter other charts or navigate to detail views. A chart without interactivity is a screenshot.

## Reference Files

- `modules/shared/layout/card.yaml` — card component (used for KPI statistics, can also wrap charts in module context)

## Template

```yaml
# components/tiles/{chart_name}/{chart_name}.yaml
_ref:
  path: ../shared/reporting/components/reporting_card.yaml
  vars:
    id: {chart_id}
    title: {Chart Title}
    no_data_type: bar_chart
    height: 500
    data:
      _request: get_{chart_data}
    content:
      - id: {chart_id}_chart
        type: EChart
        events:
          click:
            - id: set_filter
              type: SetState
              params:
                filter.{field}:
                  - _event: data.{key}
            - id: refresh
              type: Request
              params: [{request_1}, {request_2}]
        properties:
          height: 500
          option:
            dataset:
              source:
                _request: get_{chart_data}
            tooltip:
              trigger: axis
            toolbox:
              show: true
              feature:
                saveAsImage:
                  show: true
                  title: false
                  name: {export_filename}
            legend:
              top: 0
              show: true
            grid:
              left: '15%'
            xAxis:
              type: category
              axisLabel:
                interval: 0
            yAxis:
              type: value
              name: {Y Axis Label}
              nameLocation: middle
              nameGap: 40
            series:
              - type: bar
                name: {Series Name}
                encode:
                  x: {x_field}
                  y: {y_field}
                itemStyle:
                  opacity: 0.8
                  borderWidth: 1
                  color:
                    _get:
                      from:
                        _global: enums.{type}
                      key: {status}.color
```

## Checklist

- [ ] Chart wrapped in `reporting_card.yaml` with `data`, `height`, `no_data_type`
- [ ] `toolbox.saveAsImage` included for export capability
- [ ] Series colors reference enum values (not hardcoded hex)
- [ ] Click events drive interactivity (filter state → re-fetch, or navigate to list)
- [ ] Tooltip configured — `trigger: axis` for bar/line, `trigger: item` for pie/treemap
- [ ] `_mql.aggregate` used only for light client-side reshaping (axis categories, not heavy transforms)
- [ ] Statistics use `Statistic` block with `loading` + `skeleton` for progressive display
- [ ] Chart answers a question — "which agent has the most tickets?" not just "here's some data"
