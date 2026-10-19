# Task 2: Playwright harness + `workflow` fixture

## Context

Task 1 created `apps/workflows-test/` (builds and serves on port 3001, empty `workflow_config`). This task adds its `e2e/` harness and the one new fixture the design adds: `workflow`, whose helpers drive the **real emitted Lowdefy APIs** over HTTP and assert via direct Mongo reads. Principle 2 of the design is absolute: no test-only endpoint, no direct engine call — the only thing tail tests skip is the browser, never the Lowdefy API layer.

The existing fixture stack is reused as-is: `ldf` from `@lowdefy/e2e-utils/fixtures` (navigation, `ldf.block()` interaction, `ldf.user()` sessions, request/api tracking) and `mdb` from `@lowdefy/community-plugin-e2e-mdb/fixtures` (Mongo seed/snap/read). See `apps/demo/e2e/fixtures.js` for the merge pattern and `apps/demo/e2e/README.md` for the harness conventions.

**Verified wire facts** (don't re-derive):

- The built server exposes endpoints at `POST /api/endpoints/{endpointId}` with JSON body `{ blockId, payload, pageId }` (see `apps/demo/.lowdefy/server/pages/api/endpoints/[...endpointId].js`). `blockId`/`pageId` are logged/passed through — send stable dummies (e.g. `blockId: 'e2e'`, `pageId: 'e2e'`).
- API endpoint ids are auto-scoped with the module entry id, so wire ids are `workflows/start-workflow`, `workflows/cancel-workflow`, `workflows/close-workflow`, `workflows/get-entity-workflows`, `workflows/get-workflow-overview`, and per-action `workflows/{workflow_type}-{action_type}-submit` (id pattern from `modules/workflows/resolvers/makeWorkflowApis.js:72`).
- The submit payload's wire field is `signal` (part 38) — there is **no** `interaction`, `target_status`, or `force`. Other payload keys: `action_id`, and per kind `fields`/`form`/`form_review`/`comment` (see the payload mapping in `makeWorkflowApis.js` and the operational API yamls under `modules/workflows/api/`).
- Engine collections: `workflows` and `actions`.

## Task

1. **`apps/workflows-test/e2e/playwright.config.js`** — `createConfig` from `@lowdefy/e2e-utils/config`, same shape as `apps/demo/e2e/playwright.config.js` but `port: 3001`.

2. **`apps/workflows-test/e2e/.env.e2e`** (+ gitignored `.env.e2e.local`) — copy the demo's template; `MONGODB_URI` for the test app's database (distinct DB name from the demo's so parallel local runs don't collide).

3. **`apps/workflows-test/e2e/fixtures.js`** — merge `ldf` + `mdb` + a new `workflow` fixture. The `workflow` fixture extends `mdb` (it reads/writes through it) and uses the authenticated Playwright context (`page.request`) so `ldf.user()` sessions apply to tail calls. API per the design:

   - `workflow.start({ workflow_type, entity, ...overrides })` → `{ workflow_id, action_ids }` — POSTs `workflows/start-workflow` (payload shape: `modules/workflows/api/start-workflow.yaml`).
   - `workflow.submit(action_id, { signal, fields?, form?, form_review?, comment? })` — POSTs the per-action `workflows/{type}-{action}-submit` endpoint. Derive `{type}-{action}` from the action doc (read it via `mdb`) so call sites pass only the `action_id`.
   - `workflow.cancel(workflow_id, { reason? })` / `workflow.close(workflow_id)` — POST `workflows/cancel-workflow` / `workflows/close-workflow`.
   - `workflow.assertSummary(workflow_id, expected)` — poll-read the `workflows` doc, `expect.objectContaining`.
   - `workflow.assertGroups(workflow_id, expected)` — same, scoped to the doc's group-status summary.
   - `workflow.assertStatus(action_id, expected)` — poll-read the `actions` doc; `expected` matches `status[0].stage` (string) or an object for richer matching.
   - All POST helpers return the parsed response body and **throw on non-2xx** unless an `expectError: true` option is passed (access-verb and close-rejection specs assert rejections).

   Use `expect.poll` (as `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` does) inside the assert helpers — UI-triggered writes land asynchronously.

4. **Seed-state helper** — the standard tail technique: to test a transition from a given source stage without walking there through the UI, place the action doc at the source stage via `mdb` (seed or direct `collection('actions').updateOne`), then fire the real signal through the real endpoint. Provide `workflow.setStage(action_id, stage)` (a thin `mdb` write that updates `status[0].stage` the way the engine shapes it — copy the doc shape from a real engine write, don't invent it) so cluster specs share one implementation.

5. **Boot smoke spec** — `apps/workflows-test/e2e/scaffold.spec.js`: server boots, `/things` renders, `mdb` connects (seed + read a `things` doc), and `/thing-view?_id={seeded}` renders the `actions-on-entity` surface without error. No workflow fixtures exist yet, so this spec must pass against the empty config.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-workflows-test e2e` builds the app, starts it on 3001, and runs `scaffold.spec.js` green.
- `reuseExistingServer` works: with `pnpm e2e:server` running, `pnpm e2e` skips the rebuild (same posture as the demo's README documents).
- The `workflow` fixture exports exactly the helpers above; no helper touches the engine except through `POST /api/endpoints/workflows/...` or `mdb`.
- Demo e2e (`pnpm --filter @lowdefy/modules-demo e2e`) is untouched and unaffected.

## Files

- `apps/workflows-test/e2e/playwright.config.js` — create
- `apps/workflows-test/e2e/fixtures.js` — create (merge + `workflow` fixture; if the fixture grows, split into `e2e/workflowFixture.js` and import)
- `apps/workflows-test/e2e/.env.e2e` — create
- `apps/workflows-test/e2e/scaffold.spec.js` — create
- `apps/workflows-test/e2e/snaps/.gitkeep` — create (mirrors demo layout for `mdb` snaps)

## Notes

- `workflow.start` can't be exercised end-to-end until task 3 adds the first workflow fixture — implement it now, but its first green assertion lives in `form-lifecycle.spec.js`. The smoke spec only proves the harness substrate.
- Keep the fixture helpers thin: they are wire drivers + DB readers, not a DSL. The old design's `control`-action test DSL is explicitly dead; don't reintroduce it as fixture sugar.
- Read `.claude/guides/` is not needed here, but `/r:dev-playwright-gen`'s documented `ldf`/`mdb` fixture API is the reference for interaction patterns.
