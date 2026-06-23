import { WorkflowEngineError } from '../../errors.js';
import mergeEventOverrides from '../../mergeEventOverrides.js';
import renderEventDisplay from '../../render/renderEventDisplay.js';

// Tracker-mirror signal → event-type suffix mapping.
const MIRROR_TYPE_MAP = {
  internal_mirror_child_active: 'action-internal-mirror-active',
  internal_mirror_child_completed: 'action-internal-mirror-completed',
  internal_mirror_child_cancelled: 'action-internal-mirror-cancelled',
};

// Engine-default lifecycle title templates (plain Nunjucks strings), composed
// over the denormalised `workflow.title` (Part 53).
const LIFECYCLE_TITLES = {
  'workflow-started':
    '{{ user.profile.name }} started {{ workflow.title }}',
  'workflow-cancelled':
    '{{ user.profile.name }} cancelled {{ workflow.title }}',
  'workflow-closed':
    '{{ user.profile.name }} closed {{ workflow.title }}',
};

// Curated per-signal verb templates for action events (Part 53; supersedes the
// part-51 F24 / D6 catch-all). The FSM signal is known at dispatch and its set
// is closed, so verbs are hand-written once over the always-present
// `{{ action.title }}` — not humanized. `submit` is the only signal whose verb
// branches on status_after ("completed" vs "submitted … for review"); the
// mirror signals are system-driven and never attribute to a user.
const DEFAULT_SIGNAL_TITLES = {
  approve: '{{ user.profile.name }} approved {{ action.title }}',
  request_changes:
    '{{ user.profile.name }} requested changes on {{ action.title }}',
  progress: '{{ user.profile.name }} started {{ action.title }}',
  not_required:
    '{{ user.profile.name }} marked {{ action.title }} as not required',
  resolve_error:
    '{{ user.profile.name }} resolved an error on {{ action.title }}',
  internal_mirror_child_active: '{{ action.title }} started',
  internal_mirror_child_completed: '{{ action.title }} completed',
  internal_mirror_child_cancelled: '{{ action.title }} cancelled',
};

// Defensive fallback for any primary action signal not in the map above.
// Auxiliary signals (block/activate/unblock, internal_cancel_action) never
// reach planEventDispatch, so this never fires in practice — but it guarantees
// a clean message instead of a raw slug if the signal set ever grows.
const ACTION_FALLBACK_TITLE =
  '{{ user.profile.name }} updated {{ action.title }}';

function resolveActionSignalTitle(signal, status_after) {
  if (signal === 'submit') {
    return status_after === 'in-review'
      ? '{{ user.profile.name }} submitted {{ action.title }} for review'
      : '{{ user.profile.name }} completed {{ action.title }}';
  }
  return DEFAULT_SIGNAL_TITLES[signal] ?? ACTION_FALLBACK_TITLE;
}

