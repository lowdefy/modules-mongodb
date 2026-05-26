import { test, expect } from '../fixtures.js';

// Part 29 § Verification — E2E (part 22) — Spec 2:
//   "author pushes `error` via pre-hook → user recovers via `-error` page"
//
// Asserts the full author-driven `error` path:
//   1. Pre-hook returns `actions: [{ ..., status: 'error' }]` — engine writes
//      the error transition via the NORMAL priority path (no force needed;
//      `error.priority = 1` is below every non-terminal stage).
//   2. The action's `-error` page is reachable (gated by `error` being in
//      `access.{app_name}` verb list per Part 29 § D3 / Part 16).
//   3. The recovery submit posts `interaction: resolve_error`; the action's
//      status flips to the recovery target (matching submit_edit's default —
//      `in-review` if review verb exists, else `done`), layered over the
//      `error` entry via the handler-internal `force: true` write.
//
// Unit coverage exists at:
//   - "part 9: pre-hook actions: [{ status: 'error' }] writes error transition
//      via priority path; log event + notifications fire"
//   - "part 29: resolve_error recovery writes via handler-internal force: true"
//
// This spec catches end-to-end regressions across the per-action endpoint
// emission (Part 13), page template wiring (Part 16), and the priority-rule
// + force-write story under a live app stack.
//
// STATUS: skipped pending Part 22 harness + demo-app config wiring. Three
// pieces missing:
//   1. The qualify action's `access.demo` verb list does NOT currently
//      include `error`. Adding it surfaces the `-error` page; the demo app
//      decision belongs to whoever owns Part 22's onboarding-fixture wiring.
//   2. The qualify pre-hook needs a conditional branch that returns
//      `actions: [{ status: 'error' }]` on a specific trigger (e.g. a
//      magic-string `contact_name`) — keeps the existing happy path
//      intact while exposing this code path for the spec.
//   3. The `workflow` fixture's `start` + `submit` helpers need to exist
//      (Part 22 § Fixture surface). Today only `tracker-only-onboarding`
//      drives the engine via UI; this spec assumes the fixture API.

test.skip('pre-hook pushes error → recovery via -error page (Part 29 § D2, D3, D4)', async ({ ldf, mdb, page }) => {
  // NOTE: this spec assumes a `workflow` fixture (Part 22 § Fixture surface)
  // exposing `workflow.start({...})`. When that fixture lands, add it to the
  // destructure above and remove this note. Until then the test is `.skip`.
  const workflow = /** @type {any} */ (undefined);
  const leadId = `lead-${Date.now()}`;

  await mdb.collection('leads').insertOne({
    _id: leadId,
    name: 'Test Lead',
    email: 'test-lead@example.com',
  });

  try {
    // Setup: start an onboarding workflow.
    const { workflow_id } = await workflow.start({
      workflow_type: 'onboarding',
      entity: { _id: leadId, entity_collection: 'leads-collection' },
    });

    // Submit qualify with the magic trigger that makes the pre-hook return
    // `actions: [{ type: 'qualify', status: 'error' }]`.
    await ldf.goto(`/workflows/onboarding-qualify-edit?action_id=<action_id>`);
    await page.getByLabel('Contact name').fill('Duplicate CRM Match');
    await page.getByRole('button', { name: 'Submit' }).click();

    // The action lands in `error` via the normal priority path (no force).
    await expect
      .poll(async () => {
        const a = await mdb.collection('actions').findOne({
          workflow_id,
          type: 'qualify',
        });
        return a?.status?.[0]?.stage;
      }, { timeout: 10_000 })
      .toBe('error');

    // Step 7 wrote an events-log entry for the error transition (proves the
    // post-step side effects fire normally; the error push is a regular
    // status transition).
    const action = await mdb.collection('actions').findOne({
      workflow_id,
      type: 'qualify',
    });
    expect(action.status[0].event_id).toBeTruthy();
    const eventCount = await mdb
      .collection('events')
      .countDocuments({ _id: action.status[0].event_id });
    expect(eventCount).toBe(1);

    // Navigate to the -error page; recovery submit button renders.
    await ldf.goto(`/workflows/onboarding-qualify-error?action_id=${action._id}`);
    await expect(page.getByRole('button', { name: /resolve|submit/i })).toBeVisible();

    // Click recovery submit — posts `interaction: resolve_error`.
    await page.getByLabel('Contact name').fill('Alice');
    await page.getByRole('button', { name: /resolve|submit/i }).click();

    // Action recovers to the submit_edit target (engine default `done` for
    // qualify — no review verb).
    await expect
      .poll(async () => {
        const a = await mdb.collection('actions').findOne({ _id: action._id });
        return a?.status?.[0]?.stage;
      }, { timeout: 10_000 })
      .toBe('done');

    // Previous error entry preserved as audit history.
    const final = await mdb.collection('actions').findOne({ _id: action._id });
    expect(final.status[1].stage).toBe('error');
  } finally {
    await mdb.collection('leads').deleteOne({ _id: leadId });
    await mdb.collection('workflows').deleteMany({ entity_id: leadId });
    await mdb.collection('actions').deleteMany({ entity_id: leadId });
  }
});
