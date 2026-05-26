import buildHookPayload from "./utils/buildHookPayload.js";

/**
 * Step 11 of the SubmitWorkflowAction lifecycle: invoke the action's
 * post-hook after step 10 (tracker subscription) completes so the hook
 * sees the final post-subscription state via `result.tracker_fired`.
 *
 * Resolves `params.hooks?.[interaction]?.post`; any level undefined → return
 * null without calling callApi.
 *
 * No try/catch. Throws propagate — a post-hook failure surfaces to the
 * caller as a failed submit even though writes (steps 4–10) have landed.
 * Authors must make post-hooks idempotent (Part 29 § D6).
 *
 * @param {object} context
 * @param {{ action_ids: string[], completed_groups: Array, event_id: string|null, tracker_fired?: any }} result
 * @returns {Promise<any | null>} raw post-hook response, or null when no post-hook declared.
 */
async function invokePostHook(context, result) {
  const hookId = context.params?.hooks?.[context.params?.interaction]?.post;
  if (!hookId) return null;

  const payload = buildHookPayload(context, result);
  return context.callApi({ id: hookId, module: "workflows" }, payload, {
    user: context.user,
  });
}

export default invokePostHook;
