import { test, expect } from '../fixtures.js';

// Cluster: form-lifecycle (Part 22 task 3) — the TEMPLATE cluster.
//
// Mode: Spine — render the real emitted page, click the real signal button, the
// real per-workflow submit endpoint fires, Mongo mutates, and we assert both the
// committed DB state (via the `workflow` fixture / `mdb`) AND that the entity
// surface reflects it.
//
// TARGET STATE: written against parts 40/46/48 (in flight). The form pages are
// the per-action pages makeActionPages emits — `{type}-{action}-{verb}`, so
// /workflows/form-lifecycle-reviewed-form-{edit,view,review}. Signal buttons
// (Part 39/40): `button_submit` / `button_progress` / `button_not_required` on
// edit; `button_approve` / `button_request_changes` on review. The submit
// endpoint is per-workflow `form-lifecycle-submit` (Part 48). These tests fail
// against pre-48 code by design — the suite is the spec.
//
// The `mdb` fixture wipes all collections between tests, so each test starts
// from a clean database — no manual teardown needed.

const WORKFLOW_TYPE = 'form-lifecycle';

// Read an action doc by its type within a started workflow. Engine `_id`s and
// id refs are UUID strings (createEngineContext: newId: randomUUID), so query
// by the raw `workflow_id` — no ObjectId coercion.
function actionByType(mdb, workflowId, type) {
  return mdb
    .collection('actions')
    .findOne({ workflow_id: String(workflowId), type });
}

// Fill a Lowdefy TiptapInput (ProseMirror contenteditable) — `.do.fill` targets
// plain inputs, not rich-text editors.
async function fillTiptap(page, blockId, text) {
  const editor = page.locator(`#${blockId} [contenteditable="true"]`).first();
  await editor.click();
  await editor.pressSequentially(text);
}

async function seedThingAndStart(ldf, mdb, workflow, thingId) {
  await ldf.user({
    name: 'Test User',
    email: 'test-user@example.com',
    roles: ['admin'],
  });
  await mdb.seed('things', [{ _id: thingId, title: 'Lifecycle Thing' }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: 'things-collection',
  });
  return workflow_id;
}

test('the review lifecycle: a draft saves without validation, submit enters review, request_changes returns it, and approve completes — the entity surface reflecting each commit', async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = 'thing-review-lifecycle';
  const workflowId = await seedThingAndStart(ldf, mdb, workflow, thingId);

  const reviewed = await actionByType(mdb, workflowId, 'reviewed-form');
  expect(reviewed?.status?.[0]?.stage).toBe('action-required');
  const actionId = reviewed._id.toString();
  const editUrl = `/workflows/${WORKFLOW_TYPE}-reviewed-form-edit?action_id=${actionId}`;
  const reviewUrl = `/workflows/${WORKFLOW_TYPE}-reviewed-form-review?action_id=${actionId}`;
  const viewUrl = `/workflows/${WORKFLOW_TYPE}-reviewed-form-view?action_id=${actionId}`;

  // ── progress (draft-save): no validation, lands in-progress ────────────────
  // Fill only the optional field; leave the required `form.summary` empty.
  await ldf.goto(editUrl);
  await ldf.block('form.notes').do.fill('A first draft note.');
  await ldf.block('button_progress').do.click();

  // Draft-save skips validation (the required summary is still empty) and lands
  // in-progress, persisting the note to workflow.form_data.
  await workflow.assertStatus(actionId, 'in-progress');
  await expect
    .poll(
      async () => {
        const wf = await mdb
          .collection('workflows')
          .findOne({ _id: String(workflowId) });
        return wf?.form_data?.['reviewed-form']?.notes;
      },
      { timeout: 10_000 }
    )
    .toBe('A first draft note.');

  // Reopening the edit page re-primes the saved draft value into form state.
  await ldf.goto(editUrl);
  await expect.poll(() => ldf.state('form.notes').value(), { timeout: 10_000 }).toBe(
    'A first draft note.'
  );

  // ── submit enforces `required` ─────────────────────────────────────────────
  // Submitting with the required summary empty is blocked by the edit page's
  // Validate (regex ^form\.) before the endpoint fires — the action stays in
  // progress (contrast with progress, which had no Validate step).
  await ldf.block('button_submit').do.click();
  // Asserting a non-event: give the (blocked) submit time to NOT advance.
  await page.waitForTimeout(800);
  const afterBlockedSubmit = await actionByType(mdb, workflowId, 'reviewed-form');
  expect(afterBlockedSubmit.status[0].stage).toBe('in-progress');

  // Fill the required field and submit → in-review (the `review` verb routes
  // submit to in-review rather than straight to done).
  await ldf.block('form.summary').do.fill('Lifecycle summary.');
  await ldf.block('button_submit').do.click();
  await workflow.assertStatus(actionId, 'in-review');

  // ── request_changes returns the form to the submitter ──────────────────────
  await ldf.goto(reviewUrl);
  await ldf.block('button_request_changes').do.click();
  // The mandatory Request Changes modal carries a required comment.
  await fillTiptap(page, 'comment', 'Please expand the summary.');
  // Scope to the dialog: both the trigger button and the modal's OK button are
  // labelled "Request Changes" — confirm via the modal's OK control only.
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Request Changes' })
    .click();
  await workflow.assertStatus(actionId, 'changes-required');

  // ── resubmit re-enters review ──────────────────────────────────────────────
  // The edit page is actionable again from changes-required; the summary is
  // re-primed from form_data, so resubmitting passes validation → in-review.
  await ldf.goto(editUrl);
  await expect
    .poll(() => ldf.state('form.summary').value(), { timeout: 10_000 })
    .toBe('Lifecycle summary.');
  await ldf.block('button_submit').do.click();
  await workflow.assertStatus(actionId, 'in-review');

  // ── approve completes the action ───────────────────────────────────────────
  await ldf.goto(reviewUrl);
  await ldf.block('button_approve').do.click();
  await workflow.assertStatus(actionId, 'done');

  // ── the view page renders for a done action (emitted-page reachability) ─────
  await ldf.goto(viewUrl);
  await expect(page).toHaveURL(new RegExp('reviewed-form-view'));

  // ── SPINE CLOSURE: the entity surface reflects the committed done state ─────
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText('Approved and complete.')).toBeVisible();
});

test('not_required marks the optional action not-required and the group summary recomputes', async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = 'thing-not-required';
  const workflowId = await seedThingAndStart(ldf, mdb, workflow, thingId);

  const optional = await actionByType(mdb, workflowId, 'optional-form');
  expect(optional?.status?.[0]?.stage).toBe('action-required');
  const actionId = optional._id.toString();

  // optional-form opts into `allow_not_required`, so the `not_required` signal
  // is permitted (and its button resolves visible). Firing it lands not-required
  // without disturbing reviewed-form.
  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-optional-form-edit?action_id=${actionId}`
  );
  await ldf.block('button_not_required').do.click();
  await workflow.assertStatus(actionId, 'not-required');

  // The workflow's group summary recomputes to count the not-required action.
  await expect
    .poll(
      async () => {
        const wf = await mdb
          .collection('workflows')
          .findOne({ _id: String(workflowId) });
        return wf?.groups?.find((g) => g.id === 'lifecycle')?.summary
          ?.not_required;
      },
      { timeout: 10_000 }
    )
    .toBe(1);
});
