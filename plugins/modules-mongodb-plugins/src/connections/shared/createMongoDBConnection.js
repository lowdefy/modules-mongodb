import { MongoDBCollection } from '@lowdefy/community-plugin-mongodb/connections';

/**
 * Build a per-collection dispatcher over `@lowdefy/community-plugin-mongodb`'s
 * `MongoDBCollection.requests`. Callers receive a function that takes a
 * MongoDB collection name and returns the full set of community-plugin
 * request handlers bound to that collection.
 *
 * Connection pooling, change-log writes, and serialization are owned by the
 * community plugin — engine helpers call e.g.
 * `mongoDBConnection('actions').MongoDBFindOne({ query, options })` without
 * worrying about client lifecycle.
 *
 * The Lowdefy request handler context (`{ blockId, connection, connectionId,
 * pageId, requestId }`) is captured at call time so each delegated request
 * carries it through unchanged.
 *
 * @param {{
 *   blockId: string,
 *   connection: {
 *     databaseUri: string,
 *     changeLog?: object,
 *     options?: object,
 *     [key: string]: any,
 *   },
 *   connectionId: string,
 *   pageId: string,
 *   requestId: string,
 * }} lowdefyContext
 * @returns {(collection: string) => Record<string, (properties: object) => Promise<any>>}
 */
function createMongoDBConnection({
  blockId,
  connection,
  connectionId,
  pageId,
  requestId,
}) {
  const { changeLog, databaseUri, options } = connection;
  const mongoConnection = { changeLog, databaseUri, options };
  const { requests } = MongoDBCollection;
  return (collection) => {
    const mongoRequests = {};
    Object.keys(requests).forEach((requestKey) => {
      mongoRequests[requestKey] = (properties) =>
        requests[requestKey]({
          blockId,
          connection: { ...mongoConnection, collection },
          connectionId,
          pageId,
          request: properties,
          requestId,
        });
    });
    return mongoRequests;
  };
}

export default createMongoDBConnection;
