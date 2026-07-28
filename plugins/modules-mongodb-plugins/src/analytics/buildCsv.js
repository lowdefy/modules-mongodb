/**
 * Builds a CSV string from result rows — shared by the DownloadCsv client
 * action. Columns default to the first row's keys; pass `columns` to fix
 * order. RFC-4180 quoting; string cells starting with a formula trigger are
 * prefixed with a single quote to block CSV-injection into spreadsheet apps.
 */

// Leading characters that make a spreadsheet treat a cell as a formula. Tab and
// carriage return belong here alongside the obvious four: Excel strips leading
// whitespace before parsing, so "\t=cmd()" is still a formula — and a leading
// tab is not otherwise quoted, since it is not one of the RFC-4180 triggers.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function escapeCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return escapeCell(JSON.stringify(value));
  let cell = String(value);
  if (typeof value === "string" && FORMULA_TRIGGER.test(cell)) {
    cell = `'${cell}`;
  }
  if (/[",\n\r]/.test(cell)) {
    cell = `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

function buildCsv({ rows, columns }) {
  if (!Array.isArray(rows)) {
    throw new Error("buildCsv: rows must be an array.");
  }
  const cols = columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  const lines = [cols.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(cols.map((col) => escapeCell(row?.[col])).join(","));
  }
  return lines.join("\r\n");
}

export default buildCsv;
