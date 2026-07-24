import buildDataParts from "./buildDataParts.js";
import compileReport from "./compileReport.js";
import querySections from "./querySections.js";
import validateChartSpec from "./validateChartSpec.js";
import validateExportSpec from "./validateExportSpec.js";
import validateReportSpec from "./validateReportSpec.js";

/**
 * The _analytics server operator — the reporting module's presentation and
 * validation surface, used inside module endpoint routines:
 *
 *   _analytics.validateReportSpec  { spec, catalog?, roles } → normalized spec
 *   _analytics.validateChartSpec   { spec, catalog?, roles } → normalized spec
 *   _analytics.validateExportSpec  { spec, catalog?, roles } → normalized spec
 *   _analytics.querySections       { spec, catalog?, roles } → resolve-time queries
 *   _analytics.compileReport       { spec, results, catalog?, roles, endpointId } → blocks
 *   _analytics.buildDataParts      { charts, results, downloads, roles } → dataParts
 *
 * `catalog` is optional and only supplied for validate-before-persist
 * (generate_report / render_chart), where it runs the pipeline through
 * validatePipeline; execution-time gating always happens inside
 * AnalyticsPipeline regardless. All methods are pure; validation failures throw
 * with messages the model (via tool errors) or the app author can act on.
 */
const functions = {
  buildDataParts,
  compileReport,
  querySections,
  validateChartSpec,
  validateExportSpec,
  validateReportSpec,
};

function _analytics({ params, location, methodName }) {
  const fn = functions[methodName];
  if (!fn) {
    throw new Error(
      `Operator Error: _analytics.${methodName} is not supported at ${location}. ` +
        `Supported methods: ${Object.keys(functions).join(", ")}.`
    );
  }
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new Error(
      `Operator Error: _analytics.${methodName} takes an object as params at ${location}.`
    );
  }
  return fn(params);
}

_analytics.dynamic = false;

export default _analytics;
