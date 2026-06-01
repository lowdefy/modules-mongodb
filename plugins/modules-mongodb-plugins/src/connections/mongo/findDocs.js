/**
 * Wraps the native driver `find().toArray()`. Used by the load phase to read
 * the workflow + its actions (design D8).
 */
async function findDocs({ mongoDb, collection, query = {}, options, session }) {
  return mongoDb
    .collection(collection)
    .find(query, { ...options, session })
    .toArray();
}

export default findDocs;
