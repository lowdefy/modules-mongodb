# Check-action modal: page ownership + graceful click fallback

Submitting a check action from the in-context modal leaves co-present surfaces stale — on the lead view, the action steps refresh but the activity timeline keeps showing the events from before the submit. The cause is that the modal's post-submit refetch is baked in by whichever component _drops_ the modal, and that component cannot see the other surfaces on the page. This design moves the modal drop (and its refetch wiring) up to the page — the only scope that sees every surface — and makes the shared click handler degrade gracefully when no modal is present, so the surfaces work standalone.

## Proposed change

1. **The page drops `check-action-modal` once and owns its `on_complete`.** The page is the only scope that knows the full set of surfaces to refresh after a submit, so it composes the refetch list.
2. **Remove modal-dropping from the surface components.** `actions-on-entity` no longer auto-bundles the modal; `workflows-events-timeline` drops its `include_modal` flag, its `on_action_complete` var, and the `_build.if` bundling. There is now exactly one way to put the modal on a page: the page drops it.
3. **The shared click handler degrades with `try`/`catch`.** A `check`-kind card tries to open the modal; if the modal is not on the page the `CallMethod` throws and the `catch` navigates to the action's server-resolved `action.link` page instead. Surfaces no longer assume the modal exists.
4. **Suppress the modal-absent error toast.** The `CallMethod` that opens the modal carries `messages: { error: false }` so the recovered-via-`catch` path is silent.
5. **`check-action-modal` and `entity-workflows-refetch` become page-composable.** Both are already in the manifest `components:` registry (so `_ref`-able cross-module today); the `exports.components` docs are updated to describe the page-drop contract.
6. **Wire the demo `lead-view`.** Drop the modal once, with `on_complete = [entity-workflows-refetch, Request get_events_timeline]` so both the action steps and the activity timeline refresh on submit.
7. **Wire the demo `companies/view`.** It is the second multi-surface consumer (the workflows sidebar's `actions-on-entity` alongside an activities tile). Drop the modal once in the companies sidebar composition, with `on_complete = [entity-workflows-refetch]` — the same page-owns-`on_complete` model, but a different surface set (see D1).

## Current state

The in-context check-action modal is a single `Modal` block with a fixed, global blockId `check_action_modal` (`modules/workflows/components/check-action-modal.yaml`). It wraps the shared check-action surface and exposes one var, `on_complete` — the action sequence run after a successful signal (the surface's signal buttons end with `_build.array.concat: [[CallAPI …], on_complete]`).

Two surfaces can open it, both via the shared click handler `components/check-action-click.yaml` (baked into each surface's `onActionClick`, no consumer wiring — Part 51 F22):

- **`actions-on-entity`** — renders an entity's workflows as `ActionSteps`. It also _drops_ the modal, hardcoding `on_complete` = `entity-workflows-refetch.yaml` (a `CallAPI` to `get-entity-workflows` + `SetState entity_workflows`).
- **`workflows-events-timeline`** — renders the `EventsTimeline`. It can _optionally_ drop the modal via an `include_modal` flag (default false), hardcoding `on_complete` = `[Request get_events_timeline, …on_action_complete]`.

The governing rule (Part 40): _the modal is dropped exactly once per page, and `actions-on-entity` is what drops it when present._ On a page with both surfaces — the canonical entity page, e.g. `apps/demo/pages/leads/lead-view.yaml` — `actions-on-entity` wins and bakes in only its own entity-workflows refetch. The timeline's `get_events_timeline` request is never re-run, so after a modal submit the timeline shows stale events. This is the reported bug.

Two structural problems underlie it:

- **The refetch is wired at the wrong scope.** `on_complete` is fixed when the modal is dropped, by a single surface component that is structurally blind to its siblings. The page is the only scope that sees all surfaces, but it does not own `on_complete`.
- **The click handler assumes the modal exists.** `check-action-click.yaml` unconditionally runs `CallMethod { blockId: check_action_modal, method: setOpen }` for `check` cards. `createCallMethod` reads `RootSlots.map[blockId].methods[method]`; if the block is absent, `map[blockId]` is `undefined` and `.methods` throws. So a surface on a page without the modal (a timeline-only page with `include_modal: false`) errors on a check-row click today.

## Key decisions

### D1 — The page owns the modal drop and its `on_complete`

The refetch-after-submit must refresh every surface on the page. Only the page composes the full surface set, so the page must own `on_complete`. The page drops `check-action-modal` once and passes:

```yaml
on_complete:
  _build.array.concat:
    # refresh the action steps (actions-on-entity's surface)
    - _ref:
        module: workflows
        component: entity-workflows-refetch
        vars:
          entity_id: { _url_query: _id }
          entity_collection: leads-collection
    # refresh the activity timeline (workflows-events-timeline's surface)
    - - id: refetch_events_timeline
        type: Request
        params: get_events_timeline
```

`on_complete` is composed from each surface's _own_ refetch primitive, so no surface internals leak to the page:

- **Action steps** → the `entity-workflows-refetch` component (the same sequence `actions-on-entity` used internally). It encapsulates the `CallAPI` + `SetState entity_workflows`; the page passes only `entity_id` / `entity_collection`, which it already passes to `actions-on-entity`.
- **Timeline** → re-run the page-scoped request `get_events_timeline` by id (a `Request` action). The request is defined by `workflows-events-timeline`; Lowdefy resolves requests at page scope by id, so any block on the page can re-run it.

The model generalises to any surface set. `companies/view` is the second multi-surface page, and it composes a _different_ `on_complete`: its co-present surface is the activities tile (`tile_activities`), not a timeline. A check-action submit changes workflow state, not activities, so the activities tile is left out of `on_complete` (it keeps its own `on_created` refetch for activity creation). `companies/view` therefore drops the modal with `on_complete = [entity-workflows-refetch]` only, and passes `entity_collection` as the `companies-collection` connectionId operator (not a literal). This is the same page-owns-`on_complete` rule producing a page-appropriate refetch list — the point of moving ownership to the page.

**Rejected — thread an `on_action_complete` var down into `actions-on-entity`** (keep it as the dropper, page passes only the timeline refetch). This works and touches fewer files, but keeps the fragile "who drops it" rule, keeps `include_modal` on the timeline as a parallel mechanism, and still requires per-page wiring for the multi-surface case — so the auto-bundle's "free, no per-app wiring" promise is unmet exactly where it matters. Page ownership removes the rule and the second mechanism instead of adding a third var.

### D2 — `try`/`catch` for modal presence, not a flag

Once the page (not a surface) drops the modal, a surface can no longer assume the modal is present. Rather than thread a "modal present" boolean to every surface, the shared click handler detects presence at runtime: it _tries_ to open the modal and, on failure, falls back to navigation.

Verified facts that make this sound:

- **`try`/`catch` is a first-class action-chain shape.** `initEvent` (Events.js) maps `onClick.try` → `actions` and `onClick.catch` → `catchActions`; `callActions` (Actions.js) runs the catch chain when the try chain throws. An array-valued `onClick` is just `{ try: [...], catch: [] }`.
- **A missing block throws.** `createCallMethod` dereferences `RootSlots.map[blockId].methods` — `undefined.methods` on an absent block — so the `catch` reliably fires.
- **The recovered path is silent.** On any action error the runner shows a 6s error toast _unless_ the action sets `messages.error: false` — `displayMessage` (Actions.js) gates the toast on `hideExplicitly && message !== false`. So the open-modal `CallMethod` carries `messages: { error: false }` — when the modal is absent it throws, the `catch` navigates, and no error flashes.

The `catch` is a catch-all, not a modal-absent-only handler: Lowdefy runs the catch chain on _any_ throw in the try body. In practice the only expected throw is the absent-modal `CallMethod`, since the preceding `SetState` is a static assignment that effectively cannot throw; but if some other check-row failure did occur, the catch would still navigate to the action's own page — a safe default for any check-row failure, not a wrong behaviour. (One residual: only the open-modal `CallMethod` carries `messages.error: false`, so a throw from anywhere else in the try body would still flash a toast before the fallback navigates. Acceptable — those cases are not expected to occur.)

A presence flag was the first instinct (and is viable) but is strictly more wiring: every surface would need the boolean, set correctly per page, and a page that forgot it would silently navigate where the author expected a modal. `try`/`catch` needs no per-surface state and is self-correcting.

### D3 — The fallback navigates to the action's own page

The catch path navigates to the action's server-resolved `action.link`. This is correct because a `check` action _has_ a link: `collapseLink` (`plugins/modules-mongodb-plugins/src/connections/shared/render/resolveActionAccess.js:76`) resolves the highest-priority accessible link (`edit > review > error > view`) for every kind, pointing at the canonical `workflow-action-{edit,view,review}` pages. Those pages render the _same_ check-action surface, full-page. So the modal is a true in-context shortcut layered over a working navigation path — not a hard dependency. A surface with no modal on its page is fully functional; it just navigates instead of opening in place.

The handler keeps the existing kind branch: non-`check` kinds navigate via `action.link` directly in the `try` body (skip-gated), and never touch the modal. Only the `check` branch can fall through to the `catch`.

### D4 — One mechanism, exposed for page composition

`include_modal` on the timeline was a second, parallel way to get the modal onto a page; it exists only because the timeline could be the sole surface on a page. Under page ownership that case collapses into the general rule — a timeline-only page that wants the in-context modal drops `check-action-modal` itself, exactly like the entity page. So `include_modal` and the timeline's `on_action_complete` are deleted, leaving one mechanism.

`check-action-modal` and `entity-workflows-refetch` are already entries in the manifest `components:` block (`module.lowdefy.yaml:157,163`), which is what makes a component `_ref`-able — confirmed by `actions-on-entity` (not in `exports.components`) being `_ref`'d successfully from `lead-view` today. So **no resolution change is required**; only the `exports.components` documentation is updated to describe the page-drop contract (and to drop the "bundled automatically by actions-on-entity / `include_modal`" language).

## Proposed shape

### `components/check-action-click.yaml`

```yaml
# check kind → try the in-context modal, else navigate to the action's page.
# other kinds → navigate via action.link (never touches the modal).
try:
  - id: set_check_action_modal_action
    type: SetState
    skip: { _ne: [{ _event: action.kind }, check] }
    params:
      check_action_modal:
        action_id: { _event: action._id }
  - id: open_check_action_modal
    type: CallMethod
    skip: { _ne: [{ _event: action.kind }, check] }
    # error:false → when no modal is on the page the CallMethod throws and the
    # catch navigates; suppress the would-be error toast so recovery is silent.
    messages: { error: false }
    params:
      blockId: check_action_modal
      method: setOpen
      args: [{ open: true }]
  - id: link_to_action_page
    type: Link
    skip: { _eq: [{ _event: action.kind }, check] }
    params:
      pageId: { _event: action.link.pageId }
      urlQuery: { _event: action.link.urlQuery }
catch:
  # Modal not on the page (open threw) — navigate to the action's own page.
  - id: link_to_action_page_fallback
    type: Link
    params:
      pageId: { _event: action.link.pageId }
      urlQuery: { _event: action.link.urlQuery }
```

Behaviour matrix:

| kind  | modal on page | path                                                      |
| ----- | ------------- | --------------------------------------------------------- |
| check | yes           | `set` + `open` run; `link` skipped → modal opens in place |
| check | no            | `open` throws → `catch` → navigate to `action.link`       |
| other | (either)      | `set`/`open` skipped; `link` runs → navigate; no `catch`  |

### `components/actions-on-entity.yaml`

Drop the trailing `_ref: components/check-action-modal.yaml` block. The component now only renders the per-workflow `ActionSteps` (with the baked-in click handler). Header note updated: the modal is dropped by the page, not here.

### `components/workflows-events-timeline.yaml`

Remove the `include_modal` and `on_action_complete` vars and the `_build.if` modal bundling; `blocks` becomes the plain `[empty paragraph, EventsTimeline list]`. The baked-in click handler stays.

### `apps/demo/pages/leads/lead-view.yaml`

Add a single page-level modal drop (sibling to `lead_view_row`) wiring both refetches per D1. `actions-on-entity` and `workflows-events-timeline` keep their existing vars, minus the deleted ones.

## Files changed

| File                                                          | Change                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/workflows/components/check-action-click.yaml`        | Wrap in `try`/`catch`; add `messages.error:false` on open; add navigate fallback.                                                                                                                                                  |
| `modules/workflows/components/actions-on-entity.yaml`         | Remove the bundled modal drop; update header.                                                                                                                                                                                      |
| `modules/workflows/components/workflows-events-timeline.yaml` | Remove `include_modal` + `on_action_complete` + `_build.if` bundling; update header.                                                                                                                                               |
| `modules/workflows/module.lowdefy.yaml`                       | Update `exports.components` docs for `check-action-modal` (page-drop contract) and `workflows-events-timeline` (drop `include_modal`/`on_action_complete`).                                                                        |
| `apps/demo/pages/leads/lead-view.yaml`                        | Drop `check-action-modal` once; `on_complete = [entity-workflows-refetch, Request get_events_timeline]`.                                                                                                                           |
| `apps/demo/modules/companies/vars.yaml`                       | Drop `check-action-modal` once in the workflows sidebar composition; `on_complete = [entity-workflows-refetch]` with the `companies-collection` connectionId.                                                                      |
| `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`       | Reconcile the four `check`-row steps (2 on `lead-view`, 2 on `companies/view`) to drive the modal in place — assert no navigation, submit in the modal — instead of `waitForURL(workflow-action-edit)`. Confirm via `/r:dev-test`. |
| `modules/workflows/README.md`                                 | Reflect the page-drop contract (was: auto-bundle + `include_modal`).                                                                                                                                                               |

`check-action-modal.yaml` and `entity-workflows-refetch.yaml` are unchanged (already exposed via the `components:` registry).

## Impact

- **`apps/workflows-test/pages/thing-view.yaml`** mounts `actions-on-entity` with no timeline and relies on the auto-bundled modal. After this change it drops no modal, so a check-row click navigates to the `workflow-action-edit/view/review` page (via the `try`/`catch` fallback). This is acceptable for the bare test page and breaks no `workflows-test` e2e — both of those specs (`check-blocked-by`, `form-lifecycle`) reach the action surface by `ldf.goto(/workflows/workflow-action-…)` directly and never open the modal through a row click. Optionally, `thing-view` can drop the modal to exercise the in-context path; not required. (The demo's `onboarding-happy-path` spec _does_ click check rows and is affected — see the next bullet.)
- **`apps/demo/e2e/workflows/onboarding-happy-path.spec.js`** clicks four `check`-kind rows and today asserts full-page navigation (`waitForURL(workflow-action-edit)`): `site-visit` and `schedule-followup` on `lead-view` (≈ lines 213, 246), `assign-account-manager` and `kickoff-call` on `companies/view` (≈ lines 595, 643). Because both pages keep the modal (D1 / finding #1), each row click now opens the modal in place and does **not** navigate, so all four navigation assertions would fail. The spec must be reconciled to drive the **modal in place** on these steps: click the row → assert no navigation → select status `done` in the modal → submit in the modal → assert the actions doc reaches `done` and the co-present surface refreshes. This spec is already marked unverified against a live run, so the rewrite must be confirmed via `/r:dev-test` at implementation.
- **`apps/demo/companies/view`** is the second multi-surface consumer (workflows sidebar + activities tile) and is rewired, not downgraded: it drops `check-action-modal` once in the companies sidebar composition (`apps/demo/modules/companies/vars.yaml`) with `on_complete = [entity-workflows-refetch]`, keeping the in-context modal. See D1 for why the activities tile stays out of `on_complete`.
- **`workflow-action-{edit,view,review}` pages** never used the modal (they carry their own URL-bound `get_workflow_action`); unaffected.
- **Existing apps that mounted `actions-on-entity` expecting a free modal** must now drop `check-action-modal` on the page. This is the one migration cost of moving ownership to the page; it is a single `_ref` per page and is the same wiring the canonical demo pages now model.

## Non-goals

- No change to the engine, FSM, access model, link resolution, or the check-action surface body.
- No new "refresh all page data" primitive — `on_complete` lists the specific surface refetches, composed from each surface's own refetch primitive.
- No presence flag on surfaces (D2 chooses `try`/`catch` instead).

## Related

- [Part 40 — simple/check action surfaces](../40-simple-action-surfaces/design.md) — created the modal, the surface, `actions-on-entity`, and the "dropped exactly once / `actions-on-entity` owns it" rule this design replaces.
- [Part 46 — debundle workflow config](../46-debundle-workflow-config/design.md) — created `workflows-events-timeline` + `GetEventsTimeline`.
- [Part 51 — UI fix sweep](designs/workflows-module/parts/_completed/51-ui-fix-sweep/design.md) — F22 baked the shared click handler into both surfaces and added `include_modal`; this design removes `include_modal` and completes the click handler with graceful fallback.
