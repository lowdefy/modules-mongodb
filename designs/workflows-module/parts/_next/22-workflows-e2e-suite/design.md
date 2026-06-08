# Part 22 — Workflows e2e suite

**Source rationale:** [workflows-module-concept/design.md § Worked example](../../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs). **Layer:** verification + demo fixture config. **Size:** L. **Repo:** `apps/demo/e2e/workflows/`, `apps/demo/modules/workflows/workflow_config/`.

> **Rebased to the signal model (2026-06).** This part was originally written against the priority-rule + `force: true` engine. The engine moved to **signals + per-kind FSM** ([state-machine](../../../../workflows-module-concept/state-machine/design.md), implemented by [Part 38](../../_completed/38-engine-rebuild/design.md)), buttons fire signals ([Part 39](../../_completed/39-form-submit-buttons/design.md), [Part 40](../../40-simple-action-surfaces/design.md)), access is per-verb ([Part 34](../../_completed/34-action-access-model/design.md), absorbed into Part 38), and the kind/page vocabulary is `check` / `action-*` ([Part 43](../../_completed/43-rename-simple-kind-to-check/design.md)). This rebase also adds the **`test` coverage workflow**: an audit of the demo config found the curated example workflows (`onboarding` + `installation`) structurally cannot reach most FSM paths (no `error` verb, no pre-hook `actions[]` cascades, no `progress`/`not_required` exercise, no upsert spawn, no tracker recovery, no close). The two pre-existing `.skip` specs (`error-push-and-resolve.spec.js`, `transient-throw-retry.spec.js`) document exactly this: exercising those paths through the example workflow requires polluting it with magic-string test hooks. The fix is a split — the example workflows stay curated documentation; this part owns a deliberately exhaustive coverage workflow.

## Goal

Single home for end-to-end Playwright coverage of the workflows module. Every engine path that earlier parts ship — `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, `SubmitWorkflowAction` (FSM signal resolution, pre-hook cascades, upsert spawn), group state machine, side effects, hook invocation, tracker subscription, group fan-out, resolvers, page templates, entity components, operational Apis — gets exercised against demo-app fixture config. Each earlier part's verification list points here for e2e coverage; this part owns the spec authoring **and** the `test` coverage workflow the exhaustive specs drive.

The unit-test verification in each engine / resolver / UI part continues to live there. This part is the *integration* layer.

## Two fixture tiers

The demo app carries two tiers of workflow config with different jobs:

1. **Example workflows** (`onboarding` + child `installation`) — the curated, README-facing story. Realistic actions, one way to do each thing, no test hooks, no magic strings. Migrated to the signal model by [Part 38 task 20](../../_completed/38-engine-rebuild/tasks/20-demo-migration.md), which also owns the example's happy-path smoke test. Specs use the example wherever it naturally reaches the behaviour under test, so the suite doubles as live documentation.
2. **Coverage workflow** (`test` + child `test-child`) — this part's fixture. Optimized for *reachability*, not teaching: every signal, every verb (including `error`), every FSM row that the example can't reach without contortion. Admin-gated and ordered last (`display_order: 99`) so it never pollutes the example surface; the README points only at `onboarding`. Specs that need exhaustive state coverage drive the test workflow.

The split resolves the standing blocker recorded in the skipped specs: `error-push-and-resolve.spec.js` § STATUS notes that the qualify action lacks the `error` verb and that adding a magic-string pre-hook branch "keeps the existing happy path intact while exposing this code path" — i.e. test pollution of the example. The test workflow makes those hooks explicit, named controls instead.

### The `test` coverage workflow

```
apps/demo/modules/workflows/workflow_config/test/
  test.yaml             # workflow: type test, entity leads-collection, display_order 99
  control.yaml                # form action — the cascade driver (see below)
  target.yaml                 # check action — the cascade receiver
  review-loop.yaml            # form action — review + error verbs, resubmit loops
  keyed-item.yaml             # check action, key: $item_id — spawned via upsert from control
  after-keyed.yaml            # check action, blocked_by: [keyed-item] — keyed-terminality dependent
  track-child.yaml              # tracker action → test-child
  field-gallery.yaml          # form action — every component in components/fields/
  hooks/control-pre-submit.yaml
apps/demo/modules/workflows/workflow_config/test-child/
  test-child.yaml       # minimal child workflow: one check action `step`
