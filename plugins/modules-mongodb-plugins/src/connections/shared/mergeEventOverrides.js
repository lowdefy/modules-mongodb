import deepMerge from "./phases/planners/deepMerge.js";

/**
 * Compose the event_overrides layers on top of the engine-default payload from
 * `planEventDispatch`.
 *
 * Layer ordering (later layers win per field):
 *   1. defaultPayload   — engine default (title template + references + metadata).
 *   2. yamlOverride     — actionConfig.event_overrides[signal], spliced onto
 *                         actionConfig by loadWorkflowState (Part 48).
 *   3. preHookOverride  — pre-hook return `event_overrides`.
 *
 * Merge depth per channel:
 *   - `display` deep-merges under the app key (two levels: `display → {app} →
 *     {title,…}`) via the shared `deepMerge` rule, so an author per-app **title**
 *     override coexists with the engine default title instead of clobbering the
 *     whole app bucket (Part 33 D7).
 *   - `references` / `metadata` merge one level deep — override keys win,
 *     non-overridden keys fall through from the base.
 *   - `type` — last non-empty string wins.
 *
 * `display.{app}.description` is **comment-only** (Part 33 D4): any `description`
 * arriving on a merged app bucket (e.g. from a pre-hook return) is stripped
 * here, so the sole writer of that slot is `foldCommentIntoEvent`, which runs
 * after this merge and after render. Authored descriptions never reach here —
 * the builder rejects them (`makeWorkflowsConfig`).
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
      display:
        override.display === undefined
          ? base.display
          : deepMerge(base.display, override.display),
      references: overlayObject(base.references, override.references),
      metadata: overlayObject(base.metadata, override.metadata),
    };
  };

  const merged = overlay(
    overlay(defaultPayload, yamlOverride),
    preHookOverride,
  );

  // Description is comment-only (D4) — strip any that survived the merge so the
  // post-render comment fold is the sole writer of that slot.
  for (const bucket of Object.values(merged.display ?? {})) {
    if (bucket && typeof bucket === "object" && "description" in bucket) {
      delete bucket.description;
    }
  }

  return merged;
}

export default mergeEventOverrides;
