import { type } from "@lowdefy/helpers";
import buildStructureFromData from "./helpers/buildStructureFromData.js";
import buildStructureFromConfig from "./helpers/buildStructureFromConfig.js";

function collectGroups(sections) {
  const groups = [];
  for (const section of sections) {
    const fields = section.items.filter((i) => i.type === "field");
    const nested = section.items.filter((i) => i.type === "section");
    const children = nested.length > 0 ? collectGroups(nested) : [];

    if (fields.length > 0 || children.length > 0) {
      groups.push({ title: section.title || null, fields, children });
    }
  }
  return groups;
}

function preprocessData(data, formConfig) {
  if (!data && !formConfig) return [];

  const root =
    formConfig && data && type.isObject(data)
      ? buildStructureFromConfig(data, formConfig)
      : buildStructureFromData(data);

  if (!root?.items?.length) return [];

  return collectGroups(root.items);
}

export default preprocessData;
