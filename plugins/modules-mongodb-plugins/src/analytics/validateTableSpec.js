import { FORMAT_STYLES, MAX_LABEL_LENGTH } from "./constants.js";
import { validateQuery } from "./validateChartSpec.js";

// An optional is absent whether it arrived as undefined or as null — the same
// normalization every spec validator in this directory applies (see
// validateReportSpec.js's own `absent` for why: a stored spec reaches this
// function through MongoDB, which turns an undefined into a null).
const absent = (value) => value === undefined || value === null;

/**
 * Validates a presentation-contract number format
 * (`{ style: decimal|currency, currency?, locale?, decimals? }`): inert
 * display data the agent copies from the catalog's per-field display hints.
 * Only the shape is validated. `fail` is the caller's own throwing function
 * and `where` its message prefix, so a kpi section, a table column and a
 * standalone table spec each get a format error phrased in their own voice.
 */
export function validateFormat(format, where, fail) {
  if (!format || typeof format !== "object" || Array.isArray(format)) {
    fail(`${where} format must be an object.`);
  }
  if (!FORMAT_STYLES.includes(format.style)) {
    fail(
      `${where} format.style "${format.style}" is not one of ${FORMAT_STYLES.join(", ")}.`,
    );
  }
  if (!absent(format.currency) && typeof format.currency !== "string") {
    fail(`${where} format.currency must be a string.`);
  }
  if (!absent(format.locale) && typeof format.locale !== "string") {
    fail(`${where} format.locale must be a string.`);
  }
  if (
    !absent(format.decimals) &&
    (!Number.isInteger(format.decimals) ||
      format.decimals < 0 ||
      format.decimals > 20)
  ) {
    fail(`${where} format.decimals must be an integer between 0 and 20.`);
  }
  const out = { style: format.style };
  if (!absent(format.currency)) out.currency = format.currency;
  if (!absent(format.locale)) out.locale = format.locale;
  if (!absent(format.decimals)) out.decimals = format.decimals;
  return out;
}

/**
 * Validates a table spec (the render_table tool's input, and the table
 * section shape inside report specs):
 *   { title, query: { collection, pipeline }, columns: [{ key, label?, format? }] }
 *
 * There is deliberately NO `tag` flag on a column — the old derived enum-tag
 * styling was dropped; cells render plain text.
 *
 * `catalog` is optional and controls WHERE the pipeline grammar/role gate runs:
 *   - present  → run validatePipeline now (validate-before-persist posture:
 *                a render_table tool call rejects a bad pipeline before
 *                acking). Throws the validator's actionable message.
 *   - absent   → shape checks only. AnalyticsPipeline revalidates at execution
 *                regardless, so callers holding already-fetched rows
 *                (buildDataParts) skip it.
 *
 * The declared column keys are inert data — they cannot be checked against
 * the pipeline statically (an arbitrary pipeline's output shape is unknown);
 * verifyTableContract checks them against actual rows at render points.
 *
 * Returns { title, query, columns }.
 */
function validateTableSpec({ spec, catalog, roles }) {
  const fail = (m) => {
    throw new Error(`Invalid table spec: ${m}`);
  };
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    fail("spec must be an object.");
  }
  if (typeof spec.title !== "string" || spec.title === "") {
    fail("title is required.");
  }
  if (spec.title.length > MAX_LABEL_LENGTH) {
    fail(`title exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  const query = validateQuery(spec.query, { catalog, roles, fail });

  if (!Array.isArray(spec.columns) || spec.columns.length === 0) {
    fail("columns must be a non-empty array.");
  }
  const columns = spec.columns.map((col, ci) => {
    if (!col || typeof col !== "object" || Array.isArray(col)) {
      fail(`column ${ci} must be an object.`);
    }
    // Strict keys: no `tag` (enum tag styling dropped) or other extras.
    for (const key of Object.keys(col)) {
      if (!["key", "label", "format"].includes(key)) {
        fail(
          `column ${ci} has an unexpected key "${key}" (allowed: key, label, format).`,
        );
      }
    }
    if (typeof col.key !== "string" || col.key === "") {
      fail(`column ${ci} requires a key.`);
    }
    if (col.key.length > MAX_LABEL_LENGTH) {
      fail(`column ${ci} key exceeds ${MAX_LABEL_LENGTH} characters.`);
    }
    const out = { key: col.key };
    if (!absent(col.label)) {
      if (
        typeof col.label !== "string" ||
        col.label.length > MAX_LABEL_LENGTH
      ) {
        fail(
          `column ${ci} label must be a string of at most ${MAX_LABEL_LENGTH} characters.`,
        );
      }
      out.label = col.label;
    }
    if (!absent(col.format)) {
      out.format = validateFormat(col.format, `column ${ci}`, fail);
    }
    return out;
  });

  return { title: spec.title, query, columns };
}

export default validateTableSpec;
