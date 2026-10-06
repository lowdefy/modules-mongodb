/**
 * The page link to a workflow's entity, from the workflow config's `entity:`
 * block: `{ pageId, urlQuery?, pathParams? }`. The entity id goes in the query
 * string under `id_query_key` and in the path under `id_path_key`, for each of
 * the two the config sets (the config resolver defaults `id_query_key` to
 * `_id` when `id_path_key` is not set).
 *
 * @param {object} entityConfig - the workflow config's materialized `entity` block
 * @param {string} entityId - the entity instance id
 * @returns {{ pageId: string, urlQuery?: object, pathParams?: object }}
 */
function entityPageLink(entityConfig, entityId) {
  const link = { pageId: entityConfig.page_id };
  if (entityConfig.id_query_key != null) {
    link.urlQuery = { [entityConfig.id_query_key]: entityId };
  }
  if (entityConfig.id_path_key != null) {
    link.pathParams = { [entityConfig.id_path_key]: entityId };
  }
  return link;
}

export default entityPageLink;
