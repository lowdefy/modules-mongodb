# Implementation Tasks — Part 17: Shared pages

## Overview

These tasks implement the four shared, static pages defined by [part 17's design](../design.md): three task-action pages (`task-edit`, `task-view`, `task-review`) addressed by `?action_id=<id>`, and the workflow detail page (`workflow-overview`) addressed by `?workflow_id=<id>`. The task pages mirror the structure of part 16's form-action templates (shipped in commit `be78b9f`); the overview page is standalone and consumes part 19's `get-workflow-overview` Api.

Each task page references components from part 18 (`action_role_check`, `workflow-header`) and part 24 (`universal-fields`) by path. Those parts haven't shipped yet — part 17's outputs are path-stubs that fail at Lowdefy build until 18 and 24 land. Same posture as part 16, which already references the same component paths.

Part 17 also introduces a new `vars.entities` module var (see [design § "`entities` module var"](../design.md)) — a per-`entity_collection` map of `{ page_id, id_query_key, title }` used by workflow-overview to build the host-app entity-page back-link. The var's manifest declaration lands in part 20; the validator obligation lands in part 4; this part consumes the var via `_module.var: entities`.

## Tasks

| #   | File                              | Summary                                                            | Depends On |
| --- | --------------------------------- | ------------------------------------------------------------------ | ---------- |
| 2   | `02-task-view-page.md`            | Ship `pages/task-view.yaml` — read-only task page (action header, universal-fields display, status timeline, comment timeline). No gates, no writes. | —          |
| 3   | `03-task-edit-page.md`            | Ship `pages/task-edit.yaml` — status selector with priority filter, universal-fields edit, comment field, Save button with role gate + `required_after_close` gate + workflow-closed banner. | 2          |
| 4   | `04-task-review-page.md`          | Ship `pages/task-review.yaml` — read-only fields + `approve` / `request_changes` buttons with role gate + `required_after_close` gate. | 3          |
| 5   | `05-workflow-overview-page.md`    | Ship `pages/workflow-overview.yaml` — single `CallApi` to `get-workflow-overview`, header via `_ref` to part 18's `workflow-header`, action cards with v0-pattern DataView + keyed `form_data` indexing, entity back-link via `_module.var: entities`. | —          |
| 6   | `06-manifest-page-exports.md`     | Register the four new pages in `module.lowdefy.yaml` (`pages:` block + `exports.pages` entries). | 2, 3, 4, 5 |
| ~~7~~ | ~~`07-demo-app-wiring.md`~~     | **Spun out to [part 27 — demo-workflows-wiring](../../27-demo-workflows-wiring/design.md).** Scope grew large enough to warrant its own design — demo wiring needs the full workflows module surface (workflows entry, `workflows_config`, leads collection, lead pages, navigation) plus parts 18 and 24 to be shipped for live verification. | 6          |

**Note on numbering.** Task 1 (parameterizing `requests/get_entity.yaml.njk` so the overview page could source `entity_id` from the workflow doc) was dropped during consistency review when the design moved to the `entities` module var approach — the overview page builds its back-link from `_module.var: entities` and doesn't fetch the entity doc at all. The numbering gap is intentional; downstream tasks weren't renumbered to avoid churn.

**Note on task 7.** Spun out to [part 27 — demo-workflows-wiring](../../27-demo-workflows-wiring/design.md) during implementation. Demo wiring + worked-example verification is a substantial integration effort blocked on parts 18 and 24 anyway; folding it into part 17 mixed two concerns. Part 27 owns the verification record that would otherwise have landed here.

## Ordering Rationale

**Task pages 2 → 3 → 4** because they share scaffolding (`onMount` sequence, layout composition, request reuse) and each adds complexity:

- Task-view establishes the page-shell pattern: `layout.page` wrapper, request reuse, universal-fields display block, status / comment timelines. Simplest — no writes, no gates, no stale-URL redirect.
- Task-edit adds the heavy lifting: status selector with priority-rule filter, role gate, `required_after_close` banner, stale-URL redirect. The biggest single task. Builds on task-view's page-shell so the form structure is already settled.
- Task-review reuses task-edit's gates and stale-URL redirect with a smaller body (approve / request_changes buttons, optional comment field).

**Task 5 (workflow-overview) in parallel with task pages.** Different shape entirely — different Api, different layout (header + cards), different data flow. Independent of tasks 2–4. Could run concurrently with them if needed. No dependency on task 1 (which no longer exists).

**Task 6 (manifest wiring) sequenced last** because it needs all four page files to exist before they can be `_ref`d from `module.lowdefy.yaml`. Adding entries piecemeal as each page lands would invite half-broken manifest states during implementation.

**Task 7 — spun out to part 27.** Demo wiring + worked-example verification became its own design once it was clear the scope demanded the full workflows module surface (workflows entry, workflows_config, leads collection, lead pages, navigation) and live verification was blocked on parts 18 and 24 anyway. Tracked at [part 27 — demo-workflows-wiring](../../27-demo-workflows-wiring/design.md).

**Parallelizable:** tasks 2 and 5 can run concurrently (no dependencies between them). Tasks 3 and 4 are sequential. Task 6 needs all four pages.

## Scope

**Source:** `designs/workflows-module/parts/17-shared-pages/design.md`
**Context files considered:** Just the design.md — part 17 has no supporting files (no key-takeaways, considerations, or research files).
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md`, `review/consistency-2.md` — all treated as resolved feedback.

**Out-of-scope (per design):**
- Comment-timeline shape refinement beyond v1 (events filtered by `action_ids` + `metadata.comment`).
- Restricted-action and completed-workflow tile UX detail on `workflow-overview`.
- Extracting `_action_page_onmount.yaml.njk` partial — deferred to follow-up if drift surfaces.
- Fetching the entity doc on workflow-overview — replaced by the `entities` module var for back-link URL + title. The richer-label path (optional `get_entity_endpoint` on the enum, CallApi fetch, `display_label`-based label) is owned by [part 26](../../26-entity-data-contract/design.md) — separate design, separate review cycle.

**External dependencies (path-stubbed; back-filled by other parts):**
- `modules/workflows/components/action_role_check.yaml` — part 18.
- `modules/workflows/components/universal-fields/universal-fields.yaml` — part 24.
- `modules/workflows/components/workflow-header.yaml` — part 18.
- `modules/layout/components/card.yaml`, `floating-actions.yaml` — layout module.

**Cross-part obligations introduced by this part:**
- **Part 4** — validate that every `entity_collection` in `workflows_config` has a matching `vars.entities` entry; fail build with precise message otherwise.
- **Part 20** — declare `vars.entities` in the manifest with `type: object`, `required: true`.
