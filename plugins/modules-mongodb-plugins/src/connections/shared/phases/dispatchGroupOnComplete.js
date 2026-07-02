/**
 * Group `on_complete` dispatch phase.
 *
 * For each action group that flipped to `done` in this submit
 * (`plan.completedGroups`), fire its authored `on_complete` routine — the
 * `{workflow_type}-group-{group_id}-on-complete` InternalApi emitted by
 * `makeWorkflowApis`. The endpoint id arrives pre-scoped on
 * `params.group_on_complete`, keyed by group id (build-resolved
 * `_module.endpointId`) — the same mechanism hooks use via `params.hooks`. Only
 * groups that declare an `on_complete` appear in the map; the rest are skipped.
 *
 * Post-commit: fires after the workflow + actions + event + notifications have
 * committed (the log event is already in the database), matching the lifecycle
 * documented in concepts/hooks.md ("fires after notifications dispatch"). The
 * payload mirrors the post-hook `context` so a routine can reach the committed
 * workflow doc (`context.workflow.entity.id`, etc.).
 *
 * Throws propagate — an `on_complete` failure surfaces after writes have landed
 * (the commit stays), so routines must be idempotent, the same contract as
 * post-hooks. Cancel/close set `completedGroups: []`, so this never fires on a
 * cancelled or closed workflow.
 *
 * @param {import('./types.js').Plan} plan - the executed plan (post-commit shapes)
 * @param {object} params - caller-supplied request params (group_on_complete, …)
 * @param {object} user - the authenticated user
 * @param {Function} callApi - `context.callApi`
 * @returns {Promise<void>}
 */
async function dispatchGroupOnComplete(plan, params, user, callApi) {
  const completed = plan.completedGroups ?? [];
  if (completed.length === 0) return;

  const idMap = params?.group_on_complete ?? {};
  const workflow = plan.workflow?.doc;

  for (const group of completed) {
    const endpointId = idMap[group.id];
    if (!endpointId) continue; // group declares no on_complete routine

    const payload = {
      workflow_id: workflow._id,
      workflow_type: workflow.workflow_type,
      group_id: group.id,
      user: {
        id: user?.id,
        profile: user?.profile,
        roles: user?.roles,
      },
      context: { workflow },
    };

    await callApi({ endpointId, payload });
  }
}

export default dispatchGroupOnComplete;
