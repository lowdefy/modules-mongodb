import { get, type, applyArrayIndices } from "@lowdefy/helpers";
import { nunjucksString } from "@lowdefy/nunjucks";
import createSection from "./createSection.js";
import formatFieldName from "../../utils/formatFieldName.js";
import detectFieldType from "./detectFieldType.js";

function processConfigItems(data, formItems, level, arrayIndices = []) {
  const fields = [];
  const sections = [];

  formItems.forEach((item) => {
    if (!item) return;

    // Section item
    if (item.component === "section") {
      const title = item.title || null;
      const form = item.form || [];

      const sectionItems = processConfigItems(
        data,
        form,
        level + 1,
        arrayIndices,
      );

      if (sectionItems.length > 0) {
        sections.push(createSection(title, level, sectionItems));
      }
    }
    // Box component - transparent container
    else if (item.component === "box" && item.form) {
      const boxItems = processConfigItems(data, item.form, level, arrayIndices);

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
      const arrayValue = get(data, applyArrayIndices(arrayIndices, item.key));
      const items = [];

      if (type.isArray(arrayValue) && arrayValue.length > 0) {
        // Create sections for each array item. Keys keep their `$` markers;
        // the accumulated indices expand them at lookup, so lists nest to
        // any depth (e.g. form.devices.$.parts.$.name).
        arrayValue.forEach((itemValue, index) => {
          const itemStructure = processConfigItems(data, item.form, level + 1, [
            ...arrayIndices,
            index,
          ]);
          // Add section for array item. `itemTitle` is a Nunjucks template
          // rendered against the item (its fields are the template context),
          // producing the card title as HTML; fall back to `Item N` when
          // absent or when the render is empty. `_index` (0-based) is added to
          // the context so a template can reference the item's position.
          if (itemStructure.length > 0) {
            let itemTitle;
            if (item.itemTitle) {
              const context = type.isObject(itemValue)
                ? { ...itemValue, _index: index }
                : { value: itemValue, _index: index };
              const rendered = nunjucksString(item.itemTitle, context);
              if (type.isString(rendered) && rendered.trim() !== "") {
                itemTitle = rendered;
              }
            }
            const sectionTitle =
              itemTitle !== undefined ? itemTitle : `Item ${index + 1}`;
            items.push(
              createSection(sectionTitle, level + 1, itemStructure, {
                isListItem: true,
              }),
            );
          }
        });
        sections.push(createSection(title, level, items));
      }
    }
    // Simple field item
    else if (item.key) {
      const expandedKey = applyArrayIndices(arrayIndices, item.key);
      const value = get(data, expandedKey);

      if (value === undefined || value === null) return;

      // Try to detect field type
      const typeInfo = detectFieldType(value, item.component);

      // Skip plain object (structural, not a field)
      if (!typeInfo) return;

      // Create field node with config metadata and type info
      const customLabel = item.title ?? null;

      fields.push({
        type: "field",
        key: expandedKey,
        value,
        configHint: item.component || null,
        customLabel,
        label: customLabel || formatFieldName(expandedKey),
        fieldType: typeInfo.type,
        isArray: typeInfo.isArray,
        fullWidth: typeInfo.config?.fullWidth ?? false,
        // Carried so renderers can show an enum entry's title for a stored slug
        // instead of formatting the raw value. Renamed to keep the reserved word
        // out of the render-arg destructuring.
        enumMap: item.enum ?? null,
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
