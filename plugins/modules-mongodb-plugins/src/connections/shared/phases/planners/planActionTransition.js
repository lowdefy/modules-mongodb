import { WorkflowEngineError } from '../../errors.js';
import resolveSignal from '../../fsm/resolveSignal.js';
import computeEngineLinks from '../../render/computeEngineLinks.js';
import renderStatusMap from '../../render/renderStatusMap.js';
import deepMerge from './deepMerge.js';

/**
 * Plan-phase action planner (design D4 / D12 / D13). Given an action and a
 * signal, returns the planned post-commit action doc + its raw change-log
 * delta — one entry of `Plan.actions[]` (see `../types.js`). Pure: no I/O, no
 * id/clock minting — `event_id`, `now`, and `newId` are injected once per
 * handler invocation (task 15) and threaded in.
 *
 * Replaces `shared/createAction.js` (insert path), `shared/updateAction.js`
 * (update path), and the `handleSubmit` upsert branch (`utils/shouldCreate.js`
 * — the upsert-vs-update split folds into operation selection here).
 *
 * Null-resolution policy (D13 (3)): a `(stage, signal)` pair with no FSM entry
 * throws for the user-driven current-action signal (`source: 'user'` — the
 * user clicked a button that shouldn't have been available) and silently
 * no-ops (returns `null`) for pre-hook auxiliary and engine cascade signals
 * (FSM structural safety).
 *
 * Upsert spawn (D13 (2) / state-machine.md `none` row): a missing target
 * (`action` absent) with `upsert: true` is planned as `operation: 'insert'` —
 * the signal resolves against a pseudo-action at stage `none`, and the new doc
 * is seeded at the resolved birth stage. A missing target without `upsert`
 * throws (programming error).
 *
 * `seedStage` mode (task 23; consumed by task 17's Start): an optional input,
 * mutually exclusive with `signal`, insert-only (no `action`; bypasses the
 * `upsert` gate, which guards the signal path only). Skips `resolveSignal` —
 * the declared stage IS the target stage — and runs every downstream step
 * unchanged. This is how Start's direct-seeded drafts (`starting_actions` /
 * payload `actions:`) get the full composition without an FSM transition;
 * creation at workflow start is not a transition (Part 45 review 1 #2). The
 * planner stays generic — legal-seed enforcement (`action-required` |
 * `blocked`) is Start's, not here.
 *
 * Q3 sticky display: a slug removed from `access` keeps its stale
 * `<slug>.message` / `<slug>.links` on the doc — no cleanup; display surfaces
 * don't project departed slugs.
 *
 * @param {Object} args
 * @param {Object} [args.action] — loaded (or already-planned) action doc;
 *   absent when the target `(type, key)` matched no doc.
 * @param {string} [args.signal] — required unless `seedStage` is given.
 * @param {string} [args.seedStage] — direct-seed target stage; mutually
 *   exclusive with `signal`, insert-only (both violations throw
 *   `invalid_seed`).
 * @param {'user' | 'auxiliary' | 'cascade'} [args.source] — signal source,
 *   discriminates throw-vs-noop on null FSM resolution. Default `'user'`.
 * @param {{ fields?: Object, metadata?: Object }} [args.payload] — generic
 *   bags; `fields` is a kind-agnostic verbatim passthrough (today's
 *   `updateAction` `...fields` spread — no named universal fields; Part 24
 *   layers a kind-based rule later).
 * @param {Object} args.actionConfig — workflowConfig.actions entry.
 * @param {Object} args.loadedWorkflow — the loaded workflow doc (NOT the
 *   recomputed one — that doesn't exist yet). Reads only the immutable
 *   `workflow_type`, plus `_id` / `entity_id` / `entity_collection` for
 *   inserts. In seed mode the caller passes its planned workflow INSERT doc
 *   instead — Start has no loaded doc; the immutable-fields constraint holds
 *   because Start mints them before any draft is seeded (task 17).
 * @param {string} args.entry_id — module entry id for engine link scoping.
 * @param {boolean} [args.upsert] — spawn flag for a missing target.
 * @param {string | null} [args.key] — key for a spawned doc.
 * @param {string} args.event_id — per-invocation event id (status[] entries).
 * @param {{ timestamp: Date, user: Object }} args.now — per-invocation change
 *   stamp; written to status[].created and to the doc's `updated` on both
 *   operations, plus `created` for inserts.
 * @param {() => string} [args.newId] — injected id source for insert `_id`s.
 * @returns {{ doc: Object, operation: 'insert' | 'update',
 *   changeLog: { before: Object | null, after: Object } } | null}
 */
