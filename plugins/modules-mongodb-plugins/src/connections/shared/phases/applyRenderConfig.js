/**
 * Part 48 render-config seam (shared). Splices the endpoint-delivered render
 * slice (`status_map` + `event_overrides`) onto every action config of one
 * workflow, in place.
 *
 * Since Part 48 task 10 the build blob (`makeWorkflowsConfig`) no longer
 * carries `status_map`/`event_overrides` — they ride each write endpoint's
 * `render_config` property and arrive per-request on `context.params`. Every
 * handler that resolves a `workflowConfig` and then renders status_map /
 * event-display MUST apply this merge first, or seeded/planned docs are
 * written with no `<slug>.message`. The submit path merges via
 * `loadWorkflowState`; `StartWorkflow` (no load phase) calls this directly —
 * one helper so the splice is identical at both sites ("one correct way").
 *
 * Contract (matches `loadWorkflowState`'s docstring):
 *   - **Missing-key contract:** an absent `renderConfig`, absent
 *     `[workflowType]`, or absent `[action_type]` key is legal and never
 *     throws — downstream rendering falls through to sticky-`status_map` /
 *     default event display.
 *   - **Idempotent in-place merge:** mutates the passed `workflowConfig`
 *     instance (no clone). Safe because `context.workflowsConfig` is freshly
 *     operator-evaluated per connection call (never shared across requests);
 *     idempotent because the slice is constant for the invocation.
 *
 * @param {Object} args
 * @param {Object} args.workflowConfig — the resolved workflowsConfig entry to
 *   splice onto (mutated in place).
 * @param {Object} [args.renderConfig] — `context.params.render_config`: the
 *   `workflow_type → action_type → { status_map?, event_overrides? }` bundle.
 * @param {string} args.workflowType — the workflow type whose slice to apply.
 */
function applyRenderConfig({ workflowConfig, renderConfig, workflowType }) {
  const renderSlice = renderConfig?.[workflowType];
  if (!renderSlice) return;
  for (const actionCfg of workflowConfig.actions ?? []) {
    const slice = renderSlice[actionCfg.type];
    if (!slice) continue;
    if ('status_map' in slice) actionCfg.status_map = slice.status_map;
    if ('event_overrides' in slice) actionCfg.event_overrides = slice.event_overrides;
  }
}

export default applyRenderConfig;
