import buildFlintOption from "./buildFlintOption.js";

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
  ["bar", "region", ["revenue"], regionRows],
  ["bar", "region", ["revenue", "cost"], regionRows],
  ["line", "month", ["revenue"], monthRows],
  ["line", "month", ["revenue", "cost"], monthRows],
  ["pie", "region", ["revenue"], regionRows],
];

test.each(specs)(
  "%s option of %s by %p carries no private or unserializable keys",
  (chart, x, y, rows) => {
    const { option } = buildFlintOption({ chart, x, y, rows });
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

// baseSize.width is a constant the real canvas never matches, so nothing
// width-absolute may survive assembly: fixed-width bars overflow their slots
// on a narrower canvas and overlap, and a left-offset legend leaves it.
test("no series carries an absolute bar width, and legends never sit at a pixel left offset", () => {
  for (const [chart, x, y, rows] of specs) {
    const { option } = buildFlintOption({ chart, x, y, rows });
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
