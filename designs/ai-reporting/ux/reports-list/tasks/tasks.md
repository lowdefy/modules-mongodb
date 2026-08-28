# Implementation Tasks — Reports list

## Overview

Rebuild `modules/ai-reporting/pages/reports-list.yaml` from a stacked-card `List` into an
`AgGridBalham` reader over the scopes `list-reports` provides, add the recovery page for
soft-deleted reports, and trim the endpoint's now-unused offset paging. Derived from
`designs/ai-reporting/ux/reports-list/design.md`.

## Global Constraints

- **AgGridBalham for all tables** — never `AgGridMaterial` or another theme.
- **Build check:** `pnpm ldf:b` from `apps/demo` (the `:i` Infisical variants fail in the sandbox). A build check is not a smoke test; inspect the generated `.lowdefy/server/build/**` artefacts.
- **The scope match IS the authorization boundary** — `scope` is the only server parameter of `list-reports`; the page must never fetch wider than the tab and filter client-side. Search, sort and paging are the grid's, over the loaded scope.
- **Whole scope loads; no offset, no Load-more** — the page loads every row in a scope (low hundreds at most) and lets AgGrid search/sort/page it, exactly like `contacts` / `companies` / `activities` / `user-admin` (`rowData: { _request/_api: … }`, `sortable: true`).
- **`_if.test` / `visible:` / `hidden` conditions must resolve to a real boolean at runtime** — a bare `_state` string throws, and `ldf:b` does not catch it.
- **ID casing:** snake_case block, action and request IDs; kebab-case page IDs (`reports-deleted`); `_module.pageId` / `_module.endpointId` for cross-refs.
- **No client names** in any git-tracked content (demo, docs, comments).
- **Comments say why, not what** — and describe the code as it stands, no design/task references in code.

## Tasks

| #   | File                             | Summary                                                                                                          | Depends On |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-list-reports-whole-scope.md` | Drop offset paging from `list-reports`; delete the obsolete paging e2e test; note it on ownership                | —          |
| 2   | `02-recovery-page.md`            | New `reports-deleted.yaml` recovery page + manifest export                                                       | 1          |
| 3   | `03-list-grid-reader.md`         | Rebuild `reports-list.yaml` as the AgGrid reader — scopes, search, columns, empty states, open, recovery link    | 1, 2       |
| 4   | `04-list-row-actions.md`         | The `⋯` menu modal, delete confirm, ★ toggle, and scope-refetch on every mutation                                | 3          |
| 5   | `05-demo-consumers.md`           | Exercise the pages against seeded fixtures (already multi-type + second-user + deleted); augment only if starved | 2, 3       |
| 6   | `06-docs-surfaces.md`            | Update the docs index surfaces table (reports-list row + a reports-deleted row)                                  | 4          |

## Ordering Rationale

Task 1 fixes the data contract every page task reads against, so it leads. Task 2 must precede
Task 3 because Task 3's recovery footer link resolves `_module.pageId: reports-deleted`, which
only exists once Task 2 adds the page to the manifest. Task 3 (the reader — renders, switches
scope, opens a report) is a buildable, verifiable page on its own; Task 4 hangs the write actions
off it and edits the same file, so it is strictly serial after 3. Task 5 (demo data) and Task 6
(docs) both describe finished behaviour — 5 needs the list rendering its columns (Task 3) and the
recovery page (Task 2) to exercise them; 6 documents the whole surface after Task 4. Once Task 3
is done, Tasks 4 and 5 are independent and can run in parallel.

The one non-obvious coupling: Task 1 is **not** a pure endpoint edit. `apps/demo/e2e/ai-reporting/report-scopes.spec.js` has a test that asserts offset paging (`skip` / `page_size`, two pages, `_id` tiebreaker); removing `$skip`/`$limit` makes it test removed behaviour, so Task 1 deletes it. The same spec's scope-count and sort assertions stay — so Task 1 removes **only** the paging stages, and leaves the `sort` / `search` server params in place (the design flagged trimming them as optional, and e2e covers sort).

## Scope

**Source:** `designs/ai-reporting/ux/reports-list/design.md`
**Context read:** `modules/ai-reporting/api/list-reports.yaml`, `modules/ai-reporting/pages/reports-list.yaml`, `modules/ai-reporting/module.lowdefy.yaml`, `modules/user-admin/components/table_users.yaml` (AgGrid pattern), `@lowdefy/blocks-aggrid` cell renderers (`TagCell`, `ButtonsCell`), `apps/demo/api/reporting_ownership_fixture.yaml`, `apps/demo/e2e/ai-reporting/report-scopes.spec.js`, `docs/ai-reporting/index.md`
**Review files skipped:** `review/review-1.md`
