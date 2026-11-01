import { test, expect } from "../fixtures.js";

// A file stored in a workflow's form_data renders as a plain link to the
// workflows module's form-file link endpoint, with no app config, on the
// overview card and in a `file_download` field: a new tab on
// /api/endpoints/workflows/form-file/<workflow_id>/<key>, and no CallAPI.
// This app has no S3 bucket and its e2e server serves no link endpoints, so
// the spec answers the link itself and checks what the browser opens; the
// endpoint's redirect and refusals are proven in
// apps/tenant-demo/e2e/workflows/form-file-access.spec.js.

const KEY = "workflows/gallery/20260701/contract.pdf";
const FILE = { key: KEY, name: "contract.pdf", type: "application/pdf" };

async function startGallery({ ldf, mdb, workflow }) {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });
  await mdb.seed("things", [{ _id: "thing-files", title: "Acme Widget" }]);
  const { workflow_id } = await workflow.start({
    workflow_type: "field-gallery",
    entity_id: "thing-files",
    entity_collection: "things-collection",
  });
  // A form file as the file_upload field stores it.
  await mdb.collection("workflows").updateOne(
    { _id: String(workflow_id) },
    {
      $set: {
        "form_data.gallery.file_upload": { file: FILE, fileList: [FILE] },
      },
    },
  );
  return String(workflow_id);
}

const linkOf = (workflowId) =>
  `/api/endpoints/workflows/form-file/${workflowId}/${KEY}`;

// Answers the link in place of the endpoint, and records any CallAPI request
// for a form file.
async function watchLinks(page) {
  await page
    .context()
    .route("**/api/endpoints/workflows/form-file/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "file" }),
    );
  const callApi = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/endpoints/workflows/") &&
      request.url().includes("form-file")
    ) {
      callApi.push(request.url());
    }
  });
  return callApi;
}

// Clicks a link, which opens a new tab, and returns the URL that tab opened.
async function clickToTab(page, link) {
  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    link.click(),
  ]);
  await tab.waitForLoadState();
  const url = new URL(tab.url());
  await tab.close();
  return url.pathname;
}

test("the overview card links a form file to form-file", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const workflowId = await startGallery({ ldf, mdb, workflow });
  const callApi = await watchLinks(page);

  await ldf.goto(`/workflows/workflow-overview?workflow_id=${workflowId}`);
  await page.getByRole("button", { name: "Expand all" }).click();

  const link = page.getByRole("link", { name: "contract.pdf" }).first();
  await expect(link).toHaveAttribute("href", linkOf(workflowId));
  await expect(link).toHaveAttribute("target", "_blank");
  expect(await clickToTab(page, link)).toBe(linkOf(workflowId));
  expect(callApi).toEqual([]);
});

test("the file_download field links a form file to form-file", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const workflowId = await startGallery({ ldf, mdb, workflow });
  const action = await mdb
    .collection("actions")
    .findOne({ workflow_id: workflowId, type: "gallery" });
  const callApi = await watchLinks(page);

  await ldf.goto(
    `/workflows/field-gallery-gallery-edit?action_id=${action._id}`,
  );
  // The field's Label wraps the list; antd puts the block id on a hidden input.
  const field = page.locator('[id="form.file_download_download_label"]');
  const link = field.getByRole("link", { name: "contract.pdf" }).first();
  await expect(link).toHaveAttribute("href", linkOf(workflowId));
  await expect(link).toHaveAttribute("target", "_blank");
  expect(await clickToTab(page, link)).toBe(linkOf(workflowId));
  expect(callApi).toEqual([]);
});
