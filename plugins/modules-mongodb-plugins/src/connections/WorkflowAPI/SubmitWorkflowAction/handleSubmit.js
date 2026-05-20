import getActions from "../../shared/getActions.js";
import recomputeWorkflowAfterActionWrite from "../../shared/recomputeWorkflowAfterActionWrite.js";
import updateAction from "../../shared/updateAction.js";
import computeAutoUnblocks from "./computeAutoUnblocks.js";
import dispatchLogEvent from "./dispatchLogEvent.js";
import dispatchNotifications from "./dispatchNotifications.js";
import fireTrackerSubscription from "./fireTrackerSubscription.js";
import getCurrentAction from "./utils/getCurrentAction.js";

function findMatchingActionDocs({ workflowActions, type, key }) {
  return workflowActions.filter((doc) => {
    if (doc.type !== type) return false;
    if (key === null || key === undefined) {
      return doc.key === null;
    }
    return doc.key === key;
  });
}

/**
 * Resolve the engine-default target status for the user-submitted action.
 * Inlined for v1 (single call site). Part 9 will extract when YAML and
 * pre-hook override layers are introduced.
 */
function resolveTargetStatus({ interaction, actionConfig, params }) {
  const hasReviewVerb = Object.values(actionConfig.access ?? {})
    .filter((v) => Array.isArray(v))
    .some((verbs) => verbs.includes("review"));

  switch (interaction) {
    case "submit_edit":
      if (actionConfig.kind === "task") {
        if (typeof params.current_status !== "string") {
          throw new Error(
            "SubmitWorkflowAction: task submit_edit requires caller-supplied current_status",
          );
        }
        return params.current_status;
      }
      return hasReviewVerb ? "in-review" : "done";
    case "not_required":
      return "not-required";
    case "resolve_error":
      return hasReviewVerb ? "in-review" : "done";
    case "approve":
      return "done";
    case "request_changes":
      return "changes-required";
    default:
      throw new Error(`SubmitWorkflowAction: unknown interaction "${interaction}"`);
  }
}

/**
 * Orchestrate the SubmitWorkflowAction lifecycle.
 *
 * 11 steps per submit-pipeline/spec.md § Flow. Only steps 1, 3, 4, 5, 6 have
 * working bodies in part 6. Steps 2, 7, 8, 9, 10, 11 are no-op stubs with
 * TODO markers pointing at the parts that light them up.
 *
 * @param {Object} context
 * @returns {Promise<{
 *   action_ids: string[],
 *   completed_groups: Array,
 *   event_id: string | null,
 *   tracker_fired: any | null,
 *   pre_hook_response: any | null,
 *   post_hook_response: any | null,
 *   error_transition?: { reason: string, error_message: string, error_metadata: any | null },
 * }>}
 */
