import { test, expect } from "../fixtures.js";

// Cluster: wide-layout — the opt-in wide action-page layout (page_layout: wide).
//
// The `wide-layout` workflow sets `page_layout: wide`, so its emitted action
// pages (`wide-layout-wide-form-{view,edit}`) render the wide variant:
//   - the left panel is workflow-progress, NOT the actions-on-entity step list,
//   - the record's Details + History move into a right-side drawer opened from a
//     "Details & History" header button,
//   - the form takes the width the RHS column vacated.
//
// The strongest standard-vs-wide discriminators are set at BUILD time and hold
// regardless of data: the `history_details_button` header trigger exists only in
// the wide layout, and `actions_on_entity` is absent from a wide page entirely.
// Starting a real workflow (via the `workflow` fixture) resolves the action's
// entity id, which opens the entity-id-gated panels (workflow-progress, and the
// drawer's History section).
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

test("wide layout: workflow-progress replaces the step list", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-wide-progress";
  const workflowId = await startWide(ldf, mdb, workflow, thingId);
  const action = await actionByType(mdb, workflowId, "wide-form");
  const actionId = action._id.toString();

  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-wide-form-view?action_id=${actionId}`,
  );

  // Build-time discriminators, independent of live data.
  await ldf.block("history_details_button").expect.visible();
  expect(await ldf.block("actions_on_entity").locator().count()).toBe(0);

  // The started workflow resolves the entity id, opening the entity-id-gated
  // left panel — in the wide layout that panel is workflow-progress.
  await ldf.block("workflow_progress").expect.visible();
});

test("wide layout: Details and History both live in the drawer", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-wide-drawer";
  const workflowId = await startWide(ldf, mdb, workflow, thingId);
  const action = await actionByType(mdb, workflowId, "wide-form");
  const actionId = action._id.toString();

  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-wide-form-view?action_id=${actionId}`,
  );

  // The trigger opens the right-side drawer holding History and — because the
  // workflow declares an entity_view slot — the Details section.
  await ldf.block("history_details_button").do.click();
  await ldf.block("history_details_drawer").expect.visible();
  await ldf.block("drawer_details_header").expect.text("Details");
  await ldf.block("drawer_history_header").expect.text("History");
});
