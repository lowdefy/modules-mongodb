# Implementation Tasks — Save-report filter picker

## Overview

Implements the filter picker for the save-as-report confirm sheet, per
`designs/reporting/ux/save-as-report/filter-picker/design.md`: an add-only picker in the
sheet's reserved filters region that authors a filter from a catalog field, and a
server-side derivation step in `create-report` that turns the sheet's leaf inputs
(`{ field, labelKey }`) into a validated report spec — building the `optionsQuery` for
looked-up filters and binding each filter to the sections it scopes — before
`validateReportSpec` runs.

## Global Constraints

- **Derivation is server-side only, in `create-report`.** The sheet posts leaf inputs; it never builds an `optionsQuery` pipeline in Lowdefy config (that would be the runtime dynamic-key construction `CLAUDE.md` warns against).
- **The agent route is untouched.** `generate-report` keeps writing full `optionsQuery` pipelines itself; derivation fires only on the `create-report` route, only for a filter section carrying `field` + `labelKey` and no `optionsQuery`.
- **Numeric fields are excluded.** The picker offers no `type: number` fields; there is no `numberrange` control. Do not add one — it is a report-filters (engine) follow-up, not picker work.
- **Add-only.** Nothing proposes filters into this sheet; the picker only adds/edits/removes. Do not add a filter-proposal part or emit path.
- **Blind emit, no authoring-time preview.** The sheet does not resolve or preview options; they resolve at report open. Do not add an authoring-time options endpoint.
- **Filters render at the top** — existing `compileReport` behaviour. Do not touch placement in `compileReport`.
- **No client names** in any git-tracked content (`CLAUDE.md`). Use the demo's generic collections (`demo_companies`, `demo_activities`, …).

## Tasks

| #   | File                              | Summary                                                                                        | Depends On |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-server-derive-report-spec.md` | `deriveReportSpec` operator: build `optionsQuery` + bind `filterBy`; wire into `create-report` | —          |
| 2   | `02-sheet-filter-picker.md`       | Add-only filter picker in the save sheet's reserved filters region                             | 1          |
| 3   | `03-docs-and-demo.md`             | Save-as-report how-to filter step + numeric-gap note; build-verified demo path                 | 2          |

## Ordering Rationale

Task 1 is the foundation: the picker posts a spec shape (`filter` sections carrying `field` + `labelKey`, no `filterBy`, no `optionsQuery`) that **only validates if the server derives and binds it first**. Building the UI before the server accepts its output would produce a sheet whose Save always throws. So the server pass lands first, verifiable in isolation by unit test (`deriveReportSpec.test.js`) and a `create-report` build check.

Task 2 builds the picker UI that produces that shape. It depends on task 1 because the end-to-end Save only succeeds once the server derive+bind exists.

Task 3 documents the feature and confirms the demo catalog exercises it; it depends on task 2 because it describes the shipped UI. The live derive → save → resolve-on-open path needs a dev server with Mongo + AI and is a dev-test follow-up, not part of the build gate — task 2 build-verifies that the sheet and endpoint _compile_ against the demo catalog.

## Scope

**Source:** `designs/reporting/ux/save-as-report/filter-picker/design.md`
**Context read:** `design.md`; source: `create-report.yaml`, `validateReportSpec.js`, `querySections.js`, `analyticsOperator.js`, `constants.js`, `save_report_sheet.yaml`, `apps/demo/modules/reporting/catalog.yaml`, `docs/reporting/how-to/save-as-report.md`
**Review files skipped:** `review/review-1.md`
