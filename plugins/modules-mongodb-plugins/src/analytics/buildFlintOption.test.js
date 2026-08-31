import { assembleECharts } from "flint-chart/echarts";

import buildFlintOption, {
  CARD_SURFACE,
  NEUTRAL,
  PALETTE,
} from "./buildFlintOption.js";

// The palette ECharts ships and Flint pins into every option it assembles. None
// of these may survive the post-pass — the palette they lose to fails four of
// the five dataviz checks on the card surface.
const STOCK_HEXES = [
  "#5470c6",
  "#91cc75",
  "#fac858",
  "#ee6666",
  "#73c0de",
  "#3ba272",
  "#fc8452",
  "#9a60b4",
  "#ea7ccc",
  "#d48265",
];

const regionRows = [
  { region: "North", revenue: 1200, cost: 800 },
  { region: "South", revenue: 900, cost: 700 },
  { region: "East", revenue: 1100, cost: 400 },
];

const monthRows = [
  { month: "2026-01", revenue: 500, cost: 300 },
  { month: "2026-02", revenue: 650, cost: 320 },
  { month: "2026-03", revenue: 610, cost: 410 },
];

// Flint derives the whole option — axis types, rotation, grid padding, colours —
// from the data, so these snapshots are the tripwire for a Flint upgrade
// changing what ships to the browser.
test("single-y bar over a categorical x", () => {
  expect(
    buildFlintOption({
      chart: "bar",
      x: "region",
      y: ["revenue"],
      rows: regionRows,
    }),
  ).toMatchSnapshot();
});

test("multi-y bar folds into grouped series", () => {
  expect(
    buildFlintOption({
      chart: "bar",
      x: "region",
      y: ["revenue", "cost"],
      rows: regionRows,
    }),
  ).toMatchSnapshot();
});

test("single-y line over a temporal x", () => {
  expect(
    buildFlintOption({
      chart: "line",
      x: "month",
      y: ["revenue"],
      rows: monthRows,
    }),
  ).toMatchSnapshot();
});

test("multi-y line folds onto a colour channel", () => {
  expect(
    buildFlintOption({
      chart: "line",
      x: "month",
      y: ["revenue", "cost"],
      rows: monthRows,
    }),
  ).toMatchSnapshot();
});

test("stacked multi-y bar folds into stacked series", () => {
  expect(
    buildFlintOption({
      chart: "bar",
      x: "region",
      y: ["revenue", "cost"],
      rows: regionRows,
      stacked: true,
    }),
  ).toMatchSnapshot();
});

test("pie encodes the category on colour and the measure on size", () => {
  expect(
    buildFlintOption({
      chart: "pie",
      x: "region",
      y: ["revenue"],
      rows: regionRows,
    }),
  ).toMatchSnapshot();
});

function findKeys(node, predicate, path = "", found = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      findKeys(item, predicate, `${path}[${index}]`, found),
    );
    return found;
  }
  if (node === null || typeof node !== "object") return found;
  for (const key of Object.keys(node)) {
    const at = path ? `${path}.${key}` : key;
    if (predicate(key, node[key])) found.push(at);
    findKeys(node[key], predicate, at, found);
  }
  return found;
}

const specs = [
  ["bar", "region", ["revenue"], regionRows, false],
  ["bar", "region", ["revenue", "cost"], regionRows, false],
  ["bar", "region", ["revenue", "cost"], regionRows, true],
  ["line", "month", ["revenue"], monthRows, false],
  ["line", "month", ["revenue", "cost"], monthRows, false],
  ["pie", "region", ["revenue"], regionRows, false],
];

test.each(specs)(
  "%s option of %s by %p (stacked: %s) carries no private or unserializable keys",
  (chart, x, y, rows, stacked) => {
    const { option } = buildFlintOption({ chart, x, y, rows, stacked });
    expect(findKeys(option, (key) => key.startsWith("_"))).toEqual([]);
    expect(findKeys(option, (_, value) => typeof value === "function")).toEqual(
      [],
    );
    expect(option.graphic).toBeUndefined();
    // Flint's internal fold names must never reach a legend, an axis title or the
    // canvas — the hand-fold under Measure/Value exists to keep them out.
    expect(JSON.stringify(option)).not.toContain("__flint");
  },
);

