import renderTree from "./renderTree.js";

/**
 * Renders an event `display` block (per-app `{ title, detail?, icon? }`) from
 * plain Nunjucks template strings against the engine event render context
 * (Part 30 D14).
 *
 * The three-source merge (engine default -> YAML override -> pre-hook return)
 * is done by the planner before this runs; this helper just renders the merged
 * display tree. No `_nunjucks: { template, on }` wrapping is supported on the
 * engine path — display values are plain Nunjucks strings.
 */
function renderEventDisplay({ display, ctx }) {
  if (display == null) return {};
  return renderTree(display, ctx);
}

export default renderEventDisplay;
