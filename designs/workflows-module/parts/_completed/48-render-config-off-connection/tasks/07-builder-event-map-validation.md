# Task 7: Builder validation for the new event-override authoring surfaces

## Context

Part 48 adds two authoring surfaces that `makeWorkflowsConfig` (`modules/workflows/resolvers/makeWorkflowsConfig.js`) must validate:

1. **Mirror-signal overrides on tracker actions (D4).** Authors put `event: { internal_mirror_child_*: { display: … } }` on the **parent's tracker action**. Today `validateEvent` (`:107–118`) hard-errors on any `event:` key outside `HOOK_SIGNALS` (the six user signals from `resolvers/hookSignals.js`), so mirror-signal authoring is currently impossible.
2. **Workflow-level `event` map (D8).** A new workflow-scope field keyed by lifecycle signal:

```yaml
workflow:
  type: onboarding
  event:
    started: { display: { demo: { title: "Onboarding kicked off for {{ workflow.entity_id }}" } } }
    cancelled: { display: { demo: { title: "…" } } }
    closed: { display: { demo: { title: "…" } } }
```

(Each signal's value is the per-action `event[signal]` payload-override shape — `{ type?, display: { {app}: … }?, references?, metadata? }` — see task 6's shape resolution note.)

Validation depth should match the existing `validateEvent`: it checks **signal keys only**, not the override payload internals. Don't over-validate ("build for what exists").

## Task

1. **Extend `modules/workflows/resolvers/hookSignals.js`** with two new exported constants (keeping the existing comment style about the file being the shared signal source of truth):

```js
export const MIRROR_SIGNALS = [
  'internal_mirror_child_active',
  'internal_mirror_child_completed',
  'internal_mirror_child_cancelled',
];

export const LIFECYCLE_SIGNALS = ['started', 'cancelled', 'closed'];
```

2. **`validateEvent` (per-action):** allowed `event:` keys become `HOOK_SIGNALS` for every action, **plus `MIRROR_SIGNALS` when `action.kind === 'tracker'`**. A mirror-signal key on a non-tracker action hard-errors (mirror events only ever fire against tracker actions); the error message should say so and name the allowed sets. `hooks:` validation is untouched — hooks remain user-signal-only.

3. **New `validateWorkflowEvent(workflow)`:** if `workflow.event` is present, it must be a plain object whose keys are all in `LIFECYCLE_SIGNALS`; unknown keys hard-error with the expected list (mirror the `fail()` message style of `validateEvent`). Call it from `validateWorkflow`.

4. Do **not** add `event` to `WORKFLOW_FIELDS` — the workflow-level map is delivered via the `{type}-start/cancel/close` endpoints (task 9), never via the connection blob.

5. Tests (`makeWorkflowsConfig.test.js`):
   - tracker action with `event.internal_mirror_child_completed` → passes.
   - form/check action with a mirror-signal event key → fails with the kind-restriction message.
   - tracker action with an unknown event key → still fails.
   - workflow-level `event` with `started`/`cancelled`/`closed` → passes; with an unknown key (e.g. `submit`) → fails.
   - workflow-level `event` is **not** present on the returned config blob.

## Acceptance Criteria

- All five test cases above pass; existing validation tests unchanged.
- `pnpm test` passes in `modules/workflows`.

## Files

- `modules/workflows/resolvers/hookSignals.js` — modify — `MIRROR_SIGNALS`, `LIFECYCLE_SIGNALS`.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — `validateEvent` extension + `validateWorkflowEvent`.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — new tests.

## Notes

- Task 8 (`render_config` emission) and task 9 (`lifecycle_event_override` emission) consume these constants — landing this first keeps validator and emitters in mechanical sync via the shared module, per the file's own design comment.
