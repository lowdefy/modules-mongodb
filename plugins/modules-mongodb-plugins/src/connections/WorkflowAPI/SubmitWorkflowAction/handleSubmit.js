import createAction from "../../shared/createAction.js";
import getActions from "../../shared/getActions.js";
import recomputeWorkflowAfterActionWrite from "../../shared/recomputeWorkflowAfterActionWrite.js";
import updateAction from "../../shared/updateAction.js";
import computeAutoUnblocks from "./computeAutoUnblocks.js";
import dispatchLogEvent, {
  buildDefaultLogEventPayload,
} from "./dispatchLogEvent.js";
import dispatchNotifications from "./dispatchNotifications.js";
import fireTrackerSubscription from "./fireTrackerSubscription.js";
import invokePostHook from "./invokePostHook.js";
import invokePreHook from "./invokePreHook.js";
import mergeEventOverrides from "../../shared/mergeEventOverrides.js";
import mergeFormOverrides from "./mergeFormOverrides.js";
import mergePreHookActions from "./mergePreHookActions.js";
import resolveTargetStatus from "./resolveTargetStatus.js";
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
 * Orchestrate the SubmitWorkflowAction lifecycle.
 *
 * 11 steps per submit-pipeline/spec.md § Flow. Parts 6 + 9 implement steps
 * 1–8 + 10 + 11; step 9 (group on_complete fan-out) lands in part 11.
 *
 * Every step that throws propagates — the handler catches nothing (Part 29
 * § D6 propagate-everywhere). `:reject` (UserError with isReject: true) from
 * a pre-hook propagates transparently as a throw; classification as 'reject'
 * vs 'error' happens at the wrapping per-action endpoint's runRoutine.
 *
 * @param {Object} context
 * @returns {Promise<{
 *   action_ids: string[],
 *   completed_groups: Array,
 *   event_id: string | null,
 *   tracker_fired: any | null,
 *   pre_hook_response: any | null,
 *   post_hook_response: any | null,
 * }>}
 */
