import { randomUUID } from "node:crypto";

import getMongoDb from "../../mongo/getMongoDb.js";

/**
 * Shared invocation-setup step (design D7/D8/D11; task 15; workflows-sdk-split).
 *
 * Builds the engine context once per method invocation — the single place
 * that mints the per-invocation id/clock, threads the per-call input, and
 * opens the engine-owned MongoClient. Every engine method composes its
 * context here, so the mint + per-call threading happen identically across
 * handlers ("one correct way").
 *
 * The mint, per design D7:
 *   - `event_id` — `randomUUID()`, GENERATED here. Reused on every action
 *     `status[]` entry the plan writes and as the dispatched event doc's `_id`
 *     (singular end-to-end — one event per invocation).
 *   - `newId`    — `randomUUID`, an id source for insert `_id`s (upsert spawns).
 *   - `now`      — READ, not generated: it is the caller's per-call `stamp`
 *     (`{ timestamp, user }` by convention — the shape is app-defined). Do NOT
 *     construct `{ timestamp, user }` here — that would change the stamped-user
 *     shape and bypass the app-configurable stamp.
 *
 * `audit` is an opaque per-call bag of request identifiers
 * (`{ blockId, connectionId, pageId, requestId, payload }` in Lowdefy, or
 * whatever the caller has); `planChangeLog` stamps its fields onto every
 * log-changes entry.
 *
 * `getMongoDb` is async (first call awaits `connect` + the `hello` topology
 * probe, D11), so the context is built at method entry — never at module
 * scope.
 *
 * @param {Object} config — engine instance config (connection-schema
 *   vocabulary: databaseUri, databaseName, options, collection names,
 *   workflowsConfig, app_name, entry_id, changeLog, …) plus `callbacks`
 *   ({ emitEvent, sendNotification?, resolveEntityData? }) and `logger`.
 * @param {Object} [perCall]
 * @param {Object} [perCall.params] — the method's request params.
 * @param {Object} [perCall.user] — the authenticated user.
 * @param {Object} [perCall.stamp] — the per-invocation change stamp (`now`).
 * @param {Object} [perCall.audit] — opaque request-context bag for change-log entries.
 * @returns {Promise<Object>} the engine context consumed by load / pre-hook /
 *   plan / commit / post-hook.
 */
async function createContext(config, { params = {}, user, stamp, audit } = {}) {
  const { mongoDb, mongoClient, useTransactions } = await getMongoDb(config, {
    logger: config.logger ?? console,
  });

  return {
    mongoDb,
    mongoClient,
    useTransactions,
    connection: config,
    workflowsConfig: config.workflowsConfig,
    callbacks: config.callbacks ?? {},
    user,
    params,
    // Per-invocation mint (design D7).
    event_id: randomUUID(),
    now: stamp,
    newId: randomUUID,
    // Opaque request-context bag threaded into planChangeLog (task 12).
    audit: audit ?? {},
  };
}

export default createContext;
