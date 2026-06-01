import renderTree from './renderTree.js';

/**
 * Renders a status_map cell for the target stage against the planned action doc.
 *
 * Inputs:
 *   - `cell` — the `status_map[targetStage]` object (per-slug `{ message? }` +
 *     reserved `status_title`), or null/undefined when the author wrote no cell
 *     for this stage.
 *   - `plannedActionDoc` — the post-commit action doc shape (status pushed,
 *     fields set, metadata merged). Templates can reference its fields.
 *   - `mergedMetadata` — the accumulated metadata bag, hoisted into the render
 *     context (metadata wins over action-doc-field collisions — design D12).
 *
 * Output: the rendered cell, ready for the planner to deep-merge onto the doc.
 * Only the keys the author wrote are present — so a cell that omits a slug's
 * `message` does not clobber a prior (sticky) value when deep-merged.
 *
 * Returns `{}` when there is no cell (nothing to write; prior values stick).
 */
function renderStatusMap({ cell, plannedActionDoc, mergedMetadata }) {
  if (cell == null) return {};
  const ctx = {
    ...plannedActionDoc,
    ...(plannedActionDoc?.metadata ?? {}),
    ...(mergedMetadata ?? {}),
  };
  return renderTree(cell, ctx);
}

export default renderStatusMap;
