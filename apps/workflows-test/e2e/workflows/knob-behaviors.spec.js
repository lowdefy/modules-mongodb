import { test, expect } from "../fixtures.js";

// Covers the per-action UI knobs:
//   - show_comment: false           -> free-form comment box hidden on edit
//   - pages.edit.validate_on_draft   -> Save Draft validates the form first
//   - form.capped max_length         -> native TextInput maxLength cap
//   - overview-page collapsible actions + Expand/Collapse-all toggle
//
// The `mdb` fixture wipes all collections between tests, so each starts clean.

function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

async function seedAndStart(ldf, mdb, workflow, workflowType, thingId) {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });
  await mdb.seed("things", [{ _id: thingId, title: "Knob Thing" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: workflowType,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  return workflow_id;
}

test("the knob action hides the comment box, caps the max-length field, and validates on Save Draft", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-knobs";
  const workflowId = await seedAndStart(
    ldf,
    mdb,
    workflow,
    "knob-behaviors",
    thingId,
  );
  const knobs = await actionByType(mdb, workflowId, "knobs");
  expect(knobs?.status?.[0]?.stage).toBe("action-required");
  const actionId = knobs._id.toString();
  const editUrl = `/workflows/knob-behaviors-knobs-edit?action_id=${actionId}`;

  await ldf.goto(editUrl);

  // show_comment: false -> the free-form comment box (id `comment`) is absent.
  await expect(page.locator("#comment")).toHaveCount(0);

  // max_length: 8 -> the input carries maxlength and natively caps typed input.
  const capped = page.locator('[id="form.capped"] input');
  await expect(capped).toHaveAttribute("maxlength", "8");
  await capped.click();
  await capped.pressSequentially("1234567890");
  await expect(capped).toHaveValue("12345678");

  // validate_on_draft: true -> Save Draft with the required field empty is
  // blocked by Validate (contrast with the default draft, which skips it), so
  // the action stays action-required.
  await ldf.block("button_progress").do.click();
  await page.waitForTimeout(800);
  const afterBlockedDraft = await actionByType(mdb, workflowId, "knobs");
  expect(afterBlockedDraft.status[0].stage).toBe("action-required");

  // Fill the required field -> Save Draft now passes validation and persists.
  await ldf.block("form.required_field").do.fill("filled");
  await ldf.block("button_progress").do.click();
  await workflow.assertStatus(actionId, "in-progress");
});

test("the default action still shows the comment box", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  // Contrast case: reviewed-form does not set show_comment, so the free-form
  // comment box (default on) renders on its edit page.
  const thingId = "thing-default-comment";
  const workflowId = await seedAndStart(
    ldf,
    mdb,
    workflow,
    "form-lifecycle",
    thingId,
  );
  const reviewed = await actionByType(mdb, workflowId, "reviewed-form");
  const actionId = reviewed._id.toString();

  await ldf.goto(`/workflows/form-lifecycle-reviewed-form-edit?action_id=${actionId}`);
  await expect(page.locator("#comment")).toHaveCount(1);
});

test("the overview page starts collapsed and the expand/collapse-all toggle shows and hides every action body", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-collapse";
  const workflowId = await seedAndStart(
    ldf,
    mdb,
    workflow,
    "form-lifecycle",
    thingId,
  );
  // form-lifecycle starts two actions (reviewed-form + optional-form); neither
  // has submitted data, so each action body is the "No data submitted yet."
  // empty-state — a clean proxy for "the body is rendered (expanded)".
  await ldf.goto(`/workflows/workflow-overview?workflow_id=${workflowId}`);

  const bodies = page.getByText("No data submitted yet.");
  const expandAll = page.getByRole("button", { name: "Expand all" });

  // Collapsed by default: no action body is rendered, and the toggle offers
  // "Expand all".
  await expect(expandAll).toBeVisible();
  await expect(bodies).toHaveCount(0);

  // Expand all -> both bodies render, toggle flips to "Collapse all".
  await expandAll.click();
  await expect(bodies).toHaveCount(2);
  const collapseAll = page.getByRole("button", { name: "Collapse all" });
  await expect(collapseAll).toBeVisible();

  // Collapse all -> bodies hidden again.
  await collapseAll.click();
  await expect(bodies).toHaveCount(0);

  // Per-card chevron: renders cleanly (its icon _if must resolve to a boolean)
  // and expands only its own card.
  const firstChevron = page.locator('[id$="collapse_toggle"]').first();
  await expect(firstChevron).toBeVisible();
  await firstChevron.click();
  await expect(bodies).toHaveCount(1);
});
