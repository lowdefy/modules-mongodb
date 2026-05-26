/**
 * Merge the step-1 currentActionEntry, Part 7 auto-unblock entries, and
 * Part 9 pre-hook `actions[]` entries into a single list ready for Part 6's
 * per-entry write loop.
 *
 * The merge owns the engine-internal `{ type, status?, keys, fields?, force?, upsert? }`
 * shape. It normalises:
 *   - Pre-hook entries (spec shape `{ type, key?, status?, fields?, upsert?, force? }`)
 *     → `keys: [key]`, or `[null]` when key omitted/null.
 *   - Auto-unblock entries (keyless `{ type, status: 'action-required' }`)
 *     → `keys: [null]`.
 *   - The step-1 `currentActionEntry` whose `keys: undefined` (non-keyed action)
 *     → `keys: [null]`.
 *
 * After normalisation, every entry is expanded across its `keys` array into
 * `(type, single-key)` write intents. Collisions are evaluated per
 * `(type, key)` pair.
 *
 * Collision rule (replace, not per-field overlay):
 *   - Pre-hook entry collides with an auto-unblock entry → pre-hook replaces.
 *   - Pre-hook entry collides with `currentActionEntry` → pre-hook replaces.
 *     If the replacement omits `status`, graft `resolvedStatus` so the
 *     entry's effective target matches what the top-level pre-hook
 *     `status` channel would have produced. Otherwise pre-hook `status` wins.
 *
 * `currentActionEntry` keeps its first-position slot (when not replaced) so
 * Part 6's loop still produces `actionIds` in the expected order.
 *
 * @param {object} args
 * @param {{ type, status?, keys?, fields?, force? }} args.currentActionEntry
 * @param {Array<{ type, status?, keys?, fields?, force? }>} args.autoUnblockEntries
 * @param {Array<{ type, key?, status?, fields?, upsert?, force? }>|undefined} args.preHookActions
 * @param {string} args.resolvedStatus - three-layer-resolved target stage.
 * @returns {Array<{ type, status?, keys: [string|null], fields?, force?, upsert? }>}
 */
function mergePreHookActions({
  currentActionEntry,
  autoUnblockEntries,
  preHookActions,
  resolvedStatus,
}) {
  const expand = (entry, keys) =>
    keys.map((key) => ({
      ...entry,
      keys: [key],
    }));

  const normaliseAutoUnblock = (entry) => {
    const keys = entry.keys ?? [null];
    const { keys: _ignore, ...rest } = entry;
    return expand(rest, keys);
  };

  const normalisePreHook = (entry) => {
    const { key, ...rest } = entry;
    const keys = "key" in entry ? [key ?? null] : [null];
    return expand(rest, keys);
  };

  const normaliseCurrentActionEntry = (entry) => {
    const keys = entry.keys ?? [null];
    const { keys: _ignore, ...rest } = entry;
    return expand(rest, keys);
  };

  const expandedAutoUnblocks = (autoUnblockEntries ?? []).flatMap(
    normaliseAutoUnblock,
  );
  const expandedPreHook = (preHookActions ?? []).flatMap(normalisePreHook);
  const expandedCurrent = normaliseCurrentActionEntry(currentActionEntry);

  const keyOf = (entry) => `${entry.type}::${entry.keys[0] ?? "<null>"}`;

  const merged = [];
  const indexByKey = new Map();
  const pushOrReplace = (entry) => {
    const k = keyOf(entry);
    if (indexByKey.has(k)) {
      merged[indexByKey.get(k)] = entry;
    } else {
      indexByKey.set(k, merged.length);
      merged.push(entry);
    }
  };

  for (const e of expandedCurrent) pushOrReplace(e);
  for (const e of expandedAutoUnblocks) pushOrReplace(e);
  for (const e of expandedPreHook) {
    const k = keyOf(e);
    const collidesWithCurrent = expandedCurrent.some((cur) => keyOf(cur) === k);
    if (collidesWithCurrent && !("status" in e)) {
      pushOrReplace({ ...e, status: resolvedStatus });
    } else {
      pushOrReplace(e);
    }
  }

  return merged;
}

export default mergePreHookActions;
