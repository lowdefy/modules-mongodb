# Part 22 — Workflows e2e suite

**Source rationale:** [workflows-module-concept/design.md § Worked example](../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs). **Layer:** integration verification + dedicated test-app fixture config. **Repo:** new `apps/workflows-test/` (app + `e2e/`), with the curated happy-path smoke staying in `apps/demo/e2e/`.

> **Rewritten 2026-06-09.** The previous version of this part was written against the priority-rule engine, then patched onto the signal model. Both are obsolete. Two facts drove a full rewrite rather than another patch:
>
> 1. **The engine is already thoroughly unit-tested.** An audit of `plugins/modules-mongodb-plugins/` found 37 jest test files covering the workflows engine. `fsm/tables.test.js` asserts **every cell** of the form (9×11) and tracker (6×7) FSM tables against the spec; `fsm/resolveSignal.test.js` covers submit-split, the action-global review rule, and `none`-row upsert spawn; the `SubmitWorkflowAction` / `StartWorkflow` / `CancelWorkflow` / `CloseWorkflow` integration tests run the real handlers against `mongodb-memory-server` and cover CAS conflict + retry, pre-hook cascades, form-data deep merge, completed-groups, per-verb gates, and post-commit durability; `planAutoUnblock.test.js` covers blocked_by fixpoint incl. keyed terminality; `runTrackerCascade.test.js` covers multi-level cascade, depth guard, and FSM no-op skip. **The old design's headline goal — "every FSM cell exercised by an e2e spec" — is already met, more rigorously, at the unit layer.** Re-deriving it through Playwright would be slower, more brittle, and prove less.
> 2. **The demo churns.** The old design crammed exhaustive coverage into `apps/demo/`, which forced a monolithic `test` workflow, a magic `control`-action test DSL, and `display_order: 99` admin-gating to hide it all from the curated example. That machinery existed only because coverage and documentation shared one app. A dedicated test app deletes the reason for all of it.
>
> This rewrite reframes the suite around what only an end-to-end test against a **built and served** app can prove, and pushes everything else to the layer that already owns it.

## Goal

Prove that the workflows module, **as built by its resolvers and served by a real Lowdefy app**, executes the engine correctly through the real UI and the real Lowdefy API surface. The engine's _logic_ is the unit layer's job and is already covered; this part owns the **integration seam** that unit tests structurally cannot reach.

## What only e2e can prove

The plugin integration tests use the real handlers + `mongodb-memory-server`, but they **mock `callApi`** and never go through the built Lowdefy server. Three things therefore have no coverage today and are this part's reason to exist:

1. **The build → wire → serve seam.** The build-time resolvers ([`makeWorkflowApis`](../_completed/13-resolver-apis/design.md), [`makeActionPages`](../_completed/12-resolver-pages/design.md)) _emit_ endpoints and pages (and the form metadata the pages consume); the module manifest _wires_ the `WorkflowAPI` connection; the host app's `vars.yaml` _feeds_ `workflows_config` / `entities` / `app_name` / `user_schema`. Nothing proves the emitted `{type}-{action}-submit` endpoint is reachable over HTTP in a running app, that the action pages render — both surfaces: the **per-action form pages** `makeActionPages` emits (one per form action × verb, id `{type}-{action}-{verb}`, from `templates/{verb}.yaml.njk`; non-form kinds are skipped) and the **static shared check pages** (`workflow-action-edit` / `-view` / `-review`, addressed by `?action_id=`, serving `kind: check`) — or that the connection is configured end-to-end.
2. **UI → engine.** A real button click → real endpoint → real engine → real Mongo → the UI reflecting the committed state. The literal production mechanism, exercised.
3. **Real cross-module `callApi`.** Timeline events actually written via `events.new-event` and notifications actually dispatched via `send-notification` — through the real endpoints, not the unit tests' `callApi` mock.

## Principles

These are the load-bearing decisions; the cluster list below is their application.