test("multi-y bar series are grouped, not stacked, and named by column", () => {
  const { option } = buildFlintOption({
    chart: "bar",
    x: "region",
    y: ["revenue", "cost"],
    rows: regionRows,
  });
  expect(option.series).toHaveLength(2);
  expect(option.series.map((series) => series.name).sort()).toEqual([
    "Cost",
    "Revenue",
  ]);
  option.series.forEach((series) => expect(series.stack).toBeUndefined());
});

test("stacked multi-y bar series share one stack and keep their column names", () => {
  const { option } = buildFlintOption({
    chart: "bar",
    x: "region",
    y: ["revenue", "cost"],
    rows: regionRows,
    stacked: true,
  });
  expect(option.series).toHaveLength(2);
  expect(option.series.map((series) => series.name).sort()).toEqual([
    "Cost",
    "Revenue",
  ]);
  const stacks = new Set(option.series.map((series) => series.stack));
  expect(stacks.size).toBe(1);
  expect([...stacks][0]).toBeTruthy();
});

test("stacked with a single y renders the same plain bar as unstacked", () => {
  const spec = { chart: "bar", x: "region", y: ["revenue"], rows: regionRows };
  expect(buildFlintOption({ ...spec, stacked: true })).toEqual(
    buildFlintOption(spec),
  );
});

// baseSize.width is a constant the real canvas never matches, so nothing
// width-absolute may survive assembly: fixed-width bars overflow their slots
// on a narrower canvas and overlap, and a left-offset legend leaves it.
test("no series carries an absolute bar width, and legends never sit at a pixel left offset", () => {
  for (const [chart, x, y, rows, stacked] of specs) {
    const { option } = buildFlintOption({ chart, x, y, rows, stacked });
    for (const series of option.series) {
      expect(series.barWidth).toBeUndefined();
    }
    expect(typeof option.legend?.left).not.toBe("number");
  }
  const { option } = buildFlintOption({
    chart: "line",
    x: "month",
    y: ["revenue", "cost"],
    rows: monthRows,
  });
  expect(option.legend.right).toBe(10);
});

// Flint draws a pie at an absolute outer radius derived from baseSize (60px), so
// the slices stayed 120px across whatever canvas the block was given — a dot in
// an 1100px column. Same class as the bar width above: relative, or it is wrong
// everywhere except the base size. The canvas is ours for a pie (no tick labels
// to lay out), so it is asserted alongside — the two together are the size.
test("a pie's radius is relative and its canvas is the pie's own", () => {
  const { option, height } = buildFlintOption({
    chart: "pie",
    x: "region",
    y: ["revenue"],
    rows: regionRows,
  });
  for (const series of option.series) {
    expect(series.type).toBe("pie");
    const [inner, outer] = series.radius;
    // Inner stays 0 — a donut is a different chart.
    expect(inner).toBe("0%");
    expect(String(outer)).toMatch(/%$/);
  }
  expect(height).toBe(400);
});

test("column names reach axes and legends humanized; category values are untouched", () => {
  const { option } = buildFlintOption({
    chart: "bar",
    x: "company_name",
    y: ["contactCount"],
    rows: [
      { company_name: "Northwind Traders", contactCount: 4 },
      { company_name: "Contoso Ltd", contactCount: 2 },
    ],
  });
  expect(option.xAxis.name).toBe("Company Name");
  expect(option.yAxis.name).toBe("Contact Count");
  expect(option.xAxis.data).toEqual(["Northwind Traders", "Contoso Ltd"]);
});

test("height is the canvas Flint sized, larger than the pinned plot", () => {
  const { height } = buildFlintOption({
    chart: "bar",
    x: "region",
    y: ["revenue"],
    rows: regionRows,
  });
  expect(typeof height).toBe("number");
  expect(height).toBeGreaterThan(180);
});

