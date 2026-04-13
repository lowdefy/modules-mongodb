import { type } from "@lowdefy/helpers";
import createSection from "./createSection.js";
import formatFieldName from "../../utils/formatFieldName.js";
import detectFieldType from "./detectFieldType.js";

function buildObjectStructure(obj, level) {
  const leafFields = [];
  const structuralFields = [];

  Object.entries(obj).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    // Try to detect field type
    const typeInfo = detectFieldType(value);

    // Plain object
    if (!typeInfo) {
      structuralFields.push({ key, value });
    } else {
      // leaf field
      leafFields.push({
        type: "field",
        key,
        value,
        label: formatFieldName(key),
        fieldType: typeInfo.type,
        isArray: typeInfo.isArray,
        fullWidth: typeInfo.config?.fullWidth ?? false,
      });
    }
  });

  const items = [];

  // Add leaf fields directly (no grid wrapping)
  items.push(...leafFields);

  // Add sections for structural fields
  structuralFields.forEach(({ key, value }) => {
    if (type.isArray(value)) {
      // Array of objects
      const arrayItems = value.map((item) => {
        const itemStructure = buildObjectStructure(item, level + 2);
        return createSection(null, level + 2, itemStructure);
      });
      items.push(createSection(formatFieldName(key), level + 1, arrayItems));
    } else {
      // Nested object
      const subStructure = buildObjectStructure(value, level + 1);
      items.push(createSection(formatFieldName(key), level + 1, subStructure));
    }
  });

  return items;
}

export default buildObjectStructure;
