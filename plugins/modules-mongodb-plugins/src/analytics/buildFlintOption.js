import { assembleECharts } from "flint-chart/echarts";

/**
 * Builds an ECharts option from a chart kind, the declared presentation
 * contract (`x` category column, `y` value columns), and result rows, by
 * handing the rows to Flint's ECharts compiler — which derives label rotation,
 * grid padding, axis types and colours from the actual data — and then rewriting
 * what Flint decided without the one thing it never consults: the width the
 * chart will actually be drawn at.
 *
 * The AI never contributes chart config: it names a chart kind, a query and the
 * x/y columns; Flint shapes everything else server-side.
 */

// Flint's contract is "pin the plot, we tell you the canvas": `height` is the
// plot area and axis furniture is added on top of it, so the returned `height`
// varies with the labels. A `baseSize` missing either field yields
// `_width: NaN`, so both are always present.
const BASE_PLOT_HEIGHT = 180;

// Flint derives only two things from `baseSize.width` and both are rewritten
// below — the absolute bar width and the absolute legend offset — so the
// caller's width reaches Flint only to keep `baseSize` whole. Every layout
// decision the width actually drives is made in the post-pass.
//
// The fallback is the report column, where most charts are drawn. It is applied
// with a finite check rather than a default parameter because one caller is an
// endpoint payload, where an absent key arrives as null and a default parameter
// would not fire.
const DEFAULT_WIDTH = 1100;

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

// Where a vertical right-hand legend stops paying for itself. Flint funds that
// legend out of `grid.right`, which measures 79-163px — a fair trade against the
// full-width report column, and a third of the canvas on the 420px chat panel.
// 700 clears the widest narrow surface (a half-width card, ~540px) while staying
// well under the report column.
const NARROW_WIDTH = 700;

// A horizontal legend band's row height, and the allowance each entry needs
// beyond its text for its colour marker and the gap to the next entry.
const LEGEND_ROW_HEIGHT = 24;
const LEGEND_ENTRY_PAD = 40;

// With the legend above the plot, `grid.right` no longer funds a legend column —
// it only has to stop the last x-axis label, which is centred on its tick and so
// overhangs the plot by half its width, from clipping at the canvas edge.
const NARROW_PLOT_RIGHT = 38;

// Label geometry for the rotation step, estimated rather than measured: there is
// no canvas to measure text against server-side. CHAR_W is deliberately
// generous for the 12px axis label — under-estimating unrotates labels that then
// overlap each other, which reads worse than the tilt it was avoiding — and
// LABEL_GAP is the clearance between two neighbouring labels' ends.
const CHAR_W = 7.5;
const LABEL_GAP = 8;

// A label tilted 45 degrees takes up cos(45) of its length across the axis.
const COS_45 = Math.SQRT1_2;

// The chart theme's type sizes. They have to be re-applied here because Flint
// pins its own smaller sizes into the option (10px axis labels and names, 11px
// legend), and ECharts merges a theme UNDER an option — so a size set in the
// theme file is silently outranked and every chart renders type a size smaller
// than the text around it.
const AXIS_TYPE_SIZE = 12;
const LEGEND_TYPE_SIZE = 12;

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

// The surface PALETTE was validated against — recorded so a future palette
// change is re-checked against the same ground, and NEVER painted. Nothing in an
// assembled option may carry the surface colour: the option is compiled
// server-side and persisted, while the card under it is #ffffff or #1f1f1f
// depending on a dark mode only the browser knows, so a mark painted in this
// colour is a white line on a black card half the time. Where a mark has to be
// painted in the surface — a pie's slice gaps are a border in it — that mark is
// styled from the theme, which is chosen per mode in the browser.
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

