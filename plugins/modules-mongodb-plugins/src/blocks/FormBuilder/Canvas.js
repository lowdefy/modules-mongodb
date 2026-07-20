import React from "react";
import CanvasSlot from "./CanvasSlot.js";

const Canvas = ({ ctx }) => {
  const clearSelection = () => ctx.builder.selectBlock({ path: null });
  return (
    <div className="fb-canvas" onClick={clearSelection}>
      <CanvasSlot childrenPath="blocks" blocks={ctx.builder.tree.blocks} slotKey="content" ctx={ctx} />
    </div>
  );
};

export default Canvas;