/**
 * Plan-phase event planner (design D3 / D12). Composes and renders the full
 * event doc for the per-invocation `event_id`. Exactly one event per
 * invocation — the doc's `_id` IS `event_id`, so a second entry would collide.
 *
 * Handler types and their event types:
 *   StartWorkflow    → workflow-started     (lifecycle context)
 *   SubmitWorkflow   → action-{signal}      (action context) + 3-source merge
 *   CancelWorkflow   → workflow-cancelled   (lifecycle context)
 *   CloseWorkflow    → workflow-closed      (lifecycle context)
 *   tracker-mirror   → action-internal-mirror-{state} (action context, mirror signal map)
 *
 * The tracker-mirror path uses the action-event context but with a literal
 * type mapping (not the generic `action-{signal}` template) and the raw signal
 * name bound to `signal` in both context and metadata.
 *
 * The three-source override merge (engine default → YAML override → pre-hook
 * return) fires for any handler type whenever an override slice is present.
 * Absent overrides, every path falls through to today's engine defaults.
 * Originally applied only to SubmitWorkflowAction; generalized in Part 48 to
 * serve tracker-mirror (D4) and lifecycle (D8) channels as well.
 *
 * No `metadata.comment` is written — the old `buildDefaultLogEventPayload`
 * comment fold is superseded by Part 33's `foldCommentIntoEvent` (Part 38
 * keeps the `comment` param flowing on the emitted payload via task 19; the
 * planner doesn't touch it).
 *
 * Pure: no I/O; derives everything from injected inputs.
 *
 * @param {Object} args
 * @param {string} args.event_id — per-invocation id, minted by handler (task 15).
 * @param {Object} args.user — authenticated user.
 * @param {'StartWorkflow'|'SubmitWorkflowAction'|'CancelWorkflow'|'CloseWorkflow'|'tracker-mirror'} args.handlerType
 * @param {string} args.signal — the resolved FSM signal name.
 * @param {Object} args.plannedWorkflowDoc — the whole planned post-commit
 *   workflow doc (from planWorkflowRecompute). Must carry `entity_ref_key`.
 * @param {Object} [args.plannedActionDoc] — required for action-event and
 *   tracker-mirror paths; the planned post-commit action doc.
 * @param {string|null} [args.status_before] — stage before the signal.
 * @param {string} [args.status_after] — stage after the signal.
 * @param {Object} [args.submitted_form] — pre-merged form from planFormDataMerge
 *   (Submit path; exposed in the action render context as `submitted_form`).
 * @param {Object[]} args.allTouchedActionDocs — every action doc the plan
 *   touches (submitted + auxiliary + auto-unblocked; tracker-mirror → the
 *   mirrored action; lifecycle → all initially created / terminal actions).
 *   Used to build `references.action_ids`.
 * @param {Object} args.connection — engine connection config; reads
 *   `connection.app_name` (required — throws if absent) and optionally
 *   `connection.changeLog` (for meta, unused by this planner directly).
 * @param {Object} [args.yamlEventOverrides] — the YAML override slice for this
 *   invocation: submit YAML `event_overrides[signal]`, a parent tracker action's
 *   `event_overrides[internal_mirror_child_*]` (task 5), or a workflow-level
 *   lifecycle override (task 6). When absent, engine defaults apply.
 * @param {Object} [args.preHookEventOverrides] — the pre-hook `event_overrides`
 *   return (submit path only; no pre-hook layer exists for other paths).
 * @returns {{ doc: Object }} — the fully rendered event doc.
 */
