import { scopeQuery } from "./tenantScope.js";

/**
 * Wraps the native driver `find().toArray()`. Used by the load phase to read
 * the workflow + its actions (design D8).
 *
 * `tenant` is the framework tenant verdict `{ field, value }` (or null): when
 * set, the query is `$and`-merged with the tenant clause so a read can never
 * see another org's docs (tenant-wall contract).
 */
async function findDocs({
  mongoDb,
  collection,
  query = {},
  options,
  session,
  tenant = null,
}) {
  return mongoDb
    .collection(collection)
    .find(scopeQuery(query, tenant), { ...options, session })
    .toArray();
}

export default findDocs;
