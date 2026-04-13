import React from "react";

function GridItem({ label, children, fullWidth }) {
  return (
    <div
      className={`dataview-grid-item ${fullWidth ? "dataview-grid-item-fullwidth" : ""}`}
    >
      <div className="dataview-grid-label">{label}</div>
      <div>{children}</div>
    </div>
  );
}

export default GridItem;
