import React, { useMemo } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ErrorBoundary } from "@lowdefy/block-utils";
import CanvasSlot from "./CanvasSlot.js";
import { parsePreview } from "./operatorPreview.js";
import { DEFAULT_PROPERTIES, dynamicSlotKeys } from "./registry.js";
import {
  droppableSlotKeys,
  getSlotChildren,
  slotChildrenPath,
} from "./treeUtils.js";

const CONTAINER_CATEGORIES = new Set(["container", "input-container"]);
const VALUE_CATEGORIES = new Set(["input", "input-container"]);

const CanvasBlock = ({ block, path, index, childrenPath, ctx }) => {
  const { builder, registry, components, parser, previewState, setPreviewValue, mockState } = ctx;
  const entry = registry[block.type];
  const selected = builder.selection === path;

  const drag = useDraggable({ id: `node:${path}`, data: { source: "canvas", path } });
  const before = useDroppable({
    id: `before:${path}`,
    data: { kind: "before", childrenPath, index },
  });

  const { properties: parsedProperties, visible, errors } = useMemo(() => {
    const propResult = parsePreview(parser, block.properties, `${path}.properties`);
    const visResult = parsePreview(parser, block.visible, `${path}.visible`);
    return {
      properties: propResult.output ?? {},
      visible: visResult.output,
      errors: [...propResult.errors, ...visResult.errors],
    };
  }, [parser, block.properties, block.visible, path]);

  const stubMethods = useMemo(
    () => ({
      registerEvent: () => undefined,
      registerMethod: () => undefined,
      setValue: (v) => setPreviewValue(block.id, v),
      triggerEvent: () => Promise.resolve([]),
      translate: (x) => x,
      getLocale: () => "en",
    }),
    [block.id, setPreviewValue],
  );

  const handleSelect = (e) => {
    e.stopPropagation();
    builder.selectBlock({ path });
  };
  const handleDelete = (e) => {
    e.stopPropagation();
    builder.deleteBlock(path);
  };

  let rendered;
  if (!entry) {
    rendered = (
      <div className="fb-node-unknown">Unknown block type: {block.type}</div>
    );
  } else {
    const { Component, meta } = entry;
    const isContainer = CONTAINER_CATEGORIES.has(meta.category);

    // Defense in depth: even a hand/agent-authored config missing the fussy
    // property (e.g. Tabs without `tabs`) must not crash the preview. Merge the
    // type's defaults underneath the parsed properties for rendering only — the
    // stored config is never mutated here (seeding happens on drop).
    const typeDefaults = DEFAULT_PROPERTIES[block.type];
    const renderProperties = typeDefaults
      ? { ...typeDefaults, ...parsedProperties }
      : parsedProperties;

    const content = {};
    const slotKeys = droppableSlotKeys(meta);
    if (isContainer && slotKeys.length) {
      slotKeys.forEach((slotKey) => {
        content[slotKey] = () => (
          <CanvasSlot
            childrenPath={slotChildrenPath(path, slotKey)}
            blocks={getSlotChildren(block, slotKey)}
            slotKey={slotKey}
            ctx={ctx}
          />
        );
      });
    }

    // Dynamic slots: Tabs/Collapse declare `slots: false` — their slots are
    // one per item key (Tabs renders content[tab.key](), Collapse renders
    // content[panel.key]()). Keys come from the *authored* stored properties
    // (merged over the type defaults) so drop paths match what's persisted,
    // not from operator-parsed values. The property-shadow filter does not
    // apply here — these are item keys, not meta slot names.
    // Note: renaming/removing a tab/panel key orphans its `areas.<oldKey>`
    // blocks in the stored config — acceptable for now, no cleanup built.
    if (isContainer && meta.slots === false) {
      const dynKeys = dynamicSlotKeys(block.type, {
        ...typeDefaults,
        ...block.properties,
      });
      dynKeys.forEach((slotKey) => {
        content[slotKey] = () => (
          <CanvasSlot
            childrenPath={slotChildrenPath(path, slotKey)}
            blocks={getSlotChildren(block, slotKey)}
            slotKey={slotKey}
            ctx={ctx}
          />
        );
      });
      // Inactive tabs / collapsed panels are reached by switching them in
      // the canvas — the components' headers stay clickable in preview.
    }

    const componentProps = {
      blockId: block.id,
      components,
      events: {},
      loading: false,
      methods: stubMethods,
      properties: renderProperties,
      required: block.required ?? false,
      styles: block.style ?? {},
      classNames: {},
      validation: { status: null, errors: [], warnings: [] },
    };
    if (isContainer) componentProps.content = content;
    if (VALUE_CATEGORIES.has(meta.category)) {
      componentProps.value = previewState[block.id] ?? mockState?.[block.id];
    }

    rendered = (
      <ErrorBoundary
        key={JSON.stringify(renderProperties)}
        blockId={block.id}
        blockType={block.type}
        fallback={(error) => (
          <div className="fb-node-unknown">
            {block.type} render error: {error?.message ?? "unknown"}
          </div>
        )}
      >
        <Component {...componentProps} />
      </ErrorBoundary>
    );
  }

  const classNames = [
    "fb-node",
    selected && "fb-node-selected",
    before.isOver && "fb-node-drop-before",
    drag.isDragging && "fb-node-dragging",
    visible === false && "fb-node-hidden",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={before.setNodeRef} className={classNames} onClick={handleSelect}>
      <div className="fb-node-overlay">
        <span className="fb-node-chip">
          {block.id}
          <em>{block.type}</em>
        </span>
        <button
          type="button"
          ref={drag.setNodeRef}
          className="fb-node-handle"
          title="Drag to move"
          {...drag.listeners}
          {...drag.attributes}
        >
          ⠿
        </button>
        {errors.length ? (
          <span
            className="fb-node-error"
            title={errors.map((e) => e.message).join("\n")}
          >
            !
          </span>
        ) : null}
        <button
          type="button"
          className="fb-node-delete"
          title="Delete block"
          onClick={handleDelete}
        >
          ×
        </button>
      </div>
      <div className="fb-node-content">
        {rendered}
      </div>
    </div>
  );
};

export default CanvasBlock;
