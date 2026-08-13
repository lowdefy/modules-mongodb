import buildDataParts from "./buildDataParts.js";
import buildFlintOption from "./buildFlintOption.js";
import compileReport from "./compileReport.js";
import deriveReportSpec from "./deriveReportSpec.js";
import querySections from "./querySections.js";
import validateChartSpec from "./validateChartSpec.js";
import validateExportSpec from "./validateExportSpec.js";
import validateReportSpec from "./validateReportSpec.js";
import validateTableSpec from "./validateTableSpec.js";

/**
 * The _analytics server operator — the reporting module's presentation and
 * validation surface, used inside module endpoint routines:
 *
 *   _analytics.deriveReportSpec    { spec, catalog } → spec (derive filter optionsQuery + filterBy)
 *   _analytics.validateReportSpec  { spec, catalog?, roles } → normalized spec
 *   _analytics.validateChartSpec   { spec, catalog?, roles } → normalized spec
 *   _analytics.validateTableSpec   { spec, catalog?, roles } → normalized spec
 *   _analytics.validateExportSpec  { spec, catalog?, roles } → normalized spec
 *   _analytics.querySections       { spec, catalog?, roles } → resolve-time queries
 *   _analytics.compileReport       { spec, results, catalog?, roles, endpointId } → blocks
 *   _analytics.buildDataParts      { charts, results, downloads, roles } → dataParts
 *   _analytics.buildFlintOption    { chart, x, y, rows } → { option, height }
 *
 * `catalog` is optional and only supplied for validate-before-persist
 * (generate_report / render_chart), where it runs the pipeline through
 * validatePipeline; execution-time gating always happens inside
 * AnalyticsPipeline regardless. All methods are pure; validation failures throw
 * with messages the model (via tool errors) or the app author can act on.
 */
// A Map, not a plain object: `functions[methodName]` resolves inherited keys,
// so `_analytics.constructor` would look up Object and invoke it. methodName
// comes from build-time YAML rather than user input, so this was not
// exploitable — but the sibling allowlist files mandate Set/Map membership over
// object indexing precisely so no caller has to re-derive that each time.
const functions = new Map([
  ["buildDataParts", buildDataParts],
  ["buildFlintOption", buildFlintOption],
  ["compileReport", compileReport],
  ["deriveReportSpec", deriveReportSpec],
  ["querySections", querySections],
  ["validateChartSpec", validateChartSpec],
  ["validateExportSpec", validateExportSpec],
  ["validateReportSpec", validateReportSpec],
  ["validateTableSpec", validateTableSpec],
]);

function _analytics({ params, location, methodName }) {
  const fn = functions.get(methodName);
  if (!fn) {
    throw new Error(
      `Operator Error: _analytics.${methodName} is not supported at ${location}. ` +
        `Supported methods: ${[...functions.keys()].join(", ")}.`,
    );
  }
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new Error(
      `Operator Error: _analytics.${methodName} takes an object as params at ${location}.`,
    );
  }
  return fn(params);
}

_analytics.dynamic = false;

export default _analytics;
