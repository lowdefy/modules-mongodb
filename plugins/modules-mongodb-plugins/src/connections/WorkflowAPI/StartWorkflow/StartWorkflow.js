import createEngineContext from "../../shared/phases/createEngineContext.js";
import applyRenderConfig from "../../shared/phases/applyRenderConfig.js";
import findDocs from "../../mongo/findDocs.js";
import planActionTransition from "../../shared/phases/planners/planActionTransition.js";
import planWorkflowRecompute from "../../shared/phases/planners/planWorkflowRecompute.js";
import planEventDispatch from "../../shared/phases/planners/planEventDispatch.js";
import planChangeLog from "../../shared/phases/planners/planChangeLog.js";
import commitPlan from "../../shared/phases/commitPlan.js";
import runTrackerCascade from "../../shared/phases/runTrackerCascade.js";
import throwIfDispatchFailed from "../../shared/phases/throwIfDispatchFailed.js";
import { WorkflowEngineError } from "../../shared/errors.js";

// The two legal direct-seed statuses (Part 45 review 2 #2). Creation at workflow
// start is not an FSM transition, so the seed grammar is restricted to the two
// non-terminal birth stages. Build validation enforces this for
// `starting_actions` (makeWorkflowsConfig); StartWorkflow enforces it at runtime
// for the `actions:` payload override (build can't see payloads) plus
// defense-in-depth for `starting_actions`.
const LEGAL_SEED_STATUSES = ["action-required", "blocked"];

/**
 * StartWorkflow handler (design D2/D3/D12; task 17).
 *
 * Restructured into the engine's load → plan → commit (→ tracker cascade) shape
 * — same composition as `handleSubmit`, with Start-specific reads and an
 * INSERT workflow plan. No pre-hook in v1.
 *
 * Load — Start has no workflow yet, so it does NOT call `loadWorkflowState`
 * (its `{ workflowId }` mode throws `workflow_not_found`). It performs its own
 * reads: the in-memory config lookup, plus the optional parent-action read by
 * `_id` via `findDocs` when started as a tracker child.
 *
 * Plan — the workflow doc is composed by `planWorkflowRecompute` (the single
 * workflow-doc composition site), and the initial action drafts are seeded
 * directly at their declared stage by `planActionTransition` in `seedStage`
 * mode (creation is not a transition). Event = `workflow-started`
 * (workflow-lifecycle render context). Override templates for lifecycle events
 * render against `{ user, workflow, signal }` only — no `action`,
 * `status_after`, or `submitted_form`; pass via `params.lifecycle_event_override`
 * as a `{ display: { {app}: { title, description? } }, … }` slice.
 *
 * Commit — through `commitPlan` (`Plan.workflow.operation: 'insert'` → no CAS
 * filter). When started as a tracker child, the parent-tracker mirror runs as a
 * cascade level via the `internal_mirror_child_active` fire.
 */
