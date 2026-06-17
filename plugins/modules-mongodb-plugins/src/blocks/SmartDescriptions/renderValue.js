import React from "react";
import { getFieldTypeConfig } from "./fieldTypes/getFieldTypeConfig.js";
import detectFieldType from "./fieldTypes/detectFieldType.js";

function renderValue(item, Icon, methods, properties) {
  const { value, fieldType, isArray, options } = item;

  // Null/empty handling for fields mode
  if (value === null || value === undefined) {
    return <span className="dataview-value dataview-value-null">Not set</span>;
  }
  if (value === "") {
    return <span className="dataview-value dataview-value-null">Not set</span>;
  }
  if (Array.isArray(value) && value.length === 0) {
    return <span className="dataview-value dataview-value-null">Not set</span>;
  }

  const config = getFieldTypeConfig(fieldType);

  // Renders a nested raw value through detection and the full
  // renderValue pipeline. Injected into registry renderers so container
  // types (e.g. object) can recurse without importing this module.
  const renderNested = (nestedValue) => {
    const typeInfo = detectFieldType(nestedValue);
    return renderValue(
      {
        value: nestedValue,
        fieldType: typeInfo?.type ?? "string",
        isArray: typeInfo?.isArray ?? false,
        options: null,
      },
      Icon,
      methods,
      properties,
    );
  };

  // Handle arrays
  if (isArray && Array.isArray(value)) {
    // Custom array rendering (if field type defines renderArray)
    if (config?.renderArray) {
      return config.renderArray({
        value,
        Icon,
        methods,
        properties,
        fieldType,
        options,
        renderNested,
      });
    }

    // Typed array — render each item with single-value render
    if (config?.render) {
      if (value.length === 1) {
        return config.render({
          value: value[0],
          Icon,
          methods,
          properties,
          fieldType,
          options,
          renderNested,
        });
      }

      return (
        <div className="dataview-special-array">
          {value.map((v, index) => (
            <div className="dataview-special-array-item" key={index}>
              {config.render({
                value: v,
                Icon,
                methods,
                properties,
                fieldType,
                options,
                renderNested,
              })}
            </div>
          ))}
        </div>
      );
    }
  }

  // Non-array — use render function from registry
  if (config?.render) {
    return config.render({
      value,
      Icon,
      methods,
      properties,
      fieldType,
      options,
      renderNested,
    });
  }

  // Fallback
  return <span className="dataview-value">{String(value)}</span>;
}

export default renderValue;
