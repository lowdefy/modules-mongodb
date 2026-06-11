import findDocs from '../../mongo/findDocs.js';
import { WorkflowEngineError } from '../errors.js';

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
  submit: ['edit'],
  progress: ['edit'],
  not_required: ['edit'],
  resolve_error: ['error'],
  approve: ['review'],
  request_changes: ['view', 'edit', 'review'],
};

/**
 * `(gate, userRoles) → bool` role-gate semantics (Part 34). Must agree with
 * the query-time aggregation (`visible_verbs_filter.yaml`) and the client
 * component (`action_role_check`) — the three runtimes can't share code, so
 * each is tested against the shared `gates.fixtures.js` oracle.
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
  const verbs = SIGNAL_VERBS[signal];
  if (verbs === undefined) {
    throw new WorkflowEngineError(
      `loadWorkflowState: unknown signal "${signal}"`,
      { code: 'unknown_signal' },
    );
  }
  const currentApp = connection?.app_name;
  const userRoles = context.user?.apps?.[currentApp]?.roles ?? [];
  const allowed = verbs.some((verb) =>
    gateAllows(actionConfig.access?.[currentApp]?.[verb], userRoles),
  );
  if (!allowed) {
    throw new WorkflowEngineError(
      `loadWorkflowState: access denied — signal "${signal}" requires one of the ${verbs.map((verb) => `"${verb}"`).join('/')} verbs on access.${currentApp} for action type "${targetAction.type}"`,
      { code: 'access_denied' },
    );
  }

  return { workflow, actions, workflowConfig, actionConfig, targetAction };
}

export default loadWorkflowState;
