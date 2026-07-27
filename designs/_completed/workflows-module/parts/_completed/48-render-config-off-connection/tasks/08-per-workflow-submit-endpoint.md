# Task 8: Per-workflow submit endpoint with `render_config` + re-keyed `hooks`

## Context

`makeWorkflowApis` (`modules/workflows/resolvers/makeWorkflowApis.js`) today emits one submit endpoint **per action** (`{type}-{action}-submit`, `emitActionEndpoint` `:57–93`) carrying two per-action properties: a flat signal-keyed `hooks` map (`emitHooks` `:18–40`) and `event_overrides` (`emitEventOverrides` `:42–55`). Part 48 collapses this to **one endpoint per workflow** — `{type}-submit` — carrying:

- **`render_config`** — keyed `workflow_type → action_type → { status_map?, event_overrides? }`, for the workflow's **own** actions **plus every ancestor's** (ancestors = transitive closure of `tracker.child_workflow_type` edges walked **upward**; the demo's `onboarding` declares a tracker tracking `company-setup`, so `company-setup`'s endpoints bundle `onboarding`'s slices too). All four write operations cascade to ancestors and render `status_map`/mirror events along the way, and within a touched parent the reach is the whole workflow (`planAutoUnblock` renders unblocked siblings), so the bundle is all actions of all ancestor workflows. Duplication of a shared ancestor's config across descendant endpoints is accepted — build artifacts are cheap; per-request evaluation is what hurts.
- **`hooks`** — a **sibling** property (not under `render_config`: hooks are build-resolved endpoint refs consumed off `params`, not Nunjucks display config), now keyed by action type: `hooks: { {action_type}: { {signal}: { pre, post } } }`. The flat shape was unambiguous only when the endpoint was scoped to one action; per-workflow, two actions with a hook on the same signal would collide.

The engine side of the hooks re-key is `handleSubmit` re-slicing `params.hooks` by the loaded action's type, **after** `loadWorkflowState` resolves `targetAction` and **before** any phase runs — the hook consumers (`invokePreHook.js:82`, `invokePostHook.js:43`, reading `params.hooks?.[signal]?.{pre|post}`) then see exactly today's signal-keyed shape, untouched. Emit and consume are paired in this task so hooks are never broken at a task boundary.

The `event_overrides` flat property disappears — its content now rides `render_config` and rejoins action configs via task 3's load seam (task 4 switched `planSubmit` to read it there).

## Task

**1. `makeWorkflowApis.js` — collapse submit emission:**

- Replace the per-action `emitActionEndpoint` loop with one `{workflow.type}-submit` endpoint per workflow that has **at least one non-tracker action** (preserving the current invariant: `:117–118` skips trackers, so an all-tracker workflow emits no submit endpoint).
- Hook **InternalApi** emission is unchanged per action (ids stay `{workflow}-{action}-{signal}-{phase}`); collect each action's signal-keyed map into the endpoint-level `hooks: { [action.type]: map }`, omitting actions with no hooks and the property entirely when empty.
- Keep the eight payload passthrough properties (`action_id`, `signal`, `current_key`, `fields`, `form`, `form_review`, `comment`, `metadata`) and the six-key `:return` verbatim.
- Drop the flat `event_overrides` property.
- Attach `render_config` (see 2). The Part 34 D10 reserved-type guard (`:109–112`) already rejects a workflow type named `workflow` before any emission — keep it (task 9 extends its rationale comment).

**2. Build the `render_config` bundle:**

- Use `collectTrackerEdges(workflows)` from `resolvers/trackerEdges.js` (task 1) to build the edge set, then compute each workflow's ancestor set by walking `parent_type → child_type` edges upward transitively (no cycle guard needed — `makeWorkflowsConfig` hard-errors on cycles at build time, task 1; depth is ~1 in practice but handle deeper chains).
- For each workflow in `{own} ∪ ancestors`, for each of its actions, emit a slice with `status_map` (raw from the workflow YAML — already validated by `makeWorkflowsConfig`) and `event_overrides` (reuse `emitEventOverrides`, **extended** to also iterate `MIRROR_SIGNALS` from `hookSignals.js` so a tracker action's `event.internal_mirror_child_*` overrides ride along — task 7 made them authorable). Omit empty slices/keys: an action with neither field contributes nothing; a workflow with no slices contributes no key.
- Shape (matching the design's example):

```yaml
render_config:
  onboarding: # own
    kyc-form:
      status_map: { action-required: { team-app: { message: ... } } }
      event_overrides: { submit: { display: { team-app: ... } } }
  onboarding-tracker: # ancestor (traced via child_workflow_type)
    install-tracker:
      event_overrides:
        internal_mirror_child_completed:
          {
            display:
              { team-app: { title: "{{ ticket }} closed by {{ agent }}" } },
          }
```

**3. `handleSubmit.js` — the re-slice (Part 47's engine change, verbatim):** after the `loadWorkflowState` call and before `invokePreHook`:

```js
// Per-workflow endpoints key hooks by action type (Part 48 D7); re-slice to
// the signal-keyed shape the hook phases consume (params.hooks[signal].{pre|post}).
params.hooks = params.hooks?.[loadedState.targetAction.type];
```

`invokePreHook`/`invokePostHook` are untouched.

**4. Tests:**

- `makeWorkflowApis.test.js`: one submit endpoint per workflow; all-tracker workflow emits none; hook InternalApi ids unchanged; `hooks` keyed by action type; `render_config` carries own + ancestor slices (build a two-level fixture: parent with a tracker action carrying a mirror override + child); no flat `event_overrides` property; mirror-signal overrides included for tracker actions; empty slices omitted.
- `SubmitWorkflowAction.test.js` / `handleSubmit` coverage: action-type-keyed `params.hooks` → the right action's hooks fire with today's signal-keyed semantics; an action with no hooks entry → hooks skipped; two actions hooked on the same signal don't collide.

## Acceptance Criteria

- Endpoint count per workflow: 1 submit (when eligible) + per-action hook InternalApis + group on-complete InternalApis (unchanged).
- The demo build (`apps/demo`) succeeds and `company-setup-submit`'s `render_config` contains both `company-setup` and `onboarding` keys (ancestor traced via `child_workflow_type`).
- `pnpm test` passes in both `modules/workflows` and `plugins/modules-mongodb-plugins`.

## Files

- `modules/workflows/resolvers/makeWorkflowApis.js` — modify — per-workflow submit endpoint, `render_config` bundle, hooks re-key, mirror-signal override emission.
- `modules/workflows/resolvers/makeWorkflowApis.test.js` — modify — rewrite submit-emission tests.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js` — modify — hooks re-slice.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/SubmitWorkflowAction.test.js` — modify — re-slice tests.

## Notes

- Client call sites still point at the old per-action ids after this task — they re-point in task 11. The demo app's submit buttons are broken between tasks 8 and 11 at runtime (they already point at stale pre-Part-38 `update-action-{type}` ids, per the design's call-site table, so this is not a regression window).
- Start/Cancel/Close stay generic until task 9 — only submit changes here.
- `render_config` values are static build output; `_module.*` operators are not needed inside it (unlike `hooks`, whose values are `_module.endpointId` refs — keep those).
