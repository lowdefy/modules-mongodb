import { test, expect } from "../fixtures.js";

// A file stored in a workflow's form_data downloads through the workflows
// module's download-form-file endpoint, with no app config, from the overview
// card and from a `file_download` field. This app has no S3 bucket, so the
// spec checks what the browser sends to the endpoint (the workflow and the
// file's key), not the signed link; the endpoint's signing and refusals are
// proven in apps/tenant-demo/e2e/workflows/download-form-file.spec.js.

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

function downloadRequest(page) {
  return page.waitForRequest((request) =>
    request.url().endsWith("/api/endpoints/workflows/download-form-file"),
  );
}

test("the overview card downloads a form file through download-form-file", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const workflowId = await startGallery({ ldf, mdb, workflow });

  await ldf.goto(`/workflows/workflow-overview?workflow_id=${workflowId}`);
  await page.getByRole("button", { name: "Expand all" }).click();

  const sent = downloadRequest(page);
  await page.getByText("contract.pdf").first().click();
  expect((await sent).postDataJSON().payload).toEqual({
    workflow_id: workflowId,
    file_id: KEY,
  });
});

test("the file_download field downloads a form file through download-form-file", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const workflowId = await startGallery({ ldf, mdb, workflow });
  const action = await mdb
    .collection("actions")
    .findOne({ workflow_id: workflowId, type: "gallery" });

  await ldf.goto(
    `/workflows/field-gallery-gallery-edit?action_id=${action._id}`,
  );
  // The field's Label wraps the list; antd puts the block id on a hidden input.
  const field = page.locator('[id="form.file_download_download_label"]');
  await expect(field.getByText("contract.pdf").first()).toBeVisible();

  const sent = downloadRequest(page);
  await field.getByText("contract.pdf").first().click();
  expect((await sent).postDataJSON().payload).toEqual({
    workflow_id: workflowId,
    file_id: KEY,
  });
});
