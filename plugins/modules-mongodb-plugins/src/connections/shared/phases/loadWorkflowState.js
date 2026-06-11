import findDocs from '../../mongo/findDocs.js';
import { WorkflowEngineError } from '../errors.js';

/**
 * The required verb for each user signal (Part 34 D6 / design D16). This
 * resolves the verb the access gate authorizes against — a separate concern
 * from `hasReview`, which resolves the landing stage.
 */
const SIGNAL_VERBS = {
  submit: 'edit',
  progress: 'edit',
  not_required: 'edit',
  resolve_error: 'error',
  approve: 'review',
  request_changes: 'review',
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
 *     the workflow id from it), runs the stage check + access gate, and
 *     returns `actionConfig` + `targetAction`.
 *   - Start/Cancel/Close/tracker: pass `{ workflowId }` — loads the whole
 *     workflow; no target action, no stage check (lifecycle preconditions
 *     live in the lifecycle handlers, task 17), no access gate.
 *
 * Context contract: `context.mongoDb` (the `Db` from `mongo/getMongoDb.js`,
 * set up at handler entry), `context.connection` (`app_name`, collection
 * names), `context.workflowsConfig`, `context.user`.
 *
 * All throws are `WorkflowEngineError`s discriminated by `code` (design D13):
 * `workflow_not_found` / `action_not_found` / `stage_rejects_submit` /
 * `access_denied` / `unknown_signal`.
 *
 * @param {Object} context
 * @param {{ workflowId?: string, actionId?: string, signal?: string }} args
 * @returns {Promise<import('./types.js').LoadedState>} — note the loaded
 *   `workflow.updated.timestamp` is the CAS anchor the commit phase pins
 *   (design D15).
 */
async function loadWorkflowState(context, { workflowId, actionId, signal }) {
  const { mongoDb, connection } = context;
  const workflowsCollection = connection?.workflowsCollection ?? 'workflows';
  const actionsCollection = connection?.actionsCollection ?? 'actions';
  const isSubmit = actionId !== undefined && actionId !== null;

  // Submit identifies the workflow through the target action.
  if (isSubmit) {
    const [targetActionDoc] = await findDocs({
      mongoDb,
      collection: actionsCollection,
      query: { _id: actionId },
    });
    if (!targetActionDoc) {
      throw new WorkflowEngineError(
        `loadWorkflowState: action ${actionId} not found`,
        { code: 'action_not_found' },
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
      { code: 'workflow_not_found' },
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
      { code: 'workflow_not_found' },
    );
  }

  if (!isSubmit) {
    return { workflow, actions, workflowConfig };
  }

  // The same object instance as its `actions[]` entry, so planners that walk
  // the list and the handler's target handle observe one doc.
  const targetAction = actions.find((a) => String(a._id) === String(actionId));
  if (!targetAction) {
    throw new WorkflowEngineError(
      `loadWorkflowState: action ${actionId} not found on workflow ${workflowId}`,
      { code: 'action_not_found' },
    );
  }

  const actionConfig = (workflowConfig.actions ?? []).find(
    (cfg) => cfg.type === targetAction.type,
  );
  if (!actionConfig) {
    throw new WorkflowEngineError(
      `loadWorkflowState: action type "${targetAction.type}" not in workflow "${workflow.workflow_type}" config`,
      { code: 'action_not_found' },
    );
  }

  // Submit-specific stage check: a completed/cancelled workflow rejects the
  // submit unless the action is a post-close required action. Lifecycle
  // preconditions (e.g. Close's completed→no-op / cancelled→throw) live in
  // the task-17 handlers, not here.
  const workflowStage = workflow.status?.[0]?.stage;
  if (
    (workflowStage === 'completed' || workflowStage === 'cancelled') &&
    actionConfig.required_after_close !== true
  ) {
    throw new WorkflowEngineError(
      `loadWorkflowState: workflow ${workflow._id} is ${workflowStage}; action type "${targetAction.type}" does not have required_after_close: true`,
      { code: 'stage_rejects_submit' },
    );
  }

  // Per-verb access gate (design D16 / Part 34 D6). A signal outside the user
  // vocabulary has no verb to authorize — surface it as the unknown-signal
  // error (D13 (1)), not a misleading access denial.
  const verb = SIGNAL_VERBS[signal];
  if (verb === undefined) {
    throw new WorkflowEngineError(
      `loadWorkflowState: unknown signal "${signal}"`,
      { code: 'unknown_signal' },
    );
  }
  const currentApp = connection?.app_name;
  const gate = actionConfig.access?.[currentApp]?.[verb];
  const userRoles = context.user?.apps?.[currentApp]?.roles ?? [];
  if (!gateAllows(gate, userRoles)) {
    throw new WorkflowEngineError(
      `loadWorkflowState: access denied — signal "${signal}" requires the "${verb}" verb on access.${currentApp} for action type "${targetAction.type}"`,
      { code: 'access_denied' },
    );
  }

  // `not_required` load-gate (Part 46 D5): the signal is opt-in per action via
  // the root `allow_not_required` flag (every kind, default false). The FSM
  // permits `not_required` from many stages, so without this gate a
  // hand-crafted submission could mark any action not required even though
  // the button is hidden (`resolveButtons` ANDs the same flag).
  if (signal === 'not_required' && actionConfig.allow_not_required !== true) {
    throw new WorkflowEngineError(
      `loadWorkflowState: access denied — signal "not_required" requires allow_not_required: true on action type "${targetAction.type}"`,
      { code: 'access_denied' },
    );
  }

  return { workflow, actions, workflowConfig, actionConfig, targetAction };
}

export default loadWorkflowState;
