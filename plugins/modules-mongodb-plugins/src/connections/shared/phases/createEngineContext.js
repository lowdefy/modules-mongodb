import { randomUUID } from "node:crypto";

import getMongoDb from "../../mongo/getMongoDb.js";

/**
 * Shared invocation-setup step (design D7/D8/D11; task 15).
 *
 * Builds the engine context once per handler invocation — the single place
 * that mints the per-invocation id/clock, threads the request-context fields,
 * and opens the engine-owned MongoClient. Submit (task 15) and the lifecycle
 * handlers Start/Cancel/Close (task 17) all compose their context here, so the
 * mint + request-context threading happen identically across handlers ("one
 * correct way").
 *
 * The mint, per design D7:
 *   - `event_id` — `randomUUID()`, GENERATED here. Reused on every action
 *     `status[]` entry the plan writes and as the dispatched event doc's `_id`
 *     (singular end-to-end — one event per invocation).
 *   - `newId`    — `randomUUID`, an id source for insert `_id`s (upsert spawns).
 *   - `now`      — READ, not generated: it is `connection.changeStamp`, the
 *     events-module `change_stamp` component already evaluated per request by
 *     Lowdefy (one stamp per invocation; all writes share it — see
 *     WorkflowAPI/schema.js). Do NOT construct `{ timestamp, user }` here — that
 *     would change the stamped-user shape and bypass the app-configurable stamp.
 *
 * The four request-context fields `{ blockId, connectionId, pageId, requestId }`
 * come off `lowdefyContext` (Lowdefy's `callRequestResolver` passes them to
 * every connection resolver; `undefined` when an invocation has no page/block,
 * matching the community plugin). `planChangeLog` (task 12) stamps them onto
 * every log-changes entry.
 *
 * `tenant` is the framework's resolved tenant verdict `{ field, value }` —
 * present on every resolver call when the connection declares `tenant: true`
 * (the framework rejects org-less callers BEFORE the resolver runs, so a
 * non-null verdict always carries a value); null when the connection has no
 * tenant declaration or the request opted out. The engine threads it into
 * every `mongo/` wrapper call so all reads are org-scoped and all writes are
 * org-stamped (tenant-wall contract).
 *
 * `getMongoDb` is async (first call awaits `connect` + the `hello` topology
 * probe, D11), so the context is built at handler entry — never at module
 * scope.
 *
 * @param {Object} lowdefyContext — the resolver's Lowdefy context: `request`,
 *   `connection`, `callApi`, and the request-context fields. The session user
 *   is read from `connection.user` (wired via `_user: true` on the connection
 *   YAML), not from a top-level `user` key.
 * @returns {Promise<Object>} the engine context consumed by load / pre-hook /
 *   plan / commit / post-hook.
 */
async function createEngineContext(lowdefyContext) {
  const {
    request: params = {},
    connection,
    callApi,
    blockId,
    connectionId,
    pageId,
    requestId,
    tenant = null,
  } = lowdefyContext;

  const user = connection?.user;

  const { mongoDb, mongoClient, useTransactions } =
    await getMongoDb(connection);

  return {
    mongoDb,
    mongoClient,
    useTransactions,
    connection,
    workflowsConfig: connection.workflowsConfig,
    callApi,
    user,
    params,
    // Framework tenant verdict (tenant-wall contract) — threaded into every
    // mongo/ wrapper call by the phases and read methods.
    tenant,
    // Per-invocation mint (design D7).
    event_id: randomUUID(),
    now: connection.changeStamp,
    newId: randomUUID,
    // Request-context fields threaded into planChangeLog (task 12).
    blockId,
    connectionId,
    pageId,
    requestId,
    // The raw lowdefyContext is what planChangeLog reads its fields + payload
    // (`request`) from — pass it through verbatim.
    lowdefyContext,
  };
}

export default createEngineContext;
