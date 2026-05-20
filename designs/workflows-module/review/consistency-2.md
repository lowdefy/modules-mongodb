# Consistency Review 2

## Summary

Top-level sweep following [review-1](review-1.md) (testing conventions). Checked all 23 part designs, all task files, both review folders, and the implementation plan for drift from the new Testing conventions subsection in `design.md`. Found no drift requiring file changes — one soft surfacing question raised with the user and resolved as a deliberate no-op (trust the review annotation rather than pre-empt `/r:design-task`).

## Files Reviewed

**Top-level:**

- `designs/workflows-module/design.md`
- `designs/workflows-module/implementation-plan.md`
- `designs/workflows-module/review/review-1.md`
- `designs/workflows-module/review/consistency-1.md`

**Part designs (23):**

- `parts/01-call-api-primitive/design.md` through `parts/23-close-workflow-handler/design.md`

**Per-part reviews:**

- `parts/04-workflow-config-schema/review/{review-1, consistency-1}.md`
- `parts/05-start-cancel-handlers/review/{review-1, consistency-2, consistency-3}.md`
- `parts/06-submit-action-writes/review/review-1.md`
- `parts/12-resolver-pages/review/{review-1, consistency-1}.md`
- `parts/21-entity-type-to-collection/review/{review-1, consistency-1}.md`

**Task files:**

- `parts/03-engine-plugin-shell/tasks/` (tasks.md + 5 files)
- `parts/04-workflow-config-schema/tasks/` (tasks.md + 3 files)
- `parts/05-start-cancel-handlers/tasks/` (tasks.md + 6 files)
- `parts/12-resolver-pages/tasks/` (tasks.md + 3 files)
- `parts/14-form-components-library/tasks/` (tasks.md + 9 files)
- `parts/21-entity-type-to-collection/tasks/` (tasks.md + 5 files)

Targeted grep across all design + task files for: `unit test`, `jest`, `node:test`, `node --test`, `@jest`, `mongodb-memory`, `in-memory mongo`, `test framework`, `test harness`, `test runner`, `test posture`.

## Decisions Extracted from [review-1.md](review-1.md)

1. **Jest is the unit-test framework.** Files colocate as `*.test.js` next to source under `modules/workflows/` and `plugins/modules-mongodb-plugins/src/`. (review-1 #1 → resolved → landed in [design.md § Testing conventions](../design.md#testing-conventions).)
2. **Handler functions use `mongodb-memory-server`** booted per test file. (review-1 #1 → resolved.)
3. **`apps/demo/` gets no unit tests** — Lowdefy app, e2e only via [part 22](../parts/22-workflows-e2e-suite/design.md). (review-1 #1 → resolved.)
4. **Parts 3, 4, 5, 14 are grandfathered.** Convention applies forward from part 6. (review-1 #3 → resolved → landed in `design.md § Testing conventions` and [part 22 § Out of scope](../parts/22-workflows-e2e-suite/design.md#out-of-scope--deferred).)
5. **Harness setup lands as part 6's first task** — not a separate Part 24. Includes devDeps (`jest`, `@swc/jest`, `mongodb-memory-server`), `jest.config.js`, `inMemoryMongo.js` helper, `test` scripts, and the `makeWorkflowsConfig.test.js` rewrite from `node:test` to Jest. (review-1 #2 → resolved.)

## Inconsistencies Found

None requiring file changes. Surveyed surface and findings below.

### Surveyed and consistent

- **Parts 6, 7, 8, 9, 10, 11, 12, 13, 15, 19 — "Unit tests:" Verification headings.** None name a framework; the top-level convention now owns that. Repeating "Jest" per-part would duplicate the convention; the absence is the correct posture.
- **Parts 1 ("Unit tests in `@lowdefy/api`") and 2 ("Unit tests in the build package").** Refer to upstream lowdefy-repo test suites, not this module's. Out of scope for the convention.
- **Part 5 design.md:67 ("Part 05 ships no unit tests of its own").** Grandfathered per decision #4. The existing cross-reference to `tasks/tasks.md § Verification posture` is complementary to the new top-level grandfather note, not contradictory.
- **Part 14 design.md:60 ("This part does not ship its own test harness").** Grandfathered per decision #4; consistent.
- **Part 22 out-of-scope bullet (grandfathered parts).** Already updated to name parts 3, 4, 5, 14 and link to the top-level convention during the action-review pass.
- **Part 4 design.md:49 ("Unit tests on `makeWorkflowsConfig`").** Grandfathered per decision #4; the existing test file is `node:test`-shaped and slated for rewrite under decision #5. Part 4's Verification bullet doesn't need to capture the framework — the rewrite is part 6's task, not part 4's.
- **Implementation plan.** No testing-posture content; no drift surface.

### Soft finding raised with user (resolved as no-op)

**Topic:** The `makeWorkflowsConfig.test.js` rewrite commitment lives only in [review-1.md finding #2's annotation](review-1.md). Part 6 has no `tasks/` directory yet; the rewrite will be picked up by `/r:design-task workflows-module/parts/06-submit-action-writes` when it generates part 6's task prompts.

**Options presented:**

- (i) Trust the review annotation; no primary-design file change.
- (ii) Add a one-line forward reference to the top-level `§ Testing conventions` subsection.

**Resolution:** Option (i). Pre-empting `/r:design-task`'s job would add friction; the review file is itself a primary design artifact and a reader reaching part 6 would find the obligation when generating tasks.

## No Issues

- No internal contradictions within `design.md` between the new Testing conventions subsection and the rest of the conventions.
- No stale references to a pre-Jest framework in any in-flight design file.
- No drift between part 22's out-of-scope bullet and the top-level grandfathered-parts list.
- No task file references a unit-testing framework, mock layer, or harness shape — all task files predate the convention and are agnostic.

## Next Step

Run `/r:design-task workflows-module/parts/06-submit-action-writes` when part 6 is ready to start. The first task it generates should be the Jest harness setup (devDeps + `jest.config.js` + `inMemoryMongo.js` helper + `test` script wiring + `makeWorkflowsConfig.test.js` rewrite from `node:test` to Jest) per [review-1 finding #2's annotation](review-1.md).
