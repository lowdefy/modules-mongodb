# Implementation Tasks — Report Visual Polish

## Overview

Implements `designs/ai-reporting/follow-ups/report-visual-polish/design.md`: the
chart pass (theme object, palette, mark styling, width-aware legend/rotation,
report-scoped colour identity) followed by the structure pass (sections become
cards, derived layout, filter-bar and downloads chrome), closed by a demo
consumer that exercises every rule and the docs that follow the implementation.

## Global Constraints

- **No new agent surface.** The section vocabulary and presentation contract
  stay exactly as they are; `validateReportSpec`'s allowed keys are unchanged.
  New `chart-data` payload fields are client-requery surface, not agent surface.
- **Never use client names** in any git-tracked content (code, comments, tests,
  fixtures, commits).
- **`flint-chart` stays pinned exactly at `0.5.0`**; post-pass tests assert the
  pre-rewrite option shape so a version bump fails loudly, not silently.
- **Nothing is styled from `colorPrimary`** — it belongs to the consuming app
  and must not be assumed.
- **Palette** is the 8-slot reference set, light
  `#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948`
  (validated in `findings.md` §4) — re-validate against the final card surface
  (`#ffffff`) with the dataviz skill's `validate_palette.js` at implementation.
  Dark stays validated-but-unshipped.
- **Mechanical gates per task:** targeted jest suites (`pnpm test -- <name>` at
  the repo root), then `pnpm --filter @lowdefy/modules-mongodb-plugins build`
  (the app loads `dist/`, not `src/`), then `pnpm ldf:b` from `apps/demo`, then
  `pnpm e2e` — **updating the chart-data / report-render / formatted-report
  spec expectations deliberately in the same change**, never loosening them to
  pass.
- **No changesets** in this work.
- **`docs/` is touched only in the final task**, from the implementation.

## Tasks

| #   | File                          | Summary                                                                    | Depends On |
| --- | ----------------------------- | -------------------------------------------------------------------------- | ---------- |
| 1   | `01-chart-theme.md`           | Shared ECharts theme object wired to all three `EChart` sites              | —          |
| 2   | `02-palette-marks-pie-cap.md` | Palette two-write override, mark styling, pie 6 + Other cap                 | —          |
| 3   | `03-width-threading.md`       | `width` param; legend orientation + label-rotation override; every caller   | 2          |
| 4   | `04-colour-identity.md`       | Report-scoped colour identity: union pass, slot map, requery threading      | 3          |
| 5   | `05-cards-and-allowlist.md`   | Sections become cards; `Card`/`Box` in the `Dynamic` allowlist; drift test  | 1, 4       |
| 6   | `06-layout-derivation.md`     | Runs, chart pairing, KPI tile rows, trailing promotion, span-driven widths  | 5          |
| 7   | `07-filter-bar.md`            | One shared scope line replaces per-control notes; Reset control             | 6          |
| 8   | `08-downloads-and-tables.md`  | Download runs become one titled card; table `defaultColDef.flex: 1`         | 6          |
| 9   | `09-demo-and-docs.md`         | Demo report exercising every rule; docs; acceptance-bar sweep               | 7, 8       |

## Ordering Rationale

- **Two independent starts.** Task 1 (theme: module YAML + a `compileReport`
  parameter) and task 2 (palette/marks: `buildFlintOption` only) touch disjoint
  files and can run in parallel.
- **The chart lane is serial through `buildFlintOption`:** 2 → 3 → 4 each
  rewrite the same post-pass, and 3 establishes the payload-threading pattern
  (width through `requeryActions` → `chart-data`) that 4 reuses for the colour
  map.
- **The middle is serial through `compileReport.js`.** Tasks 3–8 all edit it
  and `compileReport.test.js`; parallelising them buys merge conflicts, not
  time. Task 5 sits after 4 so the risky structural change (cards + allowlist)
  lands **alone** in its own attributable commit, exactly as the design's risk
  section asks; task 6 builds derivation on top of cards.
- **7 and 8 can run in parallel**: filter-bar text (`filterControlBlock`,
  ~line 842) and downloads/table (~lines 1490–1550) live in distant regions of
  `compileReport.js` and merge cleanly.
- **9 is last** — it is the first task that exercises the whole feature: the
  extended demo report, the docs, and the acceptance-bar sweep.

Steps 1–4 match the design's "chart pass" (they improve the chat panel on their
own, with no structural change); 5–8 are its "structure and chrome"; 9 is its
step 6.

## Execution notes

- Jest suites that hit Mongo fail spuriously under the sandbox — run the full
  suite as `CI=true pnpm test` with the sandbox off; targeted analytics suites
  run fine anywhere.
- `pnpm e2e` exits on its own (builds, runs `MongoMemoryServer`, terminates) —
  background it and read the log; never run `lowdefy dev`/`start` in the
  foreground.
- Acceptance-bar items 3–6 (scroll height, collisions, colour identity on
  screen, deck side-by-side) need a running app with data: they are
  `/r:dev-test` + screenshot steps at PR review, listed in task 9 — not build
  gates.

## Scope

**Source:** `designs/ai-reporting/follow-ups/report-visual-polish/design.md`
**Context read:** `findings.md`, `probe.mjs`, `wireframes.html`,
`wireframes/README.md`, `../../flint-charts/design.md`, `../../ux/design.md`,
plus source verification of `compileReport.js`, `buildFlintOption.js`,
`buildDataParts.js`, `chart-data.yaml`, `resolve-report.yaml`, `report.yaml`,
`chat_workspace.yaml`, `expand_chart_modal.yaml`, and the e2e suites.
**Review files skipped:** `review/review-1.md`, `review/review-2.md`.
