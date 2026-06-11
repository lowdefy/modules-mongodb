# Block E2E Suite — Playwright tests for all custom blocks

> **Status: STUB.** Drafted 2026-06-11 as a placeholder when Part 40
> (`designs/workflows-module/parts/40-simple-action-surfaces/design.md`)
> dropped its React component-test requirement — the repo has no
> block-component test infrastructure (root jest is node-env, no JSX/jsdom),
> and bootstrapping one per feature part is the wrong altitude. This design is
> **not in any current wave's scope**; flesh out via `/r:design` before
> implementing.

## Problem

`plugins/modules-mongodb-plugins/src/blocks/` ships six custom React blocks —
`ActionSteps`, `ContactSelector`, `DataDescriptions`, `EventsTimeline`,
`FileManager`, `SmartDescriptions` — with **zero automated coverage**. Their
behaviour is only exercised indirectly where a demo-app e2e flow happens to
cross them. Block-level contracts (events like `onActionClick`, navigate
defaults, disabled/linkless states, property-driven rendering) have no home
for direct regression tests.

## Direction (to be designed)

Port the Lowdefy repo's own block-testing pattern rather than inventing one —
every `@lowdefy/blocks-*` package tests blocks with **Playwright against a
tiny fixture Lowdefy app**, via the published `@lowdefy/block-dev-e2e` utility
(see `lowdefy/packages/utils/block-dev-e2e/README.md`, v5.3.0 in the local
checkout):

- `plugins/modules-mongodb-plugins/e2e/playwright.config.js` —
  `createPlaywrightConfig({ packageDir, port })` (unique port; the util boots
  the fixture app's dev server).
- `plugins/modules-mongodb-plugins/e2e/app/lowdefy.yaml` — minimal fixture app
  that `_ref`s one fixture page per block.
- Per block: `src/blocks/{Block}/tests/{Block}.e2e.yaml` (fixture page
  exercising the block's properties/events/states) +
  `{Block}.e2e.spec.js` (`getBlock` / `navigateToTestPage` helpers; the
  two-step wrapper→antd-locator pattern).
- `package.json` scripts: `e2e`, `e2e:ui`.

This tests real rendered behaviour (antd included) with no jest/jsdom/swc-JSX
infrastructure at all, which is why it supersedes the component-test idea.

## First candidates

The `onActionClick` contracts Part 40 ships on `ActionSteps` and
`EventsTimeline`: wired → fires the action object; unwired → navigates via
`action.link`; linkless rows inert. Part 40's design records the deferral
pointing here.

## Open questions (for the full design)

1. Is `@lowdefy/block-dev-e2e` published at a version matching this repo's
   Lowdefy dependency, and does it run against this repo's pnpm/antd setup?
2. Blocks needing backend collaborators (`FileManager` S3 policy requests,
   `ContactSelector` requests) — mock at the fixture-app request layer or
   scope those blocks' fixtures to display states?
3. CI wiring and runtime budget alongside the existing `apps/demo/e2e` suite;
   division of labour (block contracts here, app flows there).
4. One fixture app for the whole plugin package vs per-block apps.
