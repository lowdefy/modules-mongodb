import { assembleECharts } from "flint-chart/echarts";

/**
 * Builds an ECharts option from a chart kind, the declared presentation
 * contract (`x` category column, `y` value columns), and result rows, by
 * handing the rows to Flint's ECharts compiler — which derives label rotation,
 * grid padding, axis types and colours from the actual data.
 *
 * The AI never contributes chart config: it names a chart kind, a query and the
 * x/y columns; Flint shapes everything else server-side.
 */

// Flint's contract is "pin the plot, we tell you the canvas": `height` is the
// plot area and axis furniture is added on top of it, so the returned `height`
// varies with the labels. Width feeds no layout decision, but a `baseSize`
// missing either field yields `_width: NaN`, so both are always present.
const BASE_SIZE = { width: 1100, height: 180 };

// Column names for the wide → long fold that renders multiple `y` columns as
// sibling series. Flint's own multi-`y` route (an array `y`, or
// `normalizeStaticSeries`) folds onto `__flint_series_key`/`__flint_series_value`
// and leaks those literals onto the y-axis and the canvas, so we fold ourselves
// under names a reader can see without harm.
const SERIES_KEY = "Measure";
const SERIES_VALUE = "Value";

// Column names land verbatim on axis titles, legends and tooltips, and pipeline
// columns are snake_case or camelCase — so the rows are re-keyed to Title Case
// before assembly and the encodings point at the display names. Data values
// (the categories themselves) are never touched.
function humanize(name) {
  return String(name)
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Assembled options carry private metadata (`_width`, `_height`, `_pivot`, …)
// that would otherwise be persisted forever into report specs and data parts,
// and a `tooltip.formatter` function that cannot survive the JSON every option
// here travels through. Stripping both makes what actually ships explicit.
function strip(node) {
  if (Array.isArray(node)) {
    node.forEach(strip);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const key of Object.keys(node)) {
    if (key.startsWith("_") || typeof node[key] === "function") {
      delete node[key];
      continue;
    }
    strip(node[key]);
  }
}

function buildFlintOption({ chart, x, y, rows }) {
  const values = rows ?? [];
  const multi = y.length > 1;
  const xName = humanize(x);
  const yName = humanize(y[0]);
  // The fold key column is the series identity, so folded rows carry only
  // `x` — the other `y` columns of a row become that row's sibling entries.
  // Single-series rows are re-keyed the same way, narrowed to the encoded
  // columns.
  const folded = multi
    ? values.flatMap((row) =>
        y.map((column) => ({
          [xName]: row[x],
          [SERIES_KEY]: humanize(column),
          [SERIES_VALUE]: row[column],
        })),
      )
    : values.map((row) => ({ [xName]: row[x], [yName]: row[y[0]] }));

  let chartType;
  let encodings;
  if (chart === "pie") {
    // Pie's channels are size/color — it has no `y`, and an unrecognised
    // channel is dropped silently, leaving every slice equal to 1.
    chartType = "Pie Chart";
    encodings = { color: { field: xName }, size: { field: yName } };
  } else if (chart === "bar") {
    // Folded series through a plain "Bar Chart" come back stacked; only
    // "Grouped Bar Chart" (whose channels include `group`) dodges them.
    chartType = multi ? "Grouped Bar Chart" : "Bar Chart";
    encodings = multi
      ? {
          x: { field: xName },
          y: { field: SERIES_VALUE },
          group: { field: SERIES_KEY },
        }
      : { x: { field: xName }, y: { field: yName } };
  } else {
    chartType = "Line Chart";
    encodings = multi
      ? {
          x: { field: xName },
          y: { field: SERIES_VALUE },
          color: { field: SERIES_KEY },
        }
      : { x: { field: xName }, y: { field: yName } };
  }

  const option = assembleECharts({
    data: { values: folded },
    chart_spec: { chartType, encodings, baseSize: BASE_SIZE },
  });

  // Read before the strip walk removes it: this is the canvas Flint sized for
  // the labels it laid out, and the only place that number exists.
  const height = option._height;
  strip(option);
  // A text element painting the fold key column's name over the top-right of
  // the canvas — series labelling the legend already carries.
  delete option.graphic;

  return { option, height };
}

export default buildFlintOption;
