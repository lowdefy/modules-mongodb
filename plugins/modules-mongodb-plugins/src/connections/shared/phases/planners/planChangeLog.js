/**
 * Plan-phase change-log planner (design D7). Transforms the raw per-doc
 * `{ before, after }` deltas accumulated during planning into finished
 * community-plugin-mongodb `log-changes` entries, one per affected doc.
 *
 * The output schema is a verbatim reproduction of `@lowdefy/community-plugin-
 * mongodb@3.0.0`'s per-request log entries — a reader cannot distinguish
 * engine-written from plugin-written entries except by type/content:
 *
 *   Update entry (type: "MongoDBUpdateOne"):
 *     { type, args: { filter: { _id }, update: { $set: <planned doc> } },
 *       before, after, payload, blockId, connectionId, pageId, requestId,
 *       timestamp, meta }
 *     No `response` — the plugin logs none for updates; the engine's bulk
 *     writes return counts only.
 *
 *   Insert entry (type: "MongoDBInsertOne"):
 *     { type, args: { doc: <planned doc> }, response: { acknowledged: true,
 *       insertedId }, payload, blockId, connectionId, pageId, requestId,
 *       timestamp, meta }
 *     No `before`/`after` — the plugin logs none for inserts; the doc is in
 *     `args.doc`. `insertedId` is the plan-time minted `_id`.
 *
 * `payload` and the request-context fields (blockId, connectionId, pageId,
 * requestId) are shared across all entries from one invocation — they come
 * from `lowdefyContext` (Lowdefy's `callRequestResolver` passes them to every
 * connection resolver). When an invocation has no page/block (e.g. a server-
 * side trigger), `pageId`/`blockId` are `undefined` for both plugin and engine.
 *
 * `meta` is a verbatim copy of `connection.changeLog.meta` — the community
 * plugin does no resolution (Lowdefy already evaluated operators like `_user`
 * when building connection properties). No operator evaluation is done here.
 *
 * Opt-out: when `changeLog` is not configured on the connection, produce no
 * entries (same as the community plugin — `logCollection` is falsy).
 *
 * Does NOT log events (the events module's own changeLog logs the new-event
 * write) or notifications.
 *
 * Pure: derives everything from injected inputs; no I/O.
 *
 * @param {Object} args
 * @param {Array<{ doc: Object, operation: 'insert'|'update', changeLog: { before: Object|null, after: Object } }>} args.planActions
 *   — planned action entries (from planActionTransition / planAutoUnblock).
 * @param {{ doc: Object, operation: 'insert'|'update', changeLog: { before: Object|null, after: Object } }} args.planWorkflow
 *   — planned workflow entry (from planWorkflowRecompute).
 * @param {Object} args.connection — engine connection config; reads
 *   `connection.changeLog` (opt-out when absent/falsy).
 * @param {Object} args.lowdefyContext — Lowdefy's request context; reads
 *   `blockId`, `connectionId`, `pageId`, `requestId`, and `request` (payload).
 * @param {Date} args.timestamp — per-invocation timestamp (from `now.timestamp`
 *   or equivalent); written as `timestamp` on every entry to match the plugin
 *   (which uses `new Date()` at write time; here we use the injected stamp for
 *   determinism in tests).
 * @returns {Object[]} — finished community-schema log-changes entries.
 *   Empty when `changeLog` is not configured.
 */
function planChangeLog({
  planActions,
  planWorkflow,
  connection,
  lowdefyContext,
  timestamp,
}) {
  // Opt-out: no changeLog config → no entries.
  if (!connection?.changeLog) {
    return [];
  }

  const meta = connection.changeLog.meta;
  const {
    blockId,
    connectionId,
    pageId,
    requestId,
    request: payload,
  } = lowdefyContext ?? {};

  const sharedFields = {
    payload,
    blockId,
    connectionId,
    pageId,
    requestId,
    timestamp,
    meta,
  };

  const entries = [];

  // Action entries first, then the workflow entry.
  const allPlanEntries = [...(planActions ?? []), planWorkflow].filter(Boolean);

  for (const planEntry of allPlanEntries) {
    const { doc, operation, changeLog } = planEntry;

    if (operation === "insert") {
      entries.push({
        type: "MongoDBInsertOne",
        args: { doc },
        response: { acknowledged: true, insertedId: doc._id },
        ...sharedFields,
      });
    } else {
      // operation === 'update'
      entries.push({
        type: "MongoDBUpdateOne",
        args: {
          filter: { _id: doc._id },
          update: { $set: doc },
        },
        before: changeLog.before,
        after: changeLog.after,
        ...sharedFields,
      });
    }
  }

  return entries;
}

export default planChangeLog;
