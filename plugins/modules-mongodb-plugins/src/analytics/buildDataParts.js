import { MAX_DATA_PARTS_SPECS } from "./constants.js";
import buildEChartsOption from "./buildEChartsOption.js";
import validateChartSpec from "./validateChartSpec.js";
import validateExportSpec from "./validateExportSpec.js";
import { verifyChartContract } from "./verifyContract.js";

/**
 * Builds the dataParts the emit-data-parts onFinish hook returns — the chart
 * and download payloads the chat page's adjacent panel accumulates via
 * onDataPart. The render_chart / export_data tools validated their specs during
 * the turn and acked; this hook re-checks the spec shapes (specs travel through
 * the hook payload's toolResults) and does the work once per turn.
 *
 * The chart/download pipelines were already validated and run through
 * AnalyticsPipeline by emit-data-parts, so this runs no catalog gate — the rows
 * are in hand. It re-runs the inert spec checks and, for charts, verifies the
 * declared x/y contract AGAINST the actual rows (keys present, y numeric). A
 * mismatch throws an actionable message the agent self-corrects on.
 *
 * Params:
 *   charts    — chart specs ({ chart, title, query, x, y }) in tool-call order.
 *   results   — per-chart row arrays, aligned with `charts` (the hook's :for
 *               AnalyticsPipeline step results; sparse entries skip their chart).
 *   downloads — export specs ({ label?, description?, query }).
 *   roles     — viewer roles (unused without a catalog; kept for symmetry).
 *
 * At most MAX_DATA_PARTS_SPECS chart/export specs are processed per turn.
 */
function buildDataParts({ charts = [], results = [], downloads = [], roles }) {
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
    const { chart, title, x, y } = validateChartSpec({ spec, roles });
    verifyChartContract({ x, y, rows });
    parts.push({
      type: "data-report-chart",
      data: { title, option: buildEChartsOption({ chart, x, y, rows }) },
    });
    budget -= 1;
  });

  (downloads ?? []).forEach((spec) => {
    if (budget <= 0) return;
    const { label, description, query } = validateExportSpec({ spec, roles });
    parts.push({ type: "data-report-download", data: { label, description, query } });
    budget -= 1;
  });

  return parts;
}

export default buildDataParts;
