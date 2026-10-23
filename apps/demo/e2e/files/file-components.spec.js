import { test, expect } from "../fixtures.js";

// The files module's components on the files-demo page, against an in-memory
// MongoDB: file-manager and file-list list through list-files, download
// through download-file and delete through delete-file, and file-manager
// lists again after a save or a delete.
//
// Signing is computed locally, so the placeholder bucket secrets in
// playwright.config.js are enough. save-file checks the object reached S3,
// which needs a bucket, so the upload test answers save-file in the browser
// with the record it would have written, after checking what the block sent.

const FILES = "files";
const USER = {
  id: "e2e-files-user",
  name: "Files User",
  email: "files@example.com",
  organization_id: "demo",
  roles: ["admin"],
};
const STAMP = (iso) => ({
  timestamp: new Date(iso),
  user: { id: USER.id, name: USER.name },
});
const PNG_THUMBNAIL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = Buffer.from(PNG_THUMBNAIL.split(",")[1], "base64");

function record({ key, doc_id, at, thumbnail }) {
  return {
    _id: key,
    organization_id: "demo",
    collection: "files-demo",
    doc_id,
    file: {
      key,
      name: key.split("/").pop(),
      type: "application/pdf",
      bucket: "e2e-bucket",
      size: 10,
      ...(thumbnail ? { thumbnail } : {}),
    },
    created: STAMP(at),
    updated: STAMP(at),
  };
}

const ALPHA = "files-demo/20240101_000000000/u1/alpha.pdf";
const BETA = "files-demo/20240102_000000000/u2/beta.pdf";
const CARD = "files-demo/20240103_000000000/u3/card.pdf";

test.beforeEach(async ({ ldf, page, mdb }) => {
  await mdb.collection(FILES).deleteMany({});
  await mdb.seed(FILES, [
    record({ key: ALPHA, doc_id: "showcase-manager", at: "2024-01-01" }),
    record({ key: BETA, doc_id: "showcase-manager", at: "2024-01-02" }),
    record({ key: CARD, doc_id: "showcase", at: "2024-01-03" }),
  ]);
  await ldf.user(USER);
  // A download opens the signed link; keep it instead of opening a tab.
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(url);
      return null;
    };
  });
});

const opened = (page) => page.evaluate(() => window.__opened);

test("file-manager lists, downloads and deletes through the endpoints", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/files-demo");
  const manager = page.locator("#demo_file_manager").first();
  await expect(manager).toContainText("alpha.pdf");
  await expect(manager).toContainText("beta.pdf");
  await expect(manager).not.toContainText("card.pdf");

  // Newest first: beta is row 0.
  await page.locator("#demo_file_manager_file_0_dl").click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  const [url] = await opened(page);
  expect(url).toContain(BETA);
  expect(url).toContain("X-Amz-Signature=");

  await page.locator("#demo_file_manager_file_0_rm").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(manager).not.toContainText("beta.pdf");
  await expect(manager).toContainText("alpha.pdf");
  const stored = await mdb.collection(FILES).findOne({ _id: BETA });
  expect(stored.deleted.timestamp).toBeTruthy();
});

test("file-list lists its record's files and downloads one", async ({
  ldf,
  page,
}) => {
  await ldf.goto("/files-demo");
  const list = page.locator("#demo_file_list");
  await expect(list).toContainText("card.pdf");
  await expect(list).not.toContainText("alpha.pdf");

  await list.getByText("card.pdf").click();
  await expect.poll(() => opened(page)).toHaveLength(1);
  const [url] = await opened(page);
  expect(url).toContain(CARD);
  expect(url).toContain("X-Amz-Signature=");
});

test("an upload mints its key on the server, saves with its thumbnail and lists again", async ({
  ldf,
  page,
  mdb,
}) => {
  let policyPayload = null;
  let savePayload = null;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/endpoints/files/upload-policy")) {
      policyPayload = request.postDataJSON().payload;
    }
  });
  // The presigned POST goes to the bucket; answer it as S3 would.
  await page.route(/amazonaws\.com/, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  await page.route("**/api/endpoints/files/save-file", async (route) => {
    savePayload = route.request().postDataJSON().payload;
    const { key, thumbnail } = savePayload;
    await mdb.seed(FILES, [
      record({
        key,
        doc_id: "showcase-manager",
        at: "2024-02-01",
        thumbnail,
      }),
    ]);
    // Answer in the envelope a real endpoint call uses.
    const real = await page.request.post("/api/endpoints/files/list-files", {
      data: {
        payload: { entity_type: "files-demo", entity_id: "showcase-manager" },
      },
    });
    const envelope = await real.json();
    await route.fulfill({ json: { ...envelope, response: { fileId: key } } });
  });

  await ldf.goto("/files-demo");
  const manager = page.locator("#demo_file_manager").first();
  await expect(manager).toContainText("alpha.pdf");

  await manager
    .locator("input[type=file]")
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });

  await expect(manager).toContainText("photo.png");
  expect(policyPayload).toMatchObject({
    entity_type: "files-demo",
    entity_id: "showcase-manager",
    file: { name: "photo.png", type: "image/png", size: PNG.length },
  });
  expect(savePayload.key).toMatch(
    /^demo\/files\/files-demo\/showcase-manager\/\d{8}_\d{9}\/[0-9a-f-]{36}\/photo\.png$/,
  );
  expect(savePayload.thumbnail).toMatch(/^data:image\//);
  expect(savePayload.entity_type).toBe("files-demo");
  expect(savePayload.entity_id).toBe("showcase-manager");
  await expect(manager.locator("img[src^='data:image/']")).toHaveCount(1);
});
