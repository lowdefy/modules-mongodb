# Implementation Tasks — Flint Charts

## Overview

Swap the module's hand-rolled ECharts option builder for the `flint-chart` compiler, keeping the
`bar | line | pie` authoring contract unchanged: a new `buildFlintOption` plugin function, a
`chart-data` endpoint for filtered report chart sections, content-driven chart heights on both
surfaces, and per-section containment of assembly failures. Derived from
`designs/reporting/flint-charts/design.md`.

## Global Constraints

- `flint-chart` is pinned **exactly** to `0.5.0` (no `^`/`~`) in `plugins/modules-mongodb-plugins/package.json`.
- `baseSize: { width: 1100, height: 220 }` — always pass **both** fields (a partial `baseSize` yields `_width: NaN`).
- Fold column names are exactly `Measure` (series key) and `Value` (series value).
- The chat panel's height fallback for persisted parts is exactly `300`.
- The strip walk removes: deep keys starting with `_`, deep function-valued keys, and the top-level `graphic` key. Snapshots test the **stripped** option.
- `CHART_TYPES`, `validateChartSpec`'s contract, `render-chart.yaml`'s `payloadSchema` and the agent instructions are untouched — the authoring vocabulary stays `bar | line | pie`.
- `query-data.yaml` and `query-data-tool.yaml` are untouched.
- Tests run with the sandbox off (`CI=true pnpm test` sandboxed fails ~19 Mongo suites spuriously).

## Tasks

| #   | File                          | Summary                                                                                                                       | Depends On |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-build-flint-option.md`    | Add `flint-chart@0.5.0`, write `buildFlintOption.js` (fold, template map, strip), register on `_analytics`, snapshot tests    | —          |
| 2   | `02-chat-path-height.md`      | `buildDataParts` emits `{ option, height }` on chart parts; chat panel binds height with `300` fallback                       | 1          |
| 3   | `03-chart-data-endpoint.md`   | New `chart-data.yaml` endpoint (validate spec → pipeline → assemble); manifest export + version bump                          | 1          |
| 4   | `04-compile-report.md`        | `compileReport` chart sections: assemble with containment, two-key binding, requery split to `chart-data`; delete old builder | 1, 2, 3    |
| 5   | `05-docs-changeset-verify.md` | Presentation-contract doc updates, changeset, full test + build + artifact verification                                       | 4          |

## Ordering Rationale

Task 1 is the foundation: it creates `buildFlintOption` as a **new file** and registers it on the
`_analytics` operator without touching `buildEChartsOption.js`, so the tree stays green while both
builders coexist. Tasks 2 and 3 are independent consumers of task 1's interface — the chat path
and the endpoint — and can run in parallel. Task 4 is the big consumer: it migrates
`compileReport`, needs the endpoint from task 3 (its compiled `CallAPI` targets the module-scoped
`chart-data` id) and needs task 2 done because it deletes `buildEChartsOption.js`, which is only
safe once no importer remains. Task 5 documents, changesets, and runs the full verification gate
over the finished state.

## Scope

**Source:** `designs/reporting/flint-charts/design.md`
**Context read:** `findings.md`, `probe.mjs`; source: `buildEChartsOption.js`, `buildDataParts.js`,
`compileReport.js`, `analyticsOperator.js`, `validateChartSpec.js`, `query-data.yaml`,
`resolve-report.yaml`, `module.lowdefy.yaml`, `chat_workspace.yaml`
**Review files skipped:** `review/review-1.md`
