# Review 1

## Completeness of consumer / impact analysis

### 1. `companies/view` is an unaddressed consumer of the auto-bundled modal

The design's "Files changed" and "Impact" sections enumerate only `lead-view` (rewired) and `workflows-test/thing-view` (acceptable navigation downgrade). But there is a **third** consumer of `actions-on-entity`, and it is the one the design never mentions: the companies module sidebar.

`apps/demo/modules/companies/vars.yaml:79-87` mounts `actions-on-entity` inside `components.sidebar_slots`:

```yaml
- _ref:
    module: workflows
    component: actions-on-entity
    vars:
      entity_id: { _url_query: _id }
      entity_collection:
        _module.connectionId: { id: companies-collection, module: companies }
```

This renders on `companies/view`, and the page really has the bundled modal today — the build artifacts confirm it: `apps/demo/.lowdefy/server/build/pages/companies/view/requests/get_workflow_action.json` exists (that request is defined *only* inside `check-action-modal.yaml`). So after this change `companies/view` silently loses its in-context check modal and its check rows fall through the new `try`/`catch` to full-page navigation.

Two things the design must do:

- **Decide and document the outcome for `companies/view`** — either rewire it with a page-level modal drop (the lead-view treatment) or explicitly accept the navigation downgrade as it does for `thing-view`. Right now it's an undocumented, silent behaviour change.
- **Note that the refetch composition differs from lead-view.** `companies/view` has no `workflows-events-timeline`; its co-present surface is `activities/tile_activities` (`vars.yaml:88+`), which already has its own `on_created` refetch. So a page-level modal drop here would compose the `entity-workflows-refetch` plus (if desired) the activities-tile refetch, and `entity_collection` is the `companies-collection` connection-id operator, not a literal. This is exactly the "page owns `on_complete`" model the design argues for — but it isn't carried through to the second multi-surface page that needs it.

### 2. The "breaks no tests" claim is wrong — `onboarding-happy-path` clicks check-kind rows and expects navigation

The Impact section asserts:

> every workflows e2e (`check-blocked-by`, `form-lifecycle`) reaches the action surface by `ldf.goto(/workflows/workflow-action-…)` directly and never opens the modal through a row click.

That is true for the two `workflows-test` specs (verified: `check-blocked-by.spec.js:78-139` and `form-lifecycle.spec.js` use `ldf.goto` for every action surface, and `check-blocked-by.spec.js:12-17` explicitly defers the row-click→modal path to "Part 40's own e2e supplement"). But the design overlooked the demo's main spec, `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`, which **does** click action rows — including **check-kind** rows — on `lead-view` and `companies/view`:

| line | row clicked | kind | page | expectation after click |
|------|-------------|------|------|--------------------------|
| 213-218 | "Complete the site visit." | `check` (`site-visit.yaml`) | lead-view | `waitForURL(workflow-action-edit)` |
| 246-253 | "Schedule the follow-up call." | `check` (`schedule-followup.yaml`) | lead-view | `waitForURL(workflow-action-edit)` |
| 595-602 | "Assign an account manager." | `check` (`assign-account-manager.yaml`) | companies/view | `waitForURL(workflow-action-edit)` |
| 643-650 | "Schedule and complete the kickoff call." | `check` (`kickoff-call.yaml`) | companies/view | `waitForURL(workflow-action-edit)` |

Each click is followed by `ldf.block('status').do.select('done')` + `ldf.block('button_submit_edit')` — i.e. it drives the **full-page edit surface**, not a modal.

ActionSteps renders each actionable row as `<a href="" onClick={e => { e.preventDefault(); triggerEvent('onActionClick', { action }) }}>` (`plugins/modules-mongodb-plugins/src/blocks/ActionSteps/ActionSteps.js:210-225`) — `preventDefault` kills native navigation, so behaviour is entirely the `onActionClick` handler. For a `check` row with the modal on the page, that handler opens the modal in place and **does not navigate** — so `waitForURL(workflow-action-edit)` cannot be satisfied. In other words this spec already contradicts the modal-in-place behaviour on both pages today (the spec header at lines 124-126 admits the file "has NOT been verified against a live run", so it is plausibly red on the first check step).

Consequences for this design:

- **`companies/view`:** removing the modal there (finding #1) makes check rows navigate, which *matches* this spec — so the implicit change may actually turn the companies steps green. That's a point in favour of the change, but the design has to make the choice deliberately, not by accident.
- **`lead-view`:** the design *keeps* the modal (page-drop), so `site-visit`/`schedule-followup` clicks still open the modal in place and still contradict the spec's `waitForURL`. This design cannot land "breaking no tests" while leaving that conflict unaddressed.
- **Action required:** add `onboarding-happy-path` to the Impact analysis and reconcile it — e.g. update the spec to drive the modal on `lead-view` (open → submit in place → assert no nav) and to assert navigation on `companies/view`, or change the lead-view behaviour. The current blanket "breaks no tests" is unverified and, for the demo spec, false.

## Soundness of the chosen mechanism

### 3. The `catch` fallback fires on *any* try-chain error, not only "modal absent"

D2 and the Proposed-shape comment frame the `catch` as "Modal not on the page (open threw)". But `callActions` runs `catchActions` whenever the try chain throws for *any* reason (`Actions.js:99-103`, installed engine `0.0.0-experimental-20260611102401`). Only `open_check_action_modal` carries `messages: { error: false }`; `set_check_action_modal_action` (the preceding `SetState`) does not. So if that `SetState` throws — or if a *present* modal's `setOpen` throws for some unrelated reason — the user is still navigated away by the fallback, and in the `SetState` case an error toast also flashes (it isn't suppressed). The probability is low, but the design's stronger statement — "the `catch` reliably fires [when, and implicitly only when,] the modal is absent" — is inaccurate. Either acknowledge the `catch` is a catch-all (acceptable: navigation is a safe default for any check-row failure), or narrow it. A one-line note in D2 is enough; no code change strictly required.

### 4. Engine line citations don't match the pinned engine (mechanism itself verified correct)

The load-bearing engine facts in D2/D3 were all verified against the version the demo actually builds with — `@lowdefy/engine@0.0.0-experimental-20260611102401`:

- Array `onClick` → `{ try, catch }` mapping: `Events.js:19-20` (`initEvent`). ✓
- `catchActions` run on a try-chain throw: `Actions.js:87-148` (`callActions`). ✓
- Missing block throws: `createCallMethod` dereferences `context._internal.RootSlots.map[blockId].methods` (installed dist line 19) — `RootSlots`, exactly as the design says. ✓
- Error toast suppressed by `messages.error: false`: `Actions.js:235-238` raises the 6s error toast, and `displayMessage` (`Actions.js:260-272`) gates it with `hideExplicitly && message !== false`, so `error: false` suppresses it. ✓

So the design's reasoning is correct. The only issue is bookkeeping: the cited locations (`Events.js:38-39`, `Actions.js:107-148/232-238/250-259`, `createCallMethod.js`) come from a *different* checkout. Note the trap this hides — the `lowdefy-alpha` worktree's `createCallMethod` reads `RootAreas.map`, not `RootSlots.map`; the design happens to match the *installed* engine, but citing un-pinned line numbers is how a future reader ends up reconciling against the wrong source. Pin citations to the built engine version (or just name the symbol, not the line).