async function StartWorkflow(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  const { params, event_id, now, newId, user, connection, workflowsConfig } =
    context;
  const entry_id = connection.entry_id;

  // ── Config-shaped preconditions (carry over from the prior handler) ──────
  if (!params.workflow_type) {
    throw new WorkflowEngineError("StartWorkflow: workflow_type is required", {
      code: "invalid_params",
    });
  }
  if (!params.entity?.id) {
    throw new WorkflowEngineError("StartWorkflow: entity.id is required", {
      code: "invalid_params",
    });
  }

  const workflowConfig = (workflowsConfig ?? []).find(
    (w) => w.type === params.workflow_type,
  );
  if (!workflowConfig) {
    throw new WorkflowEngineError(
      `StartWorkflow: workflow_type "${params.workflow_type}" not found in workflowsConfig`,
      { code: "unknown_workflow_type" },
    );
  }

  // Part 48 render-config seam: Start has no load phase, so it must apply the
  // endpoint-delivered render slice itself — otherwise the seeded drafts below
  // plan against status_map-less configs and are written with no
  // `<slug>.message` (same splice loadWorkflowState runs for every other path).
  applyRenderConfig({
    workflowConfig,
    renderConfig: params.render_config,
    workflowType: params.workflow_type,
  });

  const actionsConfig = workflowConfig.actions ?? [];
  const findActionConfig = (type) => actionsConfig.find((c) => c.type === type);

  // The seed list: the payload override (`actions:`) takes precedence over the
  // config default (`starting_actions`). Each entry is `{ type, key?, status }`.
  const seedEntries = params.actions ?? workflowConfig.starting_actions ?? [];

  // Keyed-action guard: `starting_actions` may not reference keyed actions
  // (keyed seeds must come via the `actions:` payload, which carries `key`).
  if (!params.actions) {
    for (const entry of seedEntries) {
      const cfg = findActionConfig(entry.type);
      if (cfg && cfg.key !== undefined) {
        throw new WorkflowEngineError(
          `StartWorkflow: starting_actions cannot reference keyed actions (type "${entry.type}"); pass them via the actions: payload instead`,
          { code: "invalid_seed" },
        );
      }
    }
  }

  // Legal-seed rule (runtime). Build validation enforces this for
  // `starting_actions`, but can't see the `actions:` payload override — so the
  // runtime check is what makes the rule real for that path (defense-in-depth
  // covers `starting_actions` too).
  for (const entry of seedEntries) {
    if (!LEGAL_SEED_STATUSES.includes(entry.status)) {
      throw new WorkflowEngineError(
        `StartWorkflow: seed status "${entry.status}" for action type "${entry.type}" is not a legal seed (expected one of: ${LEGAL_SEED_STATUSES.join(", ")}).`,
        { code: "invalid_seed" },
      );
    }
    if (!findActionConfig(entry.type)) {
      throw new WorkflowEngineError(
        `StartWorkflow: seed action type "${entry.type}" is not in workflow "${params.workflow_type}" config.`,
        { code: "unknown_action_type" },
      );
    }
  }

  // ── Load: optional parent action (tracker-child start) ───────────────────
  let parent = null;
  if (params.parent_action_id) {
    const actionsCollection = connection?.actionsCollection ?? "actions";
    [parent] = await findDocs({
      mongoDb: context.mongoDb,
      collection: actionsCollection,
      query: { _id: params.parent_action_id },
    });
    if (!parent) {
      throw new WorkflowEngineError("StartWorkflow: parent action not found", {
        code: "action_not_found",
      });
    }
    if (parent.kind !== "tracker") {
      throw new WorkflowEngineError(
        "StartWorkflow: parent action is not kind: tracker",
        { code: "invalid_seed" },
      );
    }
    if (parent.child_workflow_id != null) {
      throw new WorkflowEngineError(
        "StartWorkflow: parent action is already linked to a child workflow",
        { code: "invalid_seed" },
      );
    }
    if (parent.tracker?.child_workflow_type !== params.workflow_type) {
      throw new WorkflowEngineError(
        "StartWorkflow: workflow_type does not match parent tracker.child_workflow_type",
        { code: "invalid_seed" },
      );
    }
  }

  // ── Plan: the base insert workflow doc (status seeded `active`) ──────────
  // payload.references spreads in first; reserved fields below win. The nested
  // entity pointer (connection_id from config, id from payload, ref_key from
  // config) + parent linkage are set once at Start and never changed.
  const baseWorkflowDoc = {
    ...params.references,
    _id: newId(),
    workflow_type: params.workflow_type,
    // Part 53: persist the resolved workflow title so lifecycle events render
    // `{{ workflow.title }}` (StartWorkflow binds it directly; Cancel/Close
    // inherit it from the loaded doc with no config re-read).
    title: workflowConfig.title,
    key: workflowConfig.key ?? null,
    display_order: workflowConfig.display_order,
    entity: {
      connection_id: workflowConfig.entity.connection_id,
      id: params.entity.id,
      ref_key: workflowConfig.entity.ref_key,
    },
    status: [{ stage: "active", event_id, created: now }],
    form_data: {},
    parent_action_id: parent ? params.parent_action_id : null,
    parent_workflow_id: parent ? parent.workflow_id : null,
    parent_entity: parent
      ? { connection_id: parent.entity.connection_id, id: parent.entity.id }
      : null,
    created: now,
    updated: now,
  };

  // ── Plan: seed the initial action drafts (seedStage mode — not an FSM
  //    transition). Every seed receives params.metadata so the start-payload
  //    bag merges onto each draft's metadata (Part 30 carry-over).
  const seededEntries = seedEntries.map((entry) =>
    planActionTransition({
      seedStage: entry.status,
      payload: { metadata: params.metadata },
      actionConfig: findActionConfig(entry.type),
      loadedWorkflow: baseWorkflowDoc,
      entry_id,
      key: entry.key ?? null,
      event_id,
      now,
      newId,
    }),
  );
  const seededDrafts = seededEntries.map((e) => e.doc);

  // ── Plan: compose the workflow doc via the single composition site. No
  //    lifecyclePush — auto-complete can't fire (legal seeds are non-terminal;
  //    the total > 0 guard covers zero actions). Part 66: summary/groups are no
  //    longer composed or seeded — overview counts derive on read.
  const plannedWorkflowDoc = planWorkflowRecompute({
    loadedState: { workflow: baseWorkflowDoc, workflowConfig },
    plannedActions: seededDrafts,
    event_id,
    now,
  });

  // ── Plan: the lifecycle event (workflow-started) ─────────────────────────
  // Lifecycle override context: { user, workflow, signal } only — no action,
  // status_after, or submitted_form; see planEventDispatch.js:168–175.
  const event = planEventDispatch({
    event_id,
    user,
    handlerType: "StartWorkflow",
    signal: "started",
    plannedWorkflowDoc,
    allTouchedActionDocs: seededDrafts,
    connection,
    yamlEventOverrides: params.lifecycle_event_override,
  });

  // ── Plan: change-log (workflow insert + each seeded action insert) ───────
  const planWorkflow = {
    doc: plannedWorkflowDoc,
    operation: "insert",
    changeLog: { before: null, after: plannedWorkflowDoc },
  };
  const changeLog = planChangeLog({
    planActions: seededEntries,
    planWorkflow,
    connection,
    lowdefyContext: context.lowdefyContext,
    timestamp: now?.timestamp,
  });

  // ── Plan: tracker fire (parent-tracker mirror), iff started as a child ───
  // Composed purely from ids in hand (D3 producer rule). The fire carries the
  // parent↔child link fields as payload.fields, forwarded by planTrackerLevel
  // into planActionTransition's payload.fields onto the parent tracker doc.
  const trackerFires =
    parent != null
      ? [
          {
            parentWorkflowId: parent.workflow_id,
            parentActionId: params.parent_action_id,
            signal: "internal_mirror_child_active",
            payload: {
              fields: {
                child_workflow_id: plannedWorkflowDoc._id,
                child_entity: {
                  connection_id: plannedWorkflowDoc.entity.connection_id,
                  id: plannedWorkflowDoc.entity.id,
                },
              },
            },
          },
        ]
      : [];

  const plan = {
    workflow: planWorkflow,
    actions: seededEntries,
    event,
    changeLog,
    trackerFires,
    completedGroups: [],
  };

  // ── Commit (insert: no CAS filter) ───────────────────────────────────────
  const commitResult = await commitPlan(context, plan);

  // ── Tracker cascade (parent-tracker mirror runs as its own level) ────────
  const cascade = await runTrackerCascade(plan.trackerFires, context);

  // ── Surface post-commit dispatch failures, last (D9/D13) ─────────────────
  throwIfDispatchFailed({
    handlerName: "StartWorkflow",
    commitResult,
    cascade,
  });

  return {
    workflow_id: plannedWorkflowDoc._id,
    action_ids: commitResult.action_ids,
    event_id,
  };
}

StartWorkflow.schema = {};
StartWorkflow.meta = {
  checkRead: false,
  checkWrite: true,
};

export default StartWorkflow;
