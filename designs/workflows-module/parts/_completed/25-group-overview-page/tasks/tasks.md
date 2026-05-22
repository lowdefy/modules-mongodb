# Implementation Tasks — Part 25 group-overview page

## Overview

Ships the `group-overview` shared page, the `get-action-group-overview` operational Api that backs it, and a one-line change in `actions-on-entity` that links each group title at the entity widget to its corresponding group-overview page. Source: [design.md](../design.md).

## Tasks

| #   | File                                | Summary                                                                             | Depends On |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| 1   | `01-api-get-action-group-overview.md` | Ship `api/get-action-group-overview.yaml` + manifest export + handler-level smoke.  | —          |
| 2   | `02-page-group-overview.md`         | Ship `pages/group-overview.yaml` + manifest export.                                 | 1          |
| 3   | `03-actions-on-entity-group-link.md` | Edit `actions-on-entity.yaml` `_js` builder to populate `actionGroupConfig[*].link`. | 2          |
| 4   | `04-sibling-design-cross-refs.md`   | Add "see also part 25" lines to parts 17 / 18 / 19 / 20 design docs.                | —          |

## Ordering Rationale

- **Task 1 first** because the page (Task 2) mounts a `CallApi` against this Api; without it the page redirects-on-empty for every load. Task 1's verification is handler-level smoke against the demo app — there's no unit-test infrastructure for Lowdefy Api YAML in this repo. Behavioural coverage for the Api lands in Part 22's e2e suite.
- **Task 2 depends on Task 1** for the runtime data path. The manifest entries for both can technically land together, but landing them in two commits keeps each touched surface reviewable in isolation.
- **Task 3 depends on Task 2** because the group-title link's `pageId` resolution needs `group-overview` to exist in `exports.pages` (otherwise `_module.pageId: { id: group-overview, module: workflows }` doesn't resolve). Task 3 is otherwise just a `_js` builder edit and unit-level smoke.
- **Task 4 is independent** — pure docs in sibling design folders. Can land first, last, or in parallel. Listed last because it's lowest priority.

Tasks 1 and 4 can run in parallel. Tasks 2 and 3 chain after 1.

## Scope

**Source:** `designs/workflows-module/parts/25-group-overview-page/design.md`
**Context files considered:** none beyond design.md (no supporting docs in this part's folder).
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md` (already folded into design.md by `r:design-action-review` and `r:design-consistency-review`).
