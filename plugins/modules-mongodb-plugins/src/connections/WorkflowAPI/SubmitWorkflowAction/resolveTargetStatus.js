/**
 * Resolve the engine-default target status for the user-submitted action,
 * then apply Part 9's two override layers (last wins):
 *
 *   1. Engine default per interaction (this file).
 *   2. Action YAML `interactions[interaction].status` — baked into the
 *      endpoint payload by makeWorkflowApis (Part 13) and surfaced here as
 *      `yamlInteractions[interaction].status`.
 *   3. Pre-hook return `status` — the top-level scalar `preHookStatus`.
 *
 * The resolved value is the *intent* for the per-entry write loop in
 * handleSubmit step 4; the priority rule still applies on top at write time
 * (see Part 6 § Priority rule).
 *
 * The submit_edit task branch requires `params.current_status` and throws
 * when it's missing. This validation fires before Part 9's pre-hook
 * invocation, so a pre-hook cannot rescue the missing input — see
 * designs/workflows-module/parts/09-hook-invocation/design.md § three-layer
 * status notes ("Required inputs are validated before the pre-hook fires.").
 *
 * @param {object} args
 * @param {string} args.interaction
 *   One of submit_edit | not_required | resolve_error | approve | request_changes.
 * @param {object} args.actionConfig - workflow.actions[i] config (has `kind`, `access`).
 * @param {object} args.params - handler params bag; only `current_status` is read.
 * @param {object} [args.yamlInteractions]
 *   Baked-in YAML `interactions:` map, shape `{ [interaction]: { status } }`.
 * @param {string} [args.preHookStatus] - top-level `status` from pre-hook return.
 * @returns {string} resolved target stage.
 */
function resolveTargetStatus({
  interaction,
  actionConfig,
  params,
  yamlInteractions,
  preHookStatus,
}) {
  const hasReviewVerb = Object.values(actionConfig.access ?? {})
    .filter((v) => Array.isArray(v))
    .some((verbs) => verbs.includes("review"));

  let engineDefault;
  switch (interaction) {
    case "submit_edit":
      if (actionConfig.kind === "task") {
        if (typeof params.current_status !== "string") {
          throw new Error(
            "SubmitWorkflowAction: task submit_edit requires caller-supplied current_status",
          );
        }
        engineDefault = params.current_status;
      } else {
        engineDefault = hasReviewVerb ? "in-review" : "done";
      }
      break;
    case "not_required":
      engineDefault = "not-required";
      break;
    case "resolve_error":
      engineDefault = hasReviewVerb ? "in-review" : "done";
      break;
    case "approve":
      engineDefault = "done";
      break;
    case "request_changes":
      engineDefault = "changes-required";
      break;
    default:
      throw new Error(
        `SubmitWorkflowAction: unknown interaction "${interaction}"`,
      );
  }

  const yamlOverride = yamlInteractions?.[interaction]?.status;
  return preHookStatus ?? yamlOverride ?? engineDefault;
}

export default resolveTargetStatus;
