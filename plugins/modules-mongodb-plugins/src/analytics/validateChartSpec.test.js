import validateChartSpec from "./validateChartSpec.js";

// The presentation-contract checks run without a catalog (shape-only posture);
// AnalyticsPipeline revalidates the pipeline grammar at execution regardless.
const query = { collection: "orders", pipeline: [] };

test("a single-measure pie is accepted", () => {
  expect(() =>
    validateChartSpec({
      spec: { chart: "pie", title: "By region", query, x: "region", y: ["revenue"] },
    }),
  ).not.toThrow();
});

// A pie encodes exactly one measure as slice size (buildFlintOption reads y[0]);
// a second y column folds the rows to the multi-series shape a pie can't read,
// so every slice computes to 0 and the pie renders empty. Reject it at
// validation, where the render_chart / generate_report message is actionable.
test("a pie with more than one y column is rejected with an actionable message", () => {
  expect(() =>
    validateChartSpec({
      spec: {
        chart: "pie",
        title: "By region",
        query,
        x: "region",
        y: ["revenue", "cost"],
      },
    }),
  ).toThrow(/pie chart takes exactly one y column \(got 2\)/);
});

// The multi-y restriction is pie-specific — bar and line series it fine.
test("a bar chart with multiple y columns is still accepted", () => {
  expect(() =>
    validateChartSpec({
      spec: {
        chart: "bar",
        title: "By region",
        query,
        x: "region",
        y: ["revenue", "cost"],
      },
    }),
  ).not.toThrow();
});
