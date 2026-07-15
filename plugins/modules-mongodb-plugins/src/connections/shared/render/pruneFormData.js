/**
 * Prune a workflow's `form_data` to the slices owned by view-visible actions,
 * so form values captured by actions the user cannot see never ship to the
 * client. Shared by every read handler that returns the workflow doc.
 *
 * form_data structure (per planFormDataMerge):
 *   unkeyed action: form_data[type] = { ...values }
 *   keyed action:   form_data[type] = { [key]: { ...values }, [key2]: { ...values } }
 *
 * For unkeyed visible actions → keep form_data[type] whole.
 * For keyed visible actions → keep only the form_data[type][key] slices for
 *   visible keys; rebuild the nested object with just those keys so denied
 *   keyed siblings do not ship.
 *
 * @param {{ formData: object | null | undefined, visibleActions: Array<{ action: object }> }}
 *   `visibleActions` is the annotated output of `selectVisibleActions`.
 * @returns {object} the pruned form_data (empty object when nothing survives).
 */
export default function pruneFormData({ formData, visibleActions }) {
  const rawFormData = formData ?? {};

  // Collect visible keys per type.
  // visibleKeysByType: type → Set<key> | 'unkeyed' sentinel
  const visibleKeysByType = new Map();
  for (const { action } of visibleActions) {
    const type = action.type;
    const key = action.key ?? null;
    if (key == null) {
      // Unkeyed: keep the whole type slice.
      visibleKeysByType.set(type, "unkeyed");
    } else if (visibleKeysByType.get(type) !== "unkeyed") {
      // Keyed: only if no unkeyed instance already claimed the whole slice.
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
      // Unkeyed action: keep the whole form_data[type] value.
      prunedFormData[type] = rawFormData[type];
    } else {
      // Keyed action: rebuild form_data[type] with only visible key slices.
      const typeSlice = rawFormData[type];
      if (
        typeSlice != null &&
        typeof typeSlice === "object" &&
        !Array.isArray(typeSlice)
      ) {
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
    }
  }

  return prunedFormData;
}
