# Implementation Tasks — Part 22: Workflows e2e suite

## Overview

These tasks implement `designs/workflows-module/parts/22-workflows-e2e-suite/design.md`: a dedicated `apps/workflows-test/` Lowdefy app carrying ~8 functional-cluster workflow fixtures, a `workflow` Playwright fixture driving the real emitted Lowdefy APIs, one spec per cluster, demo e2e cleanup, a CI lane, and the unit-test backfill the design routes to the jest layer.

## Tasks

| #   | File                                    | Summary                                                                                               | Depends On | Status |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- | ------ |
| 1   | `01-test-app-scaffold.md`               | Create `apps/workflows-test/`: module wiring, `things` entity, empty workflow_config; builds & serves | —          | ✅ Done (`2ef8d36`) |
| 2   | `02-e2e-harness-and-workflow-fixture.md`| Playwright harness (port 3001) + `workflow` fixture driving real Lowdefy APIs + boot smoke spec       | 1          | ✅ Done (`2197fbb`) |
| 3   | `03-cluster-form-lifecycle.md`          | Template cluster: review-verb form lifecycle (submit/approve/request_changes/progress/not_required)   | 2          | ✅ Done (`2f97a7e`) |
| 4   | `04-cluster-check-blocked-by.md`        | Check actions with type dep + group-id dep; blocker completion unblocks dependents                    | 3          | ✅ Done (`0a6ec7d`) |
| 5   | `05-cluster-cascade-keyed.md`           | Pre-hook cascade `block`/`error`/`activate` at siblings + `upsert: true` keyed spawn                  | 3          | ✅ Done |
| 6   | `06-cluster-error-recovery.md`          | Error-verb path: cascade to error stage, event + notification, `-error` page, resolve → done          | 3          | ✅ Done |
| 7   | `07-cluster-tracker-child.md`           | Parent tracker mirrors child workflow lifecycle, incl. terminal-row recovery                          | 3          | ✅ Done |
| 8   | `08-cluster-field-gallery.md`           | Render sweep over all 27 field components + behaviors spec on one representative per family           | 3          | ⬜ To do |
| 9   | `09-cluster-operational-lifecycle.md`   | Tail-only: start/cancel/close/get-* operational APIs end-to-end, close-sweep edge cases               | 3          | ⬜ To do |
| 10  | `10-cluster-access-verbs.md`            | Per-verb button/page visibility per role; endpoint rejects signal whose verb the role lacks           | 3          | ⬜ To do |
| 11  | `11-demo-e2e-cleanup.md`                | Delete the two skipped demo specs; settle `form-submit-buttons.spec.js` disposition                   | 6          | ⬜ To do |
| 12  | `12-ci-e2e-lane.md`                     | CI lane building + serving both apps and running their e2e suites                                     | 3–10       | ⬜ To do |
| 13  | `13-unit-test-backfill.md`              | Verify audit-flagged unit gaps against existing jest files; add the missing tests                     | —          | ⬜ To do |

## Progress

**Tasks 1–7 complete.** Tasks 8–13 remain. (Tasks 5–6 added the `cascade-keyed` and `error-recovery` cluster fixtures + specs; the `error-recovery` `-error` page is the first to compile `templates/error.yaml.njk`, which surfaced and fixed a latent `_js` operator shape bug there — `{ params, body }` → `{ args, fn }`. The `error-recovery` cluster also wires the test app's notifications `send_routine` to dispatch a real notification from the trigger submit event, satisfying the design's cross-module-dispatch Verification item.)

Task 7 added the `tracker-child` cluster: a `tracker-parent` workflow whose `kind: tracker` `track-child` action mirrors a separate `tracker-child-flow` child workflow across two real workflow docs. The spec proves all three mirror directions + terminal-row recovery through real endpoints only — the mirror signals (`internal_mirror_child_active`/`_completed`/`_cancelled`) are engine-internal and were verified (against `fsm/tables.js`, `planTrackerLevel.js`, `planSubmit.js`, `CancelWorkflow.js`, `StartWorkflow.js`) to originate from, respectively, the child's start (`active`, incl. the recovery re-entry), the child's auto-complete on submit (`completed`), and `CancelWorkflow` (`cancelled`), each running `runTrackerCascade` against the parent. Recovery is reached via the documented tail seed-state technique: the cancel/complete mirrors never clear the parent's `child_workflow_id`, so a *terminal-yet-unlinked* tracker (the only state from which `internal_mirror_child_active` can re-enter `in-progress`) is positioned with `setStage`, then a real child `start` fires the recovery transition. The start_link surface is asserted both as a render (the tracker row's action-required message on `thing-view`) and as the server-resolved `edit` link with its `action_id`/`entity_id` query (read off the persisted action doc — the same field the entity-surface ActionSteps row navigates by).

**Shipped behaviour these specs rely on (parts 40/46/48 — now landed).** This suite was originally written against the *target* state of those then-in-flight parts; they have since landed, and the suite runs green against current `main` (see "Verified green" below). Two shipped facts every cluster spec depends on:

1. **Per-workflow write endpoints (Part 48 D5).** All write endpoints are per-workflow: `workflows/{type}-submit`, `{type}-start`, `{type}-cancel`, `{type}-close`. Submit is per-**workflow** (not per-action `{type}-{action}-submit`); the action is identified by `action_id` in the payload. The `workflow` fixture drives these ids. The generic `start-workflow`/`cancel-workflow`/`close-workflow` are retired.
2. **Check rows open the in-context modal (Part 40 D5).** Clicking a `kind:check` row in `actions-on-entity` opens the modal, it does **not** navigate. Specs that need the static `workflow-action-{edit,view,review}` pages reach them by their canonical `?action_id=` URLs.

