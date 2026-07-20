// Authored-shape tree helpers. The value is { blocks: [...] }.
// The default "content" slot uses the `blocks:` shorthand; any other named
// slot lives under `areas.<slotKey>.blocks`. Paths are dot-separated strings
// into the value object, e.g. "blocks.2.blocks.0" or "blocks.1.areas.extra.blocks.0".

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

export function normalizeTree(value) {
  if (value && Array.isArray(value.blocks)) return value;
  return { blocks: [] };
}

export function slotChildrenPath(blockPath, slotKey) {
  const prefix = blockPath ? `${blockPath}.` : "";
  return slotKey === "content"
    ? `${prefix}blocks`
    : `${prefix}areas.${slotKey}.blocks`;
}

// The droppable slot keys for a block, given its framework meta. A slot whose
// key also exists as a property (e.g. Card's `title` slot vs `title` property)
// is shadowed by the property and is not offered as a drop zone. The `content`
// slot is always kept.
export function droppableSlotKeys(meta) {
  if (!meta || !meta.slots || typeof meta.slots !== "object") return [];
  const propKeys = new Set(
    Object.keys(meta.properties?.properties ?? {}),
  );
  return Object.keys(meta.slots).filter(
    (key) => key === "content" || !propKeys.has(key),
  );
}

export function getSlotChildren(block, slotKey) {
  if (!block) return [];
  if (slotKey === "content") return Array.isArray(block.blocks) ? block.blocks : [];
  const children = block.areas?.[slotKey]?.blocks;
  return Array.isArray(children) ? children : [];
}

export function getAtPath(value, path) {
  if (!path) return value;
  const segs = path.split(".");
  let node = value;
  for (const seg of segs) {
    if (node == null) return undefined;
    node = node[seg];
  }
  return node;
}

export function setAtPath(value, path, next) {
  const result = clone(value);
  const segs = path.split(".");
  const last = segs.pop();
  let node = result;
  for (const seg of segs) {
    node = node[seg];
  }
  node[last] = next;
  return result;
}

export function removeAtPath(value, path) {
  const result = clone(value);
  const segs = path.split(".");
  const index = Number(segs.pop());
  let node = result;
  for (const seg of segs) {
    node = node[seg];
  }
  if (Array.isArray(node)) node.splice(index, 1);
  return result;
}

// Insert `block` into the array at `childrenPath`, creating intermediate
// containers as needed. `index` null appends.
export function insertAtChildrenPath(value, childrenPath, index, block) {
  const result = clone(value);
  const segs = childrenPath.split(".");
  let node = result;
  for (let i = 0; i < segs.length; i += 1) {
    const key = segs[i];
    const isLast = i === segs.length - 1;
    if (isLast) {
      if (!Array.isArray(node[key])) node[key] = [];
      const at = index == null ? node[key].length : index;
      node[key].splice(at, 0, block);
      return { value: result, index: at };
    }
    if (node[key] == null) {
      node[key] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    }
    node = node[key];
  }
  return { value: result, index: 0 };
}

export function parentChildrenPath(path) {
  const segs = path.split(".");
  segs.pop();
  return { childrenPath: segs.join("."), index: Number(path.split(".").pop()) };
}

export function collectIds(value, exceptPath) {
  const ids = new Set();
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, path ? `${path}.${i}` : `${i}`));
      return;
    }
    if (node && typeof node === "object") {
      if (typeof node.id === "string" && node.type && path !== exceptPath) {
        ids.add(node.id);
      }
      Object.entries(node).forEach(([key, child]) => {
        if (key === "blocks" || key === "areas") walk(child, `${path}.${key}`);
      });
    }
  };
  walk(value.blocks, "blocks");
  return ids;
}

export function stripNulls(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== null && item !== undefined)
      .map(stripNulls);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === null || val === undefined) continue;
      out[key] = stripNulls(val);
    }
    return out;
  }
  return value;
}