async function handleSubmit(context) {
  // Step 1 — Validate + translate per-endpoint payload to internal shape.
  const { params } = context;
  if (typeof params.action_id !== "string" || params.action_id.length === 0) {
    throw new Error("SubmitWorkflowAction: action_id is required");
  }
  if (typeof params.interaction !== "string" || params.interaction.length === 0) {
    throw new Error("SubmitWorkflowAction: interaction is required");
  }

  const action = await getCurrentAction(context, { actionId: params.action_id });
  if (!action) {
    throw new Error(`SubmitWorkflowAction: action ${params.action_id} not found`);
  }

  const workflow = await context
    .mongoDBConnection("workflows")
    .MongoDBFindOne({ query: { _id: action.workflow_id } });
  if (!workflow) {
    throw new Error(`SubmitWorkflowAction: workflow ${action.workflow_id} not found`);
  }

  const workflowConfig = (context.workflowsConfig ?? []).find(
    (w) => w.type === workflow.workflow_type,
  );
  if (!workflowConfig) {
    throw new Error(
      `SubmitWorkflowAction: workflow_type "${workflow.workflow_type}" not in workflowsConfig`,
    );
  }
  context.actionsConfig = workflowConfig.actions ?? [];

  const actionConfig = context.actionsConfig.find((cfg) => cfg.type === action.type);
  if (!actionConfig) {
    throw new Error(
      `SubmitWorkflowAction: action type "${action.type}" not in workflow "${workflow.workflow_type}" config`,
    );
  }

  context.workflow = workflow;
  context.action = action;
  context.actionConfig = actionConfig;

  const accessRoles = actionConfig.access?.roles ?? [];
  const userRoles = context.user?.roles ?? [];
  if (accessRoles.length > 0) {
    const intersects = accessRoles.some((role) => userRoles.includes(role));
    if (!intersects) {
      throw new Error(
        `SubmitWorkflowAction: caller roles do not intersect with action.access.roles for action ${params.action_id}`,
      );
    }
  }

  const workflowStage = workflow.status?.[0]?.stage;
  if (
    (workflowStage === "completed" || workflowStage === "cancelled") &&
    actionConfig.required_after_close !== true
  ) {
    throw new Error(
      `SubmitWorkflowAction: workflow ${workflow._id} is ${workflowStage}; action type "${action.type}" does not have required_after_close: true`,
    );
  }

  const targetStatus = resolveTargetStatus({
    interaction: params.interaction,
    actionConfig,
    params,
  });

  // Capture log-event inputs before step 4 mutates context.workflowActions
  // in-memory. status_before reads from the pre-write stage; status_after is
  // the engine-resolved target. → part 8 dispatchLogEvent.
  const logEventInputBag = {
    interaction: params.interaction,
    current_key: params.current_key ?? null,
    status_before: context.action.status?.[0]?.stage ?? null,
    status_after: targetStatus,
  };

  const internal = {
    currentActionId: action._id,
    actions: [
      {
        type: action.type,
        status: targetStatus,
        keys: params.current_key ? [params.current_key] : undefined,
        fields: params.fields,
      },
    ],
    eventId: context.eventId,
  };

  // Step 2 — Pre-hook. → part 9.

  // Step 3 — Compute auto-unblocks (mixed action types + group ids).
  const workflowActions = await getActions(context.mongoDBConnection, context.workflow._id);
  context.workflowActions = workflowActions;
  const autoUnblockEntries = computeAutoUnblocks({
    workflowActions,
    actionsConfig: context.actionsConfig,
    groups: context.workflow.groups ?? [],
    declaredGroups: workflowConfig.action_groups ?? [],
  });
  // PART 9 EXTENSION: pre-hook returned actions[] entries merge here, taking
  // precedence over auto-unblock entries on (type, key) collision. v1 has no
  // pre-hook entries, so the append-only flow below is sufficient.
  internal.actions.push(...autoUnblockEntries);

  const actionIds = [];
  let completedGroups = [];
  let recomputeResult = null;

  try {
    // Step 4 — Write action transitions (per-entry loop with priority rule).
    for (const entry of internal.actions) {
      const keys = entry.keys ?? [null];
      for (const key of keys) {
        const matchingDocs = findMatchingActionDocs({
          workflowActions: context.workflowActions,
          type: entry.type,
          key,
        });

        if (matchingDocs.length === 0) {
          // PART 9 EXTENSION: pre-hook entries with `upsert: true` land in part 9;
          // the create branch goes here (call `shouldCreate(entry, matchingDocs)`;
          // if true, call `createAction` from `../../shared/createAction.js` and
          // append the new doc's id to actionIds + workflowActions). v1 has no
          // upsert entries — silently skip per `keys: []` semantics.
          continue;
        }

        for (const doc of matchingDocs) {
          let result;
          try {
            result = await updateAction(context, {
              actionId: doc._id,
              newStage: entry.status,
              fields: entry.fields,
              eventId: context.eventId,
              currentActionId: internal.currentActionId,
              force: entry.force === true,
            });
          } catch (err) {
            err.step = err.step ?? "write-action-transitions";
            throw err;
          }

          if (result !== null && result !== undefined) {
            actionIds.push(doc._id);
            // Update the in-memory cache so step 5's summary recompute reads
            // the post-write state without a re-fetch from Mongo.
            doc.status = [
              {
                stage: entry.status,
                event_id: context.eventId,
                created: context.changeStamp,
              },
              ...(doc.status ?? []),
            ];
            doc.updated = context.changeStamp;
          }
        }
      }
    }

    // Always include the user-submitted action id in the returned set, even if
    // its write no-op'd due to priority rule. Matches v0's posture so downstream
    // consumers (parts 16/18) get the submitted id back.
    if (internal.currentActionId && !actionIds.includes(internal.currentActionId)) {
      actionIds.push(internal.currentActionId);
    }

    // Sub-steps 4a/4b/4c + step 5 — extracted to shared helper so the tracker
    // recursion path (part 10) can reuse this work on a *different* workflow
    // without re-entering the public handler.
    recomputeResult = await recomputeWorkflowAfterActionWrite(context, {
      workflowId: context.workflow._id,
    });
    // Refresh in-memory cache so any downstream reads in this handler observe
    // the post-walk action list (the helper reads its own fresh copy).
    context.workflowActions = recomputeResult.workflowActions;

    // Compute completed_groups: groups that transitioned from non-'done' to 'done'.
    const declaredGroups = workflowConfig.action_groups ?? [];
    const beforeById = new Map(
      recomputeResult.groupsBefore.map((g) => [g.id, g]),
    );
    for (const after of recomputeResult.groupsAfter) {
      const before = beforeById.get(after.id);
      if (after.status === "done" && before?.status !== "done") {
        const cfg = declaredGroups.find((g) => g.id === after.id);
        completedGroups.push({
          workflow_id: context.workflow._id,
          id: after.id,
          on_complete: cfg?.on_complete ?? null,
        });
      }
    }

    // Step 6 — Write form_data (merge form + form_review, $set per-field).
    const formMerged = {
      ...(context.params.form ?? {}),
      ...(context.params.form_review ?? {}),
    };
    // PART 9 EXTENSION: part 9's pre-hook `form_overrides` merges on top of
    // formMerged here. Pre-hook overrides win on field collision; skipped
    // entirely when hook_error is set.

    if (Object.keys(formMerged).length > 0) {
      const formDataPathPrefix = context.params.current_key
        ? `form_data.${context.action.type}.${context.params.current_key}`
        : `form_data.${context.action.type}`;

      const setOps = { updated: context.changeStamp };
      for (const [field, value] of Object.entries(formMerged)) {
        setOps[`${formDataPathPrefix}.${field}`] = value;
      }

      try {
        await context.mongoDBConnection("workflows").MongoDBUpdateOne({
          filter: { _id: context.workflow._id },
          update: { $set: setOps },
        });
      } catch (err) {
        err.step = err.step ?? "write-form-data";
        throw err;
      }
    }
  } catch (err) {
    // Force-push the error transition onto the user-submitted action.
    // Per engine/spec.md § Action `error` transition: bypasses priority rule;
    // skips remaining lifecycle work; returns partial.
    const errorTransition = {
      reason: err.step ?? "mid-write",
      error_message: err.message,
      error_metadata: err.metadata ?? null,
    };

    // PART 9: hook_error path takes the same shape but with reason: 'pre-hook'.
    await updateAction(context, {
      actionId: internal.currentActionId,
      newStage: "error",
      fields: {},
      eventId: context.eventId,
      currentActionId: null,
      force: true,
    });

    // Skip steps 7-11 (no-ops in v1; the early return makes it explicit and
    // protects parts 7-11 once they wire bodies in).
    return {
      action_ids: actionIds,
      completed_groups: [],
      event_id: null,
      tracker_fired: null,
      pre_hook_response: null,
      post_hook_response: null,
      error_transition: errorTransition,
    };
  }

  // Step 7 — Generate log event.
  let eventId;
  try {
    eventId = await dispatchLogEvent(context, logEventInputBag);
  } catch (err) {
    err.step = err.step ?? "dispatch-log-event";
    throw err;
  }

  // Step 8 — Dispatch notifications.
  try {
    await dispatchNotifications(context, eventId);
  } catch (err) {
    err.step = err.step ?? "dispatch-notifications";
    throw err;
  }

  // Step 9 — Group on_complete fan-out. → part 11.

  // Step 10 — Tracker subscription.
  let trackerFired = [];
  if (recomputeResult?.shouldPushCompleted) {
    trackerFired = await fireTrackerSubscription(context, {
      workflowId: context.workflow._id,
      newStage: "completed",
      depth: 0,
    });
  }

  // Step 11 — Post-hook. → part 9.

  return {
    action_ids: actionIds,
    completed_groups: completedGroups,
    event_id: eventId,
    tracker_fired: trackerFired,
    pre_hook_response: null,
    post_hook_response: null,
  };
}

export default handleSubmit;
