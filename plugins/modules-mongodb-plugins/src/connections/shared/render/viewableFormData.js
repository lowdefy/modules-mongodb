/**
 * Which actions a caller may see, and the part of a workflow's form_data that
 * belongs to them. The overview requests and GetWorkflowFormFile share these,
 * so a form file can be downloaded exactly when the overview would show it.
 */

import { computeAllowed } from "./resolveActionAccess.js";

/**
 * The actions the caller holds at least one verb on, each with its allowed bag.
 *
 * @param {{ actions: object[], slug: string, userRoles?: string[] }}
 * @returns {{ action: object, allowed: object }[]}
 */
export function viewableActions({ actions, slug, userRoles }) {
  const viewable = [];
  for (const action of actions ?? []) {
    const allowed = computeAllowed({ access: action.access, slug, userRoles });
    if (allowed.view || allowed.edit || allowed.review || allowed.error) {
      viewable.push({ action, allowed });
    }
  }
  return viewable;
}

/**
 * Keep only the form_data slots of the given actions.
 *
 * form_data is shaped per planFormDataMerge:
 *   unkeyed action: form_data[type] = { ...values }
 *   keyed action:   form_data[type] = { [key]: { ...values }, ... }
 *
 * An unkeyed action keeps form_data[type] whole. Keyed actions keep only their
 * own key slices, so a denied keyed sibling's values never ship.
 *
 * @param {{ formData?: object, actions: object[] }} args — actions are the
 *   viewable action docs
 * @returns {object} the pruned form_data
 */
export function pruneFormData({ formData, actions }) {
  const rawFormData = formData ?? {};

  // type → Set<key> | "unkeyed"
  const visibleKeysByType = new Map();
  for (const action of actions) {
    const type = action.type;
    const key = action.key ?? null;
    if (key == null) {
      visibleKeysByType.set(type, "unkeyed");
    } else if (visibleKeysByType.get(type) !== "unkeyed") {
      if (!visibleKeysByType.has(type)) {
        visibleKeysByType.set(type, new Set());
      }
      visibleKeysByType.get(type).add(key);
    }
  }

  const prunedFormData = {};
  for (const [type, sentinel] of visibleKeysByType) {
    if (!(type in rawFormData)) continue;
    if (sentinel === "unkeyed") {
      prunedFormData[type] = rawFormData[type];
      continue;
    }
    const typeSlice = rawFormData[type];
    if (
      typeSlice == null ||
      typeof typeSlice !== "object" ||
      Array.isArray(typeSlice)
    ) {
      continue;
    }
    const filtered = {};
    for (const k of sentinel) {
      if (k in typeSlice) {
        filtered[k] = typeSlice[k];
      }
    }
    if (Object.keys(filtered).length > 0) {
      prunedFormData[type] = filtered;
    }
  }
  return prunedFormData;
}

/**
 * The first object anywhere in `value` whose `key` equals `fileKey`: a file in
 * a `{ fileList }` upload value, a single `{ file }`, a bare file, or one in a
 * list or a keyed slot at any depth. Null when there is none.
 *
 * @param {unknown} value
 * @param {string} fileKey
 * @returns {object | null}
 */
export function findFileByKey(value, fileKey) {
  if (value == null || typeof value !== "object") return null;
  if (!Array.isArray(value) && value.key === fileKey) return value;
  for (const child of Object.values(value)) {
    const found = findFileByKey(child, fileKey);
    if (found) return found;
  }
  return null;
}
