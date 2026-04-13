import { type } from "@lowdefy/helpers";
import processConfigItems from "./processConfigItems.js";
import wrapItemsInSections from "./wrapItemsInSections.js";

function buildStructureFromConfig(data, formConfig) {
  const configArray = type.isArray(formConfig) ? formConfig : [formConfig];
  const items = processConfigItems(data, configArray, 0);

  // Wrap items in sections (root must only contain sections)
  const wrappedItems = wrapItemsInSections(items);

  return {
    type: "root",
    items: wrappedItems,
  };
}

export default buildStructureFromConfig;
