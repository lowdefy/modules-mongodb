/**
 * Builds a CSV string from result rows — shared by the DownloadCsv client
 * action. Columns default to the UNION of keys across all rows, first-seen
 * order; pass `columns` to fix a specific order or subset. RFC-4180 quoting;
 * string cells starting with a formula trigger are prefixed with a single
 * quote to block CSV-injection into spreadsheet apps.
 */

// The header is the union of every row's keys, not just row 0's. An open-engine
// pipeline legitimately produces a sparse first row (a $group with an optional
// field, a $unionWith over differing shapes, a conditional $project), and a
// row-0-only header would silently drop every column that row omits from the
// entire file — the same row-0 hazard verifyContract avoids by scanning all
// rows. First-seen order keeps the columns in the order the data introduces them.
function unionKeys(rows) {
  const cols = [];
  const seen = new Set();
  for (const row of rows) {
    if (row !== null && typeof row === "object" && !Array.isArray(row)) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          cols.push(key);
        }
      }
    }
  }
  return cols;
}

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
  const cols = columns ?? unionKeys(rows);
  const lines = [cols.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(cols.map((col) => escapeCell(row?.[col])).join(","));
  }
  return lines.join("\r\n");
}

export default buildCsv;
