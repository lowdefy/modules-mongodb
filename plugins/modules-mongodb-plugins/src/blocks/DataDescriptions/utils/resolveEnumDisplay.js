import { type } from "@lowdefy/helpers";

// Resolve a stored selector value against the field's enum map, so a read-only
// surface can show the entry's `title` (with its colour and icon) instead of the
// slug. Only enums resolve: an `options` array keeps the previous behaviour of
// formatting the raw value.
//
// Returns null when there is no enum map or the value matches no entry, leaving
// the caller on its existing formatting path.
function resolveEnumDisplay(value, enumMap) {
  if (!type.isObject(enumMap) || !type.isString(value)) return null;

  const entry = enumMap[value];
  if (!type.isObject(entry) || type.isNone(entry.title)) return null;

  return {
    label: entry.title,
    color: entry.color ?? null,
    icon: entry.icon ?? null,
  };
}

export default resolveEnumDisplay;
