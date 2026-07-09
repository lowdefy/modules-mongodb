import { MAX_DATA_PARTS_SPECS } from "./constants.js";
import buildEChartsOption from "./buildEChartsOption.js";
import validateChartSpec from "./validateChartSpec.js";
import validateExportSpec from "./validateExportSpec.js";

/**
 * Builds the dataParts the emit-data-parts onFinish hook returns — the chart
 * and download payloads the chat page's adjacent panel accumulates via
 * onDataPart. The render_chart / export_data tools validated their specs
 * during the turn and acked; this hook re-validates (specs travel through the
 * hook payload's toolResults) and does the work once per turn.
 *
 * Params:
 *   charts    — chart specs ({ chart, title, query }) in tool-call order.
 *   results   — per-chart row arrays, aligned with `charts` (the hook's :for
 *               AnalyticsQuery step results; sparse entries skip their chart).
 *   downloads — export specs ({ label?, query }).
 *   datasets, roles — dictionary + viewer roles for revalidation.
 *
 * At most MAX_DATA_PARTS_SPECS chart/export specs are processed per turn.
 */
function buildDataParts({ charts = [], results = [], downloads = [], datasets, roles }) {
  const parts = [];
  let budget = MAX_DATA_PARTS_SPECS;

  let resultsArray = results ?? [];
  if (!Array.isArray(resultsArray) && typeof resultsArray === "object") {
    resultsArray = Object.assign([], resultsArray);
  }

  (charts ?? []).forEach((spec, index) => {
    if (budget <= 0) return;
    const rows = resultsArray[index];
    if (rows === null || rows === undefined) return;
    const { chart, title, select, measures } = validateChartSpec({ spec, datasets, roles });
    parts.push({
      type: "data-report-chart",
      data: { title, option: buildEChartsOption({ chart, select, measures, rows }) },
    });
    budget -= 1;
  });

  (downloads ?? []).forEach((spec) => {
    if (budget <= 0) return;
    const { label, description, query } = validateExportSpec({ spec, datasets, roles });
    parts.push({ type: "data-report-download", data: { label, description, spec: query } });
    budget -= 1;
  });

  return parts;
}

export default buildDataParts;
