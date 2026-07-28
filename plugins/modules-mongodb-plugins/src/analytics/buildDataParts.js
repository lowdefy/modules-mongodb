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
 * declared x/y contract AGAINST the actual rows (keys present, y numeric).
 *
 * Each spec is isolated: a spec that fails its checks is skipped and the rest
 * of the turn's parts are still returned. Isolation is not cosmetic — this runs
 * in an onFinish hook whose errors handleAgentChat only console.warns, so a
 * single throw would drop every chart AND download of the turn from the stream
 * with nothing shown to the user. The agent cannot self-correct either: its
 * turn is over by the time this runs, and a declared key that the pipeline
 * doesn't actually emit is undetectable at render_chart time (no rows yet).
 * A skipped spec is currently silent to the user — surfacing it needs an error
 * dataPart type the chat page's onDataPart handles.
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

  // A skipped spec does not spend budget — it produced no part.
  (charts ?? []).forEach((spec, index) => {
    if (budget <= 0) return;
    const rows = resultsArray[index];
    if (rows === null || rows === undefined) return;
    try {
      const { chart, title, x, y } = validateChartSpec({ spec, roles });
      verifyChartContract({ x, y, rows });
      parts.push({
        type: "data-report-chart",
        data: { title, option: buildEChartsOption({ chart, x, y, rows }) },
      });
      budget -= 1;
    } catch {
      // Skip this chart; the turn's other parts still reach the panel.
    }
  });

  (downloads ?? []).forEach((spec) => {
    if (budget <= 0) return;
    try {
      const { label, description, query } = validateExportSpec({ spec, roles });
      parts.push({ type: "data-report-download", data: { label, description, query } });
      budget -= 1;
    } catch {
      // Skip this download; the turn's other parts still reach the panel.
    }
  });

  return parts;
}

export default buildDataParts;
