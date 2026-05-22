import { fieldTypeRegistry } from "./fieldTypeRegistry.js";

export function getFieldTypesByPriority() {
  return Object.entries(fieldTypeRegistry).sort(
    ([, a], [, b]) => a.priority - b.priority,
  );
}
