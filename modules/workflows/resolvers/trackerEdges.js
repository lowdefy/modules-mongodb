/**
 * Collects all parent→child workflow type edges declared by tracker actions
 * across a set of workflow configs.
 *
 * Each `kind: tracker` action declares `tracker.child_workflow_type`, which
 * names the workflow type the parent tracks. This function walks every workflow
 * in the set and emits one edge per tracker action.
 *
 * Used by:
 *  - makeWorkflowsConfig for acyclicity validation (Task 1, Part 48 D6)
 *  - makeWorkflowApis for ancestor render-config closure (Task 8, Part 48 D6)
 *
 * @param {Array<{ type: string, actions?: Array<{ kind: string, tracker?: { child_workflow_type: string } }> }>} workflows
 * @returns {Array<{ parentType: string, childType: string }>}
 */
function collectTrackerEdges(workflows) {
  const edges = [];
  for (const workflow of workflows) {
    for (const action of workflow.actions ?? []) {
      if (action.kind === "tracker" && action.tracker?.child_workflow_type) {
        edges.push({
          parentType: workflow.type,
          childType: action.tracker.child_workflow_type,
        });
      }
    }
  }
  return edges;
}

export { collectTrackerEdges };
