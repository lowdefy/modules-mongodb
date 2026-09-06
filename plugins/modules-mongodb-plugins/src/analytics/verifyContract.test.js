import {
  verifyChartContract,
  verifyKpiContract,
  verifyTableContract,
  verifyFilterOptionsContract,
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
    expect(() =>
      verifyChartContract({ x: "region", y: ["total"], rows }),
    ).not.toThrow();
    expect(() =>
      verifyTableContract({
        columns: [{ key: "region" }, { key: "total" }],
        rows,
      }),
    ).not.toThrow();
  });

  test("a key absent from every row still fails, naming the column", () => {
    const rows = [{ region: "EU" }, { region: "US" }];
    expect(() =>
      verifyChartContract({ x: "region", y: ["total"], rows }),
    ).toThrow(/column "total" is not present/);
  });
});

// A KPI reads row 0 only (compileReport: `rows[0][valueKey] ?? 0`), so unlike
// tables/charts its contract must check row 0 specifically — the at-least-one-
// row rule would pass a result whose value sits in a later row while the card
// silently renders 0.
describe("verifyKpiContract checks row 0, not any row", () => {
  test("valueKey present in row 0 passes", () => {
    expect(() =>
      verifyKpiContract({ valueKey: "total", rows: [{ total: 5 }] }),
    ).not.toThrow();
  });

  test("valueKey only in a later row fails, naming the first row's columns", () => {
    expect(() =>
      verifyKpiContract({
        valueKey: "total",
        rows: [{ region: "EU" }, { total: 5 }],
      }),
    ).toThrow(/column "total" is not present in the first result row/);
  });
});

test("empty results skip verification entirely", () => {
  expect(() =>
    verifyChartContract({ x: "region", y: ["total"], rows: [] }),
  ).not.toThrow();
  expect(() =>
    verifyKpiContract({ valueKey: "total", rows: [] }),
  ).not.toThrow();
  expect(() =>
    verifyTableContract({ columns: [{ key: "x" }], rows: [] }),
  ).not.toThrow();
});

test("null value cells are tolerated but a non-numeric one is not", () => {
  expect(() =>
    verifyChartContract({
      x: "region",
      y: ["total"],
      rows: [{ region: null, total: null }],
    }),
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
      rows: [
        { region: "EU", total: 1 },
        { region: "US", total: "five" },
      ],
    }),
  ).toThrow(/must be numeric/);
});

describe("verifyFilterOptionsContract", () => {
  test("both valueKey and labelKey present in the rows does not throw", () => {
    const rows = [
      { id: "1", name: "EU" },
      { id: "2", name: "US" },
    ];
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).not.toThrow();
  });

  test("valueKey absent throws, naming the missing column and available ones", () => {
    const rows = [{ name: "EU" }, { name: "US" }];
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).toThrow(/column "id" is not present.*available columns: name/);
  });

  test("labelKey absent throws", () => {
    const rows = [{ id: "1" }, { id: "2" }];
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).toThrow(/column "name" is not present/);
  });

  test("a key present in only some rows does not throw (at-least-one-row rule)", () => {
    const rows = [{ id: "1" }, { id: "2", name: "US" }];
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).not.toThrow();
  });

  // The value round-trips through browser state and comes back in the re-query
  // payload, so it has to be a type that survives the trip. Lowdefy's
  // serializer keeps a Date (a `~d` marker) but reduces an ObjectId to a bare
  // hex string, which then never equals the ObjectId stored in the field.
  test("a non-scalar valueKey throws, naming the type and the $toString fix", () => {
    const rows = [{ id: { _bsontype: "ObjectId" }, name: "EU" }];
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).toThrow(/column "id" must be a string or number to match on/);
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).toThrow(/\$toString/);
  });

  test("numbers pass, and a null value is tolerated like a null cell anywhere else", () => {
    const rows = [
      { id: 1, name: "EU" },
      { id: null, name: "US" },
    ];
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).not.toThrow();
  });

  // The label is display text. A Date or object there renders oddly at worst —
  // it never silently breaks the match, so it is not the contract's business.
  test("a non-scalar labelKey is not rejected", () => {
    const rows = [{ id: "1", name: { first: "E" } }];
    expect(() =>
      verifyFilterOptionsContract({ valueKey: "id", labelKey: "name", rows }),
    ).not.toThrow();
  });

  test("empty rows does not throw (the zero-rows outcome is handled elsewhere)", () => {
    expect(() =>
      verifyFilterOptionsContract({
        valueKey: "id",
        labelKey: "name",
        rows: [],
      }),
    ).not.toThrow();
  });

  test("null / non-array rows do not throw", () => {
    expect(() =>
      verifyFilterOptionsContract({
        valueKey: "id",
        labelKey: "name",
        rows: null,
      }),
    ).not.toThrow();
    expect(() =>
      verifyFilterOptionsContract({
        valueKey: "id",
        labelKey: "name",
        rows: "not-an-array",
      }),
    ).not.toThrow();
  });
});
