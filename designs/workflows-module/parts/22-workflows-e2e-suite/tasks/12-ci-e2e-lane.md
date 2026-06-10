# Task 12: CI e2e lane

## Context

The design's Verification requires: "CI gains a lane matching the demo's e2e posture", and its open question asks to "confirm the lane reuses the demo's e2e build/start pattern".

**Discovered fact the design didn't capture:** there is currently **no CI e2e lane at all** — `.github/workflows/` contains only `release.yaml`. "Matching the demo's e2e posture" therefore means matching the demo's *local* posture (`pnpm e2e` = full `lowdefy build` + `lowdefy start` + Playwright, per `apps/demo/e2e/README.md` and `apps/demo/package.json` scripts), and this task **creates** the lane rather than copying one. The design's cost note stands: a second app build is ~60–90s; accepted.

The design also requires the demo's `onboarding-happy-path.spec.js` to *stay* green — a property only CI can hold over time — so the lane covers both apps.

## Task

1. Create `.github/workflows/e2e.yaml` (or extend the repo's CI conventions if a non-release workflow file pattern exists by then) with two jobs, runnable in parallel:
   - **workflows-test e2e**: install (pnpm, with the repo's store caching), install Playwright browsers (cache them), provide MongoDB (service container or `mongodb-memory-server` if the harness self-provisions — match whatever `MONGODB_URI` in `e2e/.env.e2e` expects; a `mongo` service container with the URI exported is the straightforward path), then `pnpm --filter @lowdefy/modules-workflows-test e2e`. The Playwright config's webServer handles build + start (port 3001).
   - **demo e2e**: same recipe, `pnpm --filter @lowdefy/modules-demo e2e` (port 3000). If the demo suite needs secrets the runner lacks (check `apps/demo/e2e/.env.e2e` and any infisical-only vars), scope this job to the workflows specs or the smoke spec and document why in the workflow file.
2. Trigger on pull requests touching `apps/workflows-test/`, `apps/demo/`, `modules/`, or `plugins/` (path filters keep design-only PRs fast), plus `workflow_dispatch`.
3. Upload Playwright traces/reports as artifacts on failure.
4. Verify the lane end-to-end on a branch: push, confirm both jobs run green, confirm a deliberately broken spec fails the lane (then revert the break).

## Acceptance Criteria

- A PR touching app/module/plugin code runs both e2e jobs; both green on the suite as of tasks 3–11.
- The lane uses the same build/start mechanism as local runs (`pnpm e2e` → Playwright webServer → `lowdefy build` + `start`) — no bespoke CI-only server path.
- Failure artifacts (Playwright report) are downloadable from a failed run.
- The negative test (broken spec → red lane) was performed and reverted.

## Files

- `.github/workflows/e2e.yaml` — create

## Notes

- Lowdefy's build may need network access for plugin resolution; the repo's `pnpm install` posture in `release.yaml` is the reference for registry/auth setup.
- Keep the two jobs independent — a demo flake must not mask a workflows-test regression, and vice versa.
