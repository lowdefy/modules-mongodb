import mergeDeep, { cloneContainers, isPlainObject } from "./deepMerge.js";

/**
 * Plan the workflow's `form_data` for a submit. Replaces the old
 * `mergeFormOverrides.js` top-level spread + per-field `$set` sidewrite: the
 * commit phase `$set`s the whole planned workflow doc (design D9), so the
 * form_data behaviour is determined entirely by how this planner composes the
 * planned `form_data.{action}` from the loaded base (design Q6 — resolved).
 *
 * One uniform merge rule (the shared `deepMerge` helper) for every channel
 * and for the merge onto the loaded base (no per-channel replace/merge
 * semantics — one correct way):
 *
 *   - plain objects deep-merge (nested sibling keys survive);
 *   - arrays, scalars, and `null` replace whole (element-wise merge of
 *     differing-length arrays is garbage);
 *   - set-only / persists-until-overwritten: clearing is explicit
 *     (`field: null` overwrites via scalar replace); omitting a field leaves
 *     the prior value. No removal-by-omission.
 *
 * Pure: derives everything from `params` + `preHookResult` + `loadedState`;
 * never mutates its inputs — merges happen onto fresh containers, never onto
 * `loadedState.workflow.form_data` itself.
 */

/**
 * @param {Object} args
 * @param {Object} args.params — submit params; reads `form`, `form_review`,
 *   and `current_key` (the keyed-action submit param — not an action-doc
 *   field; equals the loaded target action's `key`).
 * @param {import('../types.js').PreHookResult} [args.preHookResult] — reads
 *   `form_overrides`.
 * @param {import('../types.js').LoadedState} args.loadedState — reads
 *   `workflow.form_data` (the loaded base) and `targetAction.type` (the
 *   form_data namespace).
 * @returns {{ form_data: Object, submitted_form: Object }} — `form_data` is
 *   the whole planned object (threaded into `planWorkflowRecompute`'s
 *   `formData` input by task 15); `submitted_form` is the pre-merged channel
 *   result **before** the merge onto the loaded base, exposed for the event
 *   render context (task 12).
 */
function planFormDataMerge({ params, preHookResult, loadedState }) {
  // Channel order: form → form_review → form_overrides; later channel wins
  // per-key under the same deep rule, so nested sibling keys survive across
  // channels (not the old top-level spread).
  const submitted_form = mergeDeep(
    mergeDeep(params.form ?? {}, params.form_review ?? {}),
    preHookResult?.form_overrides ?? {},
  );

  const type = loadedState.targetAction.type;
  const key = params.current_key;
  const form_data = cloneContainers(loadedState.workflow.form_data ?? {});

  // Nothing submitted on any channel → form_data carries over unchanged
  // (preserves the old handleSubmit empty-merge skip; no empty `{}` namespace
  // is created for the action).
  if (Object.keys(submitted_form).length === 0) {
    return { form_data, submitted_form };
  }

  if (key) {
    // Keyed action: target is form_data[type][key].
    const typeBase = isPlainObject(form_data[type]) ? form_data[type] : {};
    form_data[type] = {
      ...typeBase,
      [key]: mergeDeep(typeBase[key] ?? {}, submitted_form),
    };
  } else {
    // Unkeyed action: target is form_data[type].
    form_data[type] = mergeDeep(form_data[type] ?? {}, submitted_form);
  }

  return { form_data, submitted_form };
}

export default planFormDataMerge;
