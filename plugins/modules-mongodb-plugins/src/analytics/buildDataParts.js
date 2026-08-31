import { MAX_DATA_PART_ROWS, MAX_DATA_PARTS_SPECS } from "./constants.js";
import buildFlintOption from "./buildFlintOption.js";
import validateChartSpec from "./validateChartSpec.js";
import validateExportSpec from "./validateExportSpec.js";
import validateTableSpec from "./validateTableSpec.js";
import { verifyChartContract, verifyTableContract } from "./verifyContract.js";

// The chat page's result panel is a fixed-width column beside the conversation,
// and chart assembly lays out for the width it is given. The expand modal is
// wider but re-uses this option verbatim — it renders the persisted one out of
// state rather than assembling its own — so an expanded chart wears the panel's
// layout: a horizontal legend and, where the panel's slots were too tight, a
// tilted axis label. Both are conservative at the wider size (labels that fit at
// 420px cannot overlap at 900) and both beat what the modal showed before, which
// was the same vertical labels the panel had.
const CHAT_PANEL_WIDTH = 420;

// The hook's :for step results are index-aligned with their specs, but a run
// whose entries are sparse reaches this function as an object keyed by index
// instead of an array. Coerced back, so a missing entry stays a hole at its own
// index rather than shifting every later spec onto the wrong rows.
function asArray(value) {
  const array = value ?? [];
  if (!Array.isArray(array) && typeof array === "object") {
    return Object.assign([], array);
  }
  return array;
}

/**
 * Builds the dataParts the emit-data-parts onFinish hook returns — the chart,
 * table and download payloads the chat page's adjacent panel accumulates via
 * onDataPart. The render_chart / render_table / export_data tools validated
 * their specs during the turn and acked; this hook re-checks the spec shapes
 * (specs travel through the hook payload's toolResults) and does the work once
 * per turn.
 *
 * The pipelines were already validated and run through AnalyticsPipeline by
 * emit-data-parts, so this runs no catalog gate — the rows are in hand. It
 * re-runs the inert spec checks and verifies the declared contract AGAINST the
 * actual rows: x/y for a chart (keys present, y numeric), the column keys for a
 * table.
 *
 * A chart and a table part each carry the validated spec that produced them,
 * because the panel is an artefact store the save-as-report surface builds
 * report sections out of, and a section needs a query — a baked ECharts option
 * cannot be reversed into a pipeline. A download part keeps its `query` flat,
 * the shape the chat page and get-conversation-results already read.
 *
 * A chart part's frozen artefact is its option; a table part's is its rows,
 * which is why they are capped at MAX_DATA_PART_ROWS while an option needs no
 * cap: rows scale with the query, and the whole parts array is rewritten onto
 * the conversation document every turn.
 *
 * Each spec is isolated: a spec that fails its checks is skipped and the rest
 * of the turn's parts are still returned. Isolation is not cosmetic — this runs
 * in an onFinish hook whose errors handleAgentChat only console.warns, so a
 * single throw would drop every part of the turn from the stream
 * with nothing shown to the user. The agent cannot self-correct either: its
 * turn is over by the time this runs, and a declared key that the pipeline
 * doesn't actually emit is undetectable at render_chart time (no rows yet).
 * A skipped spec is currently silent to the user — surfacing it needs an error
 * dataPart type the chat page's onDataPart handles.
 *
 * Params:
 *   charts       — chart specs ({ chart, title, query, x, y }) in tool-call order.
 *   results      — per-chart row arrays, aligned with `charts` (the hook's :for
 *                  AnalyticsPipeline step results; sparse entries skip their
 *                  chart).
 *   tables       — table specs ({ title, query, columns }) in tool-call order.
 *   tableResults — per-table row arrays, aligned with `tables` exactly as
 *                  `results` is with `charts`.
 *   downloads    — export specs ({ label?, description?, query }).
 *   roles        — viewer roles, forwarded to the spec validators. They consume
 *               it only when a `catalog` is also supplied (validateQuery runs
 *               validatePipeline with it); this caller passes none, because
 *               the pipelines already ran through AnalyticsPipeline. It stays
 *               in the signature so the parameter cannot go missing if a
 *               catalog is ever threaded through here.
 *
 * At most MAX_DATA_PARTS_SPECS charts, MAX_DATA_PARTS_SPECS tables and
 * MAX_DATA_PARTS_SPECS downloads are processed per turn — three separate
 * budgets, so a chart-heavy turn cannot starve the tables and downloads it also
 * produced.
 */
function buildDataParts({
  charts = [],
  results = [],
  tables = [],
  tableResults = [],
  downloads = [],
  roles,
}) {
  const parts = [];
  let chartBudget = MAX_DATA_PARTS_SPECS;
  let tableBudget = MAX_DATA_PARTS_SPECS;
  let downloadBudget = MAX_DATA_PARTS_SPECS;

  const resultsArray = asArray(results);
  const tableResultsArray = asArray(tableResults);

  // A skipped spec does not spend budget — it produced no part.
  (charts ?? []).forEach((spec, index) => {
    if (chartBudget <= 0) return;
    const rows = resultsArray[index];
    if (rows === null || rows === undefined) return;
    try {
      const { chart, title, query, x, y, stacked } = validateChartSpec({
        spec,
        roles,
      });
      verifyChartContract({ x, y, rows });
      // The canvas height travels with the option because it is derived from
      // the same layout pass — the axis furniture the compiler sized for these
      // labels only fits at the height it returned.
      const { option, height } = buildFlintOption({
        chart,
        x,
        y,
        rows,
        stacked,
        width: CHAT_PANEL_WIDTH,
      });
      parts.push({
        type: "data-report-chart",
        data: {
          title,
          option,
          height,
          // stacked is part of the contract the save-as-report surface carries
          // into a section; validateChartSpec only returns it when true.
          spec: { chart, query, x, y, ...(stacked ? { stacked } : {}) },
        },
      });
      chartBudget -= 1;
    } catch {
      // Skip this chart; the turn's other parts still reach the panel.
    }
  });

  (tables ?? []).forEach((spec, index) => {
    if (tableBudget <= 0) return;
    const rows = tableResultsArray[index];
    if (rows === null || rows === undefined) return;
    try {
      const { title, query, columns } = validateTableSpec({ spec, roles });
      verifyTableContract({ columns, rows });
      // Narrowed to the declared columns for the same reason a chart's option
      // carries only its contract's: the part is persisted, so an unprojected
      // row array makes it as wide as everything the pipeline emitted rather
      // than as wide as what the card displays.
      const keys = columns.map((column) => column.key);
      const projected = rows.map((row) =>
        Object.fromEntries(keys.map((key) => [key, row[key]])),
      );
      parts.push({
        type: "data-report-table",
        data: {
          title,
          rows: projected.slice(0, MAX_DATA_PART_ROWS),
          // The total the query returned, before the cap — what lets a card say
          // "first 200 of 964" rather than imply it shows everything.
          row_count: rows.length,
          // The panel reads its column definitions from here; a second copy
          // outside the spec would be a second thing to keep in step.
          spec: { query, columns },
        },
      });
      tableBudget -= 1;
    } catch {
      // Skip this table; the turn's other parts still reach the panel.
    }
  });

  (downloads ?? []).forEach((spec) => {
    if (downloadBudget <= 0) return;
    try {
      const { label, description, query } = validateExportSpec({ spec, roles });
      parts.push({
        type: "data-report-download",
        data: { label, description, query },
      });
      downloadBudget -= 1;
    } catch {
      // Skip this download; the turn's other parts still reach the panel.
    }
  });

  return parts;
}

export default buildDataParts;