function planEventDispatch({
  event_id,
  user,
  handlerType,
  signal,
  plannedWorkflowDoc,
  plannedActionDoc,
  status_before = null,
  status_after,
  submitted_form,
  allTouchedActionDocs,
  connection,
  yamlEventOverrides,
  preHookEventOverrides,
}) {
  const appName = connection?.app_name;
  if (typeof appName !== 'string' || appName.length === 0) {
    throw new WorkflowEngineError(
      'planEventDispatch: connection.app_name is required — apps must wire app_name on the workflows module entry.',
      { code: 'missing_app_name' },
    );
  }

  const workflow = plannedWorkflowDoc;
  const refKey = workflow.entity_ref_key;
  if (typeof refKey !== 'string' || refKey.length === 0) {
    throw new WorkflowEngineError(
      'planEventDispatch: workflow.entity_ref_key is required — the workflow config must declare entity_ref_key (e.g. "lead_ids").',
      { code: 'missing_entity_ref_key' },
    );
  }

  // ── Determine event type and render-context branch ──────────────────────
  const isTrackerMirror = handlerType === 'tracker-mirror';
  const isSubmit = handlerType === 'SubmitWorkflowAction';
  const isLifecycle =
    handlerType === 'StartWorkflow' ||
    handlerType === 'CancelWorkflow' ||
    handlerType === 'CloseWorkflow';

  let eventType;
  let isActionEvent;
  let titleTemplate;

  if (isTrackerMirror) {
    eventType = MIRROR_TYPE_MAP[signal];
    if (!eventType) {
      throw new WorkflowEngineError(
        `planEventDispatch: unknown tracker-mirror signal "${signal}".`,
        { code: 'unknown_signal' },
      );
    }
    isActionEvent = true;
    titleTemplate = resolveActionSignalTitle(signal, status_after);
  } else if (isSubmit) {
    eventType = `action-${signal}`;
    isActionEvent = true;
    titleTemplate = resolveActionSignalTitle(signal, status_after);
  } else if (handlerType === 'StartWorkflow') {
    eventType = 'workflow-started';
    isActionEvent = false;
    titleTemplate = LIFECYCLE_TITLES['workflow-started'];
  } else if (handlerType === 'CancelWorkflow') {
    eventType = 'workflow-cancelled';
    isActionEvent = false;
    titleTemplate = LIFECYCLE_TITLES['workflow-cancelled'];
  } else if (handlerType === 'CloseWorkflow') {
    eventType = 'workflow-closed';
    isActionEvent = false;
    titleTemplate = LIFECYCLE_TITLES['workflow-closed'];
  } else {
    throw new WorkflowEngineError(
      `planEventDispatch: unknown handlerType "${handlerType}".`,
      { code: 'unknown_handler_type' },
    );
  }

  // ── Build render context ─────────────────────────────────────────────────
  let ctx;
  if (isActionEvent) {
    ctx = {
      user,
      action: plannedActionDoc,
      workflow,
      signal,
      status_before: status_before ?? null,
      status_after,
      submitted_form: submitted_form ?? {},
    };
  } else {
    // Lifecycle: no single target action
    ctx = {
      user,
      workflow,
      signal,
    };
  }

  // ── Build engine-default display payload ─────────────────────────────────
  const defaultDisplay = {
    [appName]: {
      title: titleTemplate,
    },
  };

  const defaultPayload = {
    type: eventType,
    display: defaultDisplay,
    references: {
      workflow_ids: [workflow._id],
      action_ids: (allTouchedActionDocs ?? []).map((a) => a._id),
      [refKey]: [workflow.entity_id],
    },
    metadata: buildMetadata({ isActionEvent, plannedActionDoc, signal, status_before, status_after, workflow }),
  };

  // ── Apply override layers (any path that supplies an override slice) ────────
  let mergedPayload = defaultPayload;
  if (yamlEventOverrides || preHookEventOverrides) {
    mergedPayload = mergeEventOverrides({
      defaultPayload,
      yamlOverride: yamlEventOverrides,
      preHookOverride: preHookEventOverrides,
    });
  }

  // ── Render the display tree (plain Nunjucks strings → resolved strings) ──
  const renderedDisplay = renderEventDisplay({
    display: mergedPayload.display,
    ctx,
  });

  const doc = {
    _id: event_id,
    type: mergedPayload.type,
    display: renderedDisplay,
    references: mergedPayload.references,
    metadata: mergedPayload.metadata,
  };

  return { doc };
}

/**
 * Build the per-type `metadata` block.
 * Action events (incl. tracker-mirror): { action_type, workflow_type, signal, current_key, status_before, status_after }
 * Lifecycle events: { workflow_type, signal }
 * No metadata.comment — superseded by Part 33's foldCommentIntoEvent.
 */
function buildMetadata({ isActionEvent, plannedActionDoc, signal, status_before, status_after, workflow }) {
  if (isActionEvent) {
    return {
      action_type: plannedActionDoc?.type ?? null,
      workflow_type: workflow.workflow_type,
      signal,
      current_key: plannedActionDoc?.key ?? null,
      status_before: status_before ?? null,
      status_after,
    };
  }
  return {
    workflow_type: workflow.workflow_type,
    signal,
  };
}

export default planEventDispatch;
