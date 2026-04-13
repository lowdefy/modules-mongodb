import { type } from "@lowdefy/helpers";
import buildStructureFromData from "./helpers/buildStructureFromData.js";
import buildStructureFromConfig from "./helpers/buildStructureFromConfig.js";

function preprocessData(data, formConfig) {
  if (!formConfig || !data || !type.isObject(data)) {
    // No formConfig, build from data shape
    return buildStructureFromData(data);
  }

  // With formConfig, use config as structure blueprint
  return buildStructureFromConfig(data, formConfig);
}

export default preprocessData;
