/**
 * Build the payload that pre-hook and post-hook routines receive.
 *
 * Shared between invokePreHook.js and invokePostHook.js so the two payloads
 * stay in mechanical sync. Post-hook callers pass `result` to spread the
 * post-write state bag onto the payload; pre-hook callers omit it.
 *
 * Payload contract per
 * designs/workflows-module/parts/09-hook-invocation/design.md
 * § `invokePreHook.js` / § `invokePostHook.js`:
 *
 *   workflow_id, workflow_type, action_id, action_type, current_key, interaction
 *   form, form_review, fields
 *   current_status — pass-through `params.current_status` (simple submit_edit) or null
 *   comment — pass-through `params.comment ?? null`
 *   user: { id, profile, roles }
 *   context: { workflow, action }
 *   [result] — post-hook only: { action_ids, completed_groups, event_id, tracker_fired? }
 *
 * @param {object} context - handler context
 * @param {object|undefined} result - optional post-write state for post-hooks
 * @returns {object}
 */
function buildHookPayload(context, result) {
  const { params, workflow, action, user } = context;

  const payload = {
    workflow_id: workflow._id,
    workflow_type: workflow.workflow_type,
    action_id: action._id,
    action_type: action.type,
    current_key: params.current_key ?? null,
    interaction: params.interaction,
    form: params.form,
    form_review: params.form_review,
    fields: params.fields,
    current_status:
      typeof params.current_status === "string"
        ? params.current_status
        : null,
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
