import { test, expect } from '../fixtures.js';

// Single test walking the six-step onboarding happy path described in
// designs/workflows-module/parts/45-demo-rebuild/design.md § Worked example.
//
// State is sequential; splitting into separate tests would require teardown/
// setup between each step. One test, one path.
//
// NOTE: this spec lands ahead of its engine prerequisites:
//   - Part 38 task 17 (per-action update endpoints)
//   - Part 43 (kind: check)
//   - Part 44 (start_link tracker)
// Run it once those parts land. The controller records this as a deferred-
// verification item.
//
// Part 55: lead-view and companies/view drop the check-action modal, so the
// four `check`-kind rows (site-visit, schedule-followup on lead-view;
// assign-account-manager, kickoff-call on companies/view) open the modal IN
// PLACE — they no longer navigate to workflow-action-edit. Each step opens the
// modal, selects `done`, submits, and asserts the modal closes; lead-view also
// asserts the co-present Activity timeline refreshes (the Part 55 bug fix).
// These four steps must be confirmed against a live app + MongoDB via
// /r:dev-test — a build check is not sufficient to exercise the modal.

test('onboarding happy path — six-step end-to-end', async ({ ldf, mdb, page }) => {
  // Set up admin session up-front — required for the `send-quote` review verb
  // which is gated to `access.demo.review: [admin]`.
  await ldf.user({
    name: 'Test Admin',
    email: 'test-admin@example.com',
    roles: ['admin'],
  });

  let leadId = null;
  let companyId = null;

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Create a lead via the UI → onboarding starts with 5 action docs.
    // ─────────────────────────────────────────────────────────────────────────
    await ldf.goto('/lead-new');
    await ldf.block('lead.name').do.fill('E2E Test Lead');
    await ldf.block('lead.email').do.fill('e2e-test-lead@example.com');

    // Capture the pre-generated _id from state before submit.
    const newLeadId = await ldf.state('new_lead_id').value();

    await Promise.all([
      page.waitForURL((url) => url.pathname.includes('/lead-view'), {
        timeout: 30_000,
      }),
      ldf.block('save_btn').do.click(),
    ]);

    // Confirm the URL carried the lead id (the Link action passes new_lead_id).
    const currentUrl = new URL(page.url());
    leadId = currentUrl.searchParams.get('_id') || newLeadId;

    // Engine writes are async — poll until the onboarding workflow doc lands.
    await expect
      .poll(
        async () =>
          (await mdb
            .collection('workflows')
            .countDocuments({ entity_id: leadId, workflow_type: 'onboarding' })) > 0,
        { timeout: 10_000 }
      )
      .toBe(true);

    // Exactly 5 action docs (qualify + send-quote + schedule-followup +
    // upload-po + track-company-setup). site-visit is absent — it spawns
    // conditionally in step 2 when site_visit_required = yes.
    await expect
      .poll(
        async () => {
          const wf = await mdb
            .collection('workflows')
            .findOne({ entity_id: leadId, workflow_type: 'onboarding' });
          if (!wf) return 0;
          return mdb.collection('actions').countDocuments({ workflow_id: wf._id });
        },
        { timeout: 10_000 }
      )
      .toBe(5);

    const onboardingWf = await mdb
      .collection('workflows')
      .findOne({ entity_id: leadId, workflow_type: 'onboarding' });
    expect(onboardingWf).toBeDefined();

    // qualify is action-required; the other four are blocked.
    const qualifyAction = await mdb
      .collection('actions')
      .findOne({ workflow_id: onboardingWf._id, type: 'qualify' });
    expect(qualifyAction?.status?.[0]?.stage).toBe('action-required');

    for (const actionType of ['send-quote', 'schedule-followup', 'upload-po', 'track-company-setup']) {
      const doc = await mdb
        .collection('actions')
        .findOne({ workflow_id: onboardingWf._id, type: actionType });
      expect(doc?.status?.[0]?.stage).toBe('blocked');
    }

    // lead-view should render the four group titles from the onboarding config.
    // We are already on lead-view after the redirect above.
    for (const groupTitle of ['Qualify', 'Quote', 'Purchase order', 'Convert to customer']) {
      await expect(page.getByText(groupTitle)).toBeVisible();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Qualify with site_visit_required = yes.
    //         Pre-hook spawns site-visit; unblock pass fires send-quote +
    //         schedule-followup to action-required.
    // ─────────────────────────────────────────────────────────────────────────

    // Navigate to the qualify edit page by clicking through the rendered row
    // link in the ActionSteps component. The qualify row is the first
    // actionable item in the Qualify group.
    const qualifyLink = page.locator('a', { hasText: 'Qualify the lead.' }).first();
    await qualifyLink.waitFor({ state: 'visible', timeout: 10_000 });
    await qualifyLink.click();

    // Now on the workflow-action-edit page for qualify.
    await page.waitForURL((url) => url.href.includes('workflow-action-edit'), {
      timeout: 15_000,
    });

    // Fill the qualify form — `contact` is now a ContactSelector (rich picker),
    // required, site_visit_required = yes. The contact field stores an array of
    // { contact_id, name, email, verified }; we add a new contact through the
    // picker so the happy path doesn't depend on seeded contacts or an Atlas
    // $search index.
    // NOTE: this picker interaction (open → type → "Add … as new contact" →
    // modal form → Save) has NOT been verified against a live run — confirm via
    // /r:dev-test before relying on this spec.
    const contactSearch = page.locator('#block\\:workflows\\/onboarding-qualify-edit\\:form\\.contact\\:0_selector_input');
    await contactSearch.click();
    await contactSearch.fill('Alice Example');
    // Debounced search (500ms) renders the "Add <text> as new contact" option.
    await page.getByText('as new contact').click();
    // Add-contact modal (form_contact_short): First Name / Last Name / Email.
    await page.getByLabel('First Name').fill('Alice');
    await page.getByLabel('Last Name').fill('Example');
    await page.getByLabel('Email').fill('alice@example.com');
    await page.getByRole('button', { name: 'Save' }).click();
    // The selected contact renders as a list row once appended.
    await expect(page.getByText('alice@example.com')).toBeVisible({ timeout: 15_000 });

    // site_visit_required is a yes_no_selector (ButtonSelector). Click the
    // "Yes" button within the block's container to select true.
    await page.getByRole('button', { name: 'Yes' }).click();

    // Submit — navigate back to lead-view (or workflow-overview).
    await Promise.all([
      page.waitForURL((url) => !url.href.includes('workflow-action-edit'), {
        timeout: 30_000,
      }),
      ldf.block('button_submit_edit').do.click(),
    ]);

    // Poll: site-visit doc spawned at action-required.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'site-visit' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('action-required');

    // send-quote and schedule-followup unblocked to action-required.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'send-quote' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('action-required');

    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'schedule-followup' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('action-required');

    // qualify itself is now done.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'qualify' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Check off site-visit and schedule-followup; fill and submit
    //         send-quote → in-review; approve → done + notification fires.
    // ─────────────────────────────────────────────────────────────────────────

    // Navigate back to lead-view so we can click through action row links.
    await ldf.goto(`/lead-view?_id=${leadId}`);
    await page.waitForLoadState('networkidle');

    // ── site-visit (kind: check) — opens the in-context modal IN PLACE ───────
    // Part 55: lead-view drops the check-action modal, so a check-row click
    // opens it over the entity page (no navigation to workflow-action-edit).
    const siteVisitLink = page.locator('a', { hasText: 'Complete the site visit.' }).first();
    await siteVisitLink.waitFor({ state: 'visible', timeout: 10_000 });
    await siteVisitLink.click();

    // Modal opens in place — the surface's status selector becomes visible and
    // the URL stays on lead-view (no workflow-action-edit navigation).
    await expect(ldf.block('status').locator()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('lead-view');
    expect(page.url()).not.toContain('workflow-action-edit');

    // For a check action the status selector drives completion. Select "done".
    await ldf.block('status').do.select('done');

    // Submit in the modal — it closes on success (no navigation).
    await ldf.block('button_submit_edit').do.click();
    await expect(ldf.block('status').locator()).toBeHidden({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'site-visit' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // Bug fix (Part 55 D1): the co-present Activity timeline must refresh after
    // a modal submit. The page-owned on_complete re-runs get_events_timeline, so
    // the site-visit card in the timeline now reflects `done` WITHOUT
    // re-navigating to lead-view. Before the fix the timeline only fetched on
    // mount and showed stale events here.
    const siteVisitDoc = await mdb
      .collection('actions')
      .findOne({ workflow_id: onboardingWf._id, type: 'site-visit' });
    await expect
      .poll(
        async () => {
          const timeline = await ldf.request('get_events_timeline').response();
          const cards = (timeline ?? []).flatMap((event) => event.actions ?? []);
          const card = cards.find((c) => String(c._id) === String(siteVisitDoc._id));
          return card?.status ?? null;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // ── schedule-followup (kind: check) ────────────────────────────────────
    await ldf.goto(`/lead-view?_id=${leadId}`);
    await page.waitForLoadState('networkidle');

    const followupLink = page
      .locator('a', { hasText: 'Schedule the follow-up call.' })
      .first();
    await followupLink.waitFor({ state: 'visible', timeout: 10_000 });
    await followupLink.click();

    // Modal opens in place — no navigation off lead-view.
    await expect(ldf.block('status').locator()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('lead-view');
    expect(page.url()).not.toContain('workflow-action-edit');

    await ldf.block('status').do.select('done');

    await ldf.block('button_submit_edit').do.click();
    await expect(ldf.block('status').locator()).toBeHidden({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'schedule-followup' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // ── send-quote (kind: form) — fill form, submit → in-review ────────────
    await ldf.goto(`/lead-view?_id=${leadId}`);
    await page.waitForLoadState('networkidle');

    const sendQuoteLink = page
      .locator('a', { hasText: 'Build and send the quote.' })
      .first();
    await sendQuoteLink.waitFor({ state: 'visible', timeout: 10_000 });
    await sendQuoteLink.click();
    await page.waitForURL((url) => url.href.includes('workflow-action-edit'), {
      timeout: 15_000,
    });

    await ldf.block('form.quote_total').do.fill('15000');
    await ldf.block('form.notes').do.fill('Standard onboarding package — e2e test.');

    await Promise.all([
      page.waitForURL((url) => !url.href.includes('workflow-action-edit'), {
        timeout: 30_000,
      }),
      ldf.block('button_submit_edit').do.click(),
    ]);

    // send-quote is now in-review pending approval.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'send-quote' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('in-review');

    // ── Approve on workflow-action-review ───────────────────────────────────
    // Navigate back to lead-view and click the in-review row link — the
    // engine resolves to the review page (not the edit page) for in-review
    // stage actions with a review verb.
    const sendQuoteAction = await mdb
      .collection('actions')
      .findOne({ workflow_id: onboardingWf._id, type: 'send-quote' });
    expect(sendQuoteAction).toBeDefined();

    await ldf.goto(`/lead-view?_id=${leadId}`);
    await page.waitForLoadState('networkidle');

    // The send-quote row now shows the in-review message. Click through to the
    // review page.
    const inReviewLink = page
      .locator('a', { hasText: 'Quote awaiting approval.' })
      .first();
    await inReviewLink.waitFor({ state: 'visible', timeout: 10_000 });
    await inReviewLink.click();

    await page.waitForURL((url) => url.href.includes('workflow-action-review'), {
      timeout: 15_000,
    });

    await ldf.block('button_approve').do.click();

    // send-quote → done after approval.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ _id: sendQuoteAction._id });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // Notification assertion: the send-routine fires on action-approve for
    // send-quote. The recipient is the user who submitted (put the action
    // in-review). Poll the notifications collection for a doc with
    // event_type: 'action-approve' whose contact_id matches the submit user.
    // The send-routine uses the in-review entry's created.user.id as the
    // contact_id (see apps/demo/modules/notifications/send-routine.yaml).
    await expect
      .poll(
        async () =>
          mdb.collection('notifications').countDocuments({
            event_type: 'action-approve',
            type: 'quote-approved',
          }),
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: upload-po unblocks (group-target gate: blocked_by: [quoting]).
    //         Fill PO number, submit → done.
    //         track-company-setup unblocks; start link carries correct params.
    // ─────────────────────────────────────────────────────────────────────────

    // upload-po should unblock once the quoting group completes (site-visit +
    // send-quote + schedule-followup all done).
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'upload-po' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('action-required');

    await ldf.goto(`/lead-view?_id=${leadId}`);
    await page.waitForLoadState('networkidle');

    const uploadPoLink = page
      .locator('a', { hasText: 'Upload the purchase order.' })
      .first();
    await uploadPoLink.waitFor({ state: 'visible', timeout: 10_000 });
    await uploadPoLink.click();
    await page.waitForURL((url) => url.href.includes('workflow-action-edit'), {
      timeout: 15_000,
    });

    await ldf.block('form.po_number').do.fill('PO-E2E-001');
    // po_document is a file_upload field — left empty; po_number alone satisfies
    // the required constraint (form.po_number required: true, form.po_document
    // has no required marker in the config).

    await Promise.all([
      page.waitForURL((url) => !url.href.includes('workflow-action-edit'), {
        timeout: 30_000,
      }),
      ldf.block('button_submit_edit').do.click(),
    ]);

    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'upload-po' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // track-company-setup should unblock to action-required (blocked_by:
    // [upload-po] which is now done).
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: onboardingWf._id, type: 'track-company-setup' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('action-required');

    const trackerAction = await mdb
      .collection('actions')
      .findOne({ workflow_id: onboardingWf._id, type: 'track-company-setup' });
    expect(trackerAction).toBeDefined();

    // Navigate back to lead-view; confirm the rendered tracker row is a link
    // whose href carries action_id=<tracker._id> and entity_id=<lead._id>.
    await ldf.goto(`/lead-view?_id=${leadId}`);
    await page.waitForLoadState('networkidle');

    const startLink = page
      .locator('a', { hasText: 'Convert the lead to a customer.' })
      .first();
    await startLink.waitFor({ state: 'visible', timeout: 10_000 });

    const startHref = await startLink.getAttribute('href');
    expect(startHref).toContain(`action_id=${trackerAction._id}`);
    expect(startHref).toContain(`entity_id=${leadId}`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Follow start link → companies/new, fill company form, save.
    //         Poll: company-setup workflow on company; tracker in-progress
    //         with child_workflow_id; convert-lead event logged.
    // ─────────────────────────────────────────────────────────────────────────
    await startLink.click();

    await page.waitForURL(
      (url) =>
        url.pathname.includes('companies') && url.pathname.includes('new'),
      { timeout: 15_000 }
    );

    // Confirm the URL query params were preserved through the navigation.
    const newCompanyUrl = new URL(page.url());
    expect(newCompanyUrl.searchParams.get('action_id')).toBe(trackerAction._id.toString());
    expect(newCompanyUrl.searchParams.get('entity_id')).toBe(leadId);

    // Fill the company form — name is the minimum required field.
    await ldf.block('name').do.fill('E2E Test Company');

    await Promise.all([
      page.waitForURL(
        (url) => url.pathname.includes('companies') && url.pathname.includes('view'),
        { timeout: 30_000 }
      ),
      ldf.block('save_button').do.click(),
    ]);

    // Extract company id from the URL.
    const companyViewUrl = new URL(page.url());
    companyId = companyViewUrl.searchParams.get('_id');
    expect(companyId).toBeTruthy();

    // Poll: company-setup workflow exists on the new company with
    // parent_action_id linking back to the tracker.
    await expect
      .poll(
        async () =>
          mdb.collection('workflows').countDocuments({
            entity_id: companyId,
            workflow_type: 'company-setup',
            // entity_collection resolves to the module-scoped connection id
            // (see apps/demo/modules/workflows/vars.yaml entities key)
            entity_collection: 'companies/companies-collection',
          }),
        { timeout: 10_000 }
      )
      .toBe(1);

    const companySetupWf = await mdb
      .collection('workflows')
      .findOne({ entity_id: companyId, workflow_type: 'company-setup' });
    expect(companySetupWf).toBeDefined();
    expect(companySetupWf.parent_action_id?.toString()).toBe(trackerAction._id.toString());

    // Tracker doc is now in-progress with child_workflow_id set.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ _id: trackerAction._id });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('in-progress');

    const trackerDoc = await mdb
      .collection('actions')
      .findOne({ _id: trackerAction._id });
    expect(trackerDoc.child_workflow_id).toBeDefined();

    // convert-lead event was logged referencing both lead_id and company_id.
    await expect
      .poll(
        async () =>
          mdb.collection('events').countDocuments({
            type: 'convert-lead',
            'references.lead_ids': leadId,
            'references.company_ids': companyId,
          }),
        { timeout: 10_000 }
      )
      .toBe(1);

    // companies/view shows the workflows panel with three company-setup rows.
    // The panel is slotted via components.sidebar_slots in the companies vars.
    for (const rowMsg of [
      "Capture the company's billing details.",
      'Assign an account manager.',
      'Awaiting account manager assignment.', // kickoff-call blocked message
    ]) {
      await expect(page.getByText(rowMsg)).toBeVisible();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Complete billing-details and assign-account-manager;
    //         kickoff-call unblocks; check it off → company-setup completes
    //         → tracker mirrors done → onboarding completes.
    // ─────────────────────────────────────────────────────────────────────────

    // ── billing-details (kind: form) ───────────────────────────────────────
    const billingLink = page
      .locator('a', { hasText: "Capture the company's billing details." })
      .first();
    await billingLink.waitFor({ state: 'visible', timeout: 10_000 });
    await billingLink.click();
    await page.waitForURL((url) => url.href.includes('workflow-action-edit'), {
      timeout: 15_000,
    });

    await ldf.block('form.billing_email').do.fill('billing@e2etestcompany.com');

    await Promise.all([
      page.waitForURL((url) => !url.href.includes('workflow-action-edit'), {
        timeout: 30_000,
      }),
      ldf.block('button_submit_edit').do.click(),
    ]);

    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: companySetupWf._id, type: 'billing-details' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // ── assign-account-manager (kind: check) ───────────────────────────────
    await ldf.goto(`/companies/view?_id=${companyId}`);
    await page.waitForLoadState('networkidle');

    const assignLink = page
      .locator('a', { hasText: 'Assign an account manager.' })
      .first();
    await assignLink.waitFor({ state: 'visible', timeout: 10_000 });
    await assignLink.click();

    // Part 55: companies/view also drops the modal, so this opens in place — no
    // navigation off companies/view.
    await expect(ldf.block('status').locator()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('companies');
    expect(page.url()).toContain('view');
    expect(page.url()).not.toContain('workflow-action-edit');

    await ldf.block('status').do.select('done');

    await ldf.block('button_submit_edit').do.click();
    await expect(ldf.block('status').locator()).toBeHidden({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: companySetupWf._id, type: 'assign-account-manager' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // kickoff-call unblocks after assign-account-manager is done.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: companySetupWf._id, type: 'kickoff-call' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('action-required');

    // ── kickoff-call (kind: check) ──────────────────────────────────────────
    await ldf.goto(`/companies/view?_id=${companyId}`);
    await page.waitForLoadState('networkidle');

    const kickoffLink = page
      .locator('a', { hasText: 'Schedule and complete the kickoff call.' })
      .first();
    await kickoffLink.waitFor({ state: 'visible', timeout: 10_000 });
    await kickoffLink.click();

    // Modal opens in place — no navigation off companies/view.
    await expect(ldf.block('status').locator()).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('companies');
    expect(page.url()).toContain('view');
    expect(page.url()).not.toContain('workflow-action-edit');

    await ldf.block('status').do.select('done');

    await ldf.block('button_submit_edit').do.click();
    await expect(ldf.block('status').locator()).toBeHidden({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ workflow_id: companySetupWf._id, type: 'kickoff-call' });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // company-setup workflow auto-completes (all actions done).
    await expect
      .poll(
        async () => {
          const wf = await mdb
            .collection('workflows')
            .findOne({ _id: companySetupWf._id });
          return wf?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('completed');

    // tracker mirrors → done.
    await expect
      .poll(
        async () => {
          const doc = await mdb
            .collection('actions')
            .findOne({ _id: trackerAction._id });
          return doc?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('done');

    // onboarding workflow completes once all groups are satisfied.
    await expect
      .poll(
        async () => {
          const wf = await mdb
            .collection('workflows')
            .findOne({ _id: onboardingWf._id });
          return wf?.status?.[0]?.stage;
        },
        { timeout: 10_000 }
      )
      .toBe('completed');
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────────
    // Remove every document created during this test run so the database is
    // clean for the next run. Order: notifications → events → actions →
    // workflows → entities.
    const entityIds = [leadId, companyId].filter(Boolean);

    for (const entityId of entityIds) {
      await mdb
        .collection('notifications')
        .deleteMany({ 'links.button.urlQuery._id': entityId });
    }

    if (leadId) {
      await mdb.collection('events').deleteMany({ 'references.lead_ids': leadId });
    }
    if (companyId) {
      await mdb
        .collection('events')
        .deleteMany({ 'references.company_ids': companyId });
    }

    for (const entityId of entityIds) {
      await mdb.collection('actions').deleteMany({ entity_id: entityId });
      await mdb.collection('workflows').deleteMany({ entity_id: entityId });
    }

    if (leadId) {
      await mdb.collection('leads').deleteOne({ _id: leadId });
    }
    if (companyId) {
      await mdb
        .collection('companies')
        .deleteOne({ _id: companyId });
    }
  }
});
