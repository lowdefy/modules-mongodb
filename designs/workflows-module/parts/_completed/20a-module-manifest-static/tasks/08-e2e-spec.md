# Task 8: Author tracker-only-onboarding Playwright spec

## Context

After task 7, the demo's tracker-only onboarding flow runs end-to-end manually per the design's six-step verification walk-through. This task automates that walk-through as a single Playwright spec that lives at `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js`.

The repo's existing Playwright patterns: read `apps/demo/e2e/` to understand the test harness. Per CLAUDE.md and the project's skill list, Lowdefy e2e tests use `ldf` and `mdb` fixtures (`r:dev-playwright-gen` skill describes the pattern in detail) — use that pattern.

The spec covers the design's verification walk-through (`design.md` § Verification, manual walk-through steps 1–6):

1. Lead-view renders three tracker actions in the right initial state.
2. "Start onboarding" transitions the first tracker to `in-progress`.
3. `workflow-overview` and `group-overview` render correctly.
4. Closing the child workflow flips the parent tracker to `done`.
5. The second tracker unblocks via `blocked_by` re-evaluation.
6. `cancel-workflow` flips remaining trackers to `not-required` and the workflow lifecycle to `cancelled`.

This part contributes one spec to the part-22 e2e suite. Engine-internal e2e specs (parts 6/8/9/11) defer to part 20b.

## Task

Create `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` (or `.ts` if the existing e2e harness is TypeScript).

The spec should:

1. **Use the `mdb` fixture** to seed a lead document into the `leads` collection before the test, and to clean up afterward.
2. **Use the `ldf` fixture** to navigate, click buttons, and assert page state.
3. **Be one test, not six** — one Playwright `test()` that walks the steps in order. State is sequential; splitting into six tests would require teardown/setup between each.
4. **Assert against rendered UI**, not DB state, except where the engine-internal subscription requires a DB read to confirm the parent tracker's `child_workflow_id` got written.

### Walk-through

```
test('tracker-only onboarding flow', async ({ ldf, mdb, page }) => {
  // 1. Seed a lead and navigate to lead-view
  const lead = await mdb.insertOne('leads', { name: 'Test Lead', email: 'test@example.com' });
  await ldf.goto(`/leads/lead-view?_id=${lead._id}`);

  // 2. actions-on-entity renders three tracker actions, first action-required, others blocked
  await expect(page.locator('[data-action-type="track-step-1"]')).toContainText('action-required');
  await expect(page.locator('[data-action-type="track-step-2"]')).toContainText('blocked');
  await expect(page.locator('[data-action-type="track-step-3"]')).toContainText('blocked');

  // 3. Click "Start onboarding" → first tracker transitions to in-progress
  await page.getByRole('button', { name: 'Start onboarding' }).click();
  await expect(page.locator('[data-action-type="track-step-1"]')).toContainText('in-progress');

  // 4. workflow-overview renders all three actions in declaration order
  await page.locator('[data-workflow-overview-link]').click();
  await expect(page).toHaveURL(/workflows\/workflow-overview/);
  await expect(page.locator('[data-action-card]')).toHaveCount(3);

  // 5. group-overview renders the first group's single action
  await page.locator('[data-group-overview-link]').first().click();
  await expect(page).toHaveURL(/workflows\/group-overview/);
  await expect(page.locator('[data-action-card]')).toHaveCount(1);

  // 6. Back to lead-view → click "Close installation child"
  await page.goBack();
  await page.goBack();
  await page.getByRole('button', { name: /Close installation child/ }).click();

  // 7. First tracker transitions to done; second tracker unblocks to action-required
  await expect(page.locator('[data-action-type="track-step-1"]')).toContainText('done');
  await expect(page.locator('[data-action-type="track-step-2"]')).toContainText('action-required');

  // 8. Cancel the parent workflow
  await page.getByRole('button', { name: /Cancel workflow/ }).click();
  // (If a cancel-onboarding button doesn't exist yet, drive via the actions-on-entity surface or skip this step
  // and only run cancel via direct API in a separate teardown step.)

  // 9. Remaining trackers flip to not-required, lifecycle badge shows cancelled
  await expect(page.locator('[data-action-type="track-step-2"]')).toContainText('not-required');
  await expect(page.locator('[data-action-type="track-step-3"]')).toContainText('not-required');
  await expect(page.locator('[data-workflow-status]')).toContainText('cancelled');

  // 10. Clean up
  await mdb.deleteOne('leads', { _id: lead._id });
  await mdb.deleteMany('workflows', { entity_id: lead._id });
  await mdb.deleteMany('actions', { entity_id: lead._id });
});
```

The exact selectors (`[data-action-type=...]`, `[data-action-card]`, etc.) depend on how the workflows-module components render. Inspect `modules/workflows/components/actions-on-entity.yaml`, `modules/workflows/pages/workflow-overview.yaml`, `modules/workflows/pages/group-overview.yaml` and choose stable selectors. Where the components don't expose stable test handles, add `data-*` attributes via the components themselves (those changes are tiny but cross-module — note any such finds back to the part-18 or part-25 designs as a follow-up).

If the "Cancel workflow" UI button doesn't exist on lead-view (the design only mandates "Start onboarding" + the admin-style "Close / Cancel installation child" buttons), drive the cancel via a direct `mdb` insert (`workflows.updateOne` pushing a `cancelled` status entry) or a direct Lowdefy `Request` block before the assertions in step 8. The spec's job is to verify the cancel sweep, not to mandate that the demo UI ship a cancel button.

## Acceptance Criteria

- `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` exists and runs in the demo's Playwright suite.
- Spec uses `ldf` and `mdb` fixtures from the project's e2e harness.
- Spec automates all six manual walk-through steps in the design.
- Spec passes against a clean Mongo database (no other workflows / leads docs interfering).
- Spec cleans up its seeded data (lead + workflows + actions).
- Spec runs in CI alongside the demo's other e2e specs.

## Files

- `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` — **create** (or `.ts` if the harness is TypeScript)
- Possibly `modules/workflows/components/{...}` — **modify** if missing `data-*` test handles need to be added; report any such changes as a finding for the relevant part's design (don't expand 20a's surface silently).

## Notes

- The spec relies on the lead-view UI elements from task 7. If task 7's buttons label or selectors changed during implementation, sync the spec selectors before merge.
- The "Cancel workflow" step is the only walk-through step without a clear UI affordance — handle pragmatically as described above.
- Engine-internal e2e specs (submit pipeline, side effects, hooks, group on_complete) defer to part 20b. This spec only exercises the static-surface paths.
- Confirm by reading `apps/demo/e2e/` whether the harness is JS or TS and whether the fixtures are imported per-file or auto-injected via `playwright.config.{js,ts}`.
