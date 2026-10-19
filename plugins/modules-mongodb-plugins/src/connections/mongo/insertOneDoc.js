import { stampDoc } from "./tenantScope.js";

/**
 * Wraps the native driver `insertOne`. Returns the inserted `_id`.
 *
 * `tenant` is the framework tenant verdict `{ field, value }` (or null): when
 * set, the doc is stamped with the tenant field so every insert lands inside
 * the org wall (tenant-wall contract).
 */
async function insertOneDoc({
  mongoDb,
  collection,
  doc,
  session,
  tenant = null,
}) {
  const result = await mongoDb
    .collection(collection)
    .insertOne(stampDoc(doc, tenant), { session });
  return result.insertedId;
}

export default insertOneDoc;
