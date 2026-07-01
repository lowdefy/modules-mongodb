import findDocs from "../../mongo/findDocs.js";
import { WorkflowEngineError } from "../errors.js";
import applyRenderConfig from "./applyRenderConfig.js";

/**
 * The accepted verbs for each user signal (Part 34 D6 / design D16; arrays
 * since Part 49). The access gate passes when ANY listed verb's gate allows —
 * a separate concern from `hasReview`, which resolves the landing stage.
 *
 * `request_changes` accepts `view` OR `edit` OR `review` (Part 49): `review`
 * gates the reviewer's judgement power (`approve`, review-page access);
 * `request_changes` is "flag a problem, send it back" — anyone who can see or
 * work on the action may raise it. The `edit`/`review` arms cover the
 * lint-warned no-`view` edges, so a caller on their own edit or review page is
 * never rejected.
 */
export const SIGNAL_VERBS = {
  submit: ["edit"],
  progress: ["edit"],
  not_required: ["edit"],
  resolve_error: ["error"],
  approve: ["review"],
  request_changes: ["view", "edit", "review"],
};

/**
 * `(gate, userRoles) → bool` role-gate semantics (Part 34). The single
 * canonical implementation — the read methods consume it via `computeAllowed`
 * (resolveActionAccess.js re-exports it). Tested against the shared
 * `gates.fixtures.js` oracle. (The former YAML/client runtimes —
 * `visible_verbs_filter.yaml`, `action_role_check.yaml` — were deleted in
 * Part 46.)
 *
 *   - `true` gate                  → pass, for ANY user roles (incl. none).
 *   - array gate ∩ user roles ≠ ∅  → pass.
 *   - anything else (absent verb, empty intersection, non-array) → fail closed.
 */
export function gateAllows(gate, userRoles) {
  if (gate === true) return true;
  if (Array.isArray(gate)) {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    return gate.some((role) => roles.includes(role));
  }
  return false;
}

/**
 * Load phase (design D2): performs ALL reads up front, resolves configs, runs
 * invariant checks, and — for Submit — runs the per-verb access gate. After
 * load returns, no further reads happen until the next load (the tracker
 * cascade's next-level load).
 *
 * The access check lives here, AHEAD of the pre-hook, on purpose: an
 * unauthorized submit is rejected before any pre-hook fires, so unauthorized
 * users never trigger pre-hook external side effects. Do not move it after
 * the pre-hook.
 *
 * Modes:
 *   - Submit: pass `{ actionId, signal }` — reads the target action (deriving
 *     the workflow id from it), runs the stage check + per-signal access gate,
 *     and returns `actionConfig` + `targetAction`.
 *   - Fields (Part 24 `UpdateActionFields`): pass `{ actionId, verb }` —
 *     signal-less. Reads the target action / workflow / configs exactly like
 *     Submit, but runs NO stage check (universal fields stay editable on a
 *     completed/cancelled workflow, regardless of `required_after_close`) and
 *     NO `SIGNAL_VERBS` mapping — the required verb is given directly. Gates on
 *     that verb via `gateAllows`. `signal` and `verb` are mutually exclusive
 *     (passing both throws `invalid_load_args`).
 *   - Start/Cancel/Close/tracker: pass `{ workflowId }` — loads the whole
 *     workflow; no target action, no stage check (lifecycle preconditions
 *     live in the lifecycle handlers, task 17), no access gate.
 *
 * Context contract: `context.mongoDb` (the `Db` from `mongo/getMongoDb.js`,
 * set up at handler entry), `context.connection` (`app_name`, collection
 * names), `context.workflowsConfig`, `context.user`.
 *
 * Part 48 render-config seam: after resolving `workflowConfig`, this function
 * splices `context.params?.render_config?.[workflow.workflow_type]` onto every
 * action config in-place. Contract:
 *
 *   - **Missing-key contract:** an absent `render_config`, absent
 *     `[workflow_type]`, or absent `[action_type]` key is legal and never
 *     throws. Downstream reads are optional-chained and fall through to
 *     sticky-`status_map`/default-event-display behavior. This is
 *     load-bearing: a runtime parent chain can outlive a config edge (a
 *     retargeted/removed `child_workflow_type` leaves an existing child
 *     cascading to a parent type absent from `params.render_config`).
 *
 *   - **Idempotent in-place merge:** `loadWorkflowState` returns the
 *     `workflowConfig` instance it `.find`s in `context.workflowsConfig` (no
 *     clone), so the merge mutates that object. Safe because
 *     `context.workflowsConfig` is freshly operator-evaluated per connection
 *     call (never shared across requests); idempotent because CAS retries
 *     re-load the same object while `params.render_config` is constant for
 *     the invocation — re-splicing writes identical values. Do not clone.
 *
 *   - Runs in both modes (submit and `{ workflowId }`), so every cascade
 *     level merges its own workflow's slice. As of Part 48 task 10 the blob no
 *     longer carries `status_map` (dropped from makeWorkflowsConfig's
 *     ACTION_FIELDS), so the spliced slice is the sole runtime source — a
 *     missing slice falls through to sticky-`status_map`/default rendering.
 *
 * All throws are `WorkflowEngineError`s discriminated by `code` (design D13):
 * `workflow_not_found` / `action_not_found` / `stage_rejects_submit` /
 * `access_denied` / `unknown_signal`.
 *
 * @param {Object} context
 * @param {{ workflowId?: string, actionId?: string, signal?: string, verb?: string }} args
 * @returns {Promise<import('./types.js').LoadedState>} — note the loaded
 *   `workflow.updated.timestamp` is the CAS anchor the commit phase pins
 *   (design D15).
 */
