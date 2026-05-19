/**
 * Bulk-fetch every action doc for a workflow via the community-plugin
 * `MongoDBFind` request. Read posture: no projection (engine spec lets
 * callers consume whatever fields they need).
 *
 * @param {(collection: string) => { MongoDBFind: (req: object) => Promise<any[]> }} mongoDBConnection
 *   The dispatcher returned by `createMongoDBConnection(lowdefyContext)`.
 * @param {string} workflowId
 * @returns {Promise<import('./types.js').ActionDoc[]>}
 */
async function getActions(mongoDBConnection, workflowId) {
  return mongoDBConnection('actions').MongoDBFind({
    query: { workflow_id: workflowId },
  });
}

export default getActions;
