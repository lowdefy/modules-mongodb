/**
 * Pure status counter — the single source for overview progress counts
 * (Part 66). The three overview read resolvers import it directly so every
 * count flows through one counter.
 *
 * Counts each action's current stage (`status[0].stage`) into a fixed-key
 * `counts` object covering all eight action stages, plus a `total`. Actions
 * with a missing/unknown stage land in no bucket but still count toward
 * `total` (defensive — a legal action always carries a stage).
 *
 * Counts ALL actions passed in, not a per-viewer visible subset: progress is
 * an objective property of the workflow, not a function of who is looking
 * (matches the old stored summary, which counted every action).
 *
 * @param {Array<Object>} actions — action docs, each `{ status: [{ stage }] }`.
 * @returns {{ counts: Record<string, number>, total: number }}
 */
const STAGES = [
  "done",
  "in-review",
  "changes-required",
  "error",
  "in-progress",
  "action-required",
  "blocked",
  "not-required",
];

function summarizeStatuses(actions) {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  const list = actions ?? [];
  for (const action of list) {
    const stage = action?.status?.[0]?.stage;
    if (Object.prototype.hasOwnProperty.call(counts, stage)) {
      counts[stage] += 1;
    }
  }
  return { counts, total: list.length };
}

export default summarizeStatuses;
