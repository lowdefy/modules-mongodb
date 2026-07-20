import React, { useCallback, useMemo, useState } from "react";
import { withBlockDefaults } from "@lowdefy/block-utils";
import withTheme from "@lowdefy/blocks-antd/blocks/withTheme.js";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import Palette from "./Palette.js";
import Canvas from "./Canvas.js";
import YamlEditor from "./YamlEditor.js";
import useBuilderState from "./useBuilderState.js";
import { buildRegistry } from "./registry.js";
import { createPreviewParser } from "./operatorPreview.js";
import { getAtPath } from "./treeUtils.js";
import "./style.css";

const FormBuilder = ({
  blockId,
  classNames = {},
  components,
  content = {},
  methods,
  properties,
  styles = {},
  value,
}) => {
  const builder = useBuilderState({ value, methods });
  const [previewState, setPreviewState] = useState({});
  const [dragLabel, setDragLabel] = useState(null);

  const registry = useMemo(
    () => buildRegistry(properties.palette?.blocks),
    [JSON.stringify(properties.palette?.blocks)],
  );

  const mock = properties.mock ?? {};
  const parser = useMemo(
    () => createPreviewParser(mock, previewState),
    [JSON.stringify(mock), previewState],
  );

  const setPreviewValue = useCallback((childId, childValue) => {
    setPreviewState((prev) => ({ ...prev, [childId]: childValue }));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragStart = ({ active }) => {
    const data = active.data.current;
    if (data?.source === "palette") setDragLabel(data.type);
    else if (data?.source === "canvas") {
      setDragLabel(getAtPath(builder.tree, data.path)?.id ?? "block");
    }
  };

  const handleDragEnd = ({ active, over }) => {
    setDragLabel(null);
    if (!over) return;
    const from = active.data.current;
    const to = over.data.current;
    if (!from || !to) return;
    const childrenPath = to.childrenPath;
    const index = to.kind === "before" ? to.index : null;
    if (from.source === "palette") {
      builder.addBlock(from.type, childrenPath, index);
    } else if (from.source === "canvas") {
      builder.moveBlock(from.path, childrenPath, index);
    }
  };

  const ctx = {
    builder,
    registry,
    components,
    parser,
    previewState,
    setPreviewValue,
    mockState: mock.state,
  };

  return (
    <div
      id={blockId}
      className={`fb-workspace ${classNames.element ?? ""}`}
      style={{ height: properties.height ?? "70vh", ...styles.element }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragLabel(null)}
      >
        <div
          className={`fb-pane fb-pane-palette ${classNames.palette ?? ""}`}
          style={styles.palette}
        >
          <Palette registry={registry} components={components} />
        </div>
        <div
          className={`fb-pane fb-pane-canvas ${classNames.canvas ?? ""}`}
          style={styles.canvas}
        >
          <Canvas ctx={ctx} />
        </div>
        <div
          className={`fb-pane fb-pane-assistant ${classNames.assistant ?? ""}`}
          style={styles.assistant}
        >
          <div className="fb-assistant-yaml">
            {builder.selectedBlock ? (
              <>
                <div className="fb-assistant-header">
                  <span className="fb-assistant-block-id">
                    {builder.selectedBlock.id}
                  </span>
                  <span className="fb-assistant-block-type">
                    {builder.selectedBlock.type}
                  </span>
                </div>
                <YamlEditor
                  block={builder.selectedBlock}
                  update={(config) =>
                    builder.setBlockConfig({ path: builder.selection, config })
                  }
                />
              </>
            ) : (
              <div className="fb-empty">
                Select a block to edit its YAML and chat about it.
              </div>
            )}
          </div>
          <div className="fb-assistant-chat">
            {content.chat && content.chat()}
          </div>
        </div>
        <DragOverlay>
          {dragLabel ? <div className="fb-drag-overlay">{dragLabel}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default withTheme("FormBuilder", withBlockDefaults(FormBuilder));