// Folded rows are object literals, so a display-name collision would silently
// overwrite a key and draw a garbage chart (an x column named "value" put the
// y values on the category axis). Rejection surfaces as a skipped part in chat
// and a broken-section Alert in a report, both carrying the rename that fixes it.
test("an x column that humanizes onto a fold column is rejected", () => {
  for (const x of ["value", "measure", "Value"]) {
    expect(() =>
      buildFlintOption({
        chart: "bar",
        x,
        y: ["revenue", "cost"],
        rows: [],
      }),
    ).toThrow(/Chart columns collide/);
  }
  // "some_measure" humanizes to "Some Measure" — not a fold column.
  expect(() =>
    buildFlintOption({
      chart: "bar",
      x: "some_measure",
      y: ["revenue", "cost"],
      rows: [],
    }),
  ).not.toThrow();
});

test("two y columns that humanize to the same name are rejected", () => {
  expect(() =>
    buildFlintOption({
      chart: "bar",
      x: "region",
      y: ["total_sales", "totalSales"],
      rows: [],
    }),
  ).toThrow(/Chart columns collide/);
});

test("an x and y column that humanize to the same name are rejected on a single-series chart", () => {
  expect(() =>
    buildFlintOption({
      chart: "pie",
      x: "total_sales",
      y: ["totalSales"],
      rows: [],
    }),
  ).toThrow(/Chart columns collide/);
});

test("empty and missing rows assemble without throwing", () => {
  expect(() =>
    buildFlintOption({ chart: "bar", x: "region", y: ["revenue"], rows: [] }),
  ).not.toThrow();
  expect(() =>
    buildFlintOption({
      chart: "bar",
      x: "region",
      y: ["revenue"],
      rows: undefined,
    }),
  ).not.toThrow();
});

test("the reserved neutral is not a palette slot", () => {
  // An "Other" slice tinted with an identity hue reads as an entity; the point
  // of the neutral is that it cannot collide with one.
  expect(PALETTE).not.toContain(NEUTRAL);
  expect(PALETTE).toHaveLength(8);
});

// Flint declares its palette twice and the per-series write is the one that
// paints, so the post-pass has to make both. These assert the shape it rewrites
// — a flint-chart bump that moves the colour somewhere else fails here, loudly,
// instead of quietly shipping stock-palette charts.
describe("flint-chart's pre-rewrite option shape", () => {
  const assemble = (chartType, encodings, values, width = 1100) =>
    assembleECharts({
      data: { values },
      chart_spec: {
        chartType,
        encodings,
        baseSize: { width, height: 180 },
      },
    });

  test.each([
    ["Bar Chart", { x: { field: "Region" }, y: { field: "Revenue" } }],
    ["Line Chart", { x: { field: "Region" }, y: { field: "Revenue" } }],
  ])(
    "%s declares a concrete stock hex on series[0].itemStyle.color",
    (chartType, encodings) => {
      const option = assemble(chartType, encodings, [
        { Region: "North", Revenue: 1200 },
        { Region: "South", Revenue: 900 },
      ]);
      expect(option.color).toEqual(expect.arrayContaining(STOCK_HEXES));
      expect(STOCK_HEXES).toContain(option.series[0].itemStyle.color);
    },
  );

  // The rotation override only ever relaxes what Flint decided, so it needs
  // Flint to still be deciding it: flat at up to 4 categories of up to 8
  // characters, else vertical, with the canvas width never consulted. A bump
  // that moves either threshold — or stops emitting a rotation at all — has to
  // fail here rather than quietly leaving every label as it found it.
  test.each([
    [["Apr", "May", "Jun", "Jul"], 0],
    [["Apr", "May", "Jun", "Jul", "Aug"], 90],
    [["Alderaan", "Tatooine", "Coruscat", "Dagobahh"], 0],
    [["Alderaan9", "Tatooine9", "Coruscant", "Dagobahhh"], 90],
  ])("rotates %p to %i degrees at every canvas width", (labels, rotate) => {
    for (const width of [420, 1100]) {
      const option = assemble(
        "Bar Chart",
        { x: { field: "Region" }, y: { field: "Revenue" } },
        labels.map((label, index) => ({ Region: label, Revenue: 100 + index })),
        width,
      );
      expect(option.xAxis.axisLabel.rotate).toBe(rotate);
    }
  });

  test("a pie declares no series or slice colour and reads option.color", () => {
    const option = assemble(
      "Pie Chart",
      { color: { field: "Region" }, size: { field: "Revenue" } },
      [
        { Region: "North", Revenue: 1200 },
        { Region: "South", Revenue: 900 },
      ],
    );
    expect(option.color).toEqual(expect.arrayContaining(STOCK_HEXES));
    expect(option.series[0].itemStyle?.color).toBeUndefined();
    for (const datum of option.series[0].data) {
      expect(datum.itemStyle?.color).toBeUndefined();
    }
  });
});

