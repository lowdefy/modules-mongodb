const getPath = (obj, path) =>
  path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

const parseNunjucks = (template, data) => {
  if (template == null) return null;
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const v = getPath(data, path);
    return v == null ? "" : String(v);
  });
};

export default parseNunjucks;
