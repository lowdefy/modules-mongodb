/**
 * Wraps the native driver `findOneAndUpdate` with `returnDocument: "after"`.
 *
 * Returns the post-write document, or `null` when the filter matches zero docs.
 * The `null` return is the compare-and-swap miss signal the commit phase (task
 * 13) relies on: a CAS filter that pins `updated.timestamp` returns `null` when
 * a concurrent write moved the doc, which the engine turns into a retryable
 * `ConcurrentSubmitError`. See design D15.
 */
async function findOneAndUpdateDoc({
  mongoDb,
  collection,
  filter,
  update,
  session,
}) {
  const result = await mongoDb
    .collection(collection)
    .findOneAndUpdate(filter, update, { returnDocument: "after", session });
  // driver v6 returns the document (or null) directly when
  // includeResultMetadata is false (the default).
  return result ?? null;
}

export default findOneAndUpdateDoc;
