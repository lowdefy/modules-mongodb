import { type } from "@lowdefy/helpers";
import detectFieldType from "./fieldTypes/detectFieldType.js";
import formatFieldName from "./utils/formatFieldName.js";

function formatLabel(fullKey) {
  return fullKey
    .split(".")
    .map((segment) => formatFieldName(segment))
    .join(" ");
}

function flattenObject(obj, prefix) {
  const items = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    // Skip null and undefined in auto-discovery mode
    if (value === null || value === undefined) continue;

    // Skip empty arrays
    if (type.isArray(value) && value.length === 0) continue;

    // Try to detect field type
    const typeInfo = detectFieldType(value);

    if (typeInfo) {
      // Recognized type — add as leaf item
      items.push({
        key: fullKey,
        value,
        label: formatLabel(fullKey),
        fieldType: typeInfo.type,
        isArray: typeInfo.isArray,
        fullWidth: typeInfo.config?.fullWidth ?? false,
        options: null,
      });
    } else if (type.isObject(value)) {
      // Unrecognized object — flatten recursively with dotted keys
      items.push(...flattenObject(value, fullKey));
    }
  }
  return items;
}

function processData(data) {
  if (!data || !type.isObject(data)) return [];
  return flattenObject(data, "");
}

export default processData;
