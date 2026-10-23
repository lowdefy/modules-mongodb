import { isPlainObject } from "../../shared/phases/planners/deepMerge.js";
import {
  isOwnFormFileKey,
  listFormFiles,
} from "../../shared/render/formFiles.js";
import UserError from "./UserError.js";

/**
 * Refuses a submit whose form carries a file the caller's organization did not
 * upload, before the pre-hook runs and before anything is written.
 *
 * Every form file in the browser's `form` and `form_review` channels must be
 * under the caller's own `{organization_id}/workflows/` (the prefix the app's
 * `upload_files` request mints), or already be in the slot this submit merges
 * into, so resubmitting a form carries its earlier files over. Without this, a
 * member could store any key they know in form_data and have
 * `download-form-file` sign it. A pre-hook's `form_overrides` is app server
 * code and is not checked.
 *
 * The slot is found as planFormDataMerge finds it: `form_data[type]`, or
 * `form_data[type][current_key]` for a keyed action.
 *
 * @param {Object} args
 * @param {Object} args.params — submit params; reads `form`, `form_review`,
 *   `current_key`.
 * @param {import('../../shared/phases/types.js').LoadedState} args.loadedState
 * @param {Object} [args.user] — the session user; reads `organization_id`.
 * @throws {UserError} naming the field, when a file is refused.
 */
function checkSubmittedFormFiles({ params, loadedState, user }) {
  const typeSlot =
    loadedState.workflow.form_data?.[loadedState.targetAction.type];
  const storedSlot = params.current_key
    ? isPlainObject(typeSlot)
      ? typeSlot[params.current_key]
      : undefined
    : typeSlot;
  const storedKeys = new Set(
    listFormFiles(storedSlot).map(({ file }) => file.key),
  );

  for (const channel of ["form", "form_review"]) {
    for (const { file, path } of listFormFiles(params[channel])) {
      if (isOwnFormFileKey(file.key, user?.organization_id)) continue;
      if (storedKeys.has(file.key)) continue;
      throw new UserError(
        `The file in ${fieldName(channel, path)} was not uploaded for this organization, so it can't be saved. Remove it and upload it again.`,
        { isReject: true },
      );
    }
  }
}

// The field a file belongs to: its path without the trailing `file` or
// `fileList.<n>` the upload value wraps it in.
function fieldName(channel, path) {
  const segments = [channel, ...path];
  const last = segments.length - 1;
  if (segments[last] === "file") return segments.slice(0, last).join(".");
  if (typeof segments[last] === "number" && segments[last - 1] === "fileList") {
    return segments.slice(0, last - 1).join(".");
  }
  return segments.join(".");
}

export default checkSubmittedFormFiles;
