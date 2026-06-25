import { test, expect } from '../fixtures.js';
import { getBlock, escapeId } from '@lowdefy/e2e-utils';

// Cluster: field-gallery / field behaviors (Part 22 task 8).
//
// Mode: Spine (UI-heavy). Where the render sweep proves the full roster renders,
// this spec proves the field-level BEHAVIOR wiring on one representative per
// field family — text (text_input), selector (selector), date (date_selector),
// file (file_upload), list (controlled_list), rich-text (tiptap_input). Per the
// design's Principle 3 we deliberately stop at one representative per family; a
// per-component behavior matrix is forbidden (an untested field *logic* is a
// jest gap, not another Playwright case).
//
// Three concerns:
//   1. Validation — required (text) + required-non-empty (list) gate `submit`.
//   2. form_data persistence — fill → `progress`-save → DB shape → re-prime.
//   3. Read-only variants — the review page's read-only main form + the error
//      page's recovery form.
//
// FILE-UPLOAD GAP (acknowledged, not mocked): the test app has no S3 backend and
// no `upload_files` policy request, so the upload can never complete. file_upload
// is therefore NON-required in the fixture (a required upload could never satisfy
// submit) and gets render + presence coverage only — no form_data round-trip.
// The task explicitly accepts this rather than mocking a backdoor.

const WORKFLOW_TYPE = 'field-gallery';

function actionByType(mdb, workflowId, type) {
  return mdb
    .collection('actions')
    .findOne({ workflow_id: String(workflowId), type });
}

function workflowDoc(mdb, workflowId) {
  return mdb.collection('workflows').findOne({ _id: String(workflowId) });
}

// Fill a Lowdefy TiptapInput (ProseMirror contenteditable) — `.do.fill` targets
// plain inputs, not rich-text editors.
async function fillTiptap(page, blockId, text) {
  // escapeId so dotted block ids (e.g. `form.rich_text`) are a valid id selector
  // — an unescaped `.` would read as a class.
  const editor = page
    .locator(`#${escapeId(blockId)} [contenteditable="true"]`)
    .first();
  await editor.click();
  await editor.pressSequentially(text);
}

// Add a controlled_list row and WAIT for the new row to commit to `form.devices`
// state before returning. ControlledList's add is an async state update; firing
// `submit` immediately races it (the submit's Validate reads `form.devices`
// before the row lands and wrongly sees an empty — required — list). Polling the
// committed state closes that race deterministically.
async function addDeviceRow(ldf) {
  await ldf.block('form.devices').do.add();
  await expect
    .poll(
      async () => {
        const value = await ldf.state('form.devices').value();
        return Array.isArray(value) ? value.length : 0;
      },
      { timeout: 10_000 }
    )
    .toBeGreaterThan(0);
}

// The row text input. ControlledList row children are addressed by a runtime id
// the harness can't cheaply predict, so target the row's textbox by role within
// the ControlledList wrapper — robust to the exact id scheme.
function deviceNameInput(page) {
  return getBlock(page, 'form.devices').getByRole('textbox').first();
}

async function seedAndStart(ldf, mdb, workflow, thingId) {
  await ldf.user({
    name: 'Test User',
    email: 'test-user@example.com',
    roles: ['admin'],
  });
  await mdb.seed('things', [{ _id: thingId, title: 'Gallery Thing' }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: 'things-collection',
  });
  const gallery = await actionByType(mdb, workflow_id, 'gallery');
  return { workflowId: workflow_id, actionId: gallery._id.toString() };
}

test('the required text field and the required list gate submit; both pass once satisfied', async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const { workflowId, actionId } = await seedAndStart(
    ldf,
    mdb,
    workflow,
    'thing-validation'
  );
  const editUrl = `/workflows/${WORKFLOW_TYPE}-gallery-edit?action_id=${actionId}`;
  await ldf.goto(editUrl);

  // ── submit blocked while the required text field is empty ──────────────────
  // The edit page's Validate (regex ^form\.) fails before the endpoint fires, so
  // the action stays action-required. Asserting a non-event: give the (blocked)
  // submit time to NOT advance.
  await ldf.block('button_submit').do.click();
  await page.waitForTimeout(800);
  expect((await actionByType(mdb, workflowId, 'gallery')).status[0].stage).toBe(
    'action-required'
  );

  // ── still blocked: text filled but the required list is empty ──────────────
  // controlled_list's submit gate is its required-non-empty rule (array length
  // > 0). (minItems is only an auto-fill floor, not a Validate rule — see
  // gallery.yaml — so it is left at 0 and an empty list genuinely blocks submit.)
  await ldf.block('form.text_input').do.fill('A summary.');
  await ldf.block('button_submit').do.click();
  await page.waitForTimeout(800);
  expect((await actionByType(mdb, workflowId, 'gallery')).status[0].stage).toBe(
    'action-required'
  );

  // ── both satisfied → submit passes (review verb routes it to in-review) ────
  // Adding a controlled_list row makes the list non-empty, satisfying required.
  await addDeviceRow(ldf);
  await ldf.block('button_submit').do.click();
  await workflow.assertStatus(actionId, 'in-review');
});

