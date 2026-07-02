/**
 * Group `on_complete` dispatch phase.
 *
 * Fires the authored `on_complete` routine for every group that flipped to
 * `done` in this submit — both on the originating workflow AND on any parent
 * workflow reached by tracker propagation (the cascade computes parent-level
 * completions; see runTrackerCascade / planTrackerLevel). Each entry carries the
 * group's `workflow_type`, `id`, and its committed `workflow` doc.
 *
 * The endpoint id is resolved off `idMap` (`params.group_on_complete`), a
 * build-resolved map keyed `workflow_type → group_id → endpoint id` (own
 * workflow + ancestors — makeWorkflowApis bundles ancestor group endpoints so a
 * parent group's `{parent_type}-group-{id}-on-complete` InternalApi resolves
 * here). Only groups that declare an on_complete appear in the map; the rest are
 * skipped. Same build-resolved `_module.endpointId` mechanism hooks use.
 *
 * Post-commit: fires after the workflow + actions + event + notifications and
 * the whole tracker cascade have committed. The payload mirrors the post-hook
 * `context` so a routine can reach the completed group's OWN committed workflow
 * doc (`context.workflow.entity.id`, etc.) — the parent doc for parent-level
 * groups, the originating doc for originating groups.
 *
 * Throws propagate — an `on_complete` failure surfaces after writes have landed
 * (the commits stay), so routines must be idempotent, the same contract as
 * post-hooks. Cancel/close produce no completed groups, so this never fires on a
 * cancelled or closed workflow.
 *
 * @param {Array<{ workflow_type: string, id: string, workflow: object }>} completedGroups
 *   - groups that transitioned to done this submit (originating + cascade),
 *     each paired with its committed workflow doc.
 * @param {object} idMap - `params.group_on_complete`: workflow_type → group_id →
 *   pre-scoped endpoint id.
 * @param {object} user - the authenticated user
 * @param {Function} callApi - `context.callApi`
 * @returns {Promise<void>}
 */
async function dispatchGroupOnComplete(completedGroups, idMap, user, callApi) {
  for (const group of completedGroups ?? []) {
    const endpointId = idMap?.[group.workflow_type]?.[group.id];
    if (!endpointId) continue; // group declares no on_complete routine

    const workflow = group.workflow;
    const payload = {
      workflow_id: workflow?._id,
      workflow_type: group.workflow_type,
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
