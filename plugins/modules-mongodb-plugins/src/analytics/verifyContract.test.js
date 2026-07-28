import {
  verifyChartContract,
  verifyKpiContract,
  verifyTableContract,
} from "./verifyContract.js";

// Contract verification runs against the ACTUAL rows, because a raw pipeline's
// output shape is not statically knowable. These pin the two directions it can
// get wrong: rejecting output that is merely sparse, and passing output whose
// declared column is genuinely absent.
describe("requireKeys looks across all rows, not just the first", () => {
  test("a key missing from row 0 but present later is accepted", () => {
    // $project with a conditional, $unionWith over differing shapes, or a
    // $group whose first bucket lacks an optional field all produce this.
    const rows = [{ region: "EU" }, { region: "US", total: 5 }];
    expect(() => verifyChartContract({ x: "region", y: ["total"], rows })).not.toThrow();
    expect(() =>
      verifyTableContract({ columns: [{ key: "region" }, { key: "total" }], rows }),
    ).not.toThrow();
  });

  test("a key absent from every row still fails, naming the column", () => {
    const rows = [{ region: "EU" }, { region: "US" }];
    expect(() => verifyChartContract({ x: "region", y: ["total"], rows })).toThrow(
      /column "total" is not present/,
    );
  });
});

test("empty results skip verification entirely", () => {
  expect(() => verifyChartContract({ x: "region", y: ["total"], rows: [] })).not.toThrow();
  expect(() => verifyKpiContract({ valueKey: "total", rows: [] })).not.toThrow();
  expect(() => verifyTableContract({ columns: [{ key: "x" }], rows: [] })).not.toThrow();
});

test("null value cells are tolerated but a non-numeric one is not", () => {
  expect(() =>
    verifyChartContract({ x: "region", y: ["total"], rows: [{ region: null, total: null }] }),
  ).not.toThrow();
  expect(() =>
    verifyKpiContract({ valueKey: "total", rows: [{ total: "five" }] }),
  ).toThrow(/must be numeric/);
});

test("a non-numeric value in a later row is caught, not just row 0", () => {
  expect(() =>
    verifyChartContract({
      x: "region",
      y: ["total"],
      rows: [{ region: "EU", total: 1 }, { region: "US", total: "five" }],
    }),
  ).toThrow(/must be numeric/);
});
