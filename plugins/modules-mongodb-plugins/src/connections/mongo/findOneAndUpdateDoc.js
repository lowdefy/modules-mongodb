import { scopeQuery, stampUpdate } from "./tenantScope.js";

/**
 * Wraps the native driver `findOneAndUpdate` with `returnDocument: "after"`.
 *
 * Returns the post-write document, or `null` when the filter matches zero docs.
 * The `null` return is the compare-and-swap miss signal the commit phase (task
 * 13) relies on: a CAS filter that pins `updated.timestamp` returns `null` when
 * a concurrent write moved the doc, which the engine turns into a retryable
 * `ConcurrentSubmitError`. See design D15.
 *
 * `tenant` is the framework tenant verdict `{ field, value }` (or null): when
 * set, the filter is `$and`-merged with the tenant clause so an update can
 * never claim another org's doc (tenant-wall contract). A cross-org target
 * surfaces as the same `null` miss. The update itself pins the tenant field
 * (`stampUpdate`), so a `$set` can't move the doc out of the org. No upsert semantics here — `upsert` is
 * never passed, so a scoped miss can't spawn a doc.
 */
async function findOneAndUpdateDoc({
  mongoDb,
  collection,
  filter,
  update,
  session,
  tenant = null,
}) {
  const result = await mongoDb
    .collection(collection)
    .findOneAndUpdate(scopeQuery(filter, tenant), stampUpdate(update, tenant), {
      returnDocument: "after",
      session,
    });
  // driver v6 returns the document (or null) directly when
  // includeResultMetadata is false (the default).
  return result ?? null;
}

export default findOneAndUpdateDoc;
