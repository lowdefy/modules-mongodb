import { fieldTypeRegistry } from "./fieldTypeRegistry.js";

export function getFieldTypeConfig(typeName) {
  return fieldTypeRegistry[typeName];
}
