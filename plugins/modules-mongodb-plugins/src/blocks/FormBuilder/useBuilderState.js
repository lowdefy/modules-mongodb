import { useCallback, useEffect, useMemo, useState } from "react";
import YAML from "yaml";
import { generateId, uniqueId } from "./ids.js";
import { defaultPropertiesFor } from "./registry.js";
import {
  collectIds,
  getAtPath,
  insertAtChildrenPath,
  normalizeTree,
  parentChildrenPath,
  removeAtPath,
  setAtPath,
  stripNulls,
} from "./treeUtils.js";

function useBuilderState({ value, methods }) {
  const tree = useMemo(() => normalizeTree(value), [value]);
  const [selection, setSelection] = useState(null);

  const emitBlockSelect = useCallback(
    (source, path) => {
      const config = getAtPath(source, path);
      if (!config) return;
      methods.triggerEvent({
        name: "onBlockSelect",
        event: {
          path,
          blockId: config.id,
          type: config.type,
          config,
          yaml: YAML.stringify(config),
        },
      });
    },
    [methods],
  );

  // Single mutation boundary: strip nulls, persist, fire onChange, then set /
  // re-emit selection off the freshly built (stripped) tree.
  const commit = useCallback(
    (nextTree, selectionPath) => {
      const cleaned = stripNulls(normalizeTree(nextTree));
      methods.setValue(cleaned);
      methods.triggerEvent({ name: "onChange" });
      setSelection(selectionPath ?? null);
      if (selectionPath) emitBlockSelect(cleaned, selectionPath);
    },
    [methods, emitBlockSelect],
  );

  const selectBlock = useCallback(
    (args) => {
      const path = args?.path ?? null;
      setSelection(path);
      if (path) emitBlockSelect(tree, path);
    },
    [tree, emitBlockSelect],
  );

  const addBlock = useCallback(
    (type, childrenPath, index) => {
      const id = generateId(type, collectIds(tree));
      const block = { id, type };
      const properties = defaultPropertiesFor(type);
      if (properties) block.properties = properties;
      const { value: next, index: at } = insertAtChildrenPath(
        tree,
        childrenPath,
        index,
        block,
      );
      commit(next, `${childrenPath}.${at}`);
    },
    [tree, commit],
  );

  const moveBlock = useCallback(
    (path, targetChildrenPath, index) => {
      // Guard: cannot drop a block into itself or a descendant.
      if (
        targetChildrenPath === path ||
        targetChildrenPath.startsWith(`${path}.`)
      ) {
        return;
      }
      const block = getAtPath(tree, path);
      if (!block) return;
      const source = parentChildrenPath(path);
      const removed = removeAtPath(tree, path);
      let targetIndex = index;
      let targetPath = targetChildrenPath;
      if (source.childrenPath === targetChildrenPath) {
        if (targetIndex != null && source.index < targetIndex) {
          targetIndex -= 1;
        }
      } else if (targetChildrenPath.startsWith(`${source.childrenPath}.`)) {
        // Removal shifted sibling indices in the target's ancestor chain.
        const rest = targetChildrenPath
          .slice(source.childrenPath.length + 1)
          .split(".");
        const siblingIndex = Number(rest[0]);
        if (siblingIndex > source.index) {
          rest[0] = String(siblingIndex - 1);
          targetPath = `${source.childrenPath}.${rest.join(".")}`;
        }
      }
      const { value: next, index: at } = insertAtChildrenPath(
        removed,
        targetPath,
        targetIndex,
        block,
      );
      commit(next, `${targetPath}.${at}`);
    },
    [tree, commit],
  );

  const deleteBlock = useCallback(
    (path) => {
      const next = removeAtPath(tree, path);
      commit(next, null);
    },
    [tree, commit],
  );

  // Replace the block at `path` with `config`, re-ensuring id uniqueness.
  const setBlockConfig = useCallback(
    (args) => {
      const { path, config } = args ?? {};
      if (!path || !config) return;
      const existing = getAtPath(tree, path);
      const id = uniqueId(config.id, config.type, collectIds(tree, path));
      const next = setAtPath(tree, path, {
        ...config,
        type: config.type ?? existing?.type,
        id,
      });
      commit(next, path);
    },
    [tree, commit],
  );

  useEffect(() => {
    methods.registerMethod("setBlockConfig", setBlockConfig);
    methods.registerMethod("selectBlock", selectBlock);
  }, [methods, setBlockConfig, selectBlock]);

  const selectedBlock = selection ? getAtPath(tree, selection) : null;

  return {
    tree,
    selection,
    selectedBlock,
    selectBlock,
    addBlock,
    moveBlock,
    deleteBlock,
    setBlockConfig,
  };
}

export default useBuilderState;
