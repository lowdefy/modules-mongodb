import { MongoClient } from 'mongodb';

/**
 * Engine-owned MongoClient layer.
 *
 * The community plugin (`shared/createMongoDBConnection.js`) exposes neither its
 * `MongoClient` nor its `Db`, and opens a fresh client per request — there is
 * nothing to extract or reuse. The engine therefore constructs and owns its own
 * pooled client, caching it at module scope keyed by `databaseUri` so it is
 * reused across handler invocations. A persistent pooled client is required for
 * transactions anyway (a session is bound to its client) and avoids a cold-start
 * connection storm in Lambda. See design D8/D11.
 */

const clientCache = new Map();

function detectUseTransactions(helloResult) {
  // Replica set carries `setName`; a mongos router answers `hello` with
  // `msg: "isdbgrid"`. Either supports multi-document transactions.
  return Boolean(helloResult?.setName) || helloResult?.msg === 'isdbgrid';
}

async function connect(connection, logger) {
  const { databaseUri, databaseName, options } = connection;
  const mongoClient = new MongoClient(databaseUri, options);
  await mongoClient.connect();
  const mongoDb = mongoClient.db(databaseName);

  const helloResult = await mongoDb.admin().command({ hello: 1 });
  let useTransactions = detectUseTransactions(helloResult);
  // Allow an operator to force the standalone ordered-writes path explicitly.
  if (connection.useTransactions === false) {
    useTransactions = false;
  }

  // Never silent — an operator debugging consistency must know which commit
  // path is live (D11).
  logger.log(
    `[workflow-engine] Mongo commit mode: ${
      useTransactions
        ? 'transactional (replica set / mongos detected)'
        : 'standalone ordered-writes (transactions unavailable)'
    }`,
  );

  return { mongoClient, mongoDb, useTransactions };
}

/**
 * Returns `{ mongoClient, mongoDb, useTransactions }` for the connection's
 * `databaseUri`, constructing and caching the client on first use. Subsequent
 * calls with the same `databaseUri` return the same connected client.
 */
async function getMongoDb(connection, { logger = console } = {}) {
  const { databaseUri } = connection ?? {};
  if (!databaseUri) {
    throw new Error('getMongoDb: connection.databaseUri is required');
  }
  if (!clientCache.has(databaseUri)) {
    const pending = connect(connection, logger).catch((error) => {
      // Don't cache a rejected connection — let the next call retry.
      clientCache.delete(databaseUri);
      throw error;
    });
    clientCache.set(databaseUri, pending);
  }
  return clientCache.get(databaseUri);
}

/**
 * Test-only: close every cached client and clear the cache. Production never
 * closes the pooled client (it is intentionally persistent).
 */
export async function clearMongoClientCache() {
  const entries = [...clientCache.values()];
  clientCache.clear();
  await Promise.all(
    entries.map(async (pending) => {
      try {
        const { mongoClient } = await pending;
        await mongoClient.close();
      } catch {
        // ignore — connection never established
      }
    }),
  );
}

export default getMongoDb;