```

Actions and what each exists to reach (vocabulary is post-Part-43: `kind: check`; shared pages `workflow-action-edit` / `workflow-action-view` / `workflow-action-review` per Part 38 task 18):

- **`control`** (form) — its `submit` pre-hook reads explicit form controls ("emit signal", "target action", "key", "upsert") and returns the matching `actions[]` entries. One action makes the **entire cascade matrix** user- and e2e-driveable: `block`, `unblock`, `activate`, `error`, `not_required`, `request_changes` against any sibling action in the test workflow, plus `{ type: keyed-item, key, signal, upsert: true }` spawns through the FSM `none` creation row. No magic strings — the test controls are the form.
- **`target`** (check) — the cascade receiver. All four verbs (`view`, `edit`, `review`, `error`) in its per-verb access map; `status_map` cells for **all eight stages**; full nullary signal button bar via the shared `action-*` pages (`submit`, `progress` "mark started", `not_required`, `approve`, `request_changes`, `resolve_error`).
- **`review-loop`** (form) — `review` + `error` verbs, `form_review:` block. Reaches: `approve`, `request_changes` → resubmit (`changes-required → submit`), resubmit-after-done (`done → submit`), `request_changes` from `done`, `error` → `resolve_error → in-review` → re-review.
- **`keyed-item`** (check, `key: $item_id`) — exists only via control's upsert spawn; birth stages exercised per the `none` row (`activate → action-required`, `block → blocked`, `request_changes → changes-required`).
- **`after-keyed`** (check, `blocked_by: [keyed-item]`) — asserts the keyed-terminality rule: unblocks only when *every* spawned `keyed-item` instance is terminal.
- **`track-child`** (tracker) → **`test-child`** — drives the `internal_mirror_child_*` rows **including recovery**: child cancel → parent `not-required`, child reactivate → parent `in-progress` (mirror signals reaching the tracker's terminal rows).
- **`field-gallery`** (form) — one field per component in `modules/workflows/components/fields/`; exercises form rendering, validation (`required`, `minItems`), `form_data` persistence, the `progress` draft-save (no validation, lands `in-progress`), and the read-only review/error render variants.

Demo wiring: `lead-view` gains an admin-gated "Start test workflow" button beside "Start onboarding", plus Cancel **and Close** buttons for the test workflow (Close has no demo surface today). Group structure stays minimal — two groups with a `blocked_by` group-id dep, enough to exercise the unblock/recompute fixpoint; `on_complete` coverage stays on the example workflow's `g1`.

Non-goals for the test workflow: it is not documentation (README ignores it); it adds no second app (cross-app coverage stays out of scope); it invents no custom engine surface — everything it exercises is shipped module behaviour.

## In scope

### Suite layout

```
apps/demo/e2e/workflows/
  fixtures.js                       # workflow-suite-specific fixtures, extends apps/demo/e2e/fixtures.js
  snaps/                            # MongoDB snap files for seed states
    onboarding-fresh/               #   - empty example workflow + entity
    onboarding-mid-flight/          #   - first action submitted, group transition pending
    onboarding-with-tracker-child/  #   - parent linked to child workflow
    test-fresh/               #   - empty test workflow + entity
  start-cancel-close.spec.js        # part 05 + 23 paths (start, cancel cascade, close sweep, lifecycle log events)
  submit-action.spec.js             # part 06 + 07 + 38 paths (FSM signal resolution, no-op safety, form_data writes, group recompute, blocked_by fixpoint, auto-complete, CAS)
  signal-cascades.spec.js           # part 38 paths via the test workflow's control action (actions[] cascades, upsert spawn, keyed terminality)
  error-recovery.spec.js            # parts 29 + 38 (error cascade → error page → resolve_error) — rewrite of the skipped error-push-and-resolve.spec.js
  transient-throw-retry.spec.js     # parts 29 + 38 D15 (transient failure / CAS conflict → toast → retry converges; no error transition) — existing skipped spec, unskipped
  side-effects.spec.js              # part 08 (log event + notifications dispatch via callApi)
  hooks.spec.js                     # part 09 + 38 (pre/post hooks, signal-manifest returns, event/form overrides)
  tracker-subscription.spec.js      # part 10 + 38 (child→parent internal_mirror_* fan-up, incl. terminal-row recovery)
  group-on-complete.spec.js         # part 11 (on_complete callApi fan-out)
  resolver-pages.spec.js            # part 12 + 34 (per-action pages emitted under each app's per-verb access map)
  resolver-apis.spec.js             # part 13 + 34 (per-action endpoints; signal→verb submit gate)
  resolver-form-builder.spec.js     # part 15 (form rendering + read-only review/error variants) — field-gallery driven
  page-templates.spec.js            # parts 16 + 39 (edit / view / review / error templates firing signals; progress draft-save; FSM-derived button visibility)
  shared-pages.spec.js              # parts 17 + 40 + 43 (action-edit / action-view / action-review, workflow-overview; nullary signal buttons, no status selector)
  entity-components.spec.js         # parts 18 + 34 (actions-on-entity per visible_verbs; per-verb action_allowed bag)
  operational-apis.spec.js          # part 19 (start / cancel / close / get-entity-workflows visible_verbs / get-workflow-overview)
