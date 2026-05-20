/**
 * Derive the entity-ref key used on log-event `references` blocks.
 *
 * Convention: `references.<entity>_ids` — matches the events module timeline's
 * `$<reference_field>` projection in modules/events/components/events-timeline.yaml.
 *
 * Rule:
 *   - Strip a trailing `-collection` if present.
 *   - Replace remaining `-` with `_`.
 *   - Append `_ids`.
 *
 * Examples:
 *   leads-collection → leads_ids
 *   tickets-collection → tickets_ids
 *   user-contacts → user_contacts_ids
 *   contacts → contacts_ids
 *
 * @param {string} entityCollection
 * @returns {string}
 */
function deriveEntityRefKey(entityCollection) {
  if (typeof entityCollection !== "string" || entityCollection.length === 0) {
    throw new Error("deriveEntityRefKey: entityCollection is required");
  }
  const stripped = entityCollection.endsWith("-collection")
    ? entityCollection.slice(0, -"-collection".length)
    : entityCollection;
  return `${stripped.replace(/-/g, "_")}_ids`;
}

export default deriveEntityRefKey;
