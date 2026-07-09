import planActionTransition from "../../shared/phases/planners/planActionTransition.js";
import planWorkflowRecompute from "../../shared/phases/planners/planWorkflowRecompute.js";
import planEventDispatch from "../../shared/phases/planners/planEventDispatch.js";
import planChangeLog from "../../shared/phases/planners/planChangeLog.js";
import commitPlan from "../../shared/phases/commitPlan.js";
import runTrackerCascade from "../../shared/phases/runTrackerCascade.js";
import throwIfDispatchFailed from "../../shared/phases/throwIfDispatchFailed.js";

// Fields that may NOT be overwritten by payload.references — they are engine-
// owned on the workflow doc (carried over from the prior handlers).
const RESERVED_WORKFLOW_KEYS = [
  "_id",
  "workflow_id",
  "type",
  "workflow_type",
  "entity",
  "status",
  "form_data",
  "created",
  "updated",
];

const TERMINAL_STAGES = ["done", "not-required"];

/**
 * Shared plan → commit → tracker-cascade tail for the two lifecycle
 * terminations (CancelWorkflow / CloseWorkflow). Both handlers do exactly this
 * after their own load + preconditions; only the declared deltas differ:
 *
 *   - `shouldSweep(action, stage)` — which NON-terminal actions are swept to
 *     `not-required` via the FSM signal `internal_cancel_action`. Terminal
 *     actions (`done` / `not-required`) are always preserved; survivors stay
 *     at their stage.
 *   - `lifecycleStage` — the stage pushed onto workflow.status
 *     (`cancelled` / `completed`) via `lifecyclePush` (skip-entirely:
 *     auto-complete can't fire a phantom `completed`).
 *   - `signal` — the lifecycle event signal (`cancelled` / `closed`).
 *   - `trackerSignal` — the parent-tracker mirror fired iff the workflow was
 *     started as a tracker child (`internal_mirror_child_cancelled` /
 *     `internal_mirror_child_completed`).
 *
 * Lifecycle override context: { user, workflow, signal } only — no action,
 * status_after, or submitted_form; see planEventDispatch.js.
 *
 * @param {Object} context — engine context; `context.loadedState` must already
 *   be set (commitPlan's CAS anchor).
 * @param {{
 *   handlerName: string,
 *   signal: string,
 *   lifecycleStage: string,
 *   trackerSignal: string,
 *   shouldSweep?: (action: object, stage: string | undefined) => boolean,
 * }} opts
 * @returns {Promise<{ action_ids: string[], event_id: string, tracker_fired: Array }>}
 */
async function terminateWorkflow(
  context,
  { handlerName, signal, lifecycleStage, trackerSignal, shouldSweep },
) {
  const { params, event_id, now, newId, user, connection, loadedState } =
    context;
  const entry_id = connection.entry_id;
  const { workflow, actions, workflowConfig } = loadedState;
  const actionsConfig = workflowConfig.actions ?? [];

  // ── Plan: sweep actions to not-required (terminal actions always preserved) ─
  const sweepEntries = [];
  for (const action of actions) {
    const stage = action.status?.[0]?.stage;
    if (TERMINAL_STAGES.includes(stage)) continue; // preserve done / not-required
    if (shouldSweep && !shouldSweep(action, stage)) continue; // survivor stays at its stage
    const actionConfig = actionsConfig.find((c) => c.type === action.type);
    const planned = planActionTransition({
      action,
      signal: "internal_cancel_action",
      source: "cascade",
      actionConfig,
      loadedWorkflow: workflow,
      entry_id,
      event_id,
      now,
      newId,
    });
    if (planned == null) continue; // FSM no-op (structural safety)
    sweepEntries.push(planned);
  }

  // Build the planned view: swept docs substituted in by _id.
  const sweptById = new Map(
    sweepEntries.map((e) => [String(e.doc._id), e.doc]),
  );
  const plannedActions = actions.map((a) => sweptById.get(String(a._id)) ?? a);

  // ── Plan: workflow recompute with the lifecycle entry ────────────────────
  const recomputed = planWorkflowRecompute({
    loadedState,
    plannedActions,
    lifecyclePush: { stage: lifecycleStage, reason: params.reason },
    event_id,
    now,
  });

  // payload.references merge (minus reserved keys), applied at plan time so
  // the whole-doc $set carries it.
  const safeReferences = { ...(params.references ?? {}) };
  for (const key of RESERVED_WORKFLOW_KEYS) {
    delete safeReferences[key];
  }
  const plannedWorkflowDoc = { ...recomputed, ...safeReferences };

  // ── Plan: the lifecycle event ────────────────────────────────────────────
  const event = planEventDispatch({
    event_id,
    user,
    handlerType: handlerName,
    signal,
    plannedWorkflowDoc,
    allTouchedActionDocs: sweepEntries.map((e) => e.doc),
    connection,
    yamlEventOverrides: params.lifecycle_event_override,
  });

  // ── Plan: change-log ─────────────────────────────────────────────────────
  const planWorkflow = {
    doc: plannedWorkflowDoc,
    operation: "update",
    changeLog: { before: workflow, after: plannedWorkflowDoc },
  };
  const changeLog = planChangeLog({
    planActions: sweepEntries,
    planWorkflow,
    connection,
    audit: context.audit,
    timestamp: now?.timestamp,
  });

  // ── Plan: tracker fire (parent tracker mirror), iff started as a child ───
  const trackerFires =
    workflow.parent_action_id != null
      ? [
          {
            parentWorkflowId: workflow.parent_workflow_id,
            parentActionId: workflow.parent_action_id,
            signal: trackerSignal,
          },
        ]
      : [];

  const plan = {
    workflow: planWorkflow,
    actions: sweepEntries,
    event,
    changeLog,
    trackerFires,
    completedGroups: [],
  };

  // ── Commit (CAS-gated update) ────────────────────────────────────────────
  const commitResult = await commitPlan(context, plan);

  // ── Tracker cascade ──────────────────────────────────────────────────────
  const cascade = await runTrackerCascade(plan.trackerFires, context);

  // ── Surface post-commit dispatch failures, last (D9/D13) ─────────────────
  throwIfDispatchFailed({ handlerName, commitResult, cascade });

  return {
    action_ids: commitResult.action_ids,
    event_id,
    tracker_fired: cascade.fires,
  };
}

export default terminateWorkflow;
