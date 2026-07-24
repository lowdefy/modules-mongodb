import { stampDoc } from "./tenantScope.js";

/**
 * Wraps the native driver `insertMany`. Used for change-log entries (design
 * D7/D9; not notifications — those dispatch via callApi("send-notification"),
 * D9 step 4). Returns the driver result.
 *
 * No-ops (returns an acknowledged empty result) on an empty `docs` array —
 * `insertMany` throws on an empty array, and an empty change-log batch is a
 * normal commit outcome.
 *
 * `tenant` is the framework tenant verdict `{ field, value }` (or null): when
 * set, every doc is stamped with the tenant field so batch inserts land inside
 * the org wall (tenant-wall contract).
 */
async function insertManyDocs({
  mongoDb,
  collection,
  docs,
  session,
  tenant = null,
}) {
  if (!docs || docs.length === 0) {
    return { acknowledged: true, insertedCount: 0, insertedIds: {} };
  }
  return mongoDb.collection(collection).insertMany(
    docs.map((doc) => stampDoc(doc, tenant)),
    { session },
  );
}

export default insertManyDocs;
