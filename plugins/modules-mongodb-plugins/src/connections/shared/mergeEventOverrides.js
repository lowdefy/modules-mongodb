/**
 * Compose Part 9's four-layer event_overrides merge on top of the default
 * payload from buildDefaultLogEventPayload.
 *
 * Layer ordering:
 *   1+3. defaultPayload (engine default + runtime comment already folded
 *        into metadata.comment by buildDefaultLogEventPayload — Task 9).
 *   2.   yamlOverride — params.event_overrides[interaction], baked by Part 13.
 *   4.   preHookOverride — pre-hook return `event_overrides`.
 *
 * Merge depth: one level deep on `display` / `references` / `metadata`. Within
 * each, override keys win; non-overridden keys fall through from the base.
 * `type` scalar — last non-empty value wins.
 *
 * Do NOT re-inject `comment` here — it's already in layer 1 via Task 9.
 *
 * @param {object} args
 * @param {{ type: string, display: object, references: object, metadata: object }} args.defaultPayload
 * @param {object} [args.yamlOverride]
 * @param {object} [args.preHookOverride]
 * @returns {{ type: string, display: object, references: object, metadata: object }}
 */
function mergeEventOverrides({
  defaultPayload,
  yamlOverride,
  preHookOverride,
}) {
  const overlayObject = (base, override) => {
    if (override === undefined) return base;
    return { ...base, ...override };
  };

  const overlay = (base, override) => {
    if (!override) return base;
    return {
      type:
        typeof override.type === "string" && override.type.length > 0
          ? override.type
          : base.type,
      display: overlayObject(base.display, override.display),
      references: overlayObject(base.references, override.references),
      metadata: overlayObject(base.metadata, override.metadata),
    };
  };

  return overlay(overlay(defaultPayload, yamlOverride), preHookOverride);
}

export default mergeEventOverrides;