async function loadWorkflowState(
  context,
  { workflowId, actionId, signal, verb },
) {
  const { mongoDb, connection } = context;
  const workflowsCollection = connection?.workflowsCollection ?? "workflows";
  const actionsCollection = connection?.actionsCollection ?? "actions";
  // Action-targeted modes: Submit (`signal`) and Fields (`verb`). They share
  // the read path; only the gating differs. `signal`/`verb` are mutually
  // exclusive — a transition and a signal-less operation can't both apply.
  const isActionMode = actionId !== undefined && actionId !== null;
  if (signal != null && verb != null) {
    throw new WorkflowEngineError(
      `loadWorkflowState: signal "${signal}" and verb "${verb}" are mutually exclusive — Submit passes a signal, the signal-less fields operation passes a verb.`,
      { code: "invalid_load_args" },
    );
  }
  const isVerbMode = isActionMode && verb != null;

  // The action-targeted modes identify the workflow through the target action.
  if (isActionMode) {
    const [targetActionDoc] = await findDocs({
      mongoDb,
      collection: actionsCollection,
      query: { _id: actionId },
    });
    if (!targetActionDoc) {
      throw new WorkflowEngineError(
        `loadWorkflowState: action ${actionId} not found`,
        { code: "action_not_found" },
      );
    }
    workflowId = targetActionDoc.workflow_id;
  }

  const [workflow] = await findDocs({
    mongoDb,
    collection: workflowsCollection,
    query: { _id: workflowId },
  });
  if (!workflow) {
    throw new WorkflowEngineError(
      `loadWorkflowState: workflow ${workflowId} not found`,
      { code: "workflow_not_found" },
    );
  }

  const actions = await findDocs({
    mongoDb,
    collection: actionsCollection,
    query: { workflow_id: workflowId },
  });

  const workflowConfig = (context.workflowsConfig ?? []).find(
    (w) => w.type === workflow.workflow_type,
  );
  if (!workflowConfig) {
    throw new WorkflowEngineError(
      `loadWorkflowState: workflow_type "${workflow.workflow_type}" not in workflowsConfig`,
      { code: "workflow_not_found" },
    );
  }

  // Part 48 merge-at-load seam: splice the endpoint-delivered render slice
  // (status_map + event_overrides) onto every action config. A missing
  // render_config / workflow / action key is legal — engine-default rendering.
  applyRenderConfig({
    workflowConfig,
    renderConfig: context.params?.render_config,
    workflowType: workflow.workflow_type,
  });

  if (!isActionMode) {
    return { workflow, actions, workflowConfig };
  }

  // The same object instance as its `actions[]` entry, so planners that walk
  // the list and the handler's target handle observe one doc.
  const targetAction = actions.find((a) => String(a._id) === String(actionId));
  if (!targetAction) {
    throw new WorkflowEngineError(
      `loadWorkflowState: action ${actionId} not found on workflow ${workflowId}`,
      { code: "action_not_found" },
    );
  }

  const actionConfig = (workflowConfig.actions ?? []).find(
    (cfg) => cfg.type === targetAction.type,
  );
  if (!actionConfig) {
    throw new WorkflowEngineError(
      `loadWorkflowState: action type "${targetAction.type}" not in workflow "${workflow.workflow_type}" config`,
      { code: "action_not_found" },
    );
  }

  const currentApp = connection?.app_name;
  const userRoles = context.user?.roles ?? [];

  // ── Fields mode (Part 24 `UpdateActionFields`): signal-less ──────────────
  // No stage check (universal fields are editable in any stage, including on a
  // completed/cancelled workflow — `required_after_close` does not apply) and
  // no SIGNAL_VERBS mapping (the verb is given directly). The gate stays ahead
  // of any handler side effects, preserving the load-gate invariant.
  if (isVerbMode) {
    if (!gateAllows(actionConfig.access?.[currentApp]?.[verb], userRoles)) {
      throw new WorkflowEngineError(
        `loadWorkflowState: access denied — verb "${verb}" is not granted on access.${currentApp} for action type "${targetAction.type}"`,
        { code: "access_denied" },
      );
    }
    return { workflow, actions, workflowConfig, actionConfig, targetAction };
  }

  // ── Submit mode (signal-driven transition) ───────────────────────────────
  // Submit-specific stage check: a completed/cancelled workflow rejects the
  // submit unless the action is a post-close required action. Lifecycle
  // preconditions (e.g. Close's completed→no-op / cancelled→throw) live in
  // the task-17 handlers, not here.
  const workflowStage = workflow.status?.[0]?.stage;
  if (
    (workflowStage === "completed" || workflowStage === "cancelled") &&
    actionConfig.required_after_close !== true
  ) {
    throw new WorkflowEngineError(
      `loadWorkflowState: workflow ${workflow._id} is ${workflowStage}; action type "${targetAction.type}" does not have required_after_close: true`,
      { code: "stage_rejects_submit" },
    );
  }

  // Per-verb access gate (design D16 / Part 34 D6). A signal outside the user
  // vocabulary has no verb to authorize — surface it as the unknown-signal
  // error (D13 (1)), not a misleading access denial.
  const verbs = SIGNAL_VERBS[signal];
  if (verbs === undefined) {
    throw new WorkflowEngineError(
      `loadWorkflowState: unknown signal "${signal}"`,
      { code: "unknown_signal" },
    );
  }
  const allowed = verbs.some((signalVerb) =>
    gateAllows(actionConfig.access?.[currentApp]?.[signalVerb], userRoles),
  );
  if (!allowed) {
    throw new WorkflowEngineError(
      `loadWorkflowState: access denied — signal "${signal}" requires one of the ${verbs.map((signalVerb) => `"${signalVerb}"`).join("/")} verbs on access.${currentApp} for action type "${targetAction.type}"`,
      { code: "access_denied" },
    );
  }

  // `not_required` load-gate (Part 46 D5): the signal is opt-in per action via
  // the root `allow_not_required` flag (every kind, default false). The FSM
  // permits `not_required` from many stages, so without this gate a
  // hand-crafted submission could mark any action not required even though
  // the button is hidden (`resolveButtons` ANDs the same flag).
  if (signal === "not_required" && actionConfig.allow_not_required !== true) {
    throw new WorkflowEngineError(
      `loadWorkflowState: access denied — signal "not_required" requires allow_not_required: true on action type "${targetAction.type}"`,
      { code: "access_denied" },
    );
  }

  return { workflow, actions, workflowConfig, actionConfig, targetAction };
}

export default loadWorkflowState;
