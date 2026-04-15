import { type } from "@lowdefy/helpers";
import blockTypeMap from "./fieldTypes/blockTypeMap.js";
import detectFieldType from "./fieldTypes/detectFieldType.js";
import { getFieldTypeConfig } from "./fieldTypes/getFieldTypeConfig.js";
import formatFieldName from "./utils/formatFieldName.js";
import getByDotNotation from "./utils/getByDotNotation.js";

function lastSegment(id) {
  const parts = id.split(".");
  return parts[parts.length - 1];
}

function processFields(data, fields) {
  if (!fields || !Array.isArray(fields)) return [];
  const items = [];

  for (const field of fields) {
    if (!field || !field.id) continue;

    // 1. Resolve data value
    const value = getByDotNotation(data, field.id);

    // 2. Determine label
    const label =
      field.properties?.title ?? formatFieldName(lastSegment(field.id));

    // 3. Determine field type
    let fieldType = null;
    let isArray = false;
    let fullWidth = false;

    // Try block type mapping first
    if (field.type && blockTypeMap[field.type]) {
      fieldType = blockTypeMap[field.type];
      const config = getFieldTypeConfig(fieldType);
      isArray = type.isArray(value);
      fullWidth = config?.fullWidth ?? false;
    } else {
      // Unknown block type or no type — fall back to auto-detection
      const typeInfo = detectFieldType(value);
      if (typeInfo) {
        fieldType = typeInfo.type;
        isArray = typeInfo.isArray;
        fullWidth = typeInfo.config?.fullWidth ?? false;
      } else {
        // Final fallback: string
        fieldType = "string";
      }
    }

    // 4. Extract options for selector types
    const options =
      fieldType === "selector" ? (field.properties?.options ?? null) : null;

    items.push({
      key: field.id,
      value,
      label,
      fieldType,
      isArray,
      fullWidth,
      options,
    });
  }

  return items;
}

export default processFields;
