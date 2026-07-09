/**
 * Wraps the native driver `bulkWrite` against the actions collection.
 *
 * `operations` is an array of `{ updateOne: {...} }` / `{ insertOne: {...} }`
 * entries built from the Plan. Returns acknowledged counts only — it does NOT
 * return per-op post-write docs, because the change-log builder reads
 * before/after from the Plan, not from the write (design D7).
 */
async function bulkWriteActions({ mongoDb, collection, operations, session }) {
  if (!operations || operations.length === 0) {
    return { ok: 1, insertedCount: 0, modifiedCount: 0, matchedCount: 0 };
  }
  return mongoDb.collection(collection).bulkWrite(operations, { session });
}

export default bulkWriteActions;
