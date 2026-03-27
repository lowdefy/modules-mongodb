import determineGridColumns from "./determineGridColumns.js";

function createGridNode(fields) {
  if (fields.length === 0) return null;

  const columns = determineGridColumns(fields);

  return {
    type: "grid",
    columns,
    items: fields,
  };
}

export default createGridNode;
