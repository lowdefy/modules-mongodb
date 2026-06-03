import findOneAndUpdateDoc from '../../mongo/findOneAndUpdateDoc.js';
import insertOneDoc from '../../mongo/insertOneDoc.js';
import bulkWriteActions from '../../mongo/bulkWriteActions.js';
import insertManyDocs from '../../mongo/insertManyDocs.js';
import dispatchNotifications from '../../WorkflowAPI/SubmitWorkflowAction/dispatchNotifications.js';
import { ConcurrentSubmitError } from '../errors.js';

/**
 * Build the bulkWrite operations array from the plan's actions array.
 * Each action carries `operation: 'insert' | 'update'` and the full post-commit
 * doc. The driver's bulkWrite contract:
 *   - insert → `{ insertOne: { document: doc } }`
 *   - update → `{ updateOne: { filter: { _id }, update: { $set: doc } } }`
 *     (whole-doc $set minus _id is written; including _id in $set is harmless
 *     but the filter already identifies the doc, so we spread the full doc —
 *     Q1 note: revisit only if write size becomes an issue).
 *
 * @param {import('./types.js').Plan['actions']} actions
 * @returns {Array<object>} — bulkWrite operations
 */
function buildActionOperations(actions) {
  return actions.map(({ doc, operation }) => {
    if (operation === 'insert') {
      return { insertOne: { document: doc } };
    }
    // operation === 'update'
    return {
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: doc },
      },
    };
  });
}

/**
 * Steps 1–2: claim the workflow (CAS or insert) then bulk-write all actions.
 * This is the shared body for both the transaction path and the standalone
 * ordered-writes path. On the transaction path it runs inside
 * `session.withTransaction()`; on the standalone path it runs without a
 * session.
 *
 * CAS detail (D15): for `operation: 'update'` we pin the scalar timestamp
 * (`"updated.timestamp"`), NOT the whole `updated` sub-document, so
 * order/shape changes on other fields in `updated` don't cause spurious
 * misses. The planned workflow doc carries a fresh per-invocation stamp (set
 * by task 11), so every commit advances the stored timestamp — the concurrent-
 * submit test depends on this.
 *
 * Throws `ConcurrentSubmitError` when the CAS filter matches zero docs (null
 * return from `findOneAndUpdateDoc`). This MUST happen before any action write
 * so the invariant "no action write is durable until the workflow claim
 * succeeds" (D9) is maintained.
 *
 * @param {Object} context
 * @param {import('./types.js').Plan} plan
 * @param {import('mongodb').ClientSession | undefined} session
 */
async function commitWorkflowAndActions(context, plan, session) {
  const workflowsCollection = context.connection?.workflowsCollection ?? 'workflows';
  const actionsCollection = context.connection?.actionsCollection ?? 'actions';

  const { doc: plannedWorkflowDoc, operation } = plan.workflow;

  // Step 1 — claim the workflow (workflow-first ordering, D9).
  if (operation === 'insert') {
    // StartWorkflow: no CAS filter — a freshly minted _id can't race.
    await insertOneDoc({
      mongoDb: context.mongoDb,
      collection: workflowsCollection,
      doc: plannedWorkflowDoc,
      session,
    });
  } else {
    // update (Submit/Cancel/Close/tracker): CAS-gated findOneAndUpdate.
    // Pin only the scalar timestamp, not the whole `updated` sub-doc (D15).
    const claimed = await findOneAndUpdateDoc({
      mongoDb: context.mongoDb,
      collection: workflowsCollection,
      filter: {
        _id: plannedWorkflowDoc._id,
        'updated.timestamp': context.loadedState.workflow.updated.timestamp,
      },
      update: { $set: plannedWorkflowDoc },
      session,
    });
    if (claimed === null) {
      // Concurrent write moved the workflow between load and commit.
      throw new ConcurrentSubmitError(
        `commitPlan: workflow ${plannedWorkflowDoc._id} was concurrently modified — the CAS filter on updated.timestamp missed. Retry the invocation.`,
      );
    }
  }

  // Step 2 — bulk-write all actions (after workflow claim succeeds, D9).
  const actionOperations = buildActionOperations(plan.actions);
  await bulkWriteActions({
    mongoDb: context.mongoDb,
    collection: actionsCollection,
    operations: actionOperations,
    session,
  });
}

/**
 * Step 3 — dispatch the per-invocation event via callApi.
 * Shipped contract (callRequestResolver.js): `callApi({ endpointId, payload })`
 * throws on failure (error classes pass through) and resolves the target's
 * `:return` value. The endpoint id is the build-resolved opaque string from
 * `connection.endpoints.new_event` — the engine never constructs prefixes.
 *
 * Returns the `event_id` string on success; a `callApi` throw propagates so
 * the caller records the failure on `dispatchErrors` and skips step 4.
 *
 * @param {Object} context
 * @param {import('./types.js').Plan} plan
 * @returns {Promise<string>} event_id
 */
async function dispatchEvent(context, plan) {
  const eventDoc = plan.event.doc;
  await context.callApi({
    endpointId: context.connection.endpoints.new_event,
    payload: eventDoc,
  });
  return String(eventDoc._id);
}

