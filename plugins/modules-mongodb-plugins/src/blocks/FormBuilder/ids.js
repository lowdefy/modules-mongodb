function toSnake(type) {
  return String(type)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

export function generateId(type, existingIds) {
  const base = toSnake(type);
  let n = 1;
  let id = `${base}_${n}`;
  const taken = existingIds instanceof Set ? existingIds : new Set(existingIds);
  while (taken.has(id)) {
    n += 1;
    id = `${base}_${n}`;
  }
  return id;
}

export function uniqueId(desiredId, type, existingIds) {
  const taken = existingIds instanceof Set ? existingIds : new Set(existingIds);
  if (desiredId && !taken.has(desiredId)) return desiredId;
  return generateId(type, taken);
}
