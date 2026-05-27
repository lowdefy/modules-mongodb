import UserError from "./UserError.js";

// Canonical enum lives in modules/workflows/resolvers/makeWorkflowsConfig.js
// (build-time validator's `ACTION_STATUSES`). Mirrored here for runtime checks
// because the plugin and the workflows module sit in separate workspace
// packages with no shared dep; cross-package import would not survive the
// plugin's swc `src → dist` build. If the canonical enum changes, update both.
const ACTION_STATUSES = [
  "not-required",
  "error",
  "changes-required",
  "done",
  "in-review",
  "in-progress",
  "action-required",
  "blocked",
];

/**
 * Resolve the target status for the user-submitted action across two layers
 * (last wins): engine default per interaction, then the pre-hook return's
 * top-level `status` scalar. Throws `UserError(isReject: false)` when the
 * pre-hook returns a status that is not a member of `ACTION_STATUSES`.
 *
 * The resolved value is the *intent* for the per-entry write loop in
 * handleSubmit step 4; the priority rule still applies on top at write time
 * (see Part 6 § Priority rule).
 *
 * The submit_edit task branch requires `params.current_status` and throws
 * when it's missing. This validation fires before Part 9's pre-hook
 * invocation, so a pre-hook cannot rescue the missing input.
 *
 * @param {object} args
 * @param {string} args.interaction
 *   One of submit_edit | not_required | resolve_error | approve | request_changes.
 * @param {object} args.actionConfig - workflow.actions[i] config (has `kind`, `access`).
 * @param {object} args.params - handler params bag; only `current_status` is read.
 * @param {string} [args.preHookStatus] - top-level `status` from pre-hook return.
 * @returns {string} resolved target stage.
 */
function resolveTargetStatus({
  interaction,
  actionConfig,
  params,
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

  if (preHookStatus !== undefined && !ACTION_STATUSES.includes(preHookStatus)) {
    throw new UserError(
      `SubmitWorkflowAction: pre-hook for action "${actionConfig.type}" returned status "${preHookStatus}", which is not a valid action status.`,
      { isReject: false },
    );
  }

  return preHookStatus ?? engineDefault;
}

export default resolveTargetStatus;
