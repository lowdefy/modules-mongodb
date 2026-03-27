import React, { useMemo } from "react";
import { withBlockDefaults } from "@lowdefy/block-utils";
import StructureRenderer from "./core/StructureRenderer.js";
import preprocessData from "./preprocessing/preprocessData.js";

const DataView = ({ blockId, properties, components: { Icon }, methods }) => {
  const { data, formConfig } = properties;

  const structure = useMemo(() => {
    return preprocessData(data, formConfig);
  }, [data, formConfig]);

  if (
    !data &&
    (!structure || !structure.items || structure.items.length === 0)
  ) {
    return (
      <div className="dataview-empty" id={blockId}>
        No data to display
      </div>
    );
  }

  return (
    <div className="dataview-container" id={blockId}>
      <StructureRenderer
        Icon={Icon}
        methods={methods}
        properties={properties}
        structure={structure}
      />
    </div>
  );
};

export default withBlockDefaults(DataView);