1. **Dedicated test app, not the demo.** Exhaustive coverage lives in a new `apps/workflows-test/`. The demo keeps exactly one workflows e2e: the curated happy-path smoke (`apps/demo/e2e/workflows/onboarding-happy-path.spec.js`, already green) that proves the README example runs. That spec is executable documentation and churns _with_ the demo — which is fine, because it is no longer load-bearing for coverage.
2. **Spine + thin tail, both through real Lowdefy APIs — no backdoors.**
   - **Spine:** for each behaviour, at least one full-stack path — render the real page, click the real button, the real per-action endpoint fires, Mongo mutates, assert the DB _and_ that the UI reflects it.
   - **Tail:** combinatorial/headless cases drive the **real emitted Lowdefy endpoints** (per-action submit endpoints, operational `start`/`cancel`/`close`/`get-*` APIs) over HTTP via the `workflow` fixture, asserting via `mdb` reads. No test-only endpoint, no direct engine call — the only thing skipped is the browser, never the Lowdefy API layer.
   - The tail is **not** "every FSM cell" (that's unit). It is "every surface the resolvers emit is wired and reachable in a running app."
3. **Functional-cluster fixtures — legible stories, not a surface census or an edge-case matrix.** The test app carries ~8 small workflows, each a self-contained end-to-end story for one behaviour cluster. Clusters may exercise the same kind of surface more than once; that is a feature — it proves the surface works _in context_ and the fixtures double as "here's how you configure X." What clusters do **not** do is enumerate every transition or edge permutation. One named, bounded exception: `field-gallery`'s render sweep covers the full field-component roster, because per-field renderability has no other coverage home (see the cluster table).
4. **Engine correctness is the unit/integration layer's job — and stays open.** The boundary is not a wall: per the top-level [E2E vs. unit split](../../design.md#testing-conventions), a bug that could exist in plugin JS without the runtime needs a _unit_ test. If authoring this suite surfaces such a gap, **add the jest test** rather than contorting Playwright to reach it.

## The test app

`apps/workflows-test/` is a deliberately minimal Lowdefy app whose only job is to instantiate the module's surfaces. It is allowed to be ugly and is stable by design.

- **Module wiring** mirrors the demo's contract (confirmed reusable — the module takes its entire config through `vars.yaml`): a `workflows` module entry pointing at `file:../../modules/workflows`, plus its required deps (`layout`, `events`, `notifications`).
- **One test entity.** A single `things-collection` with a bare list page and a view page — just enough for the `entities` map (`page_id`, `id_query_key`, `title`) and for entity-component specs to render. No styling polish.
- **`workflow_config/`** holds the cluster workflows below, each `_ref`'d from `workflow_config/workflows.yaml`. Authored in current vocabulary (`kind: check` / `form` / `tracker`; per-verb `access`). Note the two page surfaces the clusters split across: `kind: form` actions get **per-action pages emitted by `makeActionPages`** (`{type}-{action}-{verb}`) — the form clusters (`form-lifecycle`, `error-recovery`) assert these emitted page ids render; `kind: check` actions use the **static shared `workflow-action-*` pages** — `check-blocked-by` covers those.
- **Its own `e2e/`** dir with `playwright.config.js` (`createConfig` from `@lowdefy/e2e-utils/config`, distinct port) and `fixtures.js` extending the same `ldf` + `mdb` base as the demo.

Cost named honestly: a second app means a second full Lowdefy build + server + CI lane (~60–90s build per the demo's e2e README). Accepted — the decoupling and the elimination of the demo-pollution machinery are worth it.

## Fixture surface

Build on the existing `ldf` (`@lowdefy/e2e-utils`) and `mdb` (`@lowdefy/community-plugin-e2e-mdb`) fixtures — they already cover navigation, block interaction, request/api tracking + mocking, user sessions, and Mongo seed/snap/read. Add one `workflow` fixture (extends `mdb`) whose helpers drive the **real** Lowdefy APIs and assert via direct reads:

- `workflow.start({ workflow_type, entity, ...overrides })` → `{ workflow_id, action_ids }` — drives the operational `start-workflow` API ([part 19](../_completed/19-operational-apis/design.md)).
- `workflow.submit(action_id, { signal, fields?, form?, form_review?, comment? })` — drives the per-action `{type}-{action}-submit` endpoint ([part 13](../_completed/13-resolver-apis/design.md)). `signal` is the wire field ([part 38](../_completed/38-engine-rebuild/design.md)); there is no `interaction`, `target_status`, or `force`.
- `workflow.cancel(workflow_id, { reason? })` / `workflow.close(workflow_id)` — drive `cancel-workflow` / `close-workflow`.
- `workflow.assertSummary(workflow_id, expected)` / `workflow.assertGroups(workflow_id, expected)` / `workflow.assertStatus(action_id, expected)` — assertion helpers backed by `mdb` reads, so a spec verifies committed engine state without depending on UI rendering.
- **Seed-state + real-endpoint** is the standard tail technique: to assert a transition from a given source stage without walking there, `mdb.seed` (or a snap) places the action doc at the source stage, then fire the real signal through the real endpoint and assert the target. This keeps headless coverage fast without a backdoor.

## Cluster fixtures

Each row is one workflow in `apps/workflows-test/modules/workflows/workflow_config/` + one spec under `apps/workflows-test/e2e/workflows/`. "Spine" = full-stack UI→engine→DB; "Tail" = real-API headless. Most clusters are spine with a tail tail-end for permutations.

| Cluster fixture         | Spec                                                     | Story it tells                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Mode             |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `form-lifecycle`        | `form-lifecycle.spec.js`                                 | Form action with `review` verb: `submit` → in-review → `approve` → done; `request_changes` resubmit loop; `progress` draft-save (no validation, lands in-progress); `not_required`.                                                                                                                                                                                                                                                                                                                                                                                            | Spine            |
| `check-blocked-by`      | `check-blocked-by.spec.js`                               | Check actions with a type dep and a group-id dep; completing the blocker fires engine `unblock` and the dependent becomes action-required. Also opens the two static overview pages (`workflow-overview`, `workflow-group-overview`) against its group-structured workflow — one render assertion each.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Spine            |
| `cascade-keyed`         | `cascade-keyed.spec.js`                                  | A driver action whose `submit` pre-hook returns `actions[]` that cascade `block` / `error` / `activate` at siblings and `upsert: true`-spawns a keyed action at its `none`-row birth stage — the **production mechanism** for engine-only signals (no test DSL).                                                                                                                                                                                                                                                                                                               | Spine + Tail     |
| `error-recovery`        | `error-recovery.spec.js`                                 | Error-verb action: pre-hook cascades `error` → action lands error stage, event + notification fire; the `-error` page is reachable per the `error` verb; `resolve_error` → in-review → `approve` → done. (Revival of the old skipped `error-push-and-resolve.spec.js`.)                                                                                                                                                                                                                                                                                                        | Spine            |
| `tracker-child`         | `tracker-child.spec.js`                                  | Parent tracker + child workflow: start child → `internal_mirror_child_active` pulls parent to in-progress; child completes → parent done; child cancels → parent not-required; **terminal-row recovery** (child reactivates after parent landed terminal).                                                                                                                                                                                                                                                                                                                     | Spine + Tail     |
| `field-gallery`         | `field-render-sweep.spec.js` + `field-behaviors.spec.js` | Two specs. **Render sweep:** one fixture form using every component in `modules/workflows/components/fields/` (27); open the edit page once and assert each field renders — pure reachability, the only coverage home for a per-field config/render break (a field no fixture uses has none). The one named exception to Principle 3: a roster, not a behavior matrix. **Behaviors:** `required`/`minItems` validation, `form_data` persistence, and the read-only review/error variants on one representative per field family (text, selector, date, file, list, rich-text). | Spine (UI-heavy) |
| `operational-lifecycle` | `operational-lifecycle.spec.js`                          | `start` / `cancel` / `close` / `get-entity-workflows` / `get-workflow-overview` / `get-action-group-overview` end-to-end through the real APIs; close sweep skips `required_after_close: true`; already-completed close is a no-op; already-cancelled close rejects.                                                                                                                                                                                                                                                                                                                                         | Tail             |
| `access-verbs`          | `access-verbs.spec.js`                                   | Per-verb button and page visibility under different roles: `actions-on-entity` shows an action only for the verbs visible to the user's role, buttons a role cannot fire do not render, and a signal whose verb the role lacks is rejected at the endpoint.                                                                                                                                                                                                                                                                                                                                                       | Spine (UI)       |

Spec titles prefer concept-doc language (e.g. `"completing the child workflow flips the parent tracker to done"`) so a reader maps each test back to a state-machine row or worked-example step.

## Explicitly NOT in this suite (owned elsewhere)

To prevent the old design's duplication from creeping back, these are named as **out of e2e scope**, with their owning layer:

- **FSM cell-by-cell coverage** → `plugins/.../fsm/tables.test.js` + `resolveSignal.test.js`. E2e proves a _representative_ transition per cluster lands; it does not enumerate cells.
- **Cascade / keyed-terminality / blocked_by fixpoint / group recompute / tracker depth & no-op logic** → the plugin planner unit tests (`planAutoUnblock`, `recomputeGroups`, `deriveGroupStatus`, `planTrackerLevel`, `runTrackerCascade`). E2e proves these _fire through the wired app once_, not that the logic is exhaustive.
- **CAS conflict / retry-no-double-transition** → `SubmitWorkflowAction.test.js` + `commitPlan.test.js`. Unit-only — no e2e touch (see "Salvaged from the old design" for why the e2e revival was dropped).
- **Build-time config validation** → the resolver tests (`makeWorkflowsConfig.test.js`, `makeWorkflowApis.test.js`, etc.).
- **Unit-test gaps to backfill, not e2e.** The audit flagged candidates better served by jest: keyed terminality as an isolated phase rule, user-signal re-fire no-op safety, terminal-workflow submit gates, multi-group completion in one submit. These are **plugin unit backfill** (verify each against the existing test files first — the audit list is a lead, not gospel). Per Principle 4, add them at the unit layer.

## Salvaged from the old design

Two things from the prior version carry forward; a third was evaluated and dropped:

- **The edge-case catalogue** — keyed terminality, tracker terminal-row recovery, re-fire no-op safety, terminal-workflow submit gates, group recompute fixpoint, auto-complete. Carried here as a **unit-test reference** (above), not as e2e scope.
- **The `workflow` fixture API shape** — `start` / `submit` / `cancel` / `close` / `assert*` — adopted above.
- **The CAS-conflict touch — dropped, unit-only.** An e2e revival of the old `transient-throw-retry` intent ("two concurrent submits → one surfaces retryable `concurrent_submit`") was considered and rejected. [Part 38 D15](../_completed/38-engine-rebuild/design.md)'s determinism is about the CAS _semantics_ (the commit pins on `updated.timestamp`), not about making two HTTP requests interleave — against a single server they usually serialize, both succeed, and the conflict never fires. Nor can a conflict be forced through the real endpoint: the handler loads the pinned timestamp server-side during its own load phase (`commitPlan.js`), so a client can't submit a stale one, and any forcing seam would be a backdoor (Principle 2). The path is owned exhaustively and deterministically by `SubmitWorkflowAction.test.js` + `commitPlan.test.js` (Principle 4).

## The demo's role

The demo keeps `onboarding-happy-path.spec.js` (curated example smoke, already green) and may keep `form-submit-buttons.spec.js` if it still passes against the example. It does **not** grow exhaustive coverage, gain a `test` workflow, or carry the `control` DSL. The old `error-push-and-resolve.spec.js` and `transient-throw-retry.spec.js` skips are deleted from the demo; their intent is revived in the test app (`error-recovery`) and the unit layer (CAS) respectively.

## Out of scope / deferred

- **Performance / load tests.** Out of v1 e2e scope.
- **Cross-app verb-filter coverage.** The test app wires one `app_name`; multi-app role-union coverage lands if/when a second app context is added. (`access-verbs` covers multi-_role_ within one app.)
- **Migration tooling smoke tests.** Out of v1.
- **Engine-logic exhaustiveness.** Owned by the plugin unit/integration layer (see "Explicitly NOT").

## Depends on

The module surface this suite drives: [part 38](../_completed/38-engine-rebuild/design.md) (rebuilt handlers, FSM tables, per-verb access), [parts 39](../_completed/39-form-submit-buttons/design.md)/[40](../40-simple-action-surfaces/design.md) (signal-firing button bars), [part 43](../_completed/43-rename-simple-kind-to-check/design.md) (`kind: check` + `action-*` pages), [part 19](../_completed/19-operational-apis/design.md) (operational APIs), [parts 12](../_completed/12-resolver-pages/design.md)/[13](../_completed/13-resolver-apis/design.md)/[15](../_completed/15-resolver-form-builder/design.md) (emitted pages/apis/forms), [part 20a](../_completed/20a-module-manifest-static/design.md)/[20b](../_completed/20b-module-manifest-dynamic/design.md) (manifest). Parts 38, 39, 43, 12/13/15, 19, and 20a/20b have shipped; parts [40](../40-simple-action-surfaces/design.md), [46](../46-debundle-workflow-config/design.md), [48](../48-render-config-off-connection/design.md), and [49](../_next/49-request-changes-verb-gate/design.md) are in flight and this design is written against their target state — sequencing is tracked in [implementation-plan.md](../../implementation-plan.md).

The plugin unit/integration tests it defers to live under `plugins/modules-mongodb-plugins/src/connections/` and `modules/workflows/resolvers/`.

**Implementation order within this part:** test-app scaffold + `workflow` fixture first (the foundation everything drives), then `form-lifecycle` (the template the rest follow), then the remaining clusters in any order. `/r:design-task` fans this into one foundational task + one task per cluster.

## Verification

- `apps/workflows-test/` builds and serves; `pnpm e2e` from it runs the full cluster suite green; CI gains a lane matching the demo's e2e posture.
- Each cluster spec has at least one **full-stack spine assertion** (UI click → committed DB state → UI reflects it) — not a UI-only render check.
- Every emitted surface is proven reachable in the running app: each per-action `{type}-{action}-{verb}` form page and each static shared check page renders, each `{type}-{action}-submit` endpoint is callable and role-gated, each operational API returns its documented shape.
- Real cross-module dispatch is observed end-to-end: a submit writes a timeline event via `events.new-event` and dispatches a notification via `send-notification` (asserted via `mdb` reads), not mocked.
- The demo's `onboarding-happy-path.spec.js` stays green; no exhaustive coverage is added to the demo.
- A reviewer dropping the module into a fresh app can read `form-lifecycle` (config + spec) as a usage template.

## Open questions (mechanical — resolve at task time)

- **`form-submit-buttons.spec.js` disposition.** Keep in demo against the example, or fold its button-gating intent into the test app's `access-verbs` / `form-lifecycle`? Lean: keep in demo while green, retire if it duplicates a test-app spine assertion.
- **CI build cost.** Two app builds in CI. Acceptable per the cost note; confirm the lane reuses the demo's e2e build/start pattern.

## Contract to neighbours

- **Every part (5–20, 23, 38–40, 43)** keeps its single Verification line pointing here for end-to-end coverage; its own verification stays unit-tests + handler-level integration.
- The top-level [Testing conventions § E2E vs. unit split](../../design.md#testing-conventions) is the governing rule this part applies; this part adds no new convention, it instantiates that one.
