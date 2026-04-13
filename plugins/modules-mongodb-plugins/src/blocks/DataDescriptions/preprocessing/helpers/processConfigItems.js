import { get, type, applyArrayIndices } from "@lowdefy/helpers";
import createSection from "./createSection.js";
import formatFieldName from "../../utils/formatFieldName.js";
import detectFieldType from "./detectFieldType.js";

function processConfigItems(data, formItems, level) {
  const fields = [];
  const sections = [];

  formItems.forEach((item) => {
    if (!item) return;

    // Section item
    if (item.component === "section") {
      const title = item.title || null;
      const form = item.form || [];

      const sectionItems = processConfigItems(data, form, level + 1);

      if (sectionItems.length > 0) {
        sections.push(createSection(title, level, sectionItems));
      }
    }
    // Box component - transparent container
    else if (item.component === "box" && item.form) {
      const boxItems = processConfigItems(data, item.form, level);

      // Merge box contents into current level
      boxItems.forEach((boxItem) => {
        if (boxItem.type === "field") {
          fields.push(boxItem);
        } else if (boxItem.type === "section") {
          sections.push(boxItem);
        }
      });
    }
    // Array field with nested form (controlled_list)
    else if (item.key && item.form) {
      const title = item.title || null;
      const arrayValue = get(data, item.key);
      const items = [];

      if (type.isArray(arrayValue) && arrayValue.length > 0) {
        // Create sections for each array item
        arrayValue.forEach((_, index) => {
          // Expand $ syntax in nested form keys
          const expandedForm = item.form.map((formItem) => {
            if (!formItem.key) return formItem;
            // Replace $ with actual index
            const expandedKey = applyArrayIndices([index], formItem.key);

            return {
              ...formItem,
              key: expandedKey,
            };
          });
          // Process expanded form recursively
          const itemStructure = processConfigItems(
            data,
            expandedForm,
            level + 1,
          );
          // Add section for array item
          if (itemStructure.length > 0) {
            items.push(
              createSection(`Item ${index + 1}`, level + 1, itemStructure),
            );
          }
        });
        sections.push(createSection(title, level, items));
      }
    }
    // Simple field item
    else if (item.key) {
      const value = get(data, item.key);

      if (value === undefined || value === null) return;

      // Try to detect field type
      const typeInfo = detectFieldType(value, item.component);

      // Skip plain object (structural, not a field)
      if (!typeInfo) return;

      // Create field node with config metadata and type info
      const customLabel = item.title ?? null;

      fields.push({
        type: "field",
        key: item.key,
        value,
        configHint: item.component || null,
        customLabel,
        label: customLabel || formatFieldName(item.key),
        fieldType: typeInfo.type,
        isArray: typeInfo.isArray,
        fullWidth: typeInfo.config?.fullWidth ?? false,
      });
    }
  });

  const items = [];

  // Add fields directly (no grid wrapping)
  items.push(...fields);

  // Add sections
  items.push(...sections);

  return items;
}

export default processConfigItems;
