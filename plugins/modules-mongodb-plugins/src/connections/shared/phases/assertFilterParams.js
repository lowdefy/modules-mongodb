import { WorkflowEngineError } from "../errors.js";

// Request params the engine places directly into a Mongo filter. Lowdefy
// deserializes the client payload verbatim, so an object here (e.g.
// `{ "$ne": null }`) would be read as a query operator and widen the match.
const FILTER_PARAM_PATHS = [
  ["action_id"],
  ["workflow_id"],
  ["group_id"],
  ["parent_action_id"],
  ["reference_value"],
  ["entity", "connection_id"],
  ["entity", "id"],
];

function isObjectLike(value) {
  if (value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Throw `invalid_params` when a filter-position param is a plain object or an
 * array. Scalars and typed ids (strings, numbers, ObjectIds) pass; absent
 * params pass — each handler enforces its own required params.
 *
 * @param {Object} params — the request params.
 */
function assertFilterParams(params) {
  for (const path of FILTER_PARAM_PATHS) {
    let value = params;
    for (const segment of path) value = value?.[segment];
    if (isObjectLike(value)) {
      throw new WorkflowEngineError(
        `Request param "${path.join(".")}" must be a scalar id, not an object or array.`,
        { code: "invalid_params" },
      );
    }
  }
}

export default assertFilterParams;
