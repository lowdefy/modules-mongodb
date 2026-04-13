import { type } from "@lowdefy/helpers";

function formatValue(value) {
  if (!type.isString(value) || !value) return value;

  // Check if the string looks like an identifier
  const hasUnderscore = value.includes("_");
  const hasCamelCase = /[a-z][A-Z]/.test(value);
  const noSpaces = !value.includes(" ");

  // Only format if it looks like an identifier
  if ((hasUnderscore || hasCamelCase) && noSpaces) {
    return (
      value
        .replace(/_/g, " ")
        // Only add space before lowercase-to-uppercase transitions, not all caps
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .map((word) => {
          if (word.length <= 1) return word.toUpperCase();
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ")
    );
  }

  // Simple strings that aren't identifiers
  if (noSpaces && value.length > 1 && value === value.toLowerCase()) {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  return value;
}

export default formatValue;
