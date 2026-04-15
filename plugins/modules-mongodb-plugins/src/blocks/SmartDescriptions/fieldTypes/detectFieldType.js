import { type } from "@lowdefy/helpers";
import { getFieldTypesByPriority } from "./getFieldTypesByPriority.js";
import { getFieldTypeConfig } from "./getFieldTypeConfig.js";

function detectFieldType(value) {
  // Handle arrays before other types
  if (type.isArray(value)) {
    // Empty array, use string as fallback
    if (value.length === 0) {
      const config = getFieldTypeConfig("string");
      return { type: "string", isArray: true, config };
    }

    // Check if all items match a specific type
    const fieldTypes = getFieldTypesByPriority();

    for (const [typeName, config] of fieldTypes) {
      // Check if all array items match this type
      if (value.every((item) => config.detect(item))) {
        return { type: typeName, isArray: true, config };
      }
    }

    // Mixed types, use string as fallback
    const stringConfig = getFieldTypeConfig("string");
    return { type: "string", isArray: true, config: stringConfig };
  }

  // Iterate registry by priority
  const fieldTypes = getFieldTypesByPriority();

  for (const [typeName, config] of fieldTypes) {
    if (config.detect(value)) {
      return { type: typeName, isArray: false, config };
    }
  }

  // No type matched
  return null;
}

export default detectFieldType;
