import { test, expect } from '../fixtures.js';

// Part 39 supplement — authored pending Part 45 demo rebuild; not yet executed.
//
// Three specs covering signal-button-bar behaviour on the `edit` template:
//   (a) Save Draft (`progress`) persists partial form data without validation.
//   (b) A button absent from a stage's source list is not rendered (visible/hidden
//       pair on the same page+stage proves the FSM source-stage gate).
//   (c) `submit` from `done` re-opens the action to `in-review`.
//
// All specs seed workflows and actions directly via `mdb` and navigate to the
// generated pages via `ldf.goto(...)`.  Cleanup is in a `finally` block,
// following the pattern established by tracker-only-onboarding.spec.js.
//
// Action types used:
//   - qualify     (form, no review verb → submit lands done)
//   - send-quote  (form, review verb    → submit lands in-review)
//
// Both belong to the onboarding workflow_config already present in the demo app.

// Shared change stamp used when seeding documents.
const CHANGE_STAMP = {
  timestamp: new Date('2026-01-01T00:00:00Z'),
  user: { id: 'e2e-seed', name: 'E2E Seed' },
};

// ---------------------------------------------------------------------------
// (a) Save Draft — progress signal persists partial data, skips validation
// ---------------------------------------------------------------------------
test('Save Draft persists partial form data without running validation (Part 39 § a)', async ({ ldf, mdb, page }) => {
  const leadId = `lead-${Date.now()}`;
  const workflowId = `wf-${Date.now()}`;
  const actionId = `action-${Date.now()}`;

  await mdb.collection('leads').insertOne({
    _id: leadId,
    name: 'E2E Lead',
    email: 'e2e@example.com',
  });

  await mdb.collection('workflows').insertOne({
    _id: workflowId,
    workflow_type: 'onboarding',
    entity_id: leadId,
    entity_collection: 'leads-collection',
    entity_ref_key: 'lead_ids',
    status: [{ stage: 'active', event_id: 'seed-e0', created: CHANGE_STAMP }],
    summary: { done: 0, not_required: 0, total: 1 },
    groups: [],
    form_data: {},
    created: CHANGE_STAMP,
    updated: CHANGE_STAMP,
  });

  // Seed qualify action at action-required — the normal entry stage.
  await mdb.collection('actions').insertOne({
    _id: actionId,
    workflow_id: workflowId,
    entity_id: leadId,
    type: 'qualify',
    kind: 'form',
    key: null,
    action_group: 'g1',
    status: [{ stage: 'action-required', event_id: 'seed-e0', created: CHANGE_STAMP }],
    metadata: {},
    created: CHANGE_STAMP,
    updated: CHANGE_STAMP,
  });

  try {
    // Open the qualify edit page.
    await ldf.goto(`/workflows/onboarding-qualify-edit?action_id=${actionId}`);

    // Leave the required field `contact_name` empty; fill only optional notes.
    // (qualify.form: contact_name required:true, notes not required)
    await page.getByLabel('Qualification notes').fill('Partial draft note');

    // Click Save Draft — must NOT run form validation.
    // (button_progress.onClick has no Validate action; button_submit.onClick does)
    await page.getByRole('button', { name: 'Save Draft' }).click();

    // Engine writes are asynchronous; wait for the action to reach in-progress.
    await expect
      .poll(
        async () => {
          const a = await mdb.collection('actions').findOne({ _id: actionId });
          return a?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('in-progress');

    // Verify the partial form data was persisted in the workflow's form_data.
    const wf = await mdb.collection('workflows').findOne({ _id: workflowId });
    expect(wf?.form_data?.qualify?.notes).toBe('Partial draft note');

    // Re-open the page and confirm the saved notes field is pre-populated.
    await ldf.goto(`/workflows/onboarding-qualify-edit?action_id=${actionId}`);
    await ldf.request('get_workflow').expect.toFinish();
    const notesLocator = page.getByLabel('Qualification notes');
    await expect(notesLocator).toHaveValue('Partial draft note');
  } finally {
    await mdb.collection('leads').deleteOne({ _id: leadId });
    await mdb.collection('workflows').deleteMany({ entity_id: leadId });
    await mdb.collection('actions').deleteMany({ entity_id: leadId });
  }
});

// ---------------------------------------------------------------------------
// (b) FSM source-stage gate: progress hidden, submit visible on a done action
// ---------------------------------------------------------------------------
test('progress button hidden and submit visible on edit page of a done action (Part 39 § b)', async ({ ldf, mdb, page }) => {
  const leadId = `lead-${Date.now()}`;
  const workflowId = `wf-${Date.now()}`;
  const actionId = `action-${Date.now()}`;

  await mdb.collection('leads').insertOne({
    _id: leadId,
    name: 'E2E Lead Done',
    email: 'e2e-done@example.com',
  });

  await mdb.collection('workflows').insertOne({
    _id: workflowId,
    workflow_type: 'onboarding',
    entity_id: leadId,
    entity_collection: 'leads-collection',
    entity_ref_key: 'lead_ids',
    status: [{ stage: 'active', event_id: 'seed-e0', created: CHANGE_STAMP }],
    summary: { done: 0, not_required: 0, total: 1 },
    groups: [],
    form_data: {
      'send-quote': { quote_total: 1500, notes: 'Prior draft' },
    },
    created: CHANGE_STAMP,
    updated: CHANGE_STAMP,
  });

  // Seed send-quote at done.  send-quote has a review verb
  // (submit_edit → in-review → approve → done), so `done` is a valid terminal
  // stage and `submit` source list includes it.
  // `progress` source list is [action-required, in-progress] — excludes done.
  await mdb.collection('actions').insertOne({
    _id: actionId,
    workflow_id: workflowId,
    entity_id: leadId,
    type: 'send-quote',
    kind: 'form',
    key: null,
    action_group: 'g2',
    status: [{ stage: 'done', event_id: 'seed-e0', created: CHANGE_STAMP }],
    metadata: {},
    created: CHANGE_STAMP,
    updated: CHANGE_STAMP,
  });

  try {
    // Navigate directly to the edit page.  The stale-URL guard would normally
    // redirect a done action to view, but skip_status_redirect bypasses it.
    // We set it via the input param directly in the URL query isn't supported —
    // instead we use ldf.goto with the input mechanism (same as view's Edit
    // button sets it).  Since the guard checks `_input: skip_status_redirect`,
    // we navigate via the view page's Edit button to pass the input correctly.

    // Step 1: open the view page.
    await ldf.goto(`/workflows/onboarding-send-quote-view?action_id=${actionId}`);
    await ldf.request('get_action').expect.toFinish();

    // Step 2: click the Edit button (sets skip_status_redirect: true via Link input).
    // Use ldf.waitForPage so currentBlockMap is updated to the edit page before
    // any ldf.block() calls — a bare page.waitForURL would leave currentBlockMap
    // pointing at the view page, causing ldf.block('button_submit') to throw.
    await Promise.all([
      ldf.waitForPage(/onboarding-send-quote-edit/),
      page.getByRole('button', { name: 'Edit' }).click(),
    ]);

    // Step 3: wait for the page to load its action state.
    await ldf.request('get_action').expect.toFinish();

    // button_submit visible: source list includes done.
    await ldf.block('button_submit').expect.visible();

    // button_progress hidden: source list is [action-required, in-progress] — done absent.
    await ldf.block('button_progress').expect.hidden();
  } finally {
    await mdb.collection('leads').deleteOne({ _id: leadId });
    await mdb.collection('workflows').deleteMany({ entity_id: leadId });
    await mdb.collection('actions').deleteMany({ entity_id: leadId });
  }
});

// ---------------------------------------------------------------------------
// (c) submit from done (via view → Edit path) lands the action in-review
// ---------------------------------------------------------------------------
test('submit from done re-opens action to in-review (Part 39 § c)', async ({ ldf, mdb, page }) => {
  const leadId = `lead-${Date.now()}`;
  const workflowId = `wf-${Date.now()}`;
  const actionId = `action-${Date.now()}`;

  await mdb.collection('leads').insertOne({
    _id: leadId,
    name: 'E2E Lead Reopen',
    email: 'e2e-reopen@example.com',
  });

  await mdb.collection('workflows').insertOne({
    _id: workflowId,
    workflow_type: 'onboarding',
    entity_id: leadId,
    entity_collection: 'leads-collection',
    entity_ref_key: 'lead_ids',
    status: [{ stage: 'active', event_id: 'seed-e0', created: CHANGE_STAMP }],
    summary: { done: 0, not_required: 0, total: 1 },
    groups: [],
    form_data: {
      'send-quote': { quote_total: 2000, notes: 'Original quote' },
    },
    created: CHANGE_STAMP,
    updated: CHANGE_STAMP,
  });

  // Seed send-quote at done (review verb present → submit re-opens to in-review).
  await mdb.collection('actions').insertOne({
    _id: actionId,
    workflow_id: workflowId,
    entity_id: leadId,
    type: 'send-quote',
    kind: 'form',
    key: null,
    action_group: 'g2',
    status: [{ stage: 'done', event_id: 'seed-e0', created: CHANGE_STAMP }],
    metadata: {},
    created: CHANGE_STAMP,
    updated: CHANGE_STAMP,
  });

  try {
    // Step 1: open the view page.
    await ldf.goto(`/workflows/onboarding-send-quote-view?action_id=${actionId}`);
    await ldf.request('get_action').expect.toFinish();

    // Step 2: click the Edit button.  The view template's button_edit sets
    // `input: { skip_status_redirect: true }` on the Link action, allowing
    // the edit page's stale-URL guard to pass a done action through.
    await Promise.all([
      page.waitForURL((url) => url.pathname.includes('onboarding-send-quote-edit'), { timeout: 15_000 }),
      page.getByRole('button', { name: 'Edit' }).click(),
    ]);

    // Step 3: wait for the edit page to load.
    await ldf.request('get_action').expect.toFinish();

    // Step 4: update the quote total and click Submit.
    await page.getByLabel('Quote total').fill('2500');

    await page.getByRole('button', { name: 'Submit' }).click();

    // Step 5: the engine writes in-review (send-quote has a review verb).
    await expect
      .poll(
        async () => {
          const a = await mdb.collection('actions').findOne({ _id: actionId });
          return a?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('in-review');

    // Step 6: prior done entry is preserved as audit history.
    const final = await mdb.collection('actions').findOne({ _id: actionId });
    expect(final.status.length).toBeGreaterThanOrEqual(2);
    expect(final.status[1].stage).toBe('done');
  } finally {
    await mdb.collection('leads').deleteOne({ _id: leadId });
    await mdb.collection('workflows').deleteMany({ entity_id: leadId });
    await mdb.collection('actions').deleteMany({ entity_id: leadId });
  }
});
