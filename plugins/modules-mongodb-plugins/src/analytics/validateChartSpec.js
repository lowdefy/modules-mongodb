import { CHART_TYPES, MAX_LABEL_LENGTH } from "./constants.js";
import validateQuerySpec from "./validateQuerySpec.js";

/**
 * Validates a chart spec (the render_chart tool's input, and the chart section
 * shape inside report specs): { chart, title, query }.
 *
 * Returns { chart, title, query (raw, revalidated), select, measures } — the
 * normalized select/measure keys are what buildEChartsOption consumes.
 */
function validateChartSpec({ spec, datasets, roles }) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("Invalid chart spec: spec must be an object.");
  }
  if (!CHART_TYPES.includes(spec.chart)) {
    throw new Error(
      `Invalid chart spec: chart "${spec.chart}" is not one of ${CHART_TYPES.join(", ")}.`
    );
  }
  if (typeof spec.title !== "string" || spec.title === "") {
    throw new Error("Invalid chart spec: title is required.");
  }
  if (spec.title.length > MAX_LABEL_LENGTH) {
    throw new Error(`Invalid chart spec: title exceeds ${MAX_LABEL_LENGTH} characters.`);
  }
  const { select, measures } = validateQuerySpec({ spec: spec.query, datasets, roles });
  if (select.length < 1) {
    throw new Error("Invalid chart spec: the query must select at least one dimension (x-axis).");
  }
  if (measures.length < 1) {
    throw new Error("Invalid chart spec: the query must request at least one measure.");
  }
  return { chart: spec.chart, title: spec.title, query: spec.query, select, measures };
}

export default validateChartSpec;
