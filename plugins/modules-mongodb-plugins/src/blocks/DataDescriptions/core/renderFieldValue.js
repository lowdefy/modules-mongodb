import React from "react";
import { getFieldTypeConfig } from "../fieldTypes/getFieldTypeConfig.js";
import renderArray from "./renderArray.js";

function renderFieldValue(structure, Icon, methods, properties) {
  const { value, fieldType, isArray } = structure;
  const config = getFieldTypeConfig(fieldType);

  // Handle arrays
  if (isArray) {
    return renderArray(
      structure,
      config,
      Icon,
      methods,
      properties,
      renderFieldValue,
    );
  }

  // Non-arrays - use render function from registry
  if (config && config.render) {
    return config.render({ value, Icon, methods, properties, fieldType });
  }

  // Fallback for types without render functions
  return <span className="dataview-value">{String(value)}</span>;
}

export default renderFieldValue;