// The per-series override differs per kind — bar and line carry one, a pie does
// not — so a rewrite that only handles one kind leaves the other stock. All
// three kinds are swept for that reason.
test.each(specs)(
  "no stock ECharts hex survives anywhere in a %s option of %s by %p (stacked: %s)",
  (chart, x, y, rows, stacked) => {
    const { option } = buildFlintOption({ chart, x, y, rows, stacked });
    const serialized = JSON.stringify(option).toLowerCase();
    for (const hex of STOCK_HEXES) {
      expect(serialized).not.toContain(hex);
    }
  },
);

test.each(specs)(
  "the palette is written both to option.color and per series in a %s of %s by %p (stacked: %s)",
  (chart, x, y, rows, stacked) => {
    const { option } = buildFlintOption({ chart, x, y, rows, stacked });
    expect(option.color).toEqual(PALETTE);
    option.series.forEach((series, index) => {
      if (series.type === "pie") {
        // A pie slice reads option.color by index; a series colour here would
        // paint every slice the same.
        expect(series.itemStyle.color).toBeUndefined();
        return;
      }
      expect(series.itemStyle.color).toBe(PALETTE[index % PALETTE.length]);
    });
  },
);

test("bars are rounded at the data end and square at the baseline", () => {
  for (const stacked of [false, true]) {
    const { option } = buildFlintOption({
      chart: "bar",
      x: "region",
      y: ["revenue", "cost"],
      rows: regionRows,
      stacked,
    });
    for (const series of option.series) {
      expect(series.itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
    }
  }
});

test("lines are 2px and wear a symbol on their last point only", () => {
  const { option } = buildFlintOption({
    chart: "line",
    x: "month",
    y: ["revenue", "cost"],
    rows: monthRows,
  });
  for (const series of option.series) {
    expect(series.lineStyle.width).toBe(2);
    // Both switches matter: showSymbol false skips symbol drawing entirely, and
    // showAllSymbol "auto" drops symbols the category-axis interval strategy
    // skipped — on a crowded axis, the last one.
    expect(series.showSymbol).toBe(true);
    expect(series.showAllSymbol).toBe(true);
    expect(series.symbol).toBe("none");
    const last = series.data[series.data.length - 1];
    expect(last.symbol).toBe("circle");
    expect(last.symbolSize).toBeGreaterThanOrEqual(8);
    expect(last.itemStyle).toEqual({
      borderWidth: 2,
      borderColor: CARD_SURFACE,
    });
    // The point's own value is preserved, only re-expressed in object form.
    expect(last.value).toEqual([
      "2026-03",
      series.name === "Revenue" ? 610 : 410,
    ]);
    for (const datum of series.data.slice(0, -1)) {
      expect(datum.symbol).toBeUndefined();
    }
  }
});

test("a single-series line is washed with a gradient of its own hue", () => {
  const { option } = buildFlintOption({
    chart: "line",
    x: "month",
    y: ["revenue"],
    rows: monthRows,
  });
  const { areaStyle } = option.series[0];
  expect(areaStyle.color).toEqual({
    type: "linear",
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: "rgba(42, 120, 214, 0.18)" },
      { offset: 1, color: "rgba(42, 120, 214, 0)" },
    ],
  });
});

test("multi-series lines carry no area fill", () => {
  const { option } = buildFlintOption({
    chart: "line",
    x: "month",
    y: ["revenue", "cost"],
    rows: monthRows,
  });
  for (const series of option.series) {
    expect(series.areaStyle).toBeUndefined();
  }
});

