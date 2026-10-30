/**
 * Which values in a workflow's form_data are files, and which file keys the
 * module accepts. The submit check (SubmitWorkflowAction) and the download
 * lookup (GetWorkflowFormFile) share these, so a key the submit lets in is one
 * the lookup will sign, and nothing the submit refuses can be signed as a file.
 *
 * Form files are uploaded by the app's own `upload_files` policy request, which
 * must mint keys under `{organization_id}/workflows/`. form_data is written from
 * the browser, so a key is trusted only by its prefix.
 */

/**
 * A form file is any plain object with a string `key`: a file in a
 * `{ fileList }` upload value, a single `{ file }`, or a bare file.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFormFile(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.key === "string"
  );
}

/**
 * Every form file anywhere in `value`, with the path to it, at any depth:
 * nested in lists, sections, keyed slots and inside other files.
 *
 * @param {unknown} value
 * @param {Array<string|number>} [path]
 * @returns {{ file: object, path: Array<string|number> }[]}
 */
export function listFormFiles(value, path = []) {
  if (value == null || typeof value !== "object") return [];
  const found = isFormFile(value) ? [{ file: value, path }] : [];
  for (const [childKey, child] of Object.entries(value)) {
    const childPath = [
      ...path,
      Array.isArray(value) ? Number(childKey) : childKey,
    ];
    found.push(...listFormFiles(child, childPath));
  }
  return found;
}

/**
 * Whether `key` is under the caller's own `{organization_id}/workflows/`.
 *
 * @param {string} key
 * @param {string | null | undefined} organizationId
 * @returns {boolean}
 */
export function isOwnFormFileKey(key, organizationId) {
  return (
    typeof organizationId === "string" &&
    organizationId !== "" &&
    typeof key === "string" &&
    key.startsWith(`${organizationId}/workflows/`)
  );
}

// The second path segment of every module-minted key: workflows form files,
// files module records and support uploads, each under `{organization_id}/`.
const MODULE_PREFIXES = new Set(["workflows", "files", "support"]);

/**
 * Whether `key` carries no module prefix: its second path segment is not
 * `workflows`, `files` or `support`. Form files uploaded before keys carried
 * the organization have this shape, and the submit check stops new ones
 * getting in.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isLegacyFormFileKey(key) {
  if (typeof key !== "string") return false;
  return !MODULE_PREFIXES.has(key.split("/")[1]);
}

/**
 * Whether a form file key found in a slot the caller may view can be signed
 * for this caller: their own organization's form file, or a legacy key.
 * Another organization's prefix, or a files module or support key in a form
 * slot, is never signed.
 *
 * @param {string} key
 * @param {string | null | undefined} organizationId
 * @returns {boolean}
 */
export function isSignableFormFileKey(key, organizationId) {
  return isOwnFormFileKey(key, organizationId) || isLegacyFormFileKey(key);
}
