# Task 14: Wire `dispatchLogEvent` to render + update default event templates

## Context

`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js:106-122` is the single entry point for engine-written events. It assembles the event payload (engine default + runtime `comment` + pre-hook `event_overrides`) and calls `context.callApi('new-event', module: 'events')`. Today there's no render pass — operator-literal values in `display` ship through unrendered and land in Mongo as literal objects, which `EventsTimeline.js:225` then renders as empty or `[object Object]`.

This task wires `renderEventDisplay` (Task 13) into `dispatchLogEvent` before the `callApi` call, and rewrites the engine-default templates from any `_nunjucks: { template, on }` operator-literal shape to **plain Nunjucks template strings** matching the `event_display` idiom.

The render context for `renderEventDisplay` is built from locals already in scope: `context.user`, the post-write action doc (carries merged metadata), the workflow doc, `interaction`, `statusBefore`, `statusAfter`. No additional fetches.

Default-template binding rename: `{{ action_type }}` → `{{ action.type }}`. The current default title produced something like `"... marked install-step as done"` from `action_type`. The new default becomes:

```
{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}
```

Same rename applies to any other engine-default template that referenced flat-bound names removed by the new context (`status_before`, `status_after`, `interaction` survive; `action_type` does not).

## Task

1. **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js`**:
   - At the existing event-payload assembly point (lines 106-122 region), after the payload (default + comment + pre-hook overrides) is assembled but **before** `context.callApi('new-event', ...)`, call `renderEventDisplay({ eventPayload, user: context.user, action: <post-write action doc>, workflow: <workflow doc>, interaction, statusBefore, statusAfter })`. Use the rendered payload as the call argument.
   - Locate `DEFAULT_TITLE_TEMPLATE` / `DEFAULT_DETAIL_TEMPLATE` constants (or wherever `buildDefaultLogEventPayload` lives) and rewrite each from any `_nunjucks: { template, on }` operator shape to **plain Nunjucks template strings**. Rename `{{ action_type }}` to `{{ action.type }}`.

2. **Tests** — extend `dispatchLogEvent.test.js`:
   - Engine-default event template (plain Nunjucks string) renders against `{ user, action, workflow, interaction, status_before, status_after }` before reaching `new-event`. Assert the payload landing at `context.callApi('new-event', ...)` carries rendered strings, not operator literals.
   - Pre-hook `event_overrides.display.app-a.title` with a plain Nunjucks string renders against the same context.
   - `action` exposes post-write action-doc fields — assert `{{ action.key }}`, `{{ action.assignees[0].name }}`, `{{ action.metadata.physical_id }}` resolve in the rendered output.
   - `workflow` exposes workflow-only fields — assert `{{ workflow.workflow_type }}`, `{{ workflow.key }}` resolve.
   - `interaction` renders to the verb string (e.g. `submit_edit`).
   - Initial-write event (`statusBefore: null`): templates referencing `{{ status_before }}` produce empty strings.
   - Update the two existing test expectations that assert on the old rendered string (currently expect `"... marked install-step as done"` produced from `action_type`); they must assert against the new template's output produced from `action.type`.

## Acceptance Criteria

- `dispatchLogEvent` renders the event payload's `display` before calling `new-event`.
- Engine-default templates are plain Nunjucks strings; references to removed flat bindings (`action_type`) are renamed.
- All new and updated test cases pass.
- `EventsTimeline.js` continues to render correctly — the timeline block is unchanged and now receives plain strings, which is what `sanitize(title)` expects.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.js` — modify.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/dispatchLogEvent.test.js` — modify or extend.

## Notes

The events module (`modules/events/api/new-event.yaml`, `plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js`) is unchanged. The fix lives entirely on the writer side.

Coordination with Part 32: D14 of this design notes that Part 32's "`_nunjucks` evaluation — equivalence verified" section is obsoleted by this part. Once this task lands, the two edits to Part 32 listed in D14 should follow (separate work; not part of this task).
