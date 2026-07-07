/**
 * Builds an ECharts option from a chart kind, the query's shape, and result
 * rows. Uses the ECharts dataset + encode form so the data source is exactly
 * the query's row array — compileReport swaps the source for a deferred
 * `__state` read on filtered sections without touching the series config.
 *
 * The AI never contributes chart config: it names a chart kind and a query;
 * this function shapes everything else server-side.
 */
function buildEChartsOption({ chart, select, measures, rows }) {
  const source = rows ?? [];

  if (chart === "pie") {
    return {
      tooltip: { trigger: "item" },
      legend: {},
      dataset: { source },
      series: [
        {
          type: "pie",
          encode: { itemName: select[0], value: measures[0].key },
        },
      ],
    };
  }

  // bar / line
  return {
    tooltip: { trigger: "axis" },
    ...(measures.length > 1 ? { legend: {} } : {}),
    dataset: { source },
    xAxis: { type: "category" },
    yAxis: { type: "value" },
    series: measures.map((measure) => ({
      type: chart,
      name: measure.key,
      encode: { x: select[0], y: measure.key },
    })),
  };
}

export default buildEChartsOption;
