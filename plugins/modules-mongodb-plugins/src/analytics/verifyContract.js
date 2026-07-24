/**
 * Verifies a declared presentation contract against the ACTUAL result rows —
 * the check that replaces the old static shape-derivation. A raw pipeline's
 * output shape isn't statically known, so declared column keys and their
 * numeric-ness are confirmed only once rows are in hand: buildDataParts at turn
 * end (chart parts) and compileReport at report-view time (kpi/chart/table).
 *
 * Verification applies to NON-EMPTY results only — zero rows is a legitimate
 * outcome (a filter narrowing to nothing) and renders as an empty chart / zero
 * KPI / empty table. `null` cells in a value column are tolerated: null group
 * keys are normal pipeline output.
 *
 * Each function throws Error(message) on a mismatch. The caller turns that into
 * a tool error the agent self-corrects on (chat) or an Alert-card section
 * (report view) — a graceful rendering failure, never a safety one.
 */

function availableColumns(row) {
  return row && typeof row === "object" ? Object.keys(row).join(", ") : "(none)";
}

// Declared keys must exist in the result — checked against the first row (a
// pipeline emits a stable row shape). Empty results skip verification.
function requireKeys(rows, keys, what) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const first = rows[0];
  for (const key of keys) {
    if (first === null || typeof first !== "object" || !(key in first)) {
      throw new Error(
        `${what}: column "${key}" is not present in the query results ` +
          `(available columns: ${availableColumns(first)}).`
      );
    }
  }
}

// Value columns must be numeric where present; null/undefined cells (missing
// group keys) are tolerated.
function requireNumeric(rows, keys, what) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  for (const row of rows) {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== null && value !== undefined && typeof value !== "number") {
        throw new Error(
          `${what}: column "${key}" must be numeric but a row holds a ${typeof value} ` +
            `(${JSON.stringify(value)}).`
        );
      }
    }
  }
}

export function verifyChartContract({ x, y, rows }) {
  requireKeys(rows, [x, ...y], "Chart contract");
  requireNumeric(rows, y, "Chart contract");
}

export function verifyKpiContract({ valueKey, rows }) {
  requireKeys(rows, [valueKey], "KPI contract");
  requireNumeric(rows, [valueKey], "KPI contract");
}

export function verifyTableContract({ columns, rows }) {
  requireKeys(rows, columns.map((column) => column.key), "Table contract");
}
