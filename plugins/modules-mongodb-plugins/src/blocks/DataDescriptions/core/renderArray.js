import React from "react";

function renderArray(structure, config, Icon, methods, properties) {
  const { value, fieldType } = structure;

  // Empty array
  if (value.length === 0) {
    return <span className="dataview-value-null">Empty list</span>;
  }

  // Custom array rendering (if field type defines renderArray)
  if (config && config.renderArray) {
    return config.renderArray({ value, Icon, methods, properties, fieldType });
  }

  // Typed array (contact[], file[], location[], number[], etc.)
  if (config && config.render) {
    // Single item - render inline
    if (value.length === 1) {
      return config.render({ value: value[0], Icon, methods, properties });
    }

    // Multiple items - render as list
    return (
      <div className="dataview-special-array">
        {value.map((item, index) => (
          <div className="dataview-special-array-item" key={index}>
            {config.render({ value: item, Icon, methods, properties })}
          </div>
        ))}
      </div>
    );
  }

  // Should never reach
  return null;
}

export default renderArray;