function planActionTransition({
  action,
  signal,
  seedStage,
  source = 'user',
  payload = {},
  actionConfig,
  loadedWorkflow,
  entry_id,
  upsert = false,
  key = null,
  event_id,
  now,
  newId,
}) {
  if (seedStage != null) {
    if (signal != null) {
      throw new WorkflowEngineError(
        `seedStage "${seedStage}" and signal "${signal}" are mutually exclusive — a direct seed is not an FSM transition.`,
        { code: 'invalid_seed' },
      );
    }
    if (action != null) {
      throw new WorkflowEngineError(
        `seedStage "${seedStage}" is insert-only but a loaded action doc was passed (action type "${actionConfig?.type}").`,
        { code: 'invalid_seed' },
      );
    }
  }

  const operation = action == null ? 'insert' : 'update';

  if (seedStage == null && action == null && upsert !== true) {
    throw new WorkflowEngineError(
      `Signal "${signal}" targets action type "${actionConfig?.type}" (key: ${JSON.stringify(
        key,
      )}) but no matching action doc exists and the entry does not carry upsert: true.`,
      { code: 'missing_target' },
    );
  }

  let targetStage;
  if (seedStage != null) {
    // Direct seed: the declared stage IS the target — no FSM resolution.
    targetStage = seedStage;
  } else {
    // Upsert spawn resolves against a pseudo-action at the FSM `none` creation
    // row; the birth stage comes from the signal, not a status seed.
    const resolutionTarget =
      action ?? { kind: actionConfig.kind, status: [{ stage: 'none' }] };
    targetStage = resolveSignal({ action: resolutionTarget, signal, actionConfig });

    if (targetStage == null) {
      if (source === 'user') {
        throw new WorkflowEngineError(
          `Signal "${signal}" is not allowed from stage "${resolutionTarget.status?.[0]?.stage}" for kind "${resolutionTarget.kind}".`,
          { code: 'signal_not_allowed' },
        );
      }
      return null; // auxiliary/cascade no-op — FSM structural safety
    }
  }

  const statusEntry = { stage: targetStage, event_id, created: now };

  let doc;
  if (operation === 'insert') {
    // Full draft: createAction.js fields + the new denormalised fields below.
    doc = {
      _id: newId(),
      workflow_id: loadedWorkflow._id,
      type: actionConfig.type,
      kind: actionConfig.kind,
      key,
      action_group: actionConfig.action_group ?? null,
      status: [statusEntry],
      entity_id: loadedWorkflow.entity_id,
      entity_collection: loadedWorkflow.entity_collection,
      assignees: [],
      due_date: null,
      description: null,
      tracker:
        actionConfig.kind === 'tracker'
          ? { workflow_type: actionConfig.tracker.workflow_type }
          : null,
      child_workflow_id: null,
      child_entity_id: null,
      child_entity_collection: null,
      created: now,
      updated: now,
      ...payload.fields,
      metadata: { ...(payload.metadata ?? {}) },
    };
  } else {
    doc = {
      ...action,
      status: [statusEntry, ...action.status],
      updated: now,
      ...payload.fields,
      metadata: { ...(action.metadata ?? {}), ...(payload.metadata ?? {}) },
    };
  }

  // Persisted denormalisation (Part 34 / Part 30 salvage): `access` and
  // `workflow_type` are written onto the doc — visible_verbs_filter.yaml
  // resolves verbs off the persisted access, and computeEngineLinks reads
  // both off the composed doc, never a synthesized view.
  doc.access = actionConfig.access;
  doc.workflow_type = loadedWorkflow.workflow_type;

  // Render the status_map cell against the planned (post-commit) doc and
  // deep-merge it on — omitted keys keep prior (sticky) values.
  const cell = actionConfig.status_map?.[targetStage];
  const rendered = renderStatusMap({
    cell,
    plannedActionDoc: doc,
    mergedMetadata: doc.metadata,
  });
  doc = deepMerge(doc, rendered);

  // Per-verb engine links for built-in kinds, read off the composed doc.
  const linksMap = computeEngineLinks({ action: doc, entry_id });
  for (const [slug, links] of Object.entries(linksMap)) {
    doc[slug] = { ...doc[slug], links };
  }

  return {
    doc,
    operation,
    changeLog: { before: action ?? null, after: doc },
  };
}

export default planActionTransition;
