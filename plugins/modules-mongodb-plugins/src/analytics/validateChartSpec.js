import { CHART_TYPES, MAX_LABEL_LENGTH } from "./constants.js";
import validatePipeline from "./validatePipeline.js";

/**
 * Validates a `{ collection, pipeline }` query object — the shape every
 * query-backed spec (chart, kpi, table, download, export) carries on the open
 * engine.
 *
 * `catalog` is optional and controls WHERE the pipeline grammar/role gate runs:
 *   - present  → run validatePipeline now (validate-before-persist posture:
 *                generate_report / render_chart reject a bad pipeline before
 *                acking or saving). Throws the validator's actionable message.
 *   - absent   → shape checks only. AnalyticsPipeline revalidates at execution
 *                regardless, so callers holding already-fetched rows
 *                (buildDataParts) or deferring per-viewer gating to the
 *                per-section AnalyticsPipeline (resolve-report) skip it — which
 *                is what keeps one bad section an Alert card, not a whole-report
 *                failure.
 *
 * Returns the RAW query unchanged (reports persist raw — the reconstructed
 * pipeline is discarded; resolve-time revalidation is the guarantee).
 */
export function validateQuery(query, { catalog, roles, fail }) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    fail("query must be an object with a collection and a pipeline.");
  }
  if (typeof query.collection !== "string" || query.collection === "") {
    fail("query.collection is required (a catalog-declared collection name).");
  }
  if (!Array.isArray(query.pipeline)) {
    fail("query.pipeline must be an array of aggregation stages.");
  }
  if (catalog) {
    // Throws Error("Invalid pipeline: …") — already actionable, so it
    // propagates rather than being re-wrapped by `fail`.
    validatePipeline({
      collection: query.collection,
      pipeline: query.pipeline,
      catalog,
      roles,
    });
  }
  return { collection: query.collection, pipeline: query.pipeline };
}

/**
 * Validates a chart spec (the render_chart tool's input, and the chart section
 * shape inside report specs):
 *   { chart: bar|line|pie, title, query: { collection, pipeline }, x, y: [column] }
 *
 * The presentation contract (`x`, `y`) is inert data — length-capped strings,
 * no query grammar, zero security surface. It cannot be checked against the
 * pipeline statically (an arbitrary pipeline's output shape is unknown); it is
 * verified against the actual rows at render points (buildDataParts /
 * compileReport). Returns { chart, title, query, x, y }.
 */
function validateChartSpec({ spec, catalog, roles }) {
  const fail = (m) => {
    throw new Error(`Invalid chart spec: ${m}`);
  };
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    fail("spec must be an object.");
  }
  if (!CHART_TYPES.includes(spec.chart)) {
    fail(`chart "${spec.chart}" is not one of ${CHART_TYPES.join(", ")}.`);
  }
  if (typeof spec.title !== "string" || spec.title === "") {
    fail("title is required.");
  }
  if (spec.title.length > MAX_LABEL_LENGTH) {
    fail(`title exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  const query = validateQuery(spec.query, { catalog, roles, fail });

  // Presentation contract: x is the category / pie-item column, y the value
  // series (one or more columns). Inert-data checks only.
  if (typeof spec.x !== "string" || spec.x === "") {
    fail("x must be a non-empty column name.");
  }
  if (spec.x.length > MAX_LABEL_LENGTH) {
    fail(`x exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  if (!Array.isArray(spec.y) || spec.y.length === 0) {
    fail("y must be a non-empty array of column names.");
  }
  for (const col of spec.y) {
    if (typeof col !== "string" || col === "") {
      fail("y column names must be non-empty strings.");
    }
    if (col.length > MAX_LABEL_LENGTH) {
      fail(`y column "${col}" exceeds ${MAX_LABEL_LENGTH} characters.`);
    }
  }

  return { chart: spec.chart, title: spec.title, query, x: spec.x, y: spec.y };
}

export default validateChartSpec;
