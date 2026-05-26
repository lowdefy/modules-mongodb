import { test, expect } from '../fixtures.js';

// Part 29 § Verification — E2E (part 22) — Spec 1:
//   "transient infra failure → user retry → success"
//
// Asserts that when a sub-step inside SubmitWorkflowAction throws (steps 4–11),
// the handler does NOT layer an `error` transition on the action. The user
// sees a transient error toast, retries the same submission, and the priority
// rule + same-stage-self exception converge the action to its target stage.
//
// This is the integration counterpart of the unit test
//   "part 29: step 4 sub-step throws → handler rethrows; no error transition; pre-submit status unchanged"
// in handleSubmit.test.js. Unit coverage is comprehensive; this spec exists to
// catch end-to-end regressions in the propagate-everywhere model under a live
// app stack (Next.js + @lowdefy/api's runRoutine + per-action endpoint).
//
// STATUS: skipped pending Part 22 harness. Two pieces missing:
//   1. A way to inject a one-shot mid-write throw into a live app. Options
//      under discussion in Part 22: (a) a test-only API endpoint that wraps
//      handleSubmit with a one-shot failing connection; (b) the `workflow`
//      fixture's `submit(..., { failOnce: <step-name> })` toggle.
//   2. Snap fixtures (apps/demo/e2e/snaps/onboarding-fresh/) so the test
//      starts from a known seed without manually setting up workflows +
//      actions per run.
//
// Once Part 22 lands these, drop `test.skip` → `test` and wire the harness
// pieces in.

test.skip('transient infra failure → user retry → success (Part 29 § D1, Spec 1)', async ({ ldf, mdb, page }) => {
  // NOTE: this spec assumes a `workflow` fixture (Part 22 § Fixture surface)
  // exposing `workflow.start({...})` and `workflow.injectOneShotThrow({step})`.
  // When that fixture lands, add it to the destructure above and remove this
  // note. Until then the test is `.skip`.
  const workflow = /** @type {any} */ (undefined);
  const leadId = `lead-${Date.now()}`;

  await mdb.collection('leads').insertOne({
    _id: leadId,
    name: 'Test Lead',
    email: 'test-lead@example.com',
  });

  try {
    // Setup: start an onboarding workflow; first action ('qualify') sits at
    // action-required.
    const { workflow_id } = await workflow.start({
      workflow_type: 'onboarding',
      entity: { _id: leadId, entity_collection: 'leads-collection' },
    });

    // Arm the harness to throw inside step 5 (summary recompute) once.
    await workflow.injectOneShotThrow({ step: 'recompute-summary' });

    // Open the qualify-edit page and submit.
    await ldf.goto(`/workflows/onboarding-qualify-edit?action_id=<action_id>`);
    await page.getByLabel('Contact name').fill('Alice');
    await page.getByRole('button', { name: 'Submit' }).click();

    // User sees Lowdefy's standard error toast (no workflows-specific UI).
    await expect(page.getByRole('alert')).toContainText(/error/i);

    // Inspect the action doc: status[0].stage is NOT `error`. The step-4
    // write may or may not have landed (idempotent under retry), but no
    // synthetic `error` is layered.
    const action = await mdb.collection('actions').findOne({
      workflow_id,
      type: 'qualify',
    });
    expect(action.status[0].stage).not.toBe('error');

    // Retry: throw injection auto-clears after the first call. Submit again.
    await page.getByRole('button', { name: 'Submit' }).click();

    // Success: action transitions to its target stage (`done` here — qualify
    // has no `review` verb).
    await expect
      .poll(async () => {
        const a = await mdb.collection('actions').findOne({
          workflow_id,
          type: 'qualify',
        });
        return a?.status?.[0]?.stage;
      }, { timeout: 10_000 })
      .toBe('done');

    // No `error` entries anywhere in the status history (priority-rule self-
    // exception writes a fresh audit entry on retry of the same-stage push,
    // but every entry's stage is the target — not `error`).
    const final = await mdb.collection('actions').findOne({
      workflow_id,
      type: 'qualify',
    });
    expect(final.status.every((s) => s.stage !== 'error')).toBe(true);
  } finally {
    await mdb.collection('leads').deleteOne({ _id: leadId });
    await mdb.collection('workflows').deleteMany({ entity_id: leadId });
    await mdb.collection('actions').deleteMany({ entity_id: leadId });
  }
});
