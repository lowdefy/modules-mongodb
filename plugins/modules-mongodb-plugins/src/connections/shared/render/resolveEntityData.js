/**
 * resolveEntityData — read-time entity-data dispatch (Part 26).
 *
 * The host declares an inline `entity.data` routine on the workflow's `entity:`
 * block; the module generates an engine-only `{type}-entity-data` InternalApi
 * from it (makeWorkflowApis) and carries the resolved endpoint id on
 * `wfConfig.entity.data_endpoint` (makeWorkflowsConfig). The single-workflow read
 * handlers call that endpoint server-side — via the engine's `callApi`, as the
 * same authenticated user, with the same `{ endpointId, payload }` contract the
 * hook/event/notification dispatch already use — to fetch host-shaped entity
 * data: a reserved `name` (the instance display name, lifted onto chrome) plus
 * arbitrary host-owned fields (consumed by the action page's slot /
 * DataDescriptions).
 *
 * Never fails the read. A missing endpoint (no `entity.data` declared), a
 * throwing routine, or a deleted entity all degrade to `null`; failures are
 * logged. The caller falls back to the entity type label for chrome and to a
 * bare `{ id }` for the entity object.
 *
 * @param {object} context - engine context (must carry `callApi`)
 * @param {object} [wfConfig] - the matched workflow config (or undefined)
 * @param {string|null} entityId - the entity instance id (wfDoc/action.entity.id)
 * @returns {Promise<object|null>} the routine result object, or null
 */
async function resolveEntityData(context, wfConfig, entityId) {
  const endpointId = wfConfig?.entity?.data_endpoint;
  if (!endpointId) return null;
  try {
    const data = await context.callApi({
      endpointId,
      payload: { entity_id: entityId },
    });
    return data ?? null;
  } catch (err) {
    console.error(
      `resolveEntityData: entity-data routine failed for endpoint "${endpointId}" (entity_id: ${JSON.stringify(
        entityId,
      )}): ${err?.message ?? err}`,
    );
    return null;
  }
}

export default resolveEntityData;
