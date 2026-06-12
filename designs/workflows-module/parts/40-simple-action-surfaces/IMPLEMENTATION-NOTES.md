# Part 40 — Implementation notes & open issues

> Written during implementation (branch `part-40-action-surfaces`, worktree off
> `workflows-module`). Records what was built, one deviation, and the blockers
> to resolve once the three in-flight designs (40, 46-followers, 22) have all
> landed. **Tasks 1–9 are implemented and committed; task 10 (e2e) is deferred
> — see "Blocker 1" and "Task 10 disposition" below.**

## Status

| Task | Summary | State |
| ---- | ------- | ----- |
| 1 | `ActionSteps.onActionClick` generic event + navigate default | ✅ committed; plugin build + 670 unit tests green |
| 2 | `EventsTimeline` converge onto the same contract | ✅ committed; build + tests green |
| 3 | shared `check-action-surface.yaml` | ✅ committed (incl. the deviation below) |
| 4 | `workflow-action-edit` thin container | ✅ committed |
| 5 | `workflow-action-review` thin container (guard → `[in-review]`) | ✅ committed |
| 6 | `workflow-action-view` thin container (+ `resolve_error`) | ✅ committed |
| 7 | standalone `check-action-modal` + manifest export | ✅ committed |
| 8 | `actions-on-entity` bundles modal; `workflows-events-timeline` `on_action_click` passthrough | ✅ committed |
| 9 | README / parent design / implementation-plan + verification | ✅ committed |
| 10 | Part 22 e2e supplements | ⏸️ **deferred to Part 22** — see disposition below |

**Build/test state after Part 40:**

- `pnpm --filter @lowdefy/modules-mongodb-plugins build` — clean.
- `pnpm test` (root) — **670 pass / 47 suites**.
- Demo `lowdefy build` — **19 errors before and after Part 40** (Part 40 adds
  zero). All 19 are the pre-existing endpoint mismatch in Blocker 1.

## Deviation from the task spec (task 3)

- **`layout.contentJustify` → `layout.justify`.** Task 3 mirrored the shipped
  pages' `signal_button_bar` layout, but `contentJustify` is a deprecated alias
  in the installed `@lowdefy/layout` (the build treats the deprecation as a
  fatal `ConfigWarning`). Changed to `justify: flex-end` — confirmed the
  supported prop name against `@lowdefy/layout/dist/layoutParamsToArea.js`.
  (Two other repo files — `components/fields/box.yaml`,
  `components/fields/section.yaml` — still use `contentJustify`, but they sit in
  the universal-fields stub that the build doesn't reach, so they don't fire the
  warning. Worth a sweep when Part 24 lands.)

Everything else matches the task specs as written; the subagent reports per
task confirm the acceptance greps (no `interaction`/`current_status`/`Selector`
on the pages, exactly two `Validate`s in the surface, `fields` on
`submit`/`progress` only, the `_build.if` guard on the timeline passthrough,
`setOpen` not the latent `method: open` bug, etc.).

## Blocker 1 — endpoint-naming mismatch (wave-wide; predates Part 40)

The check-action signal buttons (and the Part 39 form templates) call a
**non-existent endpoint**, so neither the demo build nor any submit flow can go
green until this is reconciled across the wave.

**The mismatch:**

- **Resolver** `modules/workflows/resolvers/makeWorkflowApis.js:72` emits submit
  endpoints as **`{workflow_type}-{action_type}-submit`** (e.g.
  `onboarding-qualify-submit`). `makeWorkflowApis.test.js` *asserts* ids never
  start with `update-action-`.
- **UI references** (all of them) resolve **`update-action-{action_type}`**:
  - `templates/edit.yaml.njk:230` (and view/review/error njk) —
    `_module.endpointId: { _build.string.concat: [ "update-action-", <type> ] }`.
  - `components/check-action-surface.yaml` (this part) and the originally-shipped
    `pages/workflow-action-edit.yaml` (base) —
    `_string.concat: [ {_module.id}, "/update-action-", {_state: current_action.type} ]`.
  - Part 40 design **Decisions-applied #1** (settled 2026-06-11) explicitly
    mandates the `update-action-{type}` form, so the surface matches the design
    and the shipped precedent — the design's endpoint contract is itself stale.
- **Nothing generates `update-action-{type}`** — grep across `modules/`,
  `plugins/`, `apps/demo/` finds only *references*, never a definition.

→ 19 demo build errors: `CallAPI ... references non-existent endpoint
"workflows/update-action-{qualify|send-quote|upload-po|billing-details}"`.

