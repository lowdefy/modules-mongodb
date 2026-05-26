# Task 13: Add `renderEventDisplay` helper

## Context

Engine-written events flow through `context.callApi('new-event', module: 'events')` from `dispatchLogEvent.js`. Lowdefy's payload-evaluation pass doesn't cross that boundary — operator-shaped values in the event payload's `display` field ship verbatim to `new-event`, which `_payload: display` echoes back unchanged, and `EventsTimeline.js:225` has no operator evaluator. The fix (per design D14): render the templates in the engine before `context.callApi`.

The helper uses the same `renderTree` walker (Task 1) and `parseNunjucks` helper as action display. The render context is **fixed** and built from locals already in scope inside `dispatchLogEvent`:

| Binding         | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| `user`          | `context.user` — invoking user                                                   |
| `action`        | post-write action doc — the action this event is about                           |
| `workflow`      | workflow doc — workflow-level fields not on the action                           |
| `interaction`   | `submit_edit` / `approve` / `request_changes` / `not_required` / `resolve_error` |
| `status_before` | prior stage, or `null` for the initial write                                     |
| `status_after`  | new stage                                                                        |

Important specifics from D14:
- The binding is named `action`, not the idiom's generic `target` — workflows-module nomenclature wins inside this module.
- `action` is the **post-write** doc (events describe what just happened). Different from action-display's pre-write context (D10).
- Action metadata is reachable via `action.metadata.*` — there's intentionally no top-level `metadata` binding (would collide with the event-payload `metadata` field that `dispatchLogEvent` writes onto each event doc).
- No `entity` binding. The underlying business entity is not exposed (cost + shape-varies-per-app reasons).
- Author syntax is **plain Nunjucks template strings** — no `_nunjucks: { template, on }` wrapping on the engine path.

## Task

Add `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/renderEventDisplay.js` exporting a default function:

```js
renderEventDisplay({ eventPayload, user, action, workflow, interaction, statusBefore, statusAfter }) → newEventPayload
```

Implementation:
1. Build `ctx = { user, action, workflow, interaction, status_before: statusBefore, status_after: statusAfter }`.
2. Return a new event payload identical to the input but with `display: renderTree(eventPayload.display, ctx)`. Fields outside `display` (e.g. `metadata`, `type`, `key`) are passed through unchanged — they are not templates.

Add `renderEventDisplay.test.js` covering:
- Plain Nunjucks string in `display.app-a.title` renders against `{{ user.profile.name }}`.
- Nested per-app keys (`display.app-a.title`, `display.app-b.title`) render independently.
- `action` exposes action-doc fields — assert `{{ action.key }}`, `{{ action.assignees[0].name }}`, `{{ action.metadata.physical_id }}` resolve to the post-write values.
- `workflow` exposes workflow-only fields — assert `{{ workflow.workflow_type }}`, `{{ workflow.key }}`, `{{ workflow.summary.done }}` resolve.
- `interaction` resolves to the verb string (e.g. `submit_edit`).
- `status_before: null` on initial write: a template `'{{ status_before }}'` renders to empty string (Nunjucks default-null behaviour).
- Non-string values in `display` pass through unchanged (e.g. a numeric `icon` field).
- Payload fields outside `display` are not touched.

## Acceptance Criteria

- Helper and test file exist under `src/connections/WorkflowAPI/SubmitWorkflowAction/`.
- All test cases pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/renderEventDisplay.js` — create.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/renderEventDisplay.test.js` — create.
