import { MAX_LABEL_LENGTH } from "./constants.js";
import validateQuerySpec from "./validateQuerySpec.js";

/**
 * Validates an export spec (the export_data tool's input, and the download
 * section shape inside report specs): { label?, query }.
 */
function validateExportSpec({ spec, datasets, roles }) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("Invalid export spec: spec must be an object.");
  }
  const label = spec.label ?? "Download CSV";
  if (typeof label !== "string" || label.length > MAX_LABEL_LENGTH) {
    throw new Error(`Invalid export spec: label must be a string of at most ${MAX_LABEL_LENGTH} characters.`);
  }
  validateQuerySpec({ spec: spec.query, datasets, roles });
  return { label, query: spec.query };
}

export default validateExportSpec;
