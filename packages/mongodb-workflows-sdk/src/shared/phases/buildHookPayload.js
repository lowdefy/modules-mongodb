/**
 * Build the payload that pre-hook and post-hook routines receive.
 *
 * Shared between invokePreHook.js and invokePostHook.js so the two payloads
 * stay in mechanical sync. Post-hook callers pass `result` to spread the
 * post-write state bag onto the payload; pre-hook callers omit it.
 *
 * Payload contract:
 *
 *   workflow_id, workflow_type, action_id, action_type, current_key, signal
 *   form, form_review, fields
 *   comment — pass-through `params.comment ?? null`
 *   user: { id, profile, roles }
 *   context: { workflow, action }
 *   [result] — post-hook only: { action_ids, completed_groups, event_id, tracker_fired }
 *
 * Changes from the old buildHookPayload (SubmitWorkflowAction/utils/):
 *   - `interaction` renamed to `signal` (populated from `params.signal`)
 *   - `current_status` removed (state-machine.md supersedes the simple-selector path)
 *
 * @param {object} params - caller-supplied request params
 * @param {object} workflow - the workflow doc (pre-commit for pre-hook; planned for post-hook)
 * @param {object} action - the action doc (pre-commit for pre-hook; planned for post-hook)
 * @param {object} user - the authenticated user
 * @param {object|undefined} result - optional post-write state for post-hooks
 * @returns {object}
 */
function buildHookPayload({ params, workflow, action, user, result }) {
  const payload = {
    workflow_id: workflow._id,
    workflow_type: workflow.workflow_type,
    action_id: action._id,
    action_type: action.type,
    current_key: params.current_key ?? null,
    signal: params.signal,
    form: params.form,
    form_review: params.form_review,
    fields: params.fields,
    comment: params.comment ?? null,
    user: {
      id: user?.id,
      profile: user?.profile,
      roles: user?.roles,
    },
    context: { workflow, action },
  };

  if (result !== undefined) {
    payload.result = result;
  }

  return payload;
}

export default buildHookPayload;
