# Task 3: Compiler emits the provenance line and a per-section CSV `⤓`

## Context

`plugins/modules-mongodb-plugins/src/analytics/compileReport.js` compiles the report spec + query
results into the block list the `Dynamic` renders. It builds three arrays — `header`,
`filterBlocks`, `bodyBlocks` — and returns `[...header, ...filterRow, ...bodyBlocks]` (line 660).
The `header` currently holds only the report Title (lines 453-458) and optional description
(459-466). Query-backed sections are emitted in the `for (const section of sections)` loop:
`kpi` → `Statistic` (484-517), `chart` → heading + `EChart` (519-534), `table` → heading +
`AgGridBalham` (536-550). A `download`-type section already wires a `DownloadCsv` action
(617-641) — reuse its shape for the per-section `⤓`.

This task adds two **non-owner** display elements (everyone who can read the report sees them):

- **Provenance line** — who made it, when it was last edited, and when these numbers were
  computed. On a shared report it also names the publisher ("why am I seeing this?"). See the
  design's "Provenance is three facts" — the middle fact is labelled **"last edited," not "spec
  changed."**
- **Per-section CSV `⤓`** — on each query-backed section (`kpi`? no — see below), a download
  control that exports that one section's rows. Per the design's "Export belongs to a section":
  each _query-backed_ section carries its own `⤓`; **a KPI carries none** (one number, already on
  screen).

## Interfaces

- **Consumes (from Task 2):** `compileReport`'s signature gains `created`, `updated`, `owner`,
  `visibility`, `resolvedAt`. Add them to the destructured params
  (`function compileReport({ spec, results, catalog, roles, endpointId, created, updated, owner, visibility, resolvedAt })`).
  `is_owner`/`conversation_id` are added in Task 4 — leave them out here.

## Task

1. **Provenance line.** After the Title/description in `header`, push a provenance block (a
   `Paragraph` or `Markdown`, `layout: { span: 24 }`) stating: made by `owner.name`; last edited
   `updated` (the document's `updated` timestamp — label it "Updated"/"Last edited", **never**
   "spec changed"); and computed `resolvedAt`. When `visibility === "shared"`, include the
   publisher (`owner.name`) as the "why am I seeing this" answer. Format timestamps for display
   (the module formats dates elsewhere with `_dayjs`; match that idiom, or format in JS if the
   compiled block can't carry an operator — keep it consistent with how the Title/description
   blocks are emitted as plain compiled config).
2. **Per-section `⤓`.** For `chart` and `table` sections (query-backed, on-screen result sets),
   emit a download affordance that exports that section's rows to CSV. Reuse the `download`-type
   wiring (lines 617-641): a `CallAPI` to `endpointId` with `payload: { query: section.query }`
   followed by a `DownloadCsv` with `data: { __api: ... }` and
   `filename: safeFilename(section.label)`. Attach it to the section (e.g. in/next to
   `sectionHeading`, or as a small control beside the chart/table) so it reads as belonging to
   that section. **KPI sections get no `⤓`.**
3. `DownloadCsv` and `CallAPI` are already declared in `report.yaml` `types.actions` — no types
   change in this task.

## Acceptance Criteria

- The compiled `header` includes a provenance block naming the owner, a "last edited"/"updated"
  time from `updated`, and a computed time from `resolvedAt`; a shared report also names the
  publisher. No text anywhere says "spec changed".
- Every `chart` and `table` section carries a working CSV download (`CallAPI` → `DownloadCsv`
  over `section.query`); no `kpi` does.
- `pnpm ldf:b` from `apps/demo` is clean; in `.lowdefy/server/build/pages/**` for a seeded report,
  the provenance block and per-section download actions appear in the compiled output.
- Plugin unit test: `compileReport` given the new inputs emits the provenance block and the
  per-section download shape; a KPI-only report emits no download. `CI=true pnpm test` (sandbox
  off).

## Files

- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify: destructure new provenance inputs; emit provenance header block; emit per-section CSV on chart/table.
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify/create: provenance + per-section-CSV assertions.

## Notes

- This is the first of the serial `compileReport.js` chain (3 → 4 → 5 → 6). Keep the diff scoped
  to provenance + CSV so the review is clean.
- Provenance is a **read** for everyone — do not gate it on `is_owner`. The publisher name comes
  from `owner`/`visibility`, not `is_owner`.