// ECharts' own gradient helpers are class instances, and every option here
// travels through JSON on its way to being persisted and rendered — a gradient
// that does not survive that round trip is a silently missing fill.
test("the gradient area fill survives a JSON round trip", () => {
  const { option } = buildFlintOption({
    chart: "line",
    x: "month",
    y: ["revenue"],
    rows: monthRows,
  });
  const round = JSON.parse(JSON.stringify(option));
  expect(round.series[0].areaStyle).toEqual(option.series[0].areaStyle);
});

test("pie slices are separated by a border in the card colour", () => {
  const { option } = buildFlintOption({
    chart: "pie",
    x: "region",
    y: ["revenue"],
    rows: regionRows,
  });
  expect(option.series[0].itemStyle.borderWidth).toBe(2);
  expect(option.series[0].itemStyle.borderColor).toBe(CARD_SURFACE);
});

const manyRegionRows = Array.from({ length: 20 }, (_, index) => ({
  region: `R${index + 1}`,
  // Descending, so the kept six are R1..R6 and the tail is everything after.
  revenue: (20 - index) * 100,
}));

test("a pie past the cap keeps six slices and sums the rest into Other", () => {
  const { option } = buildFlintOption({
    chart: "pie",
    x: "region",
    y: ["revenue"],
    rows: manyRegionRows,
  });
  const { data } = option.series[0];
  expect(data).toHaveLength(7);
  expect(data.map((datum) => datum.name)).toEqual([
    "R1",
    "R2",
    "R3",
    "R4",
    "R5",
    "R6",
    "Other",
  ]);
  const other = data[6];
  const tail = manyRegionRows
    .slice(6)
    .reduce((sum, row) => sum + row.revenue, 0);
  expect(other.value).toBe(tail);
  // The aggregate sits outside the palette on purpose.
  expect(other.itemStyle.color).toBe(NEUTRAL);
  expect(PALETTE).not.toContain(other.itemStyle.color);
  for (const datum of data.slice(0, 6)) {
    expect(datum.itemStyle?.color).toBeUndefined();
  }
});

test("a pie of exactly seven slices renders as seven, uncapped", () => {
  const sevenRows = manyRegionRows.slice(0, 7);
  const { option } = buildFlintOption({
    chart: "pie",
    x: "region",
    y: ["revenue"],
    rows: sevenRows,
  });
  const { data } = option.series[0];
  expect(data).toHaveLength(7);
  expect(data.map((datum) => datum.name).sort()).toEqual(
    sevenRows.map((row) => row.region).sort(),
  );
  for (const datum of data) {
    expect(datum.itemStyle?.color).toBeUndefined();
  }
});

// Width-driven layout: what Flint decided without ever looking at the canvas.

const barSpec = { chart: "bar", x: "region", y: ["revenue"], rows: regionRows };
const multiBarSpec = {
  chart: "bar",
  x: "region",
  y: ["revenue", "cost"],
  rows: regionRows,
};

const labelRows = (labels) =>
  labels.map((label, index) => ({ region: label, revenue: 100 + index }));

const rotationAt = (labels, width) =>
  buildFlintOption({
    chart: "bar",
    x: "region",
    y: ["revenue"],
    rows: labelRows(labels),
    width,
  }).option.xAxis.axisLabel.rotate;

// Flint stands a label on end as soon as there is a fifth category or a ninth
// character, whatever the slot it has. In the report column every one of these
// has 190px or more of slot — so the whole boundary matrix ends up flat, where
// before the override half of it was vertical against an inflated grid.
test.each([
  [["Apr", "May", "Jun"], 0],
  [["Apr", "May", "Jun", "Jul"], 0],
  [["Apr", "May", "Jun", "Jul", "Aug"], 0],
  [["Alderaan", "Tatooine", "Coruscat", "Dagobahh"], 0],
  [["Alderaan9", "Tatooine9", "Coruscant", "Dagobahhh"], 0],
  [
    ["Qualified", "Discovery", "Proposal", "Negotiation", "Contract", "Legal"],
    0,
  ],
])("labels %p sit at %i degrees in the report column", (labels, rotate) => {
  expect(rotationAt(labels, 1100)).toBe(rotate);
});

