# Implementation Tasks — Report filters: multi-select, array fields, looked-up options

## Overview

These tasks implement `designs/ai-reporting/report-filters/design.md`: a `multiselect` filter control with explicit `any`/`all` semantics over scalar and array fields, and an `optionsQuery` that sources a filter's `{ label, value }` options from another collection through the existing resolve loop. They touch the analytics plugin (`plugins/modules-mongodb-plugins/src/analytics/`), the `ReportingData` connection, the reporting module's report page and agent instructions, the consumer docs, and the demo's seeded example report.

## Tasks

| #   | File                                    | Summary                                                                                                   | Depends On    |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | `01-constants-and-caps.md`              | Add the new control, match modes and options cap; raise `MAX_ARRAY_LITERAL_LENGTH` to 500                 | —             |
| 2   | `02-filter-ops-and-empty-array.md`      | `FILTER_OPS` gains `in`/`all`; `buildFilterMatch` drops empty arrays                                      | —             |
| 3   | `03-validate-filter-section.md`         | Allowed-key list, `match`, `optionsQuery` and exclusivity in `validateReportSpec`                         | 1             |
| 4   | `04-filter-options-contract.md`         | `verifyFilterOptionsContract` in `verifyContract.js`                                                      | —             |
| 5   | `05-shared-query-list.md`               | One exported ordered-query-list helper shared by `querySections` and `compileReport`                      | 3             |
| 6   | `06-compile-multiselect-and-options.md` | `compileReport`: `MultipleSelector`, `in`/`all` triples, `optionsQuery` options, three-outcome Alert      | 1, 2, 3, 4, 5 |
| 7   | `07-agent-vocabulary.md`                | Teach `reporting-assistant.yaml` the new keys and the document-not-element rule; `query-data` payload doc | 3             |
| 8   | `08-docs-and-changeset.md`              | Rewrite the docs' filter-binding section, correct two verification statements, add a changeset            | 6             |
| 9   | `09-demo-seeded-report.md`              | The seeded example report gains all three controls, including an `optionsQuery` filter                    | 6             |

## Ordering Rationale

The chain is **constants → validation → shared list → compiler**, because each step's output is the next step's input: nothing can validate `match` before `FILTER_MATCH_MODES` exists, `querySections` cannot return a filter's options query before the validator carries `optionsQuery` through the normalized spec, and `compileReport` cannot map options rows back to a filter before the shared ordered list exists.

Three tasks sit off that chain and can run in parallel with it:

- **Task 2** (`AnalyticsPipeline`) touches only the connection's `FILTER_OPS` map and `buildFilterMatch`. It is what makes the compiled triples actually run, but it has no compile-time dependency on them — do it early so the live re-query path is ready when task 6 lands.
- **Task 4** (`verifyFilterOptionsContract`) is one `requireKeys` call plus its tests; task 6 imports it.
- **Task 1** and task 2 are both leaf tasks and may be done in either order or together.

Tasks 7–9 are the consumer-facing half and all follow task 6, because they describe behaviour that must already exist: the agent instructions state the vocabulary the validator enforces, the docs state what the compiler does, and the demo report is the first spec exercised end-to-end. Task 9 is last deliberately — it is the only task whose verification includes a live dev-server pass, so it wants everything else settled.

Task 6 is the largest and is not split further: `MultipleSelector` emission, the triple shape, the `optionsQuery` options branch and the Alert degradation all live in the same two functions (`boundFilters`, `filterOptions`) and the same `filter` branch of one loop, and the `report.yaml` type declaration must land in the same change as the first `MultipleSelector` the compiler can emit — otherwise `compileReport.declared.test.js` fails between tasks.

## Scope

**Source:** `designs/ai-reporting/report-filters/design.md`
**Context files considered:** none — the design folder holds only `design.md` and its `review/` subfolder. Cross-referenced for accuracy while writing these tasks: `designs/ai-reporting/open-query-engine/design.md` (the engine and its caps), `designs/ai-reporting/ux/design.md` (the save sheet as the second author of an `optionsQuery`).
**Review files skipped:** `review/review-1.md`, `review/consistency-1.md`.
