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

// A pie is sized differently from an axis chart, on both counts. Flint gives it
// the same label-driven canvas (280px for the base height above) and then draws
// the slices at an ABSOLUTE outer radius derived from baseSize — 60px, so the
// pie stayed 120px across in an 1100px-wide column and read as a dot with four
// leader lines. That is the same baseSize-absolute defect as `series.barWidth`
// and `legend.left` below, and it gets the same treatment: a percentage radius,
// which ECharts resolves against min(canvas width, height) and so fills whatever
// canvas the block is given — the report's full-width column or the chat panel's
// 420px one.
//
// The canvas is set here rather than taken from Flint because a pie has no tick
// labels to lay out: nothing about 280px belongs to its content, where an axis
// chart's height genuinely does. 400 x 70% draws a 280px pie — a little over
// twice the old one, which is what it takes to read the slices and their labels
// at this column width — and leaves room above and below for the labels ECharts
// places outside the circle.
const PIE_HEIGHT = 400;
const PIE_RADIUS = "70%";

// Column names for the wide → long fold that renders multiple `y` columns as
// sibling series. Flint's own multi-`y` route (an array `y`, or
// `normalizeStaticSeries`) folds onto `__flint_series_key`/`__flint_series_value`
// and leaks those literals onto the y-axis and the canvas, so we fold ourselves
// under names a reader can see without harm. Exported (with humanize) so
// validateChartSpec can reject display-name collisions by the same rules.
export const SERIES_KEY = "Measure";
export const SERIES_VALUE = "Value";

// Column names land verbatim on axis titles, legends and tooltips, and pipeline
// columns are snake_case or camelCase — so the rows are re-keyed to Title Case
// before assembly and the encodings point at the display names. Data values
// (the categories themselves) are never touched.
export function humanize(name) {
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

function buildFlintOption({ chart, x, y, rows, stacked }) {
  const values = rows ?? [];
  const multi = y.length > 1;
  const xName = humanize(x);
  const yName = humanize(y[0]);
  // Humanizing can collide: distinct pipeline columns can map onto one display
  // name (total_sales / totalSales), and an x column named "value" or "measure"
  // maps onto the fold columns below. The folded rows are object literals, so a
  // collision silently overwrites a key and draws a garbage chart — reject it
  // with the rename that fixes it instead. validateChartSpec runs the same
  // checks where the agent can still act on them; this copy is the backstop
  // for specs persisted before the rule existed, which reach assembly without
  // revalidation.
  if (multi) {
    if (xName === SERIES_KEY || xName === SERIES_VALUE) {
      throw new Error(
        `Chart columns collide: x column "${x}" displays as "${xName}", which the multi-series fold reserves — $project the column to another name.`,
      );
    }
    const seen = new Map();
    for (const column of y) {
      const name = humanize(column);
      if (seen.has(name)) {
        throw new Error(
          `Chart columns collide: y columns "${seen.get(name)}" and "${column}" both display as "${name}" — $project one to another name.`,
        );
      }
      seen.set(name, column);
    }
  } else if (xName === yName) {
    throw new Error(
      `Chart columns collide: x column "${x}" and y column "${y[0]}" both display as "${xName}" — $project one to another name.`,
    );
  }
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
    // Grouped is the default for folded series because arbitrary `y` columns
    // are unrelated measures whose stacked total means nothing; `stacked` opts
    // a breakdown into "Stacked Bar Chart", whose fold-key channel is `color`
    // where the grouped template's is `group`. A plain "Bar Chart" is never
    // given folded series — it stacks them regardless — and a single series
    // stacks with nothing, so `stacked` changes nothing there.
    if (multi) {
      chartType = stacked ? "Stacked Bar Chart" : "Grouped Bar Chart";
      encodings = {
        x: { field: xName },
        y: { field: SERIES_VALUE },
        [stacked ? "color" : "group"]: { field: SERIES_KEY },
      };
    } else {
      chartType = "Bar Chart";
      encodings = { x: { field: xName }, y: { field: yName } };
    }
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
  const height = chart === "pie" ? PIE_HEIGHT : option._height;
  strip(option);
  // A text element painting the fold key column's name over the top-right of
  // the canvas — series labelling the legend already carries.
  delete option.graphic;
  // The grouped-bar template computes an absolute pixel bar width from
  // baseSize.width, but the block renders at the panel's real CSS width — on
  // any narrower canvas the fixed bars overflow their category slots and draw
  // on top of each other. Dropped so ECharts sizes bars to the slots it
  // actually has; the percentage gaps that keep the grouping survive.
  if (Array.isArray(option.series)) {
    for (const series of option.series) {
      delete series.barWidth;
      // Flint's radius is [inner, outer]; only the outer is baseSize-absolute,
      // and the inner ("0%") is what keeps this a pie rather than a donut.
      if (series.type === "pie") series.radius = ["0%", PIE_RADIUS];
    }
  }
  // Same defect on the folded line template: its legend sits at an absolute
  // left offset derived from baseSize.width, off-canvas on a narrow panel.
  // Pin it to the right edge the way the bar templates already do.
  if (option.legend && typeof option.legend.left === "number") {
    delete option.legend.left;
    option.legend.right = 10;
  }

  return { option, height };
}

export default buildFlintOption;