test('progress persists every representative field, the stored form_data shape is correct, and reopening the edit page re-primes the values', async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const { workflowId, actionId } = await seedAndStart(
    ldf,
    mdb,
    workflow,
    'thing-persistence'
  );
  const editUrl = `/workflows/${WORKFLOW_TYPE}-gallery-edit?action_id=${actionId}`;
  await ldf.goto(editUrl);

  // file_upload renders (render coverage) but cannot be filled without S3 — see
  // the FILE-UPLOAD GAP note at the top of the file.
  await expect(getBlock(page, 'form.file_upload')).toBeVisible();

  // Fill one representative per fillable family.
  await ldf.block('form.text_input').do.fill('Hello');
  await ldf.block('form.selector').do.select('Option A');
  await ldf.block('form.date_selector').do.select('2026-06-25');
  await fillTiptap(page, 'form.rich_text', 'Rich content');
  await addDeviceRow(ldf);
  await deviceNameInput(page).fill('Device 1');

  // ── progress draft-save: no validation, persists form to workflow.form_data ─
  await ldf.block('button_progress').do.click();
  await workflow.assertStatus(actionId, 'in-progress');

  // ── DB shape: form_data is keyed by action type, then by the sub-paths after
  // the `form.` prefix. ──────────────────────────────────────────────────────
  await expect
    .poll(async () => (await workflowDoc(mdb, workflowId))?.form_data?.gallery, {
      timeout: 10_000,
    })
    .toEqual(
      expect.objectContaining({
        text_input: 'Hello',
        selector: 'a',
      })
    );
  const formData = (await workflowDoc(mdb, workflowId)).form_data.gallery;
  // date_selector stores a date value; assert presence rather than an exact
  // serialization. tiptap stores an object whose `.text` holds the plain text.
  expect(formData.date_selector).toBeTruthy();
  expect(formData.rich_text?.text ?? '').toContain('Rich content');
  // controlled_list persists a non-empty row array carrying the entered value.
  expect(Array.isArray(formData.devices)).toBe(true);
  expect(formData.devices.length).toBeGreaterThan(0);
  expect(JSON.stringify(formData.devices)).toContain('Device 1');

  // ── re-prime: reopening the edit page restores the saved values ────────────
  // text + list inputs assert on the rendered value; the selector asserts on the
  // re-primed state value (the rendered selection-label lags the state prime, so
  // a display assertion races).
  await ldf.goto(editUrl);
  await ldf.block('form.text_input').expect.value('Hello');
  await expect
    .poll(() => ldf.state('form.selector').value(), { timeout: 10_000 })
    .toBe('a');
  await expect(deviceNameInput(page)).toHaveValue('Device 1');
});

test('the review page renders the submitted values read-only and the error page renders the recovery form', async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const { actionId } = await seedAndStart(ldf, mdb, workflow, 'thing-readonly');
  const editUrl = `/workflows/${WORKFLOW_TYPE}-gallery-edit?action_id=${actionId}`;
  const reviewUrl = `/workflows/${WORKFLOW_TYPE}-gallery-review?action_id=${actionId}`;
  const errorUrl = `/workflows/${WORKFLOW_TYPE}-gallery-error?action_id=${actionId}`;

  // Fill the required fields and submit → in-review.
  await ldf.goto(editUrl);
  await ldf.block('form.text_input').do.fill('Read-only value');
  await ldf.block('form.selector').do.select('Option A');
  await addDeviceRow(ldf);
  await ldf.block('button_submit').do.click();
  await workflow.assertStatus(actionId, 'in-review');

  // ── review page: the main form is rendered read-only via a single
  // DataDescriptions block (`form_body`), not per-field inputs — this is the
  // genuine read-only variant. The submitted text value is shown. ────────────
  await ldf.goto(reviewUrl);
  await expect(getBlock(page, 'form_body')).toBeVisible();
  await expect(page.getByText('Read-only value')).toBeVisible();
  // The writable form_review surface renders below the read-only main form.
  await expect(getBlock(page, 'form_review.verdict')).toBeVisible();

  // ── error page: only renders at the `error` stage (stale-URL allowlist is
  // [error]). setStage is the suite's standard fixture pre-condition (a thin
  // direct write to status[0].stage, not an engine backdoor). The error page
  // renders the `form_error` recovery schema (via makeActionsForm, mode: error)
  // plus the failure banner. ─────────────────────────────────────────────────
  await workflow.setStage(actionId, 'error');
  await ldf.goto(errorUrl);
  await expect(getBlock(page, 'failure_banner')).toBeVisible();
  await expect(getBlock(page, 'form.text_input')).toBeVisible();
  await expect(getBlock(page, 'form.selector')).toBeVisible();
});
