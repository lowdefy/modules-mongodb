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

// Excel strips leading whitespace before deciding whether a cell is a formula,
// so tab and CR are formula triggers too — and a leading tab is not otherwise
// quoted, since it is not one of the RFC-4180 special characters.
test("neutralises tab- and CR-prefixed formulas, not just = + - @", () => {
  const csv = buildCsv({
    rows: [{ a: "\t=cmd()", b: "\r=cmd()", c: "=cmd()", d: "-5", e: 5 }],
    columns: ["a", "b", "c", "d", "e"],
  });
  const [, row] = csv.split("\r\n");
  // Tab keeps its quote-free form; CR forces RFC-4180 quoting around it.
  expect(row.startsWith("'\t=cmd()")).toBe(true);
  expect(row).toContain('"\'\r=cmd()"');
  expect(row).toContain("'=cmd()");
  expect(row).toContain("'-5");
  // Numbers are never prefixed — only string cells can be formulas.
  expect(row.endsWith(",5")).toBe(true);
});
