import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

// Re-exported so consumers of the `./testing` entry can reset the SDK's
// module-scoped pooled-client cache between suites without a deep import.
export { clearMongoClientCache } from "../mongo/getMongoDb.js";

/**
 * Boots a `MongoMemoryServer`, returns `{ uri, mongoClient, db, cleanup }`.
 *
 * Test files call this in `beforeAll`, hand `uri` to the WorkflowAPI
 * connection config (as `databaseUri`), and call `cleanup` in `afterAll`.
 * `mongoClient` + `db` are exposed for tests that seed or assert directly
 * against the underlying Mongo state — independent from the per-request
 * client opened by the community-plugin handlers.
 */
export async function inMemoryMongo() {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri();
  const mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  const db = mongoClient.db();
  return {
    uri,
    mongoClient,
    db,
    cleanup: async () => {
      await mongoClient.close();
      await server.stop();
    },
  };
}

export default inMemoryMongo;
