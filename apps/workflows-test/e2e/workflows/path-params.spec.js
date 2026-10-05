import { test, expect } from "../fixtures.js";

// Cluster: path-params. A workflow whose entity page is served at a path
// (`thing/{thing_id}`, entity.id_path_key) and whose engine links carry
// `pathParams` sentinels (`path-link/{source}/{action_id}`).
//
//   1. The overview subtitle and breadcrumb, the action page breadcrumb and the
//      return-to-entity step after submit all land on /thing/<id>.
//   2. The custom action's link and the tracker's start_link resolve their
//      `action_id: true` path sentinel to the concrete action id and open that
//      action's page instance.

const WORKFLOW_TYPE = "path-params";
const THING_ID = "thing-path";

const USER = {
  name: "Test User",
  email: "test-user@example.com",
  roles: ["admin"],
};

async function startWorkflow({ ldf, mdb, workflow }) {
  await ldf.user(USER);
  await mdb.seed("things", [{ _id: THING_ID, title: "Path Thing" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: THING_ID,
    entity_collection: "things-collection",
  });
  const actions = await mdb
    .collection("actions")
    .find({ workflow_id: String(workflow_id) })
    .toArray();
  const byType = (type) => actions.find((a) => a.type === type);
  return {
    workflow_id,
    check: byType("path-check"),
    review: byType("path-review"),
    track: byType("path-track"),
  };
}

test("the entity links of a workflow on a patterned entity page land on the entity's path", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const { workflow_id, check } = await startWorkflow({ ldf, mdb, workflow });
  const checkId = check._id.toString();

  // Overview: subtitle and the entity crumb link to /thing/<id>.
  await page.goto(`/workflows/workflow-overview?workflow_id=${workflow_id}`);
  const subtitle = page.getByRole("link", { name: THING_ID });
  await expect(subtitle).toHaveAttribute("href", `/thing/${THING_ID}`);
  await expect(
    page.locator(".ant-breadcrumb").getByRole("link", { name: "Thing" }),
  ).toHaveAttribute("href", `/thing/${THING_ID}`);
  await subtitle.click();
  await expect(page).toHaveURL(new RegExp(`/thing/${THING_ID}$`));
  await expect(page.locator("#thing-title")).toHaveText("Path Thing");

  // Action page: the entity crumb, then submit returns to the entity's path.
  await page.goto(`/workflows/path-params-action?action_id=${checkId}`);
  await expect(
    page.locator(".ant-breadcrumb").getByRole("link", { name: "Thing" }),
  ).toHaveAttribute("href", `/thing/${THING_ID}`);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(new RegExp(`/thing/${THING_ID}$`));
  await expect(page.locator("#thing-title")).toHaveText("Path Thing");
  await workflow.assertStatus(checkId, "done");
});

test("custom link and start_link pathParams sentinels open the action's own page instance", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const { review, track } = await startWorkflow({ ldf, mdb, workflow });
  const reviewId = review._id.toString();
  const trackId = track._id.toString();

  // Engine routing: the `action_id: true` path sentinel became the concrete id.
  expect(review.test.links.edit).toEqual({
    pageId: "path-link-target",
    pathParams: { source: "review", action_id: reviewId },
  });
  expect(track.test.links.edit).toEqual({
    pageId: "path-link-target",
    pathParams: { source: "start", action_id: trackId },
    urlQuery: { entity_id: THING_ID },
  });

  // Click-through from the entity page's action steps.
  await page.goto(`/thing/${THING_ID}`);
  await page.getByText("Review the thing at its path.").click();
  await expect(page).toHaveURL(new RegExp(`/path-link/review/${reviewId}$`));
  await expect(page.locator("#link-source")).toHaveText("review");
  await expect(page.locator("#link-action-id")).toHaveText(reviewId);

  await page.goto(`/thing/${THING_ID}`);
  await page.getByText("Start the child workflow from its path.").click();
  await expect(page).toHaveURL(
    new RegExp(`/path-link/start/${trackId}\\?entity_id=${THING_ID}$`),
  );
  await expect(page.locator("#link-source")).toHaveText("start");
  await expect(page.locator("#link-action-id")).toHaveText(trackId);
  await expect(page.locator("#link-entity-id")).toHaveText(THING_ID);
});
