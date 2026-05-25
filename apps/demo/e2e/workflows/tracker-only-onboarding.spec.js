import { test, expect } from '../fixtures.js';

// Single test walking the six-step tracker-only onboarding flow described in
// designs/workflows-module/parts/20a-module-manifest-static/design.md § Verification.
// State is sequential; splitting into separate tests would require teardown/setup
// between each.
test('tracker-only onboarding flow', async ({ ldf, mdb, page }) => {
  const leadId = `lead-${Date.now()}`;

  // Seed a lead before the test runs.
  await mdb.collection('leads').insertOne({
    _id: leadId,
    name: 'Test Lead',
    email: 'test-lead@example.com',
  });

  try {
    // Step 1: open lead-view; actions-on-entity renders.
    await ldf.goto(`/lead-view?_id=${leadId}`);

    // Step 2: click "Start onboarding" — first tracker transitions to in-progress.
    await page.getByRole('button', { name: 'Start onboarding' }).click();

    // Engine writes are asynchronous; wait for the workflow doc to appear.
    await expect
      .poll(
        async () =>
          (await mdb.collection('workflows').countDocuments({ entity_id: leadId })) >
          0,
        { timeout: 10_000 }
      )
      .toBe(true);

    // Step 3: confirm at least one workflow + three tracker actions exist in DB.
    const workflows = await mdb
      .collection('workflows')
      .find({ entity_id: leadId })
      .toArray();
    expect(workflows.length).toBeGreaterThanOrEqual(1);
    const parentWorkflow = workflows.find((w) => w.workflow_type === 'onboarding');
    expect(parentWorkflow).toBeDefined();

    const trackerActions = await mdb
      .collection('actions')
      .find({ workflow_id: parentWorkflow._id, kind: 'tracker' })
      .toArray();
    expect(trackerActions.length).toBe(3);

    // Step 4: confirm a child installation workflow was spawned from the first tracker.
    await expect
      .poll(
        async () =>
          (await mdb
            .collection('workflows')
            .countDocuments({ workflow_type: 'installation', entity_id: leadId })) >
          0,
        { timeout: 10_000 }
      )
      .toBe(true);

    const childWorkflow = await mdb
      .collection('workflows')
      .findOne({ workflow_type: 'installation', entity_id: leadId });
    expect(childWorkflow).toBeDefined();

    // Step 5: close the child workflow via the admin button.
    await page
      .getByRole('button', { name: /Close installation child/ })
      .click();

    // After closing, the parent tracker should transition to done and the second
    // tracker should unblock to action-required via blocked_by re-evaluation.
    await expect
      .poll(
        async () => {
          const trackOne = await mdb
            .collection('actions')
            .findOne({ workflow_id: parentWorkflow._id, type: 'track-step-1' });
          return trackOne?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    await expect
      .poll(
        async () => {
          const trackTwo = await mdb
            .collection('actions')
            .findOne({ workflow_id: parentWorkflow._id, type: 'track-step-2' });
          return trackTwo?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('action-required');

    // Step 6: cancel the parent workflow via direct API (no UI button in 20a).
    await page.evaluate(async (workflowId) => {
      await fetch('/api/workflows/cancel-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
    }, parentWorkflow._id);

    // Remaining trackers flip to not-required; lifecycle becomes cancelled.
    await expect
      .poll(
        async () => {
          const wf = await mdb
            .collection('workflows')
            .findOne({ _id: parentWorkflow._id });
          return wf?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('cancelled');

    const trackTwoAfter = await mdb
      .collection('actions')
      .findOne({ workflow_id: parentWorkflow._id, type: 'track-step-2' });
    expect(trackTwoAfter?.status?.[0]?.stage).toBe('not-required');

    const trackThreeAfter = await mdb
      .collection('actions')
      .findOne({ workflow_id: parentWorkflow._id, type: 'track-step-3' });
    expect(trackThreeAfter?.status?.[0]?.stage).toBe('not-required');
  } finally {
    // Cleanup: remove lead + any workflows + actions seeded by the engine.
    await mdb.collection('leads').deleteOne({ _id: leadId });
    await mdb.collection('workflows').deleteMany({ entity_id: leadId });
    await mdb.collection('actions').deleteMany({ entity_id: leadId });
  }
});
