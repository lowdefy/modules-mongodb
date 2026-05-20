import getActions from "../../shared/getActions.js";
import updateAction from "../../shared/updateAction.js";
import computeAutoUnblocks from "./computeAutoUnblocks.js";
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

  // Step 3 — Compute auto-unblocks (action-type entries only; group ids → part 7).
  const workflowActions = await getActions(context.mongoDBConnection, context.workflow._id);
  context.workflowActions = workflowActions;
  const autoUnblockEntries = computeAutoUnblocks({
    workflowActions,
    actionsConfig: context.actionsConfig,
  });
  // PART 9 EXTENSION: pre-hook returned actions[] entries merge here, taking
  // precedence over auto-unblock entries on (type, key) collision. v1 has no
  // pre-hook entries, so the append-only flow below is sufficient.
  internal.actions.push(...autoUnblockEntries);

  const actionIds = [];

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

    // Step 5 — Recompute workflow summary (counts only; groups[] → part 7).
    const summary = {
      done: context.workflowActions.filter((doc) => doc.status?.[0]?.stage === "done").length,
      not_required: context.workflowActions.filter(
        (doc) => doc.status?.[0]?.stage === "not-required",
      ).length,
      total: context.workflowActions.length,
    };
    try {
      await context.mongoDBConnection("workflows").MongoDBUpdateOne({
        filter: { _id: context.workflow._id },
        update: {
          $set: {
            summary,
            updated: context.changeStamp,
          },
        },
      });
    } catch (err) {
      err.step = err.step ?? "recompute-summary";
      throw err;
    }
    // PART 7 EXTENSION: part 7 also writes `groups[]` here (per-group
    // `{ id, status, summary }` entries). The same $set call adds `groups`
    // to the $set block alongside `summary`.

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

  // Step 7 — Generate log event. → part 8.

  // Step 8 — Dispatch notifications. → part 8.

  // Step 9 — Group on_complete fan-out. → part 11.

  // Step 10 — Tracker subscription. → part 10.

  // Step 11 — Post-hook. → part 9.

  return {
    action_ids: actionIds,
    completed_groups: [], // PART 7: swap for [{ workflow_id, id, on_complete? }] entries.
    event_id: null,
    tracker_fired: null,
    pre_hook_response: null,
    post_hook_response: null,
  };
}

export default handleSubmit;
