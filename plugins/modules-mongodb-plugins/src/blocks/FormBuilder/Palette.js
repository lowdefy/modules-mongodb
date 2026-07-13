import React, { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Input } from "antd";
import { groupRegistry } from "./registry.js";

// A single, consistent, muted glyph per block category — cleaner than the
// per-block framework meta icons, which render as noisy black glyphs.
const CATEGORY_ICONS = {
  input: "AiOutlineEdit",
  "input-container": "AiOutlineForm",
  container: "AiOutlineAppstore",
  list: "AiOutlineUnorderedList",
  display: "AiOutlineFontSize",
};

const PaletteItem = ({ type, meta, Icon }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { source: "palette", type },
  });
  const iconName = CATEGORY_ICONS[meta.category];
  return (
    <div
      ref={setNodeRef}
      className="fb-palette-item"
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...listeners}
      {...attributes}
    >
      {iconName && Icon ? (
        <span className="fb-palette-item-icon">
          <Icon properties={{ name: iconName, size: 14 }} />
        </span>
      ) : null}
      <span className="fb-palette-item-label">{type}</span>
    </div>
  );
};

const Palette = ({ registry, components }) => {
  const [search, setSearch] = useState("");
  const groups = useMemo(() => groupRegistry(registry), [registry]);
  const term = search.trim().toLowerCase();
  const Icon = components?.Icon;

  return (
    <div className="fb-palette">
      <Input.Search
        allowClear
        placeholder="Search blocks"
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="fb-palette-groups">
        {Object.entries(groups).map(([group, items]) => {
          const filtered = items.filter(({ type }) =>
            type.toLowerCase().includes(term),
          );
          if (!filtered.length) return null;
          return (
            <div key={group} className="fb-palette-group">
              <div className="fb-palette-group-title">{group}</div>
              {filtered.map(({ type, meta }) => (
                <PaletteItem key={type} type={type} meta={meta} Icon={Icon} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Palette;
