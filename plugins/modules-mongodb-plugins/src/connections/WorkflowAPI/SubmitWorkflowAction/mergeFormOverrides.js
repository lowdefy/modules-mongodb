/**
 * Merge form payload fields from three sources at the field-path level:
 *
 *   form (user submit) → form_review (user review) → preHookOverrides (pre-hook)
 *
 * Last write wins per field. The handler constructs the dotted
 * `form_data.{type}[.{key}].{field}` prefix at the call site; this function
 * stays prefix-free so the call site can apply the prefix once.
 *
 * @param {object} args
 * @param {object} [args.form]
 * @param {object} [args.formReview]
 * @param {object} [args.preHookOverrides]
 * @returns {object} flat { field: value } bag for `$set`.
 */
function mergeFormOverrides({ form, formReview, preHookOverrides }) {
  return {
    ...(form ?? {}),
    ...(formReview ?? {}),
    ...(preHookOverrides ?? {}),
  };
}

export default mergeFormOverrides;