**Verified green (tasks 1–7).** `lowdefy build` validates the configs cleanly **and** the full suite passes end-to-end: `pnpm e2e` from `apps/workflows-test` → **10/10 passing** (scaffold + the form-lifecycle, check-blocked-by, cascade-keyed, error-recovery, and tracker-child clusters). The earlier "expected-failing on the pre-48 gap" caveat is **resolved** — Parts 40/48 repointed the form templates from the stale `update-action-{type}` endpoint to `{type}-submit`, so there is no longer a build/run gap to leave failing. Running the suite (not just the build) caught one faulty assertion in the tracker-child cancel spec — a `not-required` action is terminal and drops off the active entity surface, so a thing-view message assertion was wrong; it now asserts the parent-workflow summary recompute (the engine transition itself was correct). Remaining clusters (tasks 8–10) should likewise be run, not just built.

**Self-contained Mongo (task 2 deviation, kept).** The harness boots `mongodb-memory-server` (single-node replica set, for the engine's transactions) via `configureMdb` + the mdb plugin `globalSetup` — no external Mongo, overridable via `LOWDEFY_E2E_MONGODB_URI`. This is a deliberate improvement over the task text's "copy the demo's `.env.e2e`" (better for CI and local runs). The `mdb` fixture wipes all collections between tests, so cluster specs need no manual teardown.

**Resolved assumption (was: Part 40 check-edit button id).** The post-40 check-action-surface edit button id is `button_submit` — **confirmed** by the green run: `check-blocked-by.spec.js` and `tracker-child.spec.js` complete check actions by clicking `button_submit` on the static `workflow-action-edit` page and pass. Part 40 renamed the old `button_submit_edit` and repointed it to `{type}-submit` with `signal: submit` as anticipated.

## Ordering Rationale

The design names its own order ("Implementation order within this part"): test-app scaffold + `workflow` fixture first, then `form-lifecycle` as the template the rest follow, then the remaining clusters in any order. The foundation is split into two tasks because each leaves an independently verifiable state: task 1 is verified by `lowdefy build` + serve with no Playwright involved; task 2 is verified by a boot smoke spec with no cluster fixtures involved.

- **1 → 2** — the harness needs an app to boot.
- **2 → 3** — `form-lifecycle` is the first real consumer of the `workflow` fixture and establishes the config + spec patterns (file layout, spine assertion shape, seed-state tail technique).
- **3 → 4–10** — the remaining clusters copy `form-lifecycle`'s patterns but are otherwise independent: **tasks 4–10 can run in parallel.**
- **6 → 11** — the demo's skipped `error-push-and-resolve.spec.js` is deleted only once its intent is revived in `error-recovery` (per the design's "Salvaged" section). The CAS spec deletion needs no e2e replacement — unit-owned.
- **4–10 → 12** — the CI lane is added once the suite it runs exists.
- **13** — independent of all e2e work (pure jest in `plugins/modules-mongodb-plugins/`); can run in parallel with everything.

Decomposition boundary: one task per cluster row in the design's table (the design itself says `/r:design-task` fans this into "one foundational task + one task per cluster"). `field-gallery`'s two specs stay in one task — they share one fixture workflow. Demo cleanup, CI, and unit backfill are separate because they touch different parts of the repo (`apps/demo/`, `.github/`, `plugins/`) and have different verification.

## Scope

**Source:** `designs/workflows-module/parts/22-workflows-e2e-suite/design.md`
**Context files considered:** the design folder contains only `design.md`; context was drawn from the referenced top-level `designs/workflows-module/design.md` (§ Testing conventions), the demo app (`apps/demo/e2e/`, `apps/demo/modules/workflows/`, `apps/demo/modules.yaml`), the module (`modules/workflows/module.lowdefy.yaml`, `resolvers/`, `templates/`, `pages/`, `api/`, `components/fields/`), and `@lowdefy/e2e-utils` internals (endpoint route shape).
**Review files skipped:** `designs/workflows-module/parts/22-workflows-e2e-suite/review/` (entire folder).

## Verified facts baked into the tasks

These were checked against the repo so implementers don't re-derive them:

- Submit endpoint id: per-**workflow** `` `${workflow.type}-submit` `` (Part 48 D5; module-scoped wire id `workflows/{type}-submit`), with the action identified by `action_id` in the payload and `hooks` re-sliced server-side by the loaded action's type. This **supersedes** the original per-action `` `${workflow.type}-${action.type}-submit` `` id — the per-action submit endpoints are retired. `workflow` is still a reserved workflow type name (id-collision guard in `makeWorkflowApis.js`).
- Lowdefy serves endpoints at `POST /api/endpoints/{endpointId}` with body `{ blockId, payload, pageId }` (`apps/demo/.lowdefy/server/pages/api/endpoints/[...endpointId].js`). Endpoint ids are module-scoped, so the wire id is `workflows/{...}`.
- Engine collections: `workflows`, `actions` (see `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`). Events land in `log-events` (`modules/events/connections/events-collection.yaml`), notifications in `notifications` (`modules/notifications/connections/notifications-collection.yaml`).
- `modules/workflows/components/fields/` holds exactly 27 component yamls (plus a README), matching the design's render-sweep count.
- `makeWorkflowsConfig` accepts an empty `workflows` array (`workflows.map` on `[]`), so the scaffold can ship with an empty `workflow_config/workflows.yaml`.
- There is **no existing CI e2e lane** — `.github/workflows/` contains only `release.yaml`. Task 12 creates the lane rather than copying one.
