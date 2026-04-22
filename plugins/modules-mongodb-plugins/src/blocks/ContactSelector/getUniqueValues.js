import { type } from "@lowdefy/helpers";

const getUniqueValues = (arr, key = "value") => {
  const keys = arr.map((o) => JSON.stringify(type.isPrimitive(o) ? o : o[key]));
  return arr.filter((opt, i) => {
    const k = JSON.stringify(type.isPrimitive(opt) ? opt : opt[key]);
    return keys.indexOf(k) === i;
  });
};

export default getUniqueValues;
