# Task 6: Per-signal verb templates for event messages

## Context

`plugins/.../shared/phases/planners/planEventDispatch.js` composes the timeline event doc for each workflow invocation. Today it uses a single catch-all template for every action submit:

```js
const DEFAULT_TITLES = {
  'workflow-started':   '{{ user.profile.name }} started {{ workflow.workflow_type }}',
  'workflow-cancelled': '{{ user.profile.name }} cancelled {{ workflow.workflow_type }}',
  'workflow-closed':    '{{ user.profile.name }} closed {{ workflow.workflow_type }}',
  'action-event':       '{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}',
  'tracker-mirror':     'Tracker mirrored child {{ status_after }}',
};
```

This produces machine-y copy ("marked send-quote as in-review"). After task 5, the planned action doc carries `action.title` and the workflow doc carries `workflow.title`, both always present. The FSM signal is already known at dispatch — `eventType = action-${signal}` (line 137) for submits, and the tracker-mirror branch maps mirror signals. This task replaces the catch-all with a curated, signal-keyed verb map (the design supersedes Part 51 F24 / D6).

Signal sets (from `modules/workflows/resolvers/hookSignals.js`):
- `HOOK_SIGNALS`: `submit, progress, not_required, resolve_error, approve, request_changes`
- `MIRROR_SIGNALS`: `internal_mirror_child_active, internal_mirror_child_completed, internal_mirror_child_cancelled`
- `LIFECYCLE_SIGNALS`: `started, cancelled, closed`

The `submit` signal resolves to either `done` (no review) or `in-review` (has review) — the FSM's `submitTarget` cell (`fsm/tables.js:32`: `hasReview(actionConfig) ? 'in-review' : 'done'`). `status_after` is in scope in `planEventDispatch` and tells the branch apart.

Current branching (lines 122–157) assigns `titleTemplate` per handler/signal: tracker-mirror → `DEFAULT_TITLES['tracker-mirror']`; submit → `DEFAULT_TITLES['action-event']`; lifecycle → the three workflow templates.

## Task

Replace `DEFAULT_TITLES['action-event']` (and the tracker-mirror string) with a curated **`DEFAULT_SIGNAL_TITLES`** map. Keep `eventType` derivation unchanged; only change which template string is selected.

1. **Actor-driven action signals** (submit path — a real user acts), `{{ user.profile.name }} <verb> {{ action.title }}`:

   | Signal | status_after | Template |
   |---|---|---|
   | `submit` | `done` | `{{ user.profile.name }} completed {{ action.title }}` |
   | `submit` | `in-review` | `{{ user.profile.name }} submitted {{ action.title }} for review` |
   | `approve` | — | `{{ user.profile.name }} approved {{ action.title }}` |
   | `request_changes` | — | `{{ user.profile.name }} requested changes on {{ action.title }}` |
   | `progress` | — | `{{ user.profile.name }} started {{ action.title }}` |
   | `not_required` | — | `{{ user.profile.name }} marked {{ action.title }} as not required` |
   | `resolve_error` | — | `{{ user.profile.name }} resolved an error on {{ action.title }}` |

   `submit` is the only signal whose verb branches on `status_after` (`in-review` → "submitted … for review"; anything else → "completed").

2. **System-driven signals** (tracker-mirror — no human actor; do **not** reference the user):

   | Signal | Template |
   |---|---|
   | `internal_mirror_child_active` | `{{ action.title }} started` |
   | `internal_mirror_child_completed` | `{{ action.title }} completed` |
   | `internal_mirror_child_cancelled` | `{{ action.title }} cancelled` |

   These replace the old `'tracker-mirror'` catch-all in the `isTrackerMirror` branch (select by `signal`).

3. **Lifecycle signals** — update the three workflow templates to use `{{ workflow.title }}` instead of `{{ workflow.workflow_type }}`:

   - `started` → `{{ user.profile.name }} started {{ workflow.title }}`
   - `cancelled` → `{{ user.profile.name }} cancelled {{ workflow.title }}`
   - `closed` → `{{ user.profile.name }} closed {{ workflow.title }}`

4. **Fallback.** Any action signal not in the map falls to `{{ user.profile.name }} updated {{ action.title }}` — never a raw-slug string. This is purely defensive (auxiliary signals like `block`/`activate`/`unblock` and `internal_cancel_action` don't reach `planEventDispatch` — each invocation dispatches one event for its primary signal, and cascade cancels surface as the `workflow-cancelled` lifecycle event). Keep the fallback so the map need only cover the primary signals above.

Implementation: build a `DEFAULT_SIGNAL_TITLES` object keyed by signal (with a small helper or inline branch for the `submit` status_after split), and select from it in the submit and tracker-mirror branches. Leave the lifecycle branch using its (now `workflow.title`) templates. These remain **defaults only** — the existing 3-source override chain (`mergeEventOverrides`, `yamlEventOverrides`, `preHookEventOverrides`) is unchanged, so an app can still rewrite any signal's message.

## Acceptance Criteria

- Submit events render the per-signal verb copy above; `submit` correctly branches on `status_after` between "completed" and "submitted … for review".
- Tracker-mirror events render the system-driven `{{ action.title }} <state>` copy with no user attribution.
- Lifecycle events render `{{ workflow.title }}` (verified present after task 5).
- An unmapped action signal renders the `updated {{ action.title }}` fallback, never a raw slug.
- The 3-source override chain still overrides any signal's default (existing override tests still pass).
- `planEventDispatch.test.js` is extended to cover each signal's default, the submit status_after branch, the tracker-mirror map, lifecycle `workflow.title`, and the fallback. Tests pass.

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js` — modify — replace `DEFAULT_TITLES['action-event']` and the tracker-mirror string with `DEFAULT_SIGNAL_TITLES`; submit/status_after branch; fallback; lifecycle templates use `workflow.title`.
- `plugins/.../planners/planEventDispatch.test.js` — modify — add coverage for the cases above.

## Notes

- Depends on task 5: the new templates reference `{{ action.title }}` / `{{ workflow.title }}`, which are only present on the planned docs once task 5 stamps them.
- The status enum `.title` ("Action Required", etc.) remains available in the render context for an app override that wants "as {{ status_title }}" phrasing — but the engine defaults do **not** use it.
- Don't change `eventType` (`action-${signal}`, mirror type map) or the metadata block — only the title template selection.
