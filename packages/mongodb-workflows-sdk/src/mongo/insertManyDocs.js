/**
 * Wraps the native driver `insertMany`. Used for change-log entries (design
 * D7/D9; not notifications — those dispatch via callbacks.sendNotification,
 * D9 step 4). Returns the driver result.
 *
 * No-ops (returns an acknowledged empty result) on an empty `docs` array —
 * `insertMany` throws on an empty array, and an empty change-log batch is a
 * normal commit outcome.
 */
async function insertManyDocs({ mongoDb, collection, docs, session }) {
  if (!docs || docs.length === 0) {
    return { acknowledged: true, insertedCount: 0, insertedIds: {} };
  }
  return mongoDb.collection(collection).insertMany(docs, { session });
}

export default insertManyDocs;
