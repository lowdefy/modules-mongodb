import { type } from "@lowdefy/helpers";

function formatFieldName(name) {
  if (!name || !type.isString(name)) return name;

  return name
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default formatFieldName;
