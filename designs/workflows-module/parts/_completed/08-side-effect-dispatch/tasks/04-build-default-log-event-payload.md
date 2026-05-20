# Task 4: `buildDefaultLogEventPayload` pure function

## Context

This is the import seam for [Part 9](../../09-hook-invocation/design.md)'s three-layer `event_overrides` merge. The function takes a named-arg bag and returns the unkeyed `{ type, display, references, metadata }` shape that the events module's `new-event` Api accepts.

Pure: no `context`, no Mongo, no `callApi`. Lives in `dispatchLogEvent.js` alongside the wrapper that lands in [task 5](./05-dispatch-log-event.md), but the two exports are kept separate so part 9 can import `buildDefaultLogEventPayload` without dragging in the dispatcher.

The default-event shape is specified in [submit-pipeline/spec.md § Default log event](../../../../workflows-module-concept/submit-pipeline/spec.md) (post-Part-8 amendments):

- **`type`**: `action-{interaction}` — e.g. `action-submit_edit`, `action-approve`.
- **`display`**: per-app_name map `{ [appName]: { title: <nunjucks-template-string> } }`. The template is the literal Nunjucks `"{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}"`. Apps wire `display_key` (events module) and `app_name` (workflows module) to the same value so the timeline projection in [events-timeline.yaml:34-50](../../../../../modules/events/components/events-timeline.yaml) extracts the right title.
- **`references`**: `workflow_ids: [workflow_id]`, `action_ids: [action_id]`, and `<entity-ref-key>: [workflow.entity_id]` — entity-ref key derived via [task 3](./03-derive-entity-ref-key.md)'s helper.
- **`metadata`**: `action_type`, `workflow_type`, `interaction`, `current_key`, `status_before`, `status_after` (six fields).

The function does **not** generate `_id`, `date`, `created`, or `files` — those are set by the `new-event` Api routine itself, or (for `_id`) passed by the dispatcher in [task 5](./05-dispatch-log-event.md).

## Task

### 1. Create `dispatchLogEvent.js` with the pure function

Create [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js):

```js
import deriveEntityRefKey from './utils/deriveEntityRefKey.js';

const DEFAULT_TITLE_TEMPLATE =
  '{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}';

/**
 * Assemble the default log-event payload.
 *
 * Pure function — no context, no I/O. Returns the unkeyed
 * `{ type, display, references, metadata }` shape per
 * designs/workflows-module-concept/submit-pipeline/spec.md § Default log event.
 *
 * Part 9 imports this as the bottom layer of its three-layer event_overrides
 * merge (engine default < YAML override < pre-hook override).
 *
 * @param {object} args
 * @param {object} args.workflow         - context.workflow (has _id, workflow_type, entity_id, entity_collection)
 * @param {object} args.action           - context.action (has _id, type, key)
 * @param {object} args.actionConfig     - context.actionConfig (kind, access, etc.)
 * @param {string} args.interaction      - one of submit_edit | not_required | resolve_error | approve | request_changes
 * @param {string|null} args.current_key - per-submit key or null for non-keyed
 * @param {string|null} args.status_before - pre-step-4 action.status[0].stage
 * @param {string} args.status_after     - engine-resolved targetStatus
 * @param {string} args.appName - connection.app_name (required; throws if missing)
 * @returns {{ type: string, display: object, references: object, metadata: object }}
 */
export function buildDefaultLogEventPayload({
  workflow,
  action,
  actionConfig,
  interaction,
  current_key,
  status_before,
  status_after,
  appName,
}) {
  if (typeof appName !== 'string' || appName.length === 0) {
    throw new Error(
      'buildDefaultLogEventPayload: appName is required (read from connection.app_name). ' +
        'Apps must wire app_name on the workflows module entry — see designs/workflows-module/parts/08-side-effect-dispatch/design.md § app_name plumbing.',
    );
  }
  const refKey = deriveEntityRefKey(workflow.entity_collection);

  return {
    type: `action-${interaction}`,
    display: {
      [appName]: {
        title: {
          _nunjucks: {
            template: DEFAULT_TITLE_TEMPLATE,
            on: { user: true, action_type: true, status_after: true },
          },
        },
      },
    },
    references: {
      workflow_ids: [workflow._id],
      action_ids: [action._id],
      [refKey]: [workflow.entity_id],
    },
    metadata: {
      action_type: action.type,
      workflow_type: workflow.workflow_type,
      interaction,
      current_key: current_key ?? null,
      status_before: status_before ?? null,
      status_after,
    },
  };
}
```

### 2. Colocated tests

Create [dispatchLogEvent.test.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js). Test the pure function with no Mongo and no callApi. Coverage:

- **Type prefix** — for each of the five interactions (`submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`), the returned `type` equals `action-{interaction}`.
- **Display keying** — passing `appName: 'demo'` produces `display: { demo: { title: { _nunjucks: ... } } }`. Passing no `appName` (undefined or empty string) throws with a message pointing at the design's `§ app_name plumbing` rationale.
- **Display template** — the Nunjucks template string equals the spec verbatim (`"{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}"`).
- **References** — given `workflow: { _id: 'W1', entity_id: 'L1', entity_collection: 'leads-collection' }`, `action: { _id: 'A1' }`, `references` equals `{ workflow_ids: ['W1'], action_ids: ['A1'], leads_ids: ['L1'] }`. Also test `tickets-collection` → `tickets_ids`.
- **Metadata** — all six fields present; `current_key` and `status_before` default to `null` when undefined; `status_after` is required (passing `undefined` produces `metadata.status_after: undefined`, which Jest catches with a typed assertion).
- **Pre-step-4 capture** — `status_before` reflects the value passed in (test that passing `'action-required'` yields `metadata.status_before === 'action-required'`).

Use the table-driven style established in `utils/shouldUpdate.test.js` / `shouldCreate.test.js` for the per-interaction loop.

## Acceptance Criteria

- `dispatchLogEvent.js` exists with `buildDefaultLogEventPayload` as a **named export** (not default — part 9 imports by name).
- `dispatchLogEvent.test.js` runs under `pnpm test` with all coverage points passing.
- Function never throws on valid input; throws via `deriveEntityRefKey` if `workflow.entity_collection` is missing or non-string.
- No Mongo or callApi imports — the test file does not need `mongodb-memory-server`.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — create — with `buildDefaultLogEventPayload` named export.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js` — create — pure-function coverage.

## Notes

- The `_nunjucks` operator's `on:` field declares which context keys the template needs at render time. The events module's `new-event` Api inserts the doc with the `display` field unevaluated; the events-timeline component evaluates the Nunjucks template later when rendering on entity pages. So this task assembles the operator literally — it does not call `_nunjucks` itself.
- Do **not** include `_id`, `date`, `created`, `files` in the returned object. `_id` is the dispatcher's job (task 5); the others are filled by the `new-event` Api routine itself ([new-event.yaml](../../../../../modules/events/api/new-event.yaml) line 16-25).
- Do **not** import `context.callApi`, `context.eventId`, or anything else from the handler context — this function is pure and named-arg-only. The dispatcher (task 5) reads from `context` and adapts.
- `appName` is required at the runtime layer even though the schema field (task 2) is optional. Reason: a silent `'default'` fallback would produce events that render blank on any app whose `display_key !== 'default'`, surfacing only when someone notices an entity timeline missing entries. Throwing loudly is the safer failure mode. Fixture-app tests pass an explicit `app_name: 'test-app'` (see task 9).
