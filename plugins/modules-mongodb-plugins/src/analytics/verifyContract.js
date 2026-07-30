/**
 * Verifies a declared presentation contract against the ACTUAL result rows —
 * the check that replaces the old static shape-derivation. A raw pipeline's
 * output shape isn't statically known, so declared column keys and their
 * numeric-ness are confirmed only once rows are in hand: buildDataParts at turn
 * end (chart parts), compileReport at report-view time (kpi/chart/table), and
 * the filter options list wherever it is built.
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
  return row && typeof row === "object"
    ? Object.keys(row).join(", ")
    : "(none)";
}

// Declared keys must exist SOMEWHERE in the result, not just in row 0. Checking
// only the first row cuts both ways: `$project` with a conditional, `$unionWith`
// over differing shapes, or a `$group` whose first bucket lacks an optional
// field all produce a result where row 0 omits a key that later rows carry —
// a false failure — while a genuinely mis-declared key still passes any check
// that stops at a row which happens to hold it. Requiring the key in at least
// one row catches the mis-declaration without rejecting legitimately sparse
// output, which renders as blank cells. Empty results skip verification.
function requireKeys(rows, keys, what) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  for (const key of keys) {
    const present = rows.some(
      (row) => row !== null && typeof row === "object" && key in row,
    );
    if (!present) {
      throw new Error(
        `${what}: column "${key}" is not present in the query results ` +
          `(available columns: ${availableColumns(rows[0])}).`,
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
            `(${JSON.stringify(value)}).`,
        );
      }
    }
  }
}

// A filter option's VALUE must be a string or number, because it round-trips
// through browser state: the compiled options go to the client, the user's
// selection comes back in the re-query payload, and the server puts it straight
// into the filter `$match`. Lowdefy's serializer preserves a Date (`~d` marker)
// but an ObjectId comes back a bare hex STRING, which then never equals the
// ObjectId stored in the field — a filter that shows the right names, matches
// nothing, and reports no error. So this is a correctness check, not
// pedantry. null/undefined is tolerated for the same reason requireNumeric
// tolerates it, and is harmless anyway: selecting a null value drops the triple.
function requireScalar(rows, keys, what) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  for (const row of rows) {
    for (const key of keys) {
      const value = row?.[key];
      if (
        value !== null &&
        value !== undefined &&
        typeof value !== "string" &&
        typeof value !== "number"
      ) {
        throw new Error(
          `${what}: column "${key}" must be a string or number to match on but a row ` +
            `holds a ${typeof value} (${JSON.stringify(value)}). An ObjectId does not ` +
            `survive the round-trip through the browser — project it with $toString, ` +
            `and only where the filtered field stores strings too.`,
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
  requireKeys(
    rows,
    columns.map((column) => column.key),
    "Table contract",
  );
}

export function verifyFilterOptionsContract({ valueKey, labelKey, rows }) {
  requireKeys(rows, [valueKey, labelKey], "Filter options contract");
  // valueKey only: the label is display text, and a non-scalar there renders
  // oddly at worst — it never silently breaks the match.
  requireScalar(rows, [valueKey], "Filter options contract");
}