**Second-order problem (specific to the shared check pages):** even if the UI
adopted the resolver's `{workflow_type}-{action_type}-submit` name, the shared
check pages **cannot build it at runtime** — `GetWorkflowAction`
(`.../GetWorkflowAction/GetWorkflowAction.js`) deliberately omits
`workflow_type` ("Raw engine internals are NOT shipped: access, workflow_type,
metadata"). The surface only has the action `type` (`current_action.type`), not
the workflow type. The form templates know both at build time; the shared pages
know neither's *workflow* component at runtime.

**Resolution options (for the wave owners to decide — do not pick unilaterally):**

1. Resolver also emits an action-type-keyed alias `update-action-{type}` (works
   only if action types are unique across workflow types — they may not be).
2. `GetWorkflowAction` adds `workflow_type` to its envelope, and the surface +
   form templates build `{workflow_type}-{action_type}-submit`. Cleanest, but
   touches the engine read contract (Part 46 territory) and re-opens the design's
   Decisions-applied #1.
3. The submit endpoint becomes a single non-type-keyed endpoint that takes the
   action id and resolves type server-side. Largest change; revisits Part 38.

This sits between the **engine resolver (Part 38/46)** and the **whole UI wave
(39 shipped + 40)**, so it is explicitly out of Part 40's written scope
("Out of scope: The `update-action-{type}` endpoint / engine FSM — Part 38").
**Recommend resolving once Parts 46-followers / 22 and the resolver naming are
all on one branch.**

## Task 10 disposition — defer to Part 22

Part 40 task 10 ("Part 22 e2e supplements") overlaps the e2e suite Part 22 owns,
and Part 22 is sequenced **after 40/46** (implementation-plan row 22:
`💤 after 40/46`) and is being implemented concurrently in a sibling worktree
(`part-22-e2e-tasks-1-4`). Part 22 already plans the check-action coverage Part
40 task 10 specifies, against the **real** static shared pages and **real**
endpoints:

- **`tasks/04-cluster-check-blocked-by.md`** — the suite's coverage home for the
  static shared pages (`workflow-action-edit/-view/-review`) rendering and
  serving check actions via their real buttons; includes a `review`-verbed check
  action (the review-verb fixture task 10 also wanted).
- **`tasks/06-cluster-error-recovery.md`** — the `error → resolve_error →
  in-review → approve → done` recovery flow plus real cross-module `callApi`.

Authoring Part 40's own `check-action-surfaces.spec.js` / `check-action-modal.spec.js`
now would (a) duplicate Part 22's planned fixtures, (b) collide with the
concurrent Part 22 worktree, and (c) be unrunnable until Blocker 1 is resolved.

**Therefore task 10 is deferred.** When the wave converges, fold Part 40's
specific scenarios into the Part 22 clusters (or add as supplements there):

- (a) Mark Started (`progress`) on `schedule-followup` at `action-required` →
  `in-progress`, persists field edit without advancing (field assertion needs
  Part 24's real universal-fields renderer; `test.fixme` until then).
- (b) nullary `submit` → engine resolves `in-review` vs `done` from the `review`
  verb. Needs a review-verbed check action (Part 22 task 04 adds one;
  `schedule-followup` has no `review` verb today).
- (c) server-resolved button visibility — a `buttons.{signal}: false` button is
  **not rendered** (assert non-render, not disabled).
- (d) error recovery via `resolve_error` on the view page **and** via the modal
  (Part 22 task 06 covers the page flow).
- (e) modal open + submit from `actions-on-entity` (URL unchanged, list
  refetches) — Part 40-specific; the modal is new this part. Add to a Part 22
  cluster that renders `actions-on-entity`.
- (f) non-check (form) action in `actions-on-entity` navigates instead of
  opening the modal.
- (g) event-timeline action card opens the modal for `check`, navigates for
  others — needs a demo page wiring `workflows-events-timeline.on_action_click`.
- `allow_not_required`: hidden by default; author `allow_not_required: true` on a
  demo check action → `buttons.not_required` resolves true → signal lands
  `not-required`. (`makeWorkflowsConfig` validation + load-gate are Part 46.)

Demo config additions still needed for the above (when unblocked): a
`review`-verbed check action on `onboarding` (or reuse Part 22's
`check-blocked-by` fixture), and `allow_not_required: true` on one check action.
`schedule-followup` today is `kind: check`, `access.demo: { view, edit }`, no
`review`, no `allow_not_required`.

## Cross-cutting reminders for the convergence pass

- The two stray `contentJustify` usages in the universal-fields stub
  (`components/fields/{box,section}.yaml`) should move to `justify` when Part 24
  lands and the stub starts rendering.
- Part 33 (comment rendering) is still `_next`: `workflow-action-view` keeps its
  page-level Comments card below the surface, untouched, per task 6. Part 33
  owns the swap to the shared events-timeline `_ref`.
- Part 24 (universal-fields) is still a stub: the surface passes the contract
  vars (`kind`, `state_path: current_action.fields`, `mode`, `action_data`); the
  stub ignores them until Part 24 ships. Field-level e2e assertions depend on it.
