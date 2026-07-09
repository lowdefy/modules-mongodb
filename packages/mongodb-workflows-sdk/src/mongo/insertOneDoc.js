/**
 * Wraps the native driver `insertOne`. Returns the inserted `_id`.
 */
async function insertOneDoc({ mongoDb, collection, doc, session }) {
  const result = await mongoDb
    .collection(collection)
    .insertOne(doc, { session });
  return result.insertedId;
}

export default insertOneDoc;
