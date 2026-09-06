// Normalise a model-generated thread title for display in a thread list.
export const MAX_TITLE_CHARS = 60;

const cleanTitle = (raw) => {
  if (typeof raw !== "string") return null;
  let t = raw
    .replace(/\s+/g, " ")
    .trim()
    // Models still occasionally wrap a title in quotes despite being told not
    // to, and a stray pair of quotes in the thread list looks like a bug.
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.,;:]+$/, "")
    .trim();
  if (!t) return null;
  if (t.length > MAX_TITLE_CHARS)
    t = `${t.slice(0, MAX_TITLE_CHARS).trimEnd()}…`;
  return t;
};

export default cleanTitle;
