/**
 * resolveEntityData — read-time entity-data dispatch (Part 26;
 * workflows-sdk-split D2).
 *
 * The host declares an entity-data routine for a workflow type; the injected
 * `callbacks.resolveEntityData({ workflow_type, entity_id })` callback invokes
 * it (in Lowdefy: the adapter resolves the workflow config's
 * `entity.data_endpoint` and calls the engine-only `{type}-entity-data`
 * InternalApi) to fetch host-shaped entity data: a reserved `name` (the
 * instance display name, lifted onto chrome) plus arbitrary host-owned fields
 * (consumed by the action page's slot / DataDescriptions).
 *
 * Never fails the read. A missing callback, a throwing routine, or a deleted
 * entity all degrade to `null`; failures are logged. The caller falls back to
 * the entity type label for chrome and to a bare `{ id }` for the entity
 * object.
 *
 * @param {object} context - engine context (reads `callbacks`)
 * @param {object} [wfConfig] - the matched workflow config (or undefined)
 * @param {string|null} entityId - the entity instance id (wfDoc/action.entity.id)
 * @returns {Promise<object|null>} the routine result object, or null
 */
async function resolveEntityData(context, wfConfig, entityId) {
  const resolve = context.callbacks?.resolveEntityData;
  if (typeof resolve !== "function") return null;
  try {
    const data = await resolve({
      workflow_type: wfConfig?.type ?? null,
      entity_id: entityId,
    });
    return data ?? null;
  } catch (err) {
    console.error(
      `resolveEntityData: entity-data routine failed for workflow_type "${
        wfConfig?.type
      }" (entity_id: ${JSON.stringify(entityId)}): ${err?.message ?? err}`,
    );
    return null;
  }
}

export default resolveEntityData;
