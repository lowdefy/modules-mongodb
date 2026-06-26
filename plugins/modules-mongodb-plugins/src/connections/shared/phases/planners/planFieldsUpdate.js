import renderStatusMap from "../../render/renderStatusMap.js";
import deepMerge from "./deepMerge.js";
import planEventDispatch from "./planEventDispatch.js";
import planChangeLog from "./planChangeLog.js";

// The three action-level metadata fields this operation owns. A key present in
// the payload `fields` bag is written ($set semantics — `null` clears); a key
// absent leaves the stored value unchanged. Any other key in the bag is ignored
// — universal-field writes flow exclusively through this operation.
const UNIVERSAL_FIELDS = ["assignees", "due_date", "description"];

/**
 * Plan-phase planner for the `UpdateActionFields` operation (Part 24). Writes
 * the three universal fields on ONE action with NO FSM transition and NO
 * workflow doc write, then re-renders the status-map cell against the planned
 * doc so the sticky entity-page cell can't go stale (the design's "why it still
 * goes through the engine" invariant — D12 spreads `assignees` / `due_date`
 * into the cell render context).
 *
 * Pure: no I/O, no id/clock minting — `event_id`, `now` (`{ timestamp, user }`),
 * `connection`, `user`, and `lowdefyContext` are injected via `context` (minted
 * once per handler invocation by `createEngineContext`).
 *
 * Contract differences from `planActionTransition`:
 *   - No signal resolution / status change — the `status` array and stage are
 *     identical before/after (metadata edit, not a transition).
 *   - No engine-link recompute (`computeEngineLinks`) — stage and access are
 *     unchanged, so per-verb links are unchanged.
 *   - `Plan.workflow` is `null` (Part 38 task 3 / D15): summary/groups/form_data
 *     are unaffected by action metadata, so no workflow doc is written and there
 *     is no CAS gate — per-action concurrency is last-write-wins.
 *   - No `trackerFires` / `completedGroups` — this is not a transition.
 *
 * The optional `comment` rides the `planEventDispatch` `comment` param; Part
 * 33's `foldCommentIntoEvent` (single call site, inside that planner) renders
 * it into `display.{app_name}.description`. This planner never writes
 * `metadata.comment` (Part 33 D2).
 *
 * @param {Object} args
 * @param {import('../types.js').LoadedState} args.loadedState — verb-mode load
 *   (`{ actionId, verb: 'edit' }`); carries `workflow`, `targetAction`,
 *   `actionConfig`.
 * @param {{ assignees?, due_date?, description? }} [args.fields] — the universal
 *   fields to write ($set semantics; only the three universal keys are honoured).
 * @param {{ text: string, html: string } | null} [args.comment] — optional
 *   comment, passed through to the event planner (Part 33 renders it).
 * @param {Object} [args.metadata] — optional metadata bag merged onto the doc
 *   (the v1 endpoint sends none — normally a no-op merge).
 * @param {Object} args.context — engine context (`event_id`, `now`,
 *   `connection`, `user`, `lowdefyContext`).
 * @returns {import('../types.js').Plan} — `{ workflow: null, actions, event, changeLog }`.
 */
function planFieldsUpdate({ loadedState, fields, comment, metadata, context }) {
  const { workflow, targetAction, actionConfig } = loadedState;
  const { event_id, now, connection, user } = context;

  // ── Planned action doc — $set the three universal fields onto the loaded doc ─
  const fieldUpdates = {};
  for (const field of UNIVERSAL_FIELDS) {
    if (fields != null && field in fields) {
      fieldUpdates[field] = fields[field];
    }
  }

  let doc = {
    ...targetAction,
    ...fieldUpdates,
    updated: now,
    metadata: { ...(targetAction.metadata ?? {}), ...(metadata ?? {}) },
  };

  // ── Re-render the status-map cell against the planned doc ─────────────────
  // Stage is unchanged (no transition), so the cell is the current stage's.
  // deepMerge keeps prior (sticky) values for keys the cell omits.
  const currentStage = targetAction.status?.[0]?.stage;
  const cell = actionConfig.status_map?.[currentStage];
  const rendered = renderStatusMap({
    cell,
    plannedActionDoc: doc,
    mergedMetadata: doc.metadata,
  });
  doc = deepMerge(doc, rendered);

  // ── Event (action-fields-updated; engine-default only) ────────────────────
  const event = planEventDispatch({
    event_id,
    user,
    handlerType: "UpdateActionFields",
    comment,
    plannedWorkflowDoc: workflow,
    plannedActionDoc: doc,
    allTouchedActionDocs: [doc],
    connection,
  });

  // ── Change-log — one action update; no workflow entry ─────────────────────
  const changeLog = planChangeLog({
    planActions: [
      {
        doc,
        operation: "update",
        changeLog: { before: targetAction, after: doc },
      },
    ],
    planWorkflow: null,
    connection,
    lowdefyContext: context.lowdefyContext,
    timestamp: now?.timestamp,
  });

  return {
    workflow: null,
    actions: [
      {
        doc,
        operation: "update",
        changeLog: { before: targetAction, after: doc },
      },
    ],
    event,
    changeLog,
  };
}

export default planFieldsUpdate;
