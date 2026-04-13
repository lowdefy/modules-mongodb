import React from "react";
import Section from "../components/Section.js";
import renderField from "./renderField.js";

function StructureRenderer({ structure, Icon, methods, properties }) {
  if (!structure) return null;

  switch (structure.type) {
    case "root":
      return (
        <>
          {structure.items.map((item, index) => (
            <StructureRenderer
              Icon={Icon}
              key={index}
              methods={methods}
              properties={properties}
              structure={item}
            />
          ))}
        </>
      );

    case "section":
      return (
        <Section
          level={structure.level}
          sectionCards={properties.sectionCards ?? true}
          showCard={structure.showCard}
          title={structure.title}
        >
          {structure.items.map((item, index) => (
            <StructureRenderer
              Icon={Icon}
              key={index}
              methods={methods}
              properties={properties}
              structure={item}
            />
          ))}
        </Section>
      );

    case "grid": {
      const gridClassName = `dataview-grid ${
        structure.columns === 2 ? "dataview-grid-two-cols" : ""
      }`;

      return (
        <div className={gridClassName}>
          {structure.items.map((item, index) => (
            <StructureRenderer
              Icon={Icon}
              key={index}
              methods={methods}
              properties={properties}
              structure={item}
            />
          ))}
        </div>
      );
    }

    case "field":
      return renderField(structure, Icon, methods, properties);

    default:
      console.warn("Unknown structure type:", structure.type);
      return null;
  }
}

export default StructureRenderer;
