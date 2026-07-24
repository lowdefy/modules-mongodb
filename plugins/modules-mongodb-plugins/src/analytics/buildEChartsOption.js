/**
 * Builds an ECharts option from a chart kind, the declared presentation
 * contract (`x` category column, `y` value columns), and result rows. Uses the
 * ECharts dataset + explicit-encode form so the data source is exactly the
 * query's row array — compileReport swaps the source for a deferred `__state`
 * read on filtered sections without touching the series config.
 *
 * The AI never contributes chart config: it names a chart kind, a query and the
 * x/y columns; this function shapes everything else server-side.
 */
function buildEChartsOption({ chart, x, y, rows }) {
  const source = rows ?? [];

  if (chart === "pie") {
    return {
      tooltip: { trigger: "item" },
      legend: {},
      dataset: { source },
      series: [
        {
          type: "pie",
          encode: { itemName: x, value: y[0] },
        },
      ],
    };
  }

  // bar / line
  return {
    tooltip: { trigger: "axis" },
    ...(y.length > 1 ? { legend: {} } : {}),
    dataset: { source },
    xAxis: { type: "category" },
    yAxis: { type: "value" },
    series: y.map((column) => ({
      type: chart,
      name: column,
      encode: { x, y: column },
    })),
  };
}

export default buildEChartsOption;
