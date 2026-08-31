# Task 5: Sections become cards + the Dynamic allowlist + the drift test

## Context

**This is the risky structural change, and it lands alone** (design "Risks"):
a missed block type in the `Dynamic` allowlist blanks the **whole report**, not
one section — and the demo can never catch it, because at runtime the check is
membership in the app's **client bundle** and the demo bundles `Card` anyway
(`findings.md` §8). The compile-time drift test below is the only guard that
works everywhere.

Today every compiled block is a sibling in one wrapping flex area — the "rows"
are wrap lines, not containers. Cards introduce the first real nesting into
compiled output. Nesting inside a `Dynamic` fragment is **verified supported**
(`findings.md` §8: fragments build with the same recursive machinery as static
pages); the comment on `brokenSectionBlocks` in `compileReport.js` (~line 664,
"no wrapping Box — so the page's byId lookups reach them") predates that
verification and must be corrected here — it is not a platform constraint.

The head row (`sectionHeading` span 20 + `sectionDownload` span 4) stays
**outside** the card — the corpus pattern (6 of 7 reports put the heading above
the card). Paired-section `Box` mechanics come in task 6; this task adds `Box`
to the allowlist alongside `Card` so the allowlist changes once.

## Interfaces

- **Consumes:** `compileReport`'s `theme` param (task 1) and `colors`/`width`
  threading (tasks 3–4) — wrappers must not disturb them; inner block ids and
  state bindings (`sections.{id}.…`) are load-bearing for `chart-data` and the
  e2e suites.
- **Produces:**
  - Wrapper id convention later tasks rely on: **`${section.id}_card`**, type
    `Card`, carrying the section's `layout.span`; the inner block keeps
    `id: section.id` unchanged.
  - `Card` and `Box` declared in `report.yaml`'s `Dynamic`
    `properties.types.blocks`.
  - The extended `compileReport.declared.test.js` drift guard (later tasks
    extend it further as they emit new shapes).

## Task

1. **`modules/ai-reporting/pages/report.yaml`**: add `Card` and `Box` to
   `properties.types.blocks` (~line 44).
2. **`compileReport.js` wrappers** (spans unchanged in this task — derivation
   is task 6):
   - `kpi`: `Card` (span 6) containing the `Statistic`. Tiles on one wrap line
     get equal height from the flex line's default stretch — the card is what
     makes that visible (the current row's labels sit at different heights
     because `Statistic` self-sizes). Label → value order is `Statistic`'s
     native rendering; units stay on the number via the contract `format`.
   - `chart`: head row stays flat; `Card` (span 24) contains the `EChart`.
   - `table`: head row stays flat; `Card` (span 24) contains the
     `AgGridBalham`.
   - `markdown`: **no card** — prose narrates between cards.
   - `download`, broken/withheld `Alert`s, filter controls: unchanged here.
   - Card properties: minimal — no card title (headings live outside; the
     downloads card in task 8 is the exception, per the design table).
3. **Correct the stale `brokenSectionBlocks` comment** (~line 664) to record
   that nested fragments are supported (cite `findings.md` §8) and that the
   flat shape there is now just historical.
4. **Check `withTopGap`** still stamps the section gap on the right blocks: it
   walks wrap lines by accumulated span, and a span-24 card is its own wrap
   line after the head row — assert the gap lands on the head row, not the
   card.
5. **The drift test** (design acceptance item 8) **already exists** — extend
   it, do not write a second one.
   `plugins/modules-mongodb-plugins/src/analytics/compileReport.declared.test.js`
   already parses `report.yaml` with `js-yaml`, walks the compiled output, and
   asserts every emitted block / action / operator type is declared on the
   `Dynamic` block; its fixture covers all three filter controls, both format
   paths, markdown, a download, and the broken-section `Alert`. Two changes:
   - Its `walkBlocks` recurses `block.blocks` only. Cards and Boxes must be
     walked whichever shape `compileReport` emits — add `block.areas?.*.blocks`
     recursion so a child inside an `areas.content.blocks` card can never
     escape the check.
   - Add an assertion naming the new wrapper types explicitly (`Card`, `Box` in
     `used.blocks`), so a future refactor that stops emitting cards fails here
     rather than silently reducing the test's coverage to nothing.

## Acceptance Criteria

- `compileReport.declared.test.js` passes — and **fails** if `Card` is removed
  from `report.yaml` (verify once by hand, don't commit the failing state).
- `compileReport.test.js` updated: wrapper shape (`${section.id}_card` around
  an unchanged inner block), state bindings intact for filtered sections.
- Plugin build; `pnpm ldf:b` clean; `pnpm e2e` green — `report-render.spec.js`
  / `formatted-report.spec.js` structure expectations updated in the same
  change. Watch specifically for a blanked report (the whole-report fallback
  slot rendering instead of sections) — that is the allowlist failure mode.

## Files

- `modules/ai-reporting/pages/report.yaml` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.test.js` — modify
- `plugins/modules-mongodb-plugins/src/analytics/compileReport.declared.test.js` — modify
- `apps/demo/e2e/ai-reporting/report-render.spec.js`, `formatted-report.spec.js` — update expectations

## Notes

- `MAX_DYNAMIC_DEPTH = 5` counts nested **Dynamic** blocks only — Card/Box
  nesting doesn't approach it; no action needed, recorded so nobody "fixes" it.
- Keep e2e selectors on the inner section ids, not the card wrappers, so later
  layout changes don't churn them.
