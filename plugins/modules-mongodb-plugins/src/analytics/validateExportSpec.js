import { MAX_LABEL_LENGTH } from "./constants.js";
import { validateQuery } from "./validateChartSpec.js";

// Exports carry NO presentation contract — CSV headers come from the row keys.
// So the spec is strict: only label, description and query are accepted, and a
// contract-shaped payload (x/y/columns/valueKey/…) is rejected outright.
const ALLOWED_KEYS = new Set(["label", "description", "query"]);

/**
 * Validates an export spec (the export_data tool's input, and the download
 * section shape inside report specs): { label?, description?, query }.
 */
function validateExportSpec({ spec, catalog, roles }) {
  const fail = (m) => {
    throw new Error(`Invalid export spec: ${m}`);
  };
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    fail("spec must be an object.");
  }
  for (const key of Object.keys(spec)) {
    if (!ALLOWED_KEYS.has(key)) {
      fail(
        `unexpected key "${key}" — exports carry no presentation contract (CSV headers come from row keys).`,
      );
    }
  }
  const label = spec.label ?? "Download CSV";
  if (typeof label !== "string" || label.length > MAX_LABEL_LENGTH) {
    fail(`label must be a string of at most ${MAX_LABEL_LENGTH} characters.`);
  }
  const description = spec.description ?? "";
  if (
    typeof description !== "string" ||
    description.length > MAX_LABEL_LENGTH
  ) {
    fail(
      `description must be a string of at most ${MAX_LABEL_LENGTH} characters.`,
    );
  }
  const query = validateQuery(spec.query, { catalog, roles, fail });
  return { label, description, query };
}

export default validateExportSpec;
