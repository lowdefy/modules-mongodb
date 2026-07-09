import buildHookPayload from "./buildHookPayload.js";

/**
 * Post-hook phase wrapper (design D6).
 *
 * Fires AFTER the commit has landed and the tracker cascade is complete.
 * The hook sees fresh post-commit state: `context.workflow` and `context.action`
 * in the payload are the **planned** docs (from `plan.workflow.doc` and the
 * target action's entry in `plan.actions`), not the pre-commit loaded docs.
 *
 * Resolves `params.hooks?.[params.signal]?.post` — signal-keyed. The leaf is
 * a plain async `(payload) => result` function (workflows-sdk-split D2; the
 * Lowdefy adapter wraps each endpointId as such a function). Any level
 * undefined / not a function → return null without invoking anything.
 *
 * No try/catch. Throws propagate — a post-hook failure surfaces after writes
 * have landed (the commit stays); authors must make post-hooks idempotent
 * (design D6). `CommitResult.dispatchErrors` is NOT exposed here; partial
 * dispatch failure surfaces via the handler's `post_commit_dispatch_failed`
 * throw (D13).
 *
 * @param {import('./types.js').LoadedState} loadedState - pre-commit loaded state
 * @param {import('./types.js').Plan} plan - the executed plan (post-commit doc shapes)
 * @param {import('./types.js').CommitResult} commitResult - commit phase output
 * @param {Array<{ parent_action_id: string, parent_workflow_id: string, new_status: string }>} trackerFired - tracker cascade fire list
 * @param {object} params - caller-supplied request params (signal, hooks, …)
 * @param {object} user - the authenticated user
 * @returns {Promise<any>} raw post-hook return value, or null when no post-hook declared.
 */
async function invokePostHook(
  loadedState,
  plan,
  commitResult,
  trackerFired,
  params,
  user,
) {
  const hookFn = params?.hooks?.[params?.signal]?.post;
  if (typeof hookFn !== "function") return null;

  // Find the planned target-action doc from the plan (D6 fresh-state mechanism).
  // The target action is matched by _id against plan.actions entries.
  const targetActionId = String(loadedState.targetAction._id);
  const plannedTargetAction =
    plan.actions.find(({ doc }) => String(doc._id) === targetActionId)?.doc ??
    loadedState.targetAction;

  const result = {
    action_ids: commitResult.action_ids,
    completed_groups: plan.completedGroups ?? [],
    event_id: commitResult.event_id,
    tracker_fired: trackerFired,
  };

  const payload = buildHookPayload({
    params,
    workflow: plan.workflow.doc,
    action: plannedTargetAction,
    user,
    result,
  });

  return hookFn(payload);
}

export default invokePostHook;