// The slice names a pie will actually draw, in draw order and without the
// aggregate. Exported because the report-scoped colour map has to know a pie's
// slices before the chart is assembled, and the cap above is the only thing that
// decides them — a second copy of that ranking at the caller would drift from
// this one.
//
// Keyed on literals rather than the display names the fold uses: this only has
// to rank rows, and an x column that humanizes onto its y column would collide
// here on its way to a chart that rejects the spec anyway.
export function pieSliceNames({ x, y, rows }) {
  const slices = (rows ?? []).map((row) => ({
    name: row[x],
    value: row[y[0]],
  }));
  return capPieSlices(slices, "name", "value")
    .slices.filter((slice) => slice.name !== OTHER_SLICE)
    .map((slice) => slice.name);
}

// Flint declares its palette twice — once as `option.color` and again as a
// concrete hex on every `series[i].itemStyle.color` — and on bar and line the
// per-series value is the one that paints, so writing `option.color` alone
// recolours nothing but the legend swatches. Both writes, or neither has any
// effect. A pie series carries no colour of its own: its slices read
// `option.color` BY INDEX, which is why `option.color` is written in mark order
// rather than as the palette itself — that index is the only channel a single
// slice's hue can travel down.
//
// `colors` is the report-scoped identity map: a name in it wears the same hue in
// every section of the report, so a status is one colour across a pie and the
// stacked bar beside it, and a filter that changes a chart's series count cannot
// repaint the ones that survive. A name the map does not cover takes a slot left
// unused in THIS chart, so a chart's own marks stay distinguishable even past
// the eight hues cross-chart stability has to spend.
//
// A single-series bar or line is exempt and takes slot 1 outright: its series
// name is a measure ("Total Revenue"), an identity it shares with nothing, so a
// hue of its own would spend one the report's real entities need. A pie is not
// exempt — it colours per slice, and its slices are entities.
//
// All of it lives in this one function so the assignment rule can change without
// the two-write mechanism moving with it.
function applyPalette(option, colors) {
  const series = Array.isArray(option.series) ? option.series : [];
  const pie = series.some((entry) => entry.type === "pie");
  if (!pie && series.length === 1) {
    option.color = [PALETTE[0]];
    series[0].itemStyle = { ...series[0].itemStyle, color: PALETTE[0] };
    return;
  }
  // Own enumerable keys only. The pie half of the map is keyed on data values,
  // and indexing the object directly would answer for "constructor".
  const assigned = new Map(Object.entries(colors ?? {}));
  const names = pie
    ? series.flatMap((entry) =>
        (Array.isArray(entry.data) ? entry.data : []).map(
          (datum) => datum?.name,
        ),
      )
    : series.map((entry) => entry.name);
  const identity = names.map((name) => assigned.get(String(name)));
  const taken = new Set(identity.filter(Boolean));
  const spare = PALETTE.filter((hex) => !taken.has(hex));
  let next = 0;
  // Modulo only once the spare slots run out, which takes more than eight marks
  // in one chart: past that a chart cannot hold unique hues at all.
  const resolved = identity.map(
    (hex, index) => hex ?? spare[next++] ?? PALETTE[index % PALETTE.length],
  );
  // A series-less option has no marks to order, and an empty `color` would leave
  // ECharts with no palette at all.
  option.color = resolved.length > 0 ? resolved : PALETTE;
  if (pie) return;
  series.forEach((entry, index) => {
    entry.itemStyle = { ...entry.itemStyle, color: resolved[index] };
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

// A stack's cap belongs to the bar, not to each segment of it. Rounded on every
// segment, the interior boundaries pinch — a square-bottomed segment sits on a
// rounded top, showing two slivers of card at the join — so the segments go
// square and the cap moves to the datum that ends the stack. Chosen per
// category, not per series: the series drawn last can be zero in a given
// category, and the corner has to land on a segment that is actually there.
function capStackTops(allSeries) {
  const stacks = new Map();
  for (const series of allSeries) {
    if (series.type !== "bar" || !series.stack) continue;
    if (!Array.isArray(series.data)) continue;
    stacks.set(series.stack, [...(stacks.get(series.stack) ?? []), series]);
  }
  for (const members of stacks.values()) {
    // One member is a bar, not a stack — it keeps the series-level cap.
    if (members.length < 2) continue;
    for (const series of members) {
      series.itemStyle = { ...series.itemStyle, borderRadius: 0 };
    }
    const categories = Math.max(...members.map((series) => series.data.length));
    for (let index = 0; index < categories; index += 1) {
      // Only a positive segment can top the stack; a negative one grows the
      // other way, where these corners would round the axis end.
      const top = members.findLast((series) => series.data[index] > 0);
      if (!top) continue;
      top.data[index] = {
        value: top.data[index],
        itemStyle: { borderRadius: BAR_CAP_RADIUS },
      };
    }
  }
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
      };
    }
    if (single) series.areaStyle = { color: wash(series.itemStyle.color) };
    return;
  }
  if (series.type === "pie") {
    // Flint's radius is [inner, outer]; only the outer is baseSize-absolute,
    // and the inner ("0%") is what keeps this a pie rather than a donut.
    series.radius = ["0%", PIE_RADIUS];
    // Slice separation is NOT set here. It is a border in the colour of the card
    // behind the pie, which only the browser knows, so it comes from the theme's
    // `pie.itemStyle` per mode. padAngle was tried instead — a real angular gap
    // needing no colour at all — and rejected on sight: it insets each sector's
    // straight edges, so on a pie with no inner radius the slices stop meeting
    // at the centre and the pie reads as skewed.
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

// Flint stands the legend in a column to the right of the plot and funds it out
// of `grid.right`. On a narrow canvas that column costs more than the series
// names are worth, so below NARROW_WIDTH the legend becomes a horizontal band
// above the plot and the plot takes the width back.
//
// Returns the canvas height the band needs. Flint sized `_height` around a
// legend that cost no vertical space at all, so the band's rows have to be added
// to the canvas — taken out of the plot instead, a two-row legend would shrink
// the plot it labels.
//
// Charts with no legend (single-series, and every pie — Flint labels slices in
// place rather than in a legend) are left alone, as is any chart wide enough to
// afford the column.
function bandLegend(option, width) {
  const { legend } = option;
  if (!legend || width >= NARROW_WIDTH) return 0;
  const entries = Array.isArray(legend.data) ? legend.data : [];
  const bandWidth = entries.reduce(
    (sum, name) => sum + String(name).length * CHAR_W + LEGEND_ENTRY_PAD,
    0,
  );
  const rows = Math.max(1, Math.ceil(bandWidth / width));
  const band = rows * LEGEND_ROW_HEIGHT;
  legend.orient = "horizontal";
  legend.top = 0;
  legend.left = "center";
  // Flint anchored the column against the right edge; a centred band must not
  // also be pinned there, or ECharts resolves the two against each other.
  delete legend.right;
  if (option.grid) {
    option.grid.right = NARROW_PLOT_RIGHT;
    // Offsetting the grid by the same band that was added to the canvas leaves
    // the plot area exactly the size Flint sized it.
    option.grid.top = (option.grid.top ?? 0) + band;
  }
  return band;
}

// Flint picks label rotation from the label list alone — flat only when there are
// at most 4 categories and none longer than 8 characters, else vertical — and
// never consults the width. So three 10-character labels with 340px of slot each
// are stood on end, which inflates `grid.bottom` and pushes the labels into the
// axis title. Recomputed here against the plot width Flint never saw, in steps
// of 0 -> 45 -> 90.
//
// It only ever relaxes. A label Flint left flat already fits by its own rule, and
// tilting it on the strength of an estimate could only be wrong; relaxing on that
// estimate is safe because CHAR_W over-states how wide a label is.
//
// `grid.bottom` is deliberately left as Flint sized it: the room a vertical label
// needed becomes padding under an unrotated one, which is harmless, where
// tightening it risks clipping the axis title it also has to hold.
//
// Scoped to a category axis with its labels in hand. A time axis draws its labels
// through a formatter, so their text is not knowable here; a value axis is
// already flat.
function relaxRotation(option, width) {
  const axis = option.xAxis;
  if (axis?.type !== "category" || !Array.isArray(axis.data)) return;
  const current = axis.axisLabel?.rotate;
  if (!current || axis.data.length === 0) return;
  const labels = axis.data.map((value) => String(value));
  const pxPerCategory =
    (width - (option.grid?.left ?? 0) - (option.grid?.right ?? 0)) /
    labels.length;
  const labelWidth =
    Math.max(...labels.map((label) => label.length)) * CHAR_W + LABEL_GAP;
  let rotate = 90;
  if (labelWidth <= pxPerCategory) {
    rotate = 0;
  } else if (labelWidth * COS_45 <= pxPerCategory) {
    rotate = 45;
  }
  if (rotate < current) axis.axisLabel.rotate = rotate;
}

// Raises the type sizes Flint pinned to the theme's, and pays for the extra
// pixels out of the gutter each grown label sits in: Flint sized `grid.bottom`
// for a rotated label a size smaller, and `grid.left` for a shorter y-axis
// number, so both are scaled by the same ratio the type grew. Over-padding a
// gutter costs a little plot area; under-padding it clips the label.
//
// Only ever grows. A size Flint already set at or above the theme's is left
// alone, and so is the gutter that funds it.
function alignTypeScale(option) {
  let ratio = 1;
  for (const axis of [option.xAxis, option.yAxis]) {
    if (!axis) continue;
    for (const key of ["axisLabel", "nameTextStyle"]) {
      const style = axis[key];
      if (!style || !(style.fontSize < AXIS_TYPE_SIZE)) continue;
      ratio = Math.max(ratio, AXIS_TYPE_SIZE / style.fontSize);
      style.fontSize = AXIS_TYPE_SIZE;
    }
  }
  if (option.legend?.textStyle?.fontSize < LEGEND_TYPE_SIZE) {
    option.legend.textStyle.fontSize = LEGEND_TYPE_SIZE;
  }
  if (ratio === 1 || !option.grid) return;
  // A flat x-axis label grows across its category slot, not down into the
  // gutter, so an unrotated axis needs nothing here.
  if (option.xAxis?.axisLabel?.rotate) {
    option.grid.bottom = Math.round(option.grid.bottom * ratio);
  }
  option.grid.left = Math.round(option.grid.left * ratio);
}

function buildFlintOption({ chart, x, y, rows, stacked, width, colors }) {
  const canvasWidth = Number.isFinite(width) ? width : DEFAULT_WIDTH;
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
    chart_spec: {
      chartType,
      encodings,
      baseSize: { width: canvasWidth, height: BASE_PLOT_HEIGHT },
    },
  });

  // Read before the strip walk removes it: this is the canvas Flint sized for
  // the labels it laid out, and the only place that number exists.
  const height = chart === "pie" ? PIE_HEIGHT : option._height;
  strip(option);
  // A text element painting the fold key column's name over the top-right of
  // the canvas — series labelling the legend already carries.
  delete option.graphic;
  applyPalette(option, colors);
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
    capStackTops(option.series);
  }
  // Same defect on the folded line template: its legend sits at an absolute
  // left offset derived from baseSize.width, off-canvas on a narrow panel.
  // Pin it to the right edge the way the bar templates already do.
  if (option.legend && typeof option.legend.left === "number") {
    delete option.legend.left;
    option.legend.right = 10;
  }
  // Legend first: the rotation step measures the plot against `grid.right`, which
  // a banded legend hands back to the plot.
  const band = bandLegend(option, canvasWidth);
  relaxRotation(option, canvasWidth);
  // After rotation: a label relaxed to flat no longer needs a taller gutter.
  alignTypeScale(option);

  return { option, height: height + band };
}

export default buildFlintOption;
