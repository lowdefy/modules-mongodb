# Implementation Tasks — Part 22: Workflows e2e suite

## Overview

These tasks implement `designs/workflows-module/parts/22-workflows-e2e-suite/design.md`: a dedicated `apps/workflows-test/` Lowdefy app carrying ~8 functional-cluster workflow fixtures, a `workflow` Playwright fixture driving the real emitted Lowdefy APIs, one spec per cluster, demo e2e cleanup, a CI lane, and the unit-test backfill the design routes to the jest layer.

## Tasks

| #   | File                                    | Summary                                                                                               | Depends On |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-test-app-scaffold.md`               | Create `apps/workflows-test/`: module wiring, `things` entity, empty workflow_config; builds & serves | —          |
| 2   | `02-e2e-harness-and-workflow-fixture.md`| Playwright harness (port 3001) + `workflow` fixture driving real Lowdefy APIs + boot smoke spec       | 1          |
| 3   | `03-cluster-form-lifecycle.md`          | Template cluster: review-verb form lifecycle (submit/approve/request_changes/progress/not_required)   | 2          |
| 4   | `04-cluster-check-blocked-by.md`        | Check actions with type dep + group-id dep; blocker completion unblocks dependents                    | 3          |
| 5   | `05-cluster-cascade-keyed.md`           | Pre-hook cascade `block`/`error`/`activate` at siblings + `upsert: true` keyed spawn                  | 3          |
| 6   | `06-cluster-error-recovery.md`          | Error-verb path: cascade to error stage, event + notification, `-error` page, resolve → done          | 3          |
| 7   | `07-cluster-tracker-child.md`           | Parent tracker mirrors child workflow lifecycle, incl. terminal-row recovery                          | 3          |
| 8   | `08-cluster-field-gallery.md`           | Render sweep over all 27 field components + behaviors spec on one representative per family           | 3          |
| 9   | `09-cluster-operational-lifecycle.md`   | Tail-only: start/cancel/close/get-* operational APIs end-to-end, close-sweep edge cases               | 3          |
| 10  | `10-cluster-access-verbs.md`            | Per-verb button/page visibility per role; endpoint rejects signal whose verb the role lacks           | 3          |
| 11  | `11-demo-e2e-cleanup.md`                | Delete the two skipped demo specs; settle `form-submit-buttons.spec.js` disposition                   | 6          |
| 12  | `12-ci-e2e-lane.md`                     | CI lane building + serving both apps and running their e2e suites                                     | 3–10       |
| 13  | `13-unit-test-backfill.md`              | Verify audit-flagged unit gaps against existing jest files; add the missing tests                     | —          |

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

- Per-action submit endpoint id: `` `${workflow.type}-${action.type}-submit` `` (`modules/workflows/resolvers/makeWorkflowApis.js:72`); hook endpoints `` `${type}-${action}-${signal}-${phase}` ``; group hooks `` `${type}-group-${group.id}-on-complete` ``. `workflow` is a reserved workflow type name (id-collision guard in the same file).
- Lowdefy serves endpoints at `POST /api/endpoints/{endpointId}` with body `{ blockId, payload, pageId }` (`apps/demo/.lowdefy/server/pages/api/endpoints/[...endpointId].js`). Endpoint ids are module-scoped, so the wire id is `workflows/{...}`.
- Engine collections: `workflows`, `actions` (see `apps/demo/e2e/workflows/onboarding-happy-path.spec.js`). Events land in `log-events` (`modules/events/connections/events-collection.yaml`), notifications in `notifications` (`modules/notifications/connections/notifications-collection.yaml`).
- `modules/workflows/components/fields/` holds exactly 27 component yamls (plus a README), matching the design's render-sweep count.
- `makeWorkflowsConfig` accepts an empty `workflows` array (`workflows.map` on `[]`), so the scaffold can ship with an empty `workflow_config/workflows.yaml`.
- There is **no existing CI e2e lane** — `.github/workflows/` contains only `release.yaml`. Task 12 creates the lane rather than copying one.
