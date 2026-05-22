import { fieldTypeRegistry } from "./fieldTypeRegistry.js";

export function getFieldTypeByComponentHint(componentHint) {
  if (!componentHint) return null;

  const entry = Object.entries(fieldTypeRegistry).find(([, config]) =>
    config.componentHints.includes(componentHint),
  );

  return entry ? entry[0] : null;
}
