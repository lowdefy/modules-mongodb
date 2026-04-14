function getByDotNotation(obj, path) {
  if (!obj || !path) return undefined;
  const keys = path.split(".");
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

export default getByDotNotation;
