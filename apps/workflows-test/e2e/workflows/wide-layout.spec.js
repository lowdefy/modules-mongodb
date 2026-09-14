import { test } from "../fixtures.js";

// Cluster: wide-layout — the opt-in wide action-page layout (page_layout: wide).
//
// The `wide-layout` workflow sets `page_layout: wide`, so its emitted action
// pages (`wide-layout-wide-form-{view,edit}`) render the wide variant: the left
// panel is workflow-progress (not the actions-on-entity step list), and the
// record's Details + History move into a right-side drawer opened from a
// "Details & History" header button. The `history_details_button` trigger is
// emitted only in the wide layout, so its presence is the wide-vs-standard
// discriminator.
//
// The `mdb` fixture wipes collections between tests.

const WORKFLOW_TYPE = "wide-layout";

function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

async function startWide(ldf, mdb, workflow, thingId) {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });
  await mdb.seed("things", [{ _id: thingId, title: "Wide Thing" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  return workflow_id;
}

test("wide layout: workflow-progress left panel + Details & History trigger", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-wide-progress";
  const workflowId = await startWide(ldf, mdb, workflow, thingId);
  const action = await actionByType(mdb, workflowId, "wide-form");

  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-wide-form-view?action_id=${action._id.toString()}`,
  );

  // The wide-only header trigger renders, and the left panel is the
  // workflow-progress surface (the standard step list is swapped out).
  await ldf.block("history_details_button").expect.visible();
  await ldf.block("workflow_progress").expect.visible();
});

test("wide layout: Details and History open in the drawer", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-wide-drawer";
  const workflowId = await startWide(ldf, mdb, workflow, thingId);
  const action = await actionByType(mdb, workflowId, "wide-form");

  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-wide-form-view?action_id=${action._id.toString()}`,
  );

  // The trigger opens the right-side drawer; the workflow declares an
  // entity_view slot, so both the Details and History sections render there.
  // drawer_history_header is entity-id-gated, so its visibility also confirms
  // the action's data resolved.
  await ldf.block("history_details_button").do.click();
  await ldf.block("history_details_drawer").expect.visible();
  await ldf.block("drawer_details_header").expect.visible();
  await ldf.block("drawer_history_header").expect.visible();
});
