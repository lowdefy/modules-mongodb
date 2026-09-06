# Implementation Tasks — Report Page (provenance, per-section export, recoveries, filter placement)

## Overview

Implements `designs/ai-reporting/ux/report-page/design.md`: a provenance line, per-section CSV
export, owner-only chat links and broken-section recoveries, a withheld-vs-broken Alert
distinction, and filter co-location. Nearly all visible output is emitted by `compileReport`
into the report's `Dynamic` block; the page (`report.yaml`) only declares types and the
fallback, and the resolver (`resolve-report.yaml`) threads the new inputs the compiler needs.

## Global Constraints

- **Dynamic types, same commit:** any compiler change that emits a new block, action, or operator type must add that type to `report.yaml`'s `properties.types` in the same commit — an undeclared type fails the WHOLE report to the fallback slot, invisibly until a report contains that section type.
- **Withheld Alert names no collection and no role** — the section's own label is all the viewer learns; naming the role/collection would describe the app's access model.
- **Fallback copy is exactly** `This report couldn't be loaded` (replacing "The report does not exist or you do not have access to it.").
- **The provenance middle fact is labelled "last edited," not "spec changed"** — it reads the document's `updated` field.
- **Reuse the validator's single walk for the withheld pre-check** — never a second collection scan (a hand-rolled "base + `$lookup.from`" scan, or any helper that re-walks, drifts on `$unionWith` / nested `$lookup` / `$graphLookup`).
- **Owner-only affordances are display gates over a server-side gate** — `compileReport`'s `is_owner` branch decides what renders; the real authorization is the endpoint (`remove-report-section` owner-matches in its filter; chat access is gated server-side). Test per branch: a non-owner must never see an owner action.
- **Build verify:** `pnpm ldf:b` from `apps/demo` (needs no secrets/Infisical), then inspect the generated `.lowdefy/server/build/pages/**` artefacts. Plugin (`compileReport`/`validatePipeline`) changes ship with vitest unit tests.

## Tasks

| #   | File                                                 | Summary                                                                                                             | Depends On |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-validate-pipeline-touched-collections.md`        | Expose the validator's collection enumeration (non-gating) for classification                                       | —          |
| 2   | `02-resolve-report-provenance-and-honest-failure.md` | Resolver returns/threads provenance + `is_owner` + `conversation_id`; logs whole-spec failure; honest page fallback | —          |
| 3   | `03-compile-provenance-and-csv.md`                   | Compiler emits the provenance line and a per-section `⤓` CSV                                                        | 2          |
| 4   | `04-compile-owner-chat-and-recoveries.md`            | Compiler emits owner-only Continue-in-chat, fix-in-chat, drop-section; declares `Link`                              | 3          |
| 5   | `05-compile-withheld-variant.md`                     | Compiler renders a third (withheld) Alert variant for role-denied sections                                          | 4, 1       |
| 6   | `06-compile-filter-colocation.md`                    | Compiler emits each filter beside the section group it drives, not a top row                                        | 5          |
| 7   | `07-docs-reporting.md`                               | Update reporting docs for the new compiled shape                                                                    | 6          |
| 8   | `08-demo-consumers.md`                               | Seed broken / withheld / two-filter-group reports; exercise end-to-end                                              | 6, 2       |

## Ordering Rationale

Two independent foundations start together: **Task 1** (the validator's collection enumeration,
in `validatePipeline.js`) and **Task 2** (the resolver + page-fallback, in `resolve-report.yaml`
and `report.yaml`). Neither depends on the other.

Tasks **3 → 4 → 5 → 6 are a strictly serial chain** because they all edit the same file,
`compileReport.js`. This is honest serialism, not an artefact: there is no parallelism to win by
splitting one file across concurrent agents, and chaining keeps each a clean, reviewable diff.
The order within the chain is by input dependency — provenance/CSV (3) before the owner-gated
affordances (4) that share the header region; both before the withheld variant (5), which also
needs Task 1; co-location (6) last, as the largest structural change to the emit loop. Task 5
carries the second dependency on Task 1.

`report.yaml` is touched by Task 2 (fallback copy) and Task 4 (the `Link` declaration) — the
chain keeps 4 after 2, so there is no conflict.

**Tasks 7 (docs) and 8 (demo) are leaves after the compiler is complete (dep 6).** They can run
in parallel with each other. Task 8 is the exercise-the-feature step — it seeds the three demo
reports the design calls for and verifies the whole page end-to-end against a build; it also
depends on Task 2 for the honest-fallback path.

## Scope

**Source:** `designs/ai-reporting/ux/report-page/design.md`
**Context read:** the design's referenced source — `modules/ai-reporting/api/resolve-report.yaml`, `modules/ai-reporting/pages/report.yaml`, `plugins/modules-mongodb-plugins/src/analytics/compileReport.js`, `plugins/modules-mongodb-plugins/src/analytics/validatePipeline.js`; sibling designs `ownership`, `save-as-report`, `reports-from-chat` (all shipped); demo seeds under `apps/demo/api/reporting-seed-*.yaml` and `apps/demo/modules/ai-reporting/catalog.yaml`; `docs/ai-reporting/`.
**Review files skipped:** `review/review-1.md`, `review/review-2.md` (resolved decisions already in the design).