// The same labels, the same rule, two canvases: 195px of slot each in the report
// column against 59px in the chat panel.
test("rotation is recomputed against the width the chart is actually drawn at", () => {
  const labels = [
    "Alderaan99",
    "Tatooine99",
    "Coruscantt",
    "Dagobahhhh",
    "Endorendor",
  ];
  expect(rotationAt(labels, 1100)).toBe(0);
  expect(rotationAt(labels, 420)).toBe(45);
});

// 45 is a step of its own and not a rounding of 90: a label that fits its slot
// tilted should be tilted, not stood up. These two straddle it at the panel
// width — ten characters fit at 45, eleven do not fit at all.
test("a label that fits only tilted lands on 45, and one that does not lands on 90", () => {
  expect(
    rotationAt(
      ["Alderaan99", "Tatooine99", "Coruscantt", "Dagobahhhh", "Endorendor"],
      420,
    ),
  ).toBe(45);
  expect(
    rotationAt(
      [
        "Qualified",
        "Discovery",
        "Proposal",
        "Negotiation",
        "Contract",
        "Legal",
      ],
      420,
    ),
  ).toBe(90);
});

// The override relaxes and never tightens. Flint's flat cases fit by its own
// rule, and the label width here is an estimate — no canvas to measure against —
// so a rotation added on the strength of it could only be wrong.
test("a label Flint left flat is never rotated, however narrow the canvas", () => {
  for (const width of [200, 420, 1100]) {
    expect(rotationAt(["Apr", "May", "Jun"], width)).toBe(0);
  }
});

// A time axis renders its labels through a formatter, so what will be drawn is
// not knowable here and its rotation is left as Flint set it.
test("a temporal axis keeps the rotation Flint gave it", () => {
  const rotateAt = (width) =>
    buildFlintOption({
      chart: "line",
      x: "month",
      y: ["revenue"],
      rows: monthRows,
      width,
    }).option.xAxis.axisLabel.rotate;
  expect(rotateAt(1100)).toBe(rotateAt(420));
});

test("a narrow canvas bands the legend above the plot and pays for it in height", () => {
  const wide = buildFlintOption({ ...multiBarSpec, width: 1100 });
  const narrow = buildFlintOption({ ...multiBarSpec, width: 420 });

  expect(wide.option.legend.orient).toBe("vertical");
  expect(wide.option.legend.right).toBe(10);
  expect(wide.option.legend.top).toBe(20);

  expect(narrow.option.legend.orient).toBe("horizontal");
  expect(narrow.option.legend.top).toBe(0);
  expect(narrow.option.legend.left).toBe("center");
  // A centred band pinned to the right edge as well would have ECharts resolve
  // the two against each other.
  expect(narrow.option.legend.right).toBeUndefined();

  // Flint funded the legend column out of grid.right; banded, that goes back to
  // the plot.
  expect(narrow.option.grid.right).toBeLessThan(wide.option.grid.right);
  // Flint sized _height around a legend that cost no vertical space, so the band
  // is added to the canvas and offset in the grid by the same amount — which
  // leaves the plot area itself exactly the size Flint sized it.
  const band = narrow.height - wide.height;
  expect(band).toBeGreaterThan(0);
  expect(narrow.option.grid.top - wide.option.grid.top).toBe(band);
});

// Only a legend can cost a band, and Flint gives one to multi-series charts
// alone — it labels pie slices in place.
test.each([
  ["a single-series bar", barSpec],
  ["a pie", { chart: "pie", x: "region", y: ["revenue"], rows: regionRows }],
])("%s has no legend to band and no band to pay for", (_, spec) => {
  const narrow = buildFlintOption({ ...spec, width: 420 });
  expect(narrow.option.legend).toBeUndefined();
  expect(narrow.height).toBe(buildFlintOption({ ...spec, width: 1100 }).height);
});

// One caller is an endpoint payload, where an absent key resolves to null rather
// than undefined — a default parameter would not fire on it.
test("a missing or null width lays the chart out for the report column", () => {
  const column = buildFlintOption({ ...multiBarSpec, width: 1100 });
  expect(buildFlintOption(multiBarSpec)).toEqual(column);
  expect(buildFlintOption({ ...multiBarSpec, width: null })).toEqual(column);
});