/**
 * Step 5 — insert all change-log entries into the configured collection.
 * Skipped entirely when `plan.changeLog` is empty (the unconfigured case) to
 * avoid hitting `insertManyDocs` with an undefined collection name.
 *
 * @param {Object} context
 * @param {import('./types.js').Plan} plan
 */
async function writeChangeLog(context, plan) {
  if (!plan.changeLog || plan.changeLog.length === 0) {
    return;
  }
  await insertManyDocs({
    mongoDb: context.mongoDb,
    collection: context.connection.changeLog.collection,
    docs: plan.changeLog,
  });
}

/**
 * Compose the `CommitResult` from the committed plan.
 *
 * @param {import('./types.js').Plan} plan
 * @param {string | null} event_id — the dispatched event_id, or null on step-3 failure.
 * @param {Array<{ step: number, error: Error }>} dispatchErrors
 * @returns {import('./types.js').CommitResult}
 */
function buildCommitResult(plan, event_id, dispatchErrors) {
  return {
    workflow_id: plan.workflow.doc._id,
    action_ids: plan.actions.map((a) => a.doc._id),
    event_id,
    dispatchErrors,
  };
}

/**
 * Commit phase entry point (design D9/D11/D15).
 *
 * Writes the Plan and nothing else — no reads, no renders, no logic that
 * wasn't in the plan.
 *
 * Write ordering (D9):
 *   1. Workflow  — CAS-gated findOneAndUpdate (update) or insertOne (insert/Start).
 *      A null return (CAS miss) → throws ConcurrentSubmitError BEFORE any action
 *      write. On replica set, steps 1–2 run inside one transaction.
 *   2. Actions   — bulkWrite all plan.actions (insert + update ops).
 *   3. Event     — callApi(endpoints.new_event) with plan.event.doc.
 *   4. Notifications — dispatchNotifications keyed on the step-3 event_id.
 *      Skipped when step 3 recorded a failure.
 *   5. Change-log — insertMany plan.changeLog into the changeLog collection.
 *      Skipped when plan.changeLog is empty; always runs even on step-3/4
 *      failure (the change-log audits the step-1/2 writes, which did commit).
 *
 * Failure policy:
 *   Steps 1–2 throw — atomicity gate; nothing downstream runs on a miss.
 *   Steps 3–5 never throw out of commitPlan — each is caught individually and
 *   recorded as `{ step, error }` on CommitResult.dispatchErrors[]. By step 3
 *   the workflow + actions are durably committed; propagating a throw would
 *   strand plan.trackerFires and skip the post-hook. The handler (task 15)
 *   throws WorkflowEngineError with code: "post_commit_dispatch_failed" when
 *   dispatchErrors is non-empty.
 *
 * Context contract (set up at handler entry, task 15):
 *   context.mongoDb           — Db from getMongoDb
 *   context.mongoClient       — MongoClient from getMongoDb (transaction path only)
 *   context.useTransactions   — topology flag from getMongoDb
 *   context.connection        — raw connection config (collection names, changeLog,
 *                               app_name, endpoints.{new_event,send_notification})
 *   context.loadedState       — LoadedState from load phase; .workflow.updated.timestamp
 *                               is the CAS anchor (D15)
 *   context.callApi           — Lowdefy callApi (community client, not engine session)
 *   context.user              — authenticated user
 *
 * @param {Object} context
 * @param {import('./types.js').Plan} plan
 * @returns {Promise<import('./types.js').CommitResult>}
 */
async function commitPlan(context, plan) {
  // ── Steps 1–2: atomic workflow claim + action bulk-write ─────────────────
  // On a replica set, these run inside one transaction (steps 3–5 must NOT be
  // inside the callback — withTransaction re-runs its callback on transient
  // errors, and a retried step 3/4/5 would double-fire events/notifications/
  // change-log whose writes are on other clients and won't be rolled back).
  if (context.useTransactions) {
    const session = context.mongoClient.startSession();
    try {
      await session.withTransaction(() =>
        commitWorkflowAndActions(context, plan, session),
      );
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone ordered-writes fallback (D11). CAS gate still applies.
    await commitWorkflowAndActions(context, plan);
  }

  // ── Steps 3–5: post-commit dispatch — once, both paths, never inside the
  //    driver's retry loop. Each step is caught individually; failures are
  //    recorded on dispatchErrors rather than propagated.
  const dispatchErrors = [];
  let event_id = null;

  // Step 3 — event dispatch.
  try {
    event_id = await dispatchEvent(context, plan);
  } catch (error) {
    dispatchErrors.push({ step: 3, error });
  }

  // Step 4 — notifications (skipped when step 3 failed — no committed event_id).
  if (event_id !== null) {
    try {
      await dispatchNotifications(context, event_id);
    } catch (error) {
      dispatchErrors.push({ step: 4, error });
    }
  }

  // Step 5 — change-log (always runs; audits the step-1/2 writes that committed).
  try {
    await writeChangeLog(context, plan);
  } catch (error) {
    dispatchErrors.push({ step: 5, error });
  }

  return buildCommitResult(plan, event_id, dispatchErrors);
}

export default commitPlan;
export { ConcurrentSubmitError, commitWorkflowAndActions, buildActionOperations };
