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

// A pie past a handful of slices stops being readable: the tail slivers end up
// thinner than the leader lines pointing at them. Six identity slices plus one
// aggregate is the cap. A pie of exactly seven renders as seven — folding a
// single slice into an "Other" of one is noise, not a summary.
const PIE_SLICE_CAP = 6;
const OTHER_SLICE = "Other";

// Rounded at the data end, square at the baseline: a bar grows from its
// baseline, and rounding that end lifts it off the axis it is measured from.
const BAR_CAP_RADIUS = [4, 4, 0, 0];

// The eight-slot categorical set every chart draws from, validated against the
// card surface below for lightness band, chroma floor, CVD separation and
// normal-vision separation. The stock ECharts palette fails four of those five
// checks on this surface — 13.9 normal-vision ΔE between its own slots 2 and 3
// alone — which is why charts carry their own set rather than ECharts'.
//
// The fifth check, contrast against the surface, does not pass but relaxes:
// three slots sit under 3:1, which the validator discharges on condition of
// "visible labels or a table view". A compiled report satisfies both by
// construction — every multi-series chart carries a legend naming its series,
// every pie labels its slices, and every chart section carries a download that
// renders the same rows as a table — so the relief is taken deliberately here,
// not skipped.
//
// Nothing is derived from the consuming app's `colorPrimary`: these are chart
// marks, and the app's brand hue is not a data hue.
export const PALETTE = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

// Reserved for the capped pie's aggregate slice, and deliberately not a PALETTE
// slot: an "Other" wearing an identity hue reads as one more entity beside the
// six it stands in for.
export const NEUTRAL = "#8c8c8c";

// The card the charts are drawn on. Pie slice gaps are painted in it (ECharts
// has no gap — a border the colour of what is behind the slice is one), and it
// is the surface PALETTE is validated against.
export const CARD_SURFACE = "#ffffff";

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

// Pie values arrive straight out of an aggregation, so a slice value can be
// null or non-numeric; treating those as zero keeps one bad row from poisoning
// the tail total with NaN and blanking the whole pie.
function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// Ranks slices by value and folds everything past the cap into one aggregate.
// Runs on the folded rows rather than the assembled option because Flint derives
// the slice data, the labels and the legend from the rows it is given.
function capPieSlices(slices, xName, yName) {
  if (slices.length <= PIE_SLICE_CAP + 1) return { slices, capped: false };
  const ranked = [...slices].sort(
    (a, b) => numeric(b[yName]) - numeric(a[yName]),
  );
  const tail = ranked
    .slice(PIE_SLICE_CAP)
    .reduce((sum, slice) => sum + numeric(slice[yName]), 0);
  return {
    slices: [
      ...ranked.slice(0, PIE_SLICE_CAP),
      { [xName]: OTHER_SLICE, [yName]: tail },
    ],
    capped: true,
  };
}

// Flint declares its palette twice — once as `option.color` and again as a
// concrete hex on every `series[i].itemStyle.color` — and on bar and line the
// per-series value is the one that paints, so writing `option.color` alone
// recolours nothing but the legend swatches. Both writes, or neither has any
// effect. A pie series carries no colour of its own: its slices read
// `option.color` by index, which is why it is skipped below rather than given a
// series colour that would paint every slice the same.
//
// Assignment is by series index, so a hue here means only "not the one beside
// it". All of it lives in this one function so the assignment rule can change
// without the two-write mechanism moving with it.
function applyPalette(option) {
  option.color = PALETTE;
  if (!Array.isArray(option.series)) return;
  option.series.forEach((series, index) => {
    if (series.type === "pie") return;
    series.itemStyle = {
      ...series.itemStyle,
      color: PALETTE[index % PALETTE.length],
    };
  });
}

// The area under a single line is a wash, not a block: the series hue fading to
// nothing. Written as literal gradient stops because ECharts' gradient helpers
// are class instances, and this option travels through JSON on its way to being
// persisted and rendered — only data survives that.
function wash(hex) {
  const value = Number.parseInt(String(hex).slice(1), 16);
  const rgb = `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
  return {
    type: "linear",
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: `rgba(${rgb}, 0.18)` },
      { offset: 1, color: `rgba(${rgb}, 0)` },
    ],
  };
}

// Mark styling, applied after the palette so a mark can read its own hue.
// Everything set here is plain data for the same reason `wash` is.
function styleMark(series, { single, capped }) {
  if (series.type === "bar") {
    series.itemStyle = {
      ...series.itemStyle,
      borderRadius: BAR_CAP_RADIUS,
    };
    return;
  }
  if (series.type === "line") {
    series.lineStyle = { ...series.lineStyle, width: 2 };
    // Flint draws a bare polyline. A dot on the last point is where the eye
    // goes for "the latest value"; a dot on every point is noise on a long
    // series. So the symbol is off series-wide and re-enabled on one datum —
    // which needs both switches: `showSymbol: false` skips symbol drawing
    // altogether (a per-datum symbol under it never renders), and
    // `showAllSymbol` defaults to "auto", which drops the symbols whose
    // category-axis label the interval strategy skipped — on a crowded axis,
    // exactly the last one.
    series.showSymbol = true;
    series.showAllSymbol = true;
    series.symbol = "none";
    if (Array.isArray(series.data) && series.data.length > 0) {
      series.data[series.data.length - 1] = {
        value: series.data[series.data.length - 1],
        symbol: "circle",
        symbolSize: 8,
        // A ring in the card colour keeps the dot readable where it lands on
        // top of another series' line.
        itemStyle: { borderWidth: 2, borderColor: CARD_SURFACE },
      };
    }
    if (single) series.areaStyle = { color: wash(series.itemStyle.color) };
    return;
  }
  if (series.type === "pie") {
    // Flint's radius is [inner, outer]; only the outer is baseSize-absolute,
    // and the inner ("0%") is what keeps this a pie rather than a donut.
    series.radius = ["0%", PIE_RADIUS];
    series.itemStyle = {
      ...series.itemStyle,
      borderWidth: 2,
      borderColor: CARD_SURFACE,
    };
    // The capped tail is an aggregate, not an entity. Per-datum because a pie
    // takes its slice colours from `option.color` by index, so this is the only
    // place one slice can be told to sit outside the palette.
    if (capped && Array.isArray(series.data)) {
      for (const datum of series.data) {
        if (datum?.name !== OTHER_SLICE) continue;
        datum.itemStyle = { ...datum.itemStyle, color: NEUTRAL };
      }
    }
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
  let folded = multi
    ? values.flatMap((row) =>
        y.map((column) => ({
          [xName]: row[x],
          [SERIES_KEY]: humanize(column),
          [SERIES_VALUE]: row[column],
        })),
      )
    : values.map((row) => ({ [xName]: row[x], [yName]: row[y[0]] }));

  let pieCapped = false;
  if (chart === "pie") {
    const capped = capPieSlices(folded, xName, yName);
    folded = capped.slices;
    pieCapped = capped.capped;
  }

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
  applyPalette(option);
  if (Array.isArray(option.series)) {
    const single = option.series.length === 1;
    for (const series of option.series) {
      // The grouped-bar template computes an absolute pixel bar width from
      // baseSize.width, but the block renders at the panel's real CSS width —
      // on any narrower canvas the fixed bars overflow their category slots and
      // draw on top of each other. Dropped so ECharts sizes bars to the slots
      // it actually has; the percentage gaps that keep the grouping survive.
      delete series.barWidth;
      styleMark(series, { single, capped: pieCapped });
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
