/**
 * Fetch the core fields for one action via the community-plugin
 * `MongoDBFindOne` request — enough to compose a status push or run access
 * checks. Returns null if the action doesn't exist.
 *
 * @param {(collection: string) => { MongoDBFindOne: (req: object) => Promise<any> }} mongoDBConnection
 *   The dispatcher returned by `createMongoDBConnection(lowdefyContext)`.
 * @param {string} actionId
 * @returns {Promise<Pick<
 *   import('./types.js').ActionDoc,
 *   '_id' | 'workflow_id' | 'type' | 'key' | 'kind' | 'status' |
 *   'entity_id' | 'entity_collection'
 * > | null>}
 */
async function getActionFields(mongoDBConnection, actionId) {
  return mongoDBConnection('actions').MongoDBFindOne({
    query: { _id: actionId },
    options: {
      projection: {
        _id: 1,
        workflow_id: 1,
        type: 1,
        key: 1,
        kind: 1,
        status: 1,
        entity_id: 1,
        entity_collection: 1,
      },
    },
  });
}

export default getActionFields;