async function handleSubmit(context) {
  // Step 1 — Validate + translate per-endpoint payload to internal shape.
  const { params } = context;
  if (typeof params.action_id !== "string" || params.action_id.length === 0) {
    throw new Error("SubmitWorkflowAction: action_id is required");
  }
  if (
    typeof params.interaction !== "string" ||
    params.interaction.length === 0
  ) {
    throw new Error("SubmitWorkflowAction: interaction is required");
  }

  const action = await getCurrentAction(context, {
    actionId: params.action_id,
  });
  if (!action) {
    throw new Error(
      `SubmitWorkflowAction: action ${params.action_id} not found`,
    );
  }

  const workflow = await context
    .mongoDBConnection("workflows")
    .MongoDBFindOne({ query: { _id: action.workflow_id } });
  if (!workflow) {
    throw new Error(
      `SubmitWorkflowAction: workflow ${action.workflow_id} not found`,
    );
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

  const actionConfig = context.actionsConfig.find(
    (cfg) => cfg.type === action.type,
  );
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

  // Resolve target status from engine default. The pre-hook return is grafted
  // in after step 2 below.
  const initialTargetStatus = resolveTargetStatus({
    interaction: params.interaction,
    actionConfig,
    params,
  });

  const logEventInputBag = {
    interaction: params.interaction,
    current_key: params.current_key ?? null,
    status_before: context.action.status?.[0]?.stage ?? null,
    status_after: initialTargetStatus,
    comment: params.comment ?? null,
  };

  const currentActionEntry = {
    type: action.type,
    status: initialTargetStatus,
    keys: params.current_key ? [params.current_key] : undefined,
    fields: params.fields,
  };

  const internal = {
    currentActionId: action._id,
    actions: [currentActionEntry],
    eventId: context.eventId,
  };

  // Step 2 — Pre-hook. Outside the mid-write try/catch so throws (including
  // :reject as UserError with isReject: true) propagate transparently before
  // any writes happen.
  const preHookResponse = await invokePreHook(context);

  // Re-resolve target status now that the pre-hook has had a chance to
  // contribute its `status` return. An invalid status throws here before any
  // writes land (UserError with isReject: false).
  const resolvedTargetStatus = resolveTargetStatus({
    interaction: params.interaction,
    actionConfig,
    params,
    preHookStatus: preHookResponse?.status,
  });
  currentActionEntry.status = resolvedTargetStatus;
  logEventInputBag.status_after = resolvedTargetStatus;

  // Step 3 — Compute auto-unblocks (mixed action types + group ids).
  const workflowActions = await getActions(
    context.mongoDBConnection,
    context.workflow._id,
  );
  context.workflowActions = workflowActions;
  const autoUnblockEntries = computeAutoUnblocks({
    workflowActions,
    actionsConfig: context.actionsConfig,
    groups: context.workflow.groups ?? [],
    declaredGroups: workflowConfig.action_groups ?? [],
  });
  internal.actions = mergePreHookActions({
    currentActionEntry,
    autoUnblockEntries,
    preHookActions: preHookResponse?.actions,
    resolvedStatus: resolvedTargetStatus,
  });

  const actionIds = [];
  let completedGroups = [];
  let recomputeResult = null;

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
        if (entry.upsert === true) {
          const newDoc = createAction(context, {
            workflow: context.workflow,
            action: {
              type: entry.type,
              key,
              status: entry.status,
              fields: entry.fields,
            },
            eventId: context.eventId,
          });
          await context
            .mongoDBConnection("actions")
            .MongoDBInsertOne({ doc: newDoc });
          actionIds.push(newDoc._id);
          context.workflowActions.push(newDoc);
        }
        continue;
      }

      for (const doc of matchingDocs) {
        const result = await updateAction(context, {
          actionId: doc._id,
          newStage: entry.status,
          fields: entry.fields,
          eventId: context.eventId,
          currentActionId: internal.currentActionId,
          force: entry.force === true,
        });

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
  if (
    internal.currentActionId &&
    !actionIds.includes(internal.currentActionId)
  ) {
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

  // Step 6 — Write form_data (merge form + form_review + pre-hook overrides
  // at the field-path level, $set per-field).
  const formMerged = mergeFormOverrides({
    form: context.params.form,
    formReview: context.params.form_review,
    preHookOverrides: preHookResponse?.form_overrides,
  });

  if (Object.keys(formMerged).length > 0) {
    const formDataPathPrefix = context.params.current_key
      ? `form_data.${context.action.type}.${context.params.current_key}`
      : `form_data.${context.action.type}`;

    const setOps = { updated: context.changeStamp };
    for (const [field, value] of Object.entries(formMerged)) {
      setOps[`${formDataPathPrefix}.${field}`] = value;
    }

    await context.mongoDBConnection("workflows").MongoDBUpdateOne({
      filter: { _id: context.workflow._id },
      update: { $set: setOps },
    });
  }

  // Step 7 — Generate log event. Four-layer merge: engine default (incl.
  // runtime comment via buildDefaultLogEventPayload) → YAML override →
  // pre-hook override.
  const defaultEventPayload = buildDefaultLogEventPayload({
    workflow: context.workflow,
    action: context.action,
    actionConfig: context.actionConfig,
    interaction: logEventInputBag.interaction,
    current_key: logEventInputBag.current_key,
    status_before: logEventInputBag.status_before,
    status_after: logEventInputBag.status_after,
    appName: context.connection?.app_name,
    comment: logEventInputBag.comment,
  });
  const mergedEventPayload = mergeEventOverrides({
    defaultPayload: defaultEventPayload,
    yamlOverride: params.event_overrides?.[params.interaction],
    preHookOverride: preHookResponse?.event_overrides,
  });

  const eventId = await dispatchLogEvent(context, mergedEventPayload);

  // Step 8 — Dispatch notifications.
  await dispatchNotifications(context, eventId);

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

  // Step 11 — Post-hook. Throws propagate; writes from steps 4–10 stay
  // (deliberately non-atomic). Authors must make post-hooks idempotent.
  const postHookResponse = await invokePostHook(context, {
    action_ids: actionIds,
    completed_groups: completedGroups,
    event_id: eventId,
    tracker_fired: trackerFired,
  });

  return {
    action_ids: actionIds,
    completed_groups: completedGroups,
    event_id: eventId,
    tracker_fired: trackerFired,
    pre_hook_response: preHookResponse,
    post_hook_response: postHookResponse,
  };
}

export default handleSubmit;
