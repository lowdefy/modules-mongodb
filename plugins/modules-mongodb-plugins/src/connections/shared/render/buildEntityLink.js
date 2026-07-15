/**
 * Build the `entity_link` chrome object from a workflow config's `entity`
 * block — the back-navigation link every workflow read surface returns.
 * Returns null when the workflow type has no config or no `entity` block.
 *
 * The base shape is `{ pageId, urlQuery, title }`. Optional slices, opted into
 * per surface (the response shapes are contractual — see each handler's tests):
 *   - `name` — the instance name lifted off the host's entity.data routine
 *     (Part 26). Included whenever the caller passes the option (null is a
 *     legal value: "routine declared none").
 *   - `listCrumb: true` — the optional entity-list breadcrumb crumb
 *     (`list_page_id` / `list_title`, Part 63). Runtime-driven overview pages
 *     can't bake these like the action page does, so they ride the response
 *     and the runtime fragment gates on `list_page_id`.
 *
 * @param {{ entityConfig: object | null | undefined, entityId: any, name?: any, listCrumb?: boolean }}
 * @returns {object | null}
 */
export default function buildEntityLink({
  entityConfig,
  entityId,
  name,
  listCrumb = false,
}) {
  if (!entityConfig) return null;
  const link = {
    pageId: entityConfig.page_id,
    urlQuery: { [entityConfig.id_query_key]: entityId },
    title: entityConfig.title ?? null,
  };
  if (name !== undefined) {
    link.name = name;
  }
  if (listCrumb) {
    link.list_page_id = entityConfig.list_page_id ?? null;
    link.list_title = entityConfig.list_title ?? null;
  }
  return link;
}
