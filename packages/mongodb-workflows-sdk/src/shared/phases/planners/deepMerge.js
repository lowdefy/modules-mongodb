/**
 * The uniform deep-merge rule (design Q6 — resolved), shared by every planner
 * that layers a patch onto loaded state (`planFormDataMerge`'s channel +
 * form_data merges, `planActionTransition`'s rendered-cell spread):
 *
 *   - plain objects deep-merge (nested sibling keys survive);
 *   - arrays, scalars, and `null` replace whole (element-wise merge of
 *     differing-length arrays is garbage);
 *   - keys absent from `patch` keep their `base` value — clearing is explicit
 *     (`field: null`), never by omission. This is also what makes display
 *     sticky: a cell that omits a slug's `message` doesn't clobber the prior
 *     value.
 *
 * Pure: returns fresh containers; mutates neither input (the lodash
 * `mergeWith(cloneDeep(base), patch, customizer)` equivalent, without the
 * dependency).
 */

/**
 * A merge-rule "plain object" — deep-merged rather than replaced whole.
 * Excludes arrays and class instances (Date, ObjectId), which replace whole.
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursive clone of plain objects + arrays; leaves (scalars, Date, ObjectId)
 * copied by reference. Container isolation is all the no-input-mutation
 * guarantee needs.
 */
function cloneContainers(value) {
  if (Array.isArray(value)) return value.map(cloneContainers);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = cloneContainers(entry);
    }
    return out;
  }
  return value;
}

/**
 * Both sides plain objects → recurse per-key; anything else → `patch`
 * replaces whole.
 */
function deepMerge(base, patch) {
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out = cloneContainers(base);
    for (const [key, entry] of Object.entries(patch)) {
      out[key] =
        key in out ? deepMerge(out[key], entry) : cloneContainers(entry);
    }
    return out;
  }
  return cloneContainers(patch);
}

export default deepMerge;
export { cloneContainers, isPlainObject };