```

`tracker-only-onboarding.spec.js` (live today) folds into `tracker-subscription.spec.js` / `start-cancel-close.spec.js` coverage; keep it green until those land, then retire it.

### Fixture surface

- Build on `apps/demo/e2e/fixtures.js` — the existing `ldf` and `mdb` fixtures already cover navigation, block interaction, request mocking, and MongoDB seed/snap.
- Add a `workflow` fixture (extends `mdb`) with helpers that match the engine's contract:
  - `workflow.start({ workflow_type, entity, ...overrides })` — drives `start-workflow` via the operational Api (part 19) and returns `{ workflow_id, action_ids }`.
  - `workflow.submit(action_id, { signal, fields?, form?, form_review? })` — drives the per-action endpoint (part 13). `signal` is the wire field (Part 38); there is no `interaction`, `target_status`, or `force`.
  - `workflow.cancel(workflow_id, { reason? })` / `workflow.close(workflow_id)` — drive `cancel-workflow` / `close-workflow`.
  - `workflow.assertSummary(workflow_id, expected)` / `workflow.assertGroups(workflow_id, expected)` / `workflow.assertStatus(action_id, expected)` — assertion helpers backed by direct `mdb` reads, so tests can verify engine state without depending on UI rendering.
- Reuse the `apps/demo/e2e/snaps/` snap mechanism for repeatable seed states.

### Coverage matrix (per earlier-part)

For each shipping part, the matrix below names the file and the load-bearing assertions it owns. Specs may share fixtures but each part's behaviour must be asserted somewhere in the suite. Rows for parts 5–10 assert the **post-Part-38** behaviour of those surfaces (load-plan-commit, signals); the original parts' priority-rule semantics are superseded, not tested.

| Part | Spec file | Load-bearing assertions |
| ---- | --------- | ----------------------- |
| 05 + 38 | `start-cancel-close.spec.js` | Workflow + N action docs written; `starting_actions` `{ type, status }` seeds honoured; `display_order` carried; initial `summary` correct; reference-key spread; parent linking (three fields + tracker push via `internal_mirror_child_active`); parent-link rejections (wrong kind, already linked, mismatched `tracker.workflow_type`); keyed-action YAML rejection; change-stamp threading; `workflow-started` log event (Part 38 D11). Cancel: `internal_cancel_action` swept against every open action; terminal actions untouched; `reason` propagated; `references` reserved-key merge order; `workflow-cancelled` log event. |
| 06 + 07 + 38 | `submit-action.spec.js` | FSM resolution per kind table: each signal lands the table's target stage; unlisted `(stage, signal)` no-ops silently (re-fire safety); unknown signal name rejects at handler entry; `submit` lands `in-review` vs `done` per the action-global review verb; resubmit-after-done (`done → submit`); `form` + `form_review` merge into one flat `form_data.{action_type}` bag at the correct path (keyed + non-keyed); terminal-workflow gate — `completed` workflow rejects submit unless `required_after_close: true`; `cancelled` workflow rejects ALL submits ([action-authoring/spec.md § Terminal-behaviour field](../../../../workflows-module-concept/action-authoring/spec.md)). Group transitions to `done`; mixed-type (action-type + group-id) `blocked_by` fixpoint; `completed_groups` returned; auto-complete pushes workflow to `completed`; `CancelWorkflow` `groups[]` recompute. |
| 38 | `signal-cascades.spec.js` | Driven via the `test` workflow's `control` action: each cascade signal (`block`, `unblock`, `activate`, `error`, `not_required`, `request_changes`) fired via pre-hook `actions[]` resolves against the target's FSM; cascade against a non-listening stage no-ops without failing the submit; `upsert: true` spawn creates `keyed-item` at the `none`-row birth stage (`activate` → `action-required`, `block` → `blocked`, `request_changes` → `changes-required`); same entry against an existing doc transitions it normally; missing target *without* `upsert` rejects; `after-keyed` unblocks only when **all** spawned `keyed-item` instances are terminal. |
| 29 + 38 | `error-recovery.spec.js` | Control cascades `error` onto `target` / `review-loop` → action lands `error` stage, log event + notifications fire; the `-error` page is reachable per the `error` verb in the per-verb access map; `resolve_error` recovers to `in-review`; reviewer approves → `done`. |
| 29 + 38 D15 | `transient-throw-retry.spec.js` | Mid-commit transient failure (incl. CAS `ConcurrentSubmitError`) surfaces as an API-level error toast — **no** `error` transition is written; user retries the same submit and the FSM converges to the target stage. |
| 08 | `side-effects.spec.js` | Log event written via `events.new-event`; notifications dispatched keyed on the committed `event_id` (Part 38 D9); both threaded with the submit's `event_id`. |
| 09 + 38 | `hooks.spec.js` | Pre-hook fires before plan; return treated as signal manifest — `actions[]` enters the Plan, `event_overrides` / `form_overrides` applied, `message` surfaced; **no current-action redirect** (the current action lands per the fired signal regardless of pre-hook return); thrown pre-hook rejects the submit with no status transition (Part 29 model); post-hook fires against committed state and sees fresh docs. |
| 10 + 38 | `tracker-subscription.spec.js` | Child `active` → parent `in-progress` (`internal_mirror_child_active`); child `completed` → parent `done`; child `cancelled` → parent `not-required`; same-stage refire no-ops; **terminal-row recovery** — child reactivated after parent landed `done`/`not-required` pulls the parent back to `in-progress`; recursion is per-level load-plan-commit (Part 38 D8). |
| 11 | `group-on-complete.spec.js` | `on_complete` Api fires once per group `done` transition with the declared payload; retry no-ops. |
| 12 + 34 | `resolver-pages.spec.js` | Per-action page emitted at the right path for each verb key in the app's per-verb access map (edit / view / review / error); kind/verb-incompatible combinations not emitted. |
| 13 + 34 | `resolver-apis.spec.js` | Per-action endpoint reachable; signal→verb submit gate (Part 34 D6) rejects when the caller's roles miss the signal's verb gate; payload shape matches the rebuilt `SubmitWorkflowAction` contract (`signal`, no `force` / `target_status`). |
| 15 | `resolver-form-builder.spec.js` | Driven via `field-gallery`: every `components/fields/` component renders from `form:`, validates, persists to `form_data`; review form layers `form_review:` writable below read-only `form:`; error page renders the read-only variant. |
| 16 + 39 | `page-templates.spec.js` | Edit template fires `submit` / `progress` / `not_required` signals; `progress` persists a draft without validation and lands `in-progress`; review template fires `approve` / `request_changes`; error template's `resolve_error` recovers to `in-review`; button visibility derives from the FSM source states (button shown iff its signal is coherent from the current stage). |
| 17 + 40 + 43 | `shared-pages.spec.js` | `workflow-action-edit` / `workflow-action-view` / `workflow-action-review` render against a check action without per-type pages; nullary signal buttons, **no status selector**, no `current_status` payload; workflow-overview shows summary + groups. |
| 18 + 34 | `entity-components.spec.js` | `actions-on-entity` renders actions per the user's `visible_verbs`; actions with no true verb dropped; `workflow-header` shows summary state; `action_role_check` exposes the per-verb `action_allowed` bag and templates gate on it. |
| 19 | `operational-apis.spec.js` | `start-workflow` end-to-end; `cancel-workflow` end-to-end; `get-entity-workflows` projects the four-key `visible_verbs` bag (Part 34 D12); `get-workflow-overview` returns aggregated shape; `close-workflow` end-to-end (from part 23). |
| 23 + 38 | `start-cancel-close.spec.js` | Workflow `active` → close → `completed` push; sweep skips `required_after_close: true` actions; blocked actions get swept even when `required_after_close: true`; already-`completed` close is a no-op; already-`cancelled` close rejects; tracker fan-up fires `done` on parent when child closes; `workflow-closed` log event (Part 38 D11). |

### Specs as documentation

Spec files prefer descriptive `test()` titles matching the concept-doc language (e.g. `"completing the child workflow flips the parent's tracker to done"`, `"unblock re-fire against action-required no-ops"`). A reader skimming the suite should be able to map each test back to a concept-spec section, an FSM table row, or a worked-example step.

## Out of scope / deferred

- **Performance / load tests.** Out of v1 e2e scope.
- **Cross-app verb-filter coverage.** v1 demo wires one app (`apps/demo`); cross-app coverage lands when a second app is added.
- **Migration tooling smoke tests.** Concept-level migration tooling is out of v1.
- **Unit-test backfill for grandfathered parts 3, 4, 5, 14.** Those parts shipped before the [top-level Testing conventions](../../../design.md#testing-conventions) landed; their existing posture stands. Their e2e coverage flows naturally from the engine specs that depend on them (parts 6+).
- **The example workflows' happy-path smoke test.** Owned by [Part 38 task 20](../../_completed/38-engine-rebuild/tasks/20-demo-migration.md) as the rebuild's integration capstone; this part doesn't duplicate it.

## Depends on

[Part 20a](../../_completed/20a-module-manifest-static/design.md) — manifest static exports + tracker-only demo wiring. [Part 20b](../../_completed/20b-module-manifest-dynamic/design.md) — manifest resolver-channel entries + form/check worked-example demo. **[Part 38](../../_completed/38-engine-rebuild/design.md)** — the rebuilt handlers, FSM tables, per-verb access model (Part 34 absorbed), and the migrated example workflows (task 20); the suite asserts post-38 behaviour throughout. **[Part 39](../../_completed/39-form-submit-buttons/design.md) / [Part 40](../../40-simple-action-surfaces/design.md)** — signal-firing button bars on the form templates and shared pages. **[Part 43](../../_completed/43-rename-simple-kind-to-check/design.md)** — `kind: check` + `action-*` page names; the `test` workflow config is authored in post-43 vocabulary, so land 43 first (or author it with pre-43 names and let 43's sweep rename it — sequencing decided at implementation time).

Soft dependencies on every earlier part: a spec for part N can only land once part N has shipped. Implementation order within this part: `test` config first (it's the fixture everything else drives), then `start-cancel-close.spec.js`, then `submit-action.spec.js` + `signal-cascades.spec.js`, then error/transient/hook/tracker/fan-out specs, then resolvers and UI.

## Verification

- Every part listed in the coverage matrix has at least one passing spec in this suite.
- Every **FSM table cell** (form/check + tracker tables in [state-machine](../../../../workflows-module-concept/state-machine/design.md) § FSM tables per kind) is exercised by at least one spec — transition cells land their target stage; a representative sample of empty cells assert the no-op. The `test` workflow exists to make every cell reachable; a coverage checklist in the suite README maps cells → specs.
- Both previously-skipped specs (`error-push-and-resolve` → `error-recovery.spec.js`, `transient-throw-retry.spec.js`) run unskipped and green.
- Worked-example flow from concept design.md runs end-to-end without skipped steps.
- `pnpm e2e` from `apps/demo/` runs the full suite green; CI integration matches the existing `apps/demo/e2e/` posture.
- A reviewer dropping the workflows module into a fresh app with a minimal `workflows_config` can follow `start-cancel-close.spec.js` as a usage template.

## Open questions

- **Per-part vs. coverage-matrix split.** Listed as per-part spec files above; an alternative is one spec per scenario. Lean per-part for traceability back to design parts; revisit during implementation if specs duplicate setup.
- **MongoDB driver vs. operational-Api drive.** `workflow.start` / `submit` / `cancel` / `close` helpers drive engine paths through the operational Apis (part 19). For engine assertions that don't need UI exercise, direct `mdb` reads are used. Drawing the line between "drive via Api" and "drive via direct write" lands during implementation — lean Api-drive for anything user-reachable.
- **One-shot throw injection for `transient-throw-retry.spec.js`.** Options: (a) a test-only Api endpoint wrapping the handler with a one-shot failing connection; (b) a `workflow.submit(..., { failOnce: <phase> })` fixture toggle; (c) drive a genuine CAS conflict with two concurrent submits (no injection needed — Part 38 D15 makes the conflict path deterministic to trigger). Lean (c) first since it tests a real path; fall back to injection only if the toast/retry UX needs a non-CAS failure.

## Contract to neighbours

- **Every shipping part (5–20, 23, 38–40, 43)** carries a single line in its Verification section: "End-to-end coverage lands in [part 22](design.md). This part's verification is unit-tests + handler-level integration smoke only."
- **[Part 38 task 20](../../_completed/38-engine-rebuild/tasks/20-demo-migration.md)** owns migrating the example workflows and their happy-path smoke test; exhaustive state/FSM coverage is **not** its job — it points here.
- **Part 20** strikes the "End-to-end Playwright e2e tests — recommend `/r:dev-playwright-gen` as a follow-up" out-of-scope bullet; e2e is no longer deferred from the workflows module, it has its own part.
