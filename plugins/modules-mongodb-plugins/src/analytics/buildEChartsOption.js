/**
 * Builds an ECharts option from a chart kind, the declared presentation
 * contract (`x` category column, `y` value columns), and result rows. Uses the
 * ECharts dataset + explicit-encode form so the series read columns by name
 * from a shared source — compileReport passes `rows: []` here and then
 * overwrites `dataset.source` outright with `dataBinding(section, rows)`, so
 * the report path never sees the projection below in either direction.
 *
 * The AI never contributes chart config: it names a chart kind, a query and the
 * x/y columns; this function shapes everything else server-side.
 */
function buildEChartsOption({ chart, x, y, rows }) {
  // This option is persisted onto the conversation document as a chart part;
  // an unprojected source would make the part as wide as the query's whole
  // row array instead of as wide as the [x, ...y] columns the series actually
  // encode. Object form (not tuples) because encode addresses columns by name
  // and the dataset's implicit dimension detection reads the first row's keys.
  const columns = [x, ...y];
  const source = (rows ?? []).map((row) =>
    Object.fromEntries(columns.map((column) => [column, row[column]])),
  );

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
