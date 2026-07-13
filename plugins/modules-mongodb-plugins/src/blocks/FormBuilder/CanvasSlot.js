import React from "react";
import { useDroppable } from "@dnd-kit/core";
import CanvasBlock from "./CanvasBlock.js";

const CanvasSlot = ({ childrenPath, blocks, slotKey, ctx }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${childrenPath}`,
    data: { kind: "slot", childrenPath },
  });
  const empty = !blocks || blocks.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={`fb-slot${isOver ? " fb-slot-over" : ""}${
        empty ? " fb-slot-empty" : ""
      }`}
    >
      {empty ? (
        <span className="fb-slot-placeholder">
          {slotKey === "content" ? "Drop blocks here" : `Drop into ${slotKey}`}
        </span>
      ) : (
        blocks.map((block, index) => (
          <CanvasBlock
            key={block.id ?? index}
            block={block}
            path={`${childrenPath}.${index}`}
            index={index}
            childrenPath={childrenPath}
            ctx={ctx}
          />
        ))
      )}
    </div>
  );
};

export default CanvasSlot;
