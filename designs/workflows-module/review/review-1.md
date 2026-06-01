# Review 1 — Testing conventions missing from top-level design

Focus: the design tree references unit tests across ~10 parts but never names the framework, harness, or file layout. New contributors landing on part 6 or part 13 have no way to know whether to write Jest-style with `mongodb-memory-server`, mock the dispatcher, or hand-roll something. The decision is implicit in part 22's "unit-test verification in each engine / resolver / UI part continues to live there" but no part says *how*.

## Substantive issues

### 1. No documented test framework or harness for unit tests

> **Resolved.** Added a "Testing conventions" subsection under [Conventions across parts](../design.md#conventions-across-parts) in the top-level design. Records Jest as the framework, colocated `*.test.js` layout, pure-functions-without-Mongo + handlers-with-`mongodb-memory-server` split, no unit tests in `apps/demo/`, the e2e-vs-unit decision rule, and an explicit carve-out for part 5's existing opt-out.

[design.md:111–116](../design.md) ("Conventions across parts") covers identifiers, scope deferrals, and open-question locality, but says nothing about testing. The implicit position scattered across part Verification sections is:

- [Part 6 design.md:120–126](../parts/06-submit-action-writes/design.md) — "Unit tests on `handleSubmit`: priority rule honored; per-entry `force: true` bypasses…"
- [Part 7 design.md:63](../parts/07-group-state-machine/design.md) — "Unit tests on `deriveGroupStatus`: table-driven over every status combination."
- [Part 13 design.md:50–55](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) — "Unit tests: Worked-example onboarding workflow produces `update-action-qualify`…"
- [Part 22 design.md:9](../parts/_next/22-workflows-e2e-suite/design.md) — "The unit-test verification in each engine / resolver / UI part continues to live there. This part is the *integration* layer."

But nowhere in the design tree is it recorded that:

- The framework is **Jest** — the established convention across the rest of the org. Lowdefy itself uses Jest 28 with `@swc/jest`; this repo has no Jest config wired yet, only Playwright for e2e.
- Engine handlers that hit Mongo should use `mongodb-memory-server` directly inside Jest tests (same dep that backs Playwright's `mdb` fixture from `@lowdefy/community-plugin-e2e-mdb`, so unit and e2e share the underlying Mongo posture).
- `*.test.js` files colocate next to source under `modules/workflows/` and `plugins/modules-mongodb-plugins/src/connections/` — mirroring Lowdefy's `packages/operators/src/evaluateOperators.test.js` convention.
- The Lowdefy app at `apps/demo/` does not get unit tests — it's YAML consumed by the runtime; coverage is Playwright e2e only (part 22).
- The existing `modules/workflows/resolvers/makeWorkflowsConfig.test.js` is currently written for `node:test`. Adopting the Jest convention means rewriting that one file to Jest as part of the harness landing.

**Why this matters.** Part 6 starts soon. Its Verification list says "Unit tests on `handleSubmit`" — but `handleSubmit` reads/writes Mongo, so the contributor either invents an ad-hoc mock layer or stops to design a harness. Either path drifts away from part 7's pure-function `deriveGroupStatus` tests and part 13's resolver-output tests, which need *no* Mongo at all. Without a top-level convention, each part will pick its own posture and the suite fragments.

**Fix.** Add a "Testing conventions" subsection to [design.md § Conventions across parts](../design.md#conventions-across-parts) (around line 116). Suggested wording:

```markdown
### Testing conventions

- **Unit tests** use Jest. Files colocate as `*.test.js` next to source under
  `modules/workflows/` and `plugins/modules-mongodb-plugins/src/`. Mirrors
  Lowdefy's own convention (`packages/operators/src/evaluateOperators.test.js`
  in lowdefy/lowdefy) and the established Jest posture elsewhere in the org.
- **Pure functions** (state-machine reducer in part 7, resolver transforms in
  parts 12/13/15, payload validators in part 6) test without Mongo. Table-driven
  where the input space is enumerable.
- **Handler functions** that read/write Mongo use `mongodb-memory-server` booted
  per test file. Same dependency that backs Playwright's `mdb` fixture
  (`@lowdefy/community-plugin-e2e-mdb`), so unit and e2e share the underlying
  Mongo posture.
- **No unit tests in `apps/demo/`.** The Lowdefy app is YAML consumed by the
  runtime; coverage is Playwright e2e via [part 22](parts/22-workflows-e2e-suite/design.md).
- **E2E vs. unit split.** A bug that could exist in the plugin JS without the
  Lowdefy runtime needs a unit test; a bug that only manifests through page →
  action → endpoint → DB → re-render needs an e2e spec.
- **Part 5's opt-out** ([part 5 design.md:67](parts/05-start-cancel-handlers/design.md))
  stands. The dispatcher-mock surface drift rationale is part-specific, not a
  precedent for other parts.
```

### 2. Test-harness setup needs a clear owner

> **Resolved.** Committed to option (a): the harness lands as part 6's first task (devDeps `jest` + `@swc/jest` + `mongodb-memory-server`, `jest.config.js`, `inMemoryMongo.js` helper, `test` scripts, and the `makeWorkflowsConfig.test.js` rewrite from `node:test` to Jest). Part 6 has no `tasks/` directory yet; `/r:design-task` will pick this up when it generates part 6's task prompts. Escalate to a new Part 24 only if the harness grows past two helper files during implementation.

Adopting Jest in this repo is real setup work. Concretely, ahead of the first unit test landing:

- Add devDeps: `jest`, `@swc/jest` (or equivalent ESM transformer), `mongodb-memory-server`.
- Add `jest.config.js` — likely with a SERVER/CLIENT project split if any test ever needs jsdom, but server-only to start since the WorkflowAPI is Node-side.
- Add a `pnpm test` script at the right level (root + per-package), plus CI wiring.
- Add a shared `inMemoryMongo.js` helper that handler tests import (boots `MongoMemoryServer`, returns a `db` with per-test cleanup).
- Rewrite `modules/workflows/resolvers/makeWorkflowsConfig.test.js` from `node:test` to Jest so the convention is uniform from day one.

That work belongs somewhere. Two viable options:

- **(a) Fold into part 6's first task.** Part 6 is the first part that will write handler unit tests against Mongo. Its `tasks/` directory can carry a "test-harness-setup" task ahead of the `handleSubmit` task. Lean toward this if the harness stays small (one config file + one helper + the test-script wiring + the resolver-test rewrite).
- **(b) Spin out a Part 24 — `test-harness-setup`.** Treat it like parts 1–2 (foundational) but for tests. A reviewer-day's worth of work; ships before any part that depends on it. Lean toward this if the harness ends up non-trivial (multiple shared fixtures, custom matchers, transformer pinning, CI integration, or contention with shipped resolver code).

**Lean.** Option (a) — fold into part 6 as a precursor task. The harness is genuinely small for what part 6 needs on day one, and growing it incrementally as parts 7, 8, 9 land their own tests is cheaper than predicting the full surface up front. If it grows past two helper files, lift out then.

Avoid putting this into part 22 — part 22 is the e2e (integration) layer; mixing unit-test harness into it dilutes its scope and re-opens the Verification split it just cleaned up.

**Fix.** Add the setup task to [`parts/06-submit-action-writes/tasks/tasks.md`](../parts/06-submit-action-writes/tasks/tasks.md) once finding #1 is resolved and the convention is documented. Steps: install devDeps, add `jest.config.js`, add `inMemoryMongo.js` helper, add `test` scripts, rewrite `makeWorkflowsConfig.test.js` to Jest. If complexity grows during implementation, escalate to option (b) (new Part 24).

### 3. Part 22's "unit-test backfill" out-of-scope bullet under-specifies which parts are exempt

> **Resolved.** Added a grandfathered-parts bullet to the new Testing conventions subsection ("Parts 3, 4, 5, 14 are grandfathered…") and updated part 22's out-of-scope bullet to name all four parts (3, 4, 5, 14) and link back to the top-level convention.

[Part 22 design.md:83](../parts/_next/22-workflows-e2e-suite/design.md):

> **Unit-test backfill for already-implemented parts 3, 4, 14.** Those parts shipped without unit tests by design; their e2e coverage flows naturally from the engine specs that depend on them (parts 5+).

This is correct for parts 3, 4, 14 — they shipped pre-convention. But part 5 also shipped without unit tests (with its own opt-out rationale in [part 5 design.md:67](../parts/05-start-cancel-handlers/design.md)). The convention proposed in finding #1 above should explicitly say "parts 3, 4, 5, 14 are grandfathered; the convention applies from part 6 forward" so a future reader doesn't backfill against the wrong baseline.

**Fix.** Once finding #1 lands, add a single line to the "Testing conventions" subsection: "Parts 3, 4, 5, 14 shipped before this convention; their existing posture stands."

## Files affected

- `designs/workflows-module/design.md` — add "Testing conventions" subsection under `## Conventions across parts`.
- `designs/workflows-module/parts/06-submit-action-writes/tasks/tasks.md` — add a test-harness-setup task ahead of `handleSubmit` work (Jest config + `mongodb-memory-server` + `inMemoryMongo` helper + `test` script + rewrite of the existing `node:test` resolver test).
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — rewrite from `node:test` to Jest when the harness lands.

## Out of scope for this review

- Choosing between Jest and other runners. Jest is the recommendation because it matches established org-wide convention and Lowdefy's own posture; the one existing `node:test` file in this repo is a holdover, not a precedent.
- Updating already-shipped parts (3, 4, 5, 14) to add unit tests. The convention applies forward from part 6.
- Choosing between the per-part spec file layout and a worked-example-driven layout in part 22 — already an open question in [part 22 design.md:100](../parts/_next/22-workflows-e2e-suite/design.md).
