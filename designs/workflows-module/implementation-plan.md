# Workflows Module — Implementation Plan

Live roadmap for the workflows module, ordered by dependency. [Part 45 — demo-rebuild](parts/45-demo-rebuild/design.md) (from-scratch demo config + happy-path e2e) is shipped via [PR #75](https://github.com/lowdefy/modules-mongodb/pull/75), but it landed ahead of its runtime prerequisites: the demo is authored in the post-rebuild grammar and won't build or run until [40 Band 1](parts/40-simple-action-surfaces/tasks/tasks.md#bands) (signal rewrite of the shared pages) and [43](parts/43-rename-simple-kind-to-check/design.md) (`kind: check` rename) land — those are the next milestone. Everything already delivered is collapsed into [Shipped](#shipped); the original wave-by-wave delivery record lives in git history and the `parts/_completed/` folders.

Status legend: `✅ shipped` · `🚧 in progress` · `📐 design only` · `💤 deferred (_next)` · `❌ rejected (_rejected)` · empty = not started.

## Sequence

Dependency-ordered. Items with no entry in **After** have no unmet dependencies and can run in parallel.

| Work | Size | After | Status |
| ---- | ---- | ----- | ------ |
| [40 Band 1](parts/40-simple-action-surfaces/tasks/tasks.md#bands) — signal rewrite of the three shared pages (tasks 1, 3, 4) | ~half of M | — | |
| [43 rename-simple-kind-to-check](parts/43-rename-simple-kind-to-check/design.md) — kind-only sweep (page renames already landed in 38 task 18) | S | 40 Band 1 | 📐 design only |
| [24 universal-fields](parts/24-universal-fields/design.md) — real renderer + `UpdateActionFields` handler | M | — | |
| [33 comment-rendering](parts/33-comment-rendering/design.md) | M | 24 (`UpdateActionFields` is its 2nd write site) | |
| [40 Band 2](parts/40-simple-action-surfaces/tasks/tasks.md#bands) — in-context modal + `ActionSteps.onActionClick` + e2e supplements (tasks 2, 5–8) | ~half of M | 24, 33, 43 | |

Sequencing constraints:

- **The shipped demo (45) doesn't run yet.** It's authored in the post-rebuild grammar — `kind: check`, signal-driven shared pages — that the codebase doesn't satisfy: the resolver/engine still validate `kind: simple` (43), and the three shared `workflow-action-*` pages still fire `interaction:` while the rebuilt engine accepts only `signal:` payloads (40 Band 1; 38 tasks 15/19 dropped `interaction`/`current_status` from the wire). The demo build and its happy-path e2e go green when 40 Band 1 + 43 land.
- **Only Band 1 of Part 40 blocks the demo** — without it, `kind: check` actions can't be driven. Band 2 (in-context modal, `ActionSteps.onActionClick`, e2e supplements) is sequenced after 24/33; the split is recorded in [40's tasks.md](parts/40-simple-action-surfaces/tasks/tasks.md#bands).
- **43 precedes 40 Band 2's re-touch of the shared pages** (avoids churn on the same files) and must land before any real app onboards a workflow config.
- **[Part 24 — universal-fields](parts/24-universal-fields/design.md) doesn't block the demo.** The component is a render-nothing stub the shared pages already `_ref` safely, and check actions are driven by signal buttons, not field editing. Until 24 lands, universal fields render nothing.

## Design-only — unsequenced

| #   | Part | Size | Status |
| --- | ---- | ---- | ------ |
| 36  | [extra-action-buttons](parts/36-extra-action-buttons/design.md) | S–M | needs signal-model reconciliation |
| 41  | [notification-roles-model](parts/41-notification-roles-model/design.md) | TBD | ⚠️ STUB — rethink; supersedes part 34 D9 |

## Deferred — `_next/` (slot in once their deps land)

| #   | Part | Size | Status |
| --- | ---- | ---- | ------ |
| 11  | [group-on-complete-fanout](parts/_next/11-group-on-complete-fanout/design.md) | S | 💤 |
| 22  | [workflows-e2e-suite](parts/_next/22-workflows-e2e-suite/design.md) | M | 💤 |
| 26  | [entity-data-contract](parts/_next/26-entity-data-contract/design.md) | M | 💤 |
| 28  | [custom-action-kind](parts/_next/28-custom-action-kind/design.md) | M | 💤 |
| 31  | [keyed-auto-unblock-fanout](parts/_next/31-keyed-auto-unblock-fanout/design.md) | S–M | 💤 draft / open for discussion |

## Shipped

Delivered in waves 0–7 plus follow-ons: two streams — engine in `plugins/modules-mongodb-plugins/`, module in `modules/workflows/` — converging at 20a/20b, re-converged by 38. Each part folder under `parts/_completed/` is the record.

| #   | Part | Notes |
| --- | ---- | ----- |
| 1   | [call-api-primitive](parts/_completed/01-call-api-primitive/design.md) | upstream `@lowdefy/api` |
| 2   | [dynamic-module-pages](parts/_completed/02-dynamic-module-pages/design.md) | upstream; resolved by removing `exports:` entirely — re-scoped 12/13/20b to emit dynamic pages/endpoints via `_build.array.map` in the manifest, no resolver channel |
| 3   | [engine-plugin-shell](parts/_completed/03-engine-plugin-shell/design.md) | |
| 4   | [workflow-config-schema](parts/_completed/04-workflow-config-schema/design.md) | |
| 5   | [start-cancel-handlers](parts/_completed/05-start-cancel-handlers/design.md) | |
| 6   | [submit-action-writes](parts/_completed/06-submit-action-writes/design.md) | |
| 7   | [group-state-machine](parts/_completed/07-group-state-machine/design.md) | |
| 8   | [side-effect-dispatch](parts/_completed/08-side-effect-dispatch/design.md) | |
| 9   | [hook-invocation](parts/_completed/09-hook-invocation/design.md) | |
| 10  | [tracker-subscription](parts/_completed/10-tracker-subscription/design.md) | |
| 12  | [resolver-pages](parts/_completed/12-resolver-pages/design.md) | |
| 13  | [resolver-apis](parts/_completed/13-resolver-apis/design.md) | |
| 14  | [form-components-library](parts/_completed/14-form-components-library/design.md) | |
| 15  | [resolver-form-builder](parts/_completed/15-resolver-form-builder/design.md) | |
| 16  | [page-templates](parts/_completed/16-page-templates/design.md) | |
| 17  | [shared-pages](parts/_completed/17-shared-pages/design.md) | |
| 18  | [entity-components](parts/_completed/18-entity-components/design.md) | |
| 19  | [operational-apis](parts/_completed/19-operational-apis/design.md) | |
| 20a | [module-manifest-static](parts/_completed/20a-module-manifest-static/design.md) | |
| 20b | [module-manifest-dynamic](parts/_completed/20b-module-manifest-dynamic/design.md) | |
| 21  | [entity-type-to-collection](parts/_completed/21-entity-type-to-collection/design.md) | |
| 23  | [close-workflow-handler](parts/_completed/23-close-workflow-handler/design.md) | |
| 24a | [user-account-selector-avatar](parts/_completed/24a-user-account-selector-avatar/design.md) | |
| 25  | [group-overview-page](parts/_completed/25-group-overview-page/design.md) | |
| 29  | [error-model-cleanup](parts/_completed/29-error-model-cleanup/design.md) | |
| 30  | [status-map-rendering](parts/_rejected/30-status-map-rendering/design.md) | ❌ rejected — superseded by 38, which keeps its on-disk display contract but renders against planned state (load→plan→commit), collapsing the render-against-stale-doc bug class |
| 32  | [drop-static-overrides](parts/_completed/32-drop-static-overrides/design.md) | |
| 34  | [action-access-model](parts/_completed/34-action-access-model/design.md) | 📐 design-only — per-app per-verb `access`, per-verb `links`, `visible_verbs`; implemented inside 38 |
| 35  | [rename-task-kind-to-simple](parts/_completed/35-rename-task-kind-to-simple/design.md) | |
| 37  | [actions-collection-indexes](parts/_completed/37-actions-collection-indexes/design.md) | |
| 38  | [engine-rebuild](parts/_completed/38-engine-rebuild/design.md) | all bands shipped — rebuilt every write entry point (Submit/Start/Cancel/Close + tracker cascade) into load → plan → commit with signals + per-kind FSM tables; carried Part 34's access model into code; task 20 superseded by Part 45; see [tasks.md](parts/_completed/38-engine-rebuild/tasks/tasks.md) |
| 39  | [form-submit-buttons](parts/_completed/39-form-submit-buttons/design.md) | merged via [PR #77](https://github.com/lowdefy/modules-mongodb/pull/77) — form templates fire `signal:`; ships `enums/button_signal_sources.yaml` |
| 42  | [timeline-action-cards](parts/_completed/42-timeline-action-cards/design.md) | merged via [PR #71](https://github.com/lowdefy/modules-mongodb/pull/71) — see the [implementation record](parts/_completed/42-timeline-action-cards/tasks/tasks.md#implementation-record) |
| 44  | [tracker-start-link](parts/44-tracker-start-link/design.md) | merged via [PR #76](https://github.com/lowdefy/modules-mongodb/pull/76) |
| 45  | [demo-rebuild](parts/45-demo-rebuild/design.md) | merged via [PR #75](https://github.com/lowdefy/modules-mongodb/pull/75) — lead-onboarding demo config + cross-entity `company-setup` child + happy-path e2e; authored in post-rebuild grammar, so it won't build or run until 40 Band 1 + 43 land |
