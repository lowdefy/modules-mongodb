import buildCsv from "./buildCsv.js";

test("builds a CSV with a header row from the first row's keys", () => {
  const csv = buildCsv({
    rows: [
      { region: "EU", total_sum: 2500 },
      { region: "US", total_sum: 1700 },
    ],
  });
  expect(csv).toBe("region,total_sum\r\nEU,2500\r\nUS,1700");
});

test("respects explicit column order and fills missing cells", () => {
  const csv = buildCsv({
    rows: [{ b: 2, a: 1 }],
    columns: ["a", "b", "c"],
  });
  expect(csv).toBe("a,b,c\r\n1,2,");
});

test("quotes cells with commas, quotes and newlines", () => {
  const csv = buildCsv({ rows: [{ note: 'a,"b"\nc' }] });
  expect(csv).toBe('note\r\n"a,""b""\nc"');
});

test("guards formula-injection triggers in string cells", () => {
  const csv = buildCsv({ rows: [{ v: "=SUM(A1)" }, { v: -5 }] });
  expect(csv).toBe("v\r\n'=SUM(A1)\r\n-5");
});

test("serializes dates as ISO strings", () => {
  const csv = buildCsv({ rows: [{ at: new Date("2026-04-01T00:00:00.000Z") }] });
  expect(csv).toBe("at\r\n2026-04-01T00:00:00.000Z");
});

test("empty rows produce an empty CSV", () => {
  expect(buildCsv({ rows: [] })).toBe("");
});
