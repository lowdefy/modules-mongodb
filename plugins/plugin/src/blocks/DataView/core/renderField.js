import React from "react";
import GridItem from "../components/GridItem.js";
import renderFieldValue from "./renderFieldValue.js";

function renderField(structure, Icon, methods, properties) {
  const { label, fullWidth } = structure;

  return (
    <GridItem fullWidth={fullWidth} label={label}>
      {renderFieldValue(structure, Icon, methods, properties)}
    </GridItem>
  );
}

export default renderField;
