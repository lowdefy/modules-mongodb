import { test, expect } from "../fixtures.js";

// The workflows module's `form-file` link endpoint, opened as a browser opens
// a link: a GET on /api/endpoints/workflows/form-file/<workflow_id>/<key> with
// the session cookie, redirects not followed. Two organizations share one
// in-memory MongoDB. A key opens only when it is in the form slots of actions
// the caller holds a verb on, in a workflow the tenant wall lets the caller
// read, and is the caller's own {organization_id}/workflows/ key or a key from
// before form files carried the organization. Images pasted into a rich-text
// field link here too, so the last test pastes one into upload-po's notes.
//
// Signing is computed locally, so the placeholder bucket secrets in
// playwright.config.js are enough to read the 302's Location. The paste test
// answers the browser's S3 upload and image load itself. Lowdefy's e2e server
// serves link endpoints only through serve-link-endpoints.mjs.

const SLUG = "tenant-demo";
const STAMP = {
  timestamp: new Date("2026-07-01T09:00:00.000Z"),
  user: { id: "user-e2e", name: "E2E User" },
};
const ORG_A = {
  id: "user-a",
  organization_id: "org-a",
  email: "a@example.com",
};
const ORG_B = {
  id: "user-b",
  organization_id: "org-b",
  email: "b@example.com",
};

const PO_KEY = "org-a/workflows/po/20260701/p o+1&2.pdf";
const AUDIT_KEY = "org-a/workflows/audit/report.pdf";
const LEGACY_A_KEY = "workflows/po/20260701/legacy-a.pdf";
const NOTE_IMAGE_KEY = "org-a/workflows/po/20260701/paste.png";
const AUDIT_IMAGE_KEY = "org-a/workflows/audit/20260701/paste.png";
const OTHER_ORG_KEY = "org-b/workflows/po/20260701/other-org.pdf";

const fileValue = (key, type = "application/pdf") => {
  const file = { key, name: key.split("/").pop(), type };
  return { file, fileList: [file] };
};

// A rich-text value as the Tiptap field saves it: the HTML links each pasted
// image through form-file, and fileList keeps each image's upload.
const richText = (workflowId, key) => {
  const src = linkOf(workflowId, key);
  return {
    html: `<img src="${src}"><p><a href="${src}">Enlarge Image</a></p>`,
    text: "Enlarge Image",
    markdown: `![](${src})`,
    fileList: [
      {
        key,
        name: key.split("/").pop(),
        type: "image/png",
        bucket: "e2e-bucket",
        size: 10,
        status: "done",
        url: src,
      },
    ],
  };
};

function workflow({ _id, organization_id, form_data, extra = {} }) {
  return {
    _id,
    organization_id,
    workflow_type: "sales-pipeline",
    status: [{ stage: "active", created: STAMP }],
    form_data,
    created: STAMP,
    updated: STAMP,
    ...extra,
  };
}

function action({ _id, workflow_id, organization_id, type, access, extra }) {
  return {
    _id,
    workflow_id,
    organization_id,
    workflow_type: "sales-pipeline",
    type,
    key: null,
    status: [{ stage: "done", created: STAMP }],
    access: { [SLUG]: access },
    created: STAMP,
    updated: STAMP,
    ...extra,
  };
}

async function seed(mdb) {
  await mdb.seed("workflows", [
    workflow({
      _id: "wf-a",
      organization_id: "org-a",
      form_data: {
        "upload-po": {
          po_document: fileValue(PO_KEY),
          old_files: fileValue(LEGACY_A_KEY),
          notes: richText("wf-a", NOTE_IMAGE_KEY),
        },
        audit: {
          report: fileValue(AUDIT_KEY),
          notes: richText("wf-a", AUDIT_IMAGE_KEY),
        },
      },
    }),
    workflow({
      _id: "wf-b",
      organization_id: "org-b",
      form_data: { "upload-po": { po_document: fileValue(OTHER_ORG_KEY) } },
    }),
  ]);
  await mdb.seed("actions", [
    action({
      _id: "act-po",
      workflow_id: "wf-a",
      organization_id: "org-a",
      type: "upload-po",
      access: { view: true },
    }),
    action({
      _id: "act-audit",
      workflow_id: "wf-a",
      organization_id: "org-a",
      type: "audit",
      access: { view: ["auditor"], edit: ["auditor"] },
    }),
    action({
      _id: "act-po-b",
      workflow_id: "wf-b",
      organization_id: "org-b",
      type: "upload-po",
      access: { view: true },
    }),
  ]);
}

async function as(ldf, caller, roles = ["admin"]) {
  await ldf.user({ name: caller.email, email: caller.email, roles, ...caller });
}

// The link the module builds: each segment encoded, the key's "/" kept.
function linkOf(workflowId, key) {
  return `/api/endpoints/workflows/form-file/${[workflowId, ...key.split("/")]
    .map(encodeURIComponent)
    .join("/")}`;
}

async function open(page, path) {
  const response = await page.request.get(path, { maxRedirects: 0 });
  return {
    status: response.status(),
    headers: response.headers(),
    text: await response.text(),
  };
}

async function expectNotFound(page, path) {
  const result = await open(page, path);
  expect(result.status).toBe(404);
  expect(result.headers.location).toBeUndefined();
  expect(result.text).toBe("");
}

function signedLink(result) {
  expect(result.status).toBe(302);
  return new URL(result.headers.location);
}

function expectSignedFor(location, key) {
  const path = decodeURIComponent(location.pathname);
  expect(path.slice(-key.length - 1)).toBe(`/${key}`);
}

test("a signed-out open is 401", async ({ page, mdb }) => {
  await seed(mdb);
  const result = await open(page, linkOf("wf-a", PO_KEY));
  expect(result.status).toBe(401);
  expect(result.headers.location).toBeUndefined();
});

test("a form file in a slot the caller may view redirects to a 60-second signed link", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);

  const link = linkOf("wf-a", PO_KEY);
  expect(link).toContain("p%20o%2B1%262.pdf");
  const location = signedLink(await open(page, link));
  expectSignedFor(location, PO_KEY);
  expect(location.searchParams.get("X-Amz-Expires")).toBe("60");
  expect(location.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(location.searchParams.get("response-content-type")).toBe(
    "application/pdf",
  );
  expect(location.searchParams.get("response-content-disposition")).toBe(
    "inline; filename*=UTF-8''p%20o%2B1%262.pdf",
  );

  // A key from before form files carried the organization opens the same way.
  expectSignedFor(
    signedLink(await open(page, linkOf("wf-a", LEGACY_A_KEY))),
    LEGACY_A_KEY,
  );
});

test("a rich-text image opens for a viewer of its action only", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  const location = signedLink(await open(page, linkOf("wf-a", NOTE_IMAGE_KEY)));
  expectSignedFor(location, NOTE_IMAGE_KEY);
  expect(location.searchParams.get("response-content-disposition")).toBe(
    "inline; filename*=UTF-8''paste.png",
  );
  await expectNotFound(page, linkOf("wf-a", AUDIT_IMAGE_KEY));

  await as(ldf, ORG_A, ["auditor"]);
  expectSignedFor(
    signedLink(await open(page, linkOf("wf-a", AUDIT_IMAGE_KEY))),
    AUDIT_IMAGE_KEY,
  );
});

test("every refusal is a bare 404", async ({ ldf, page, mdb }) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  // A slot the caller has no verb on, a key in no slot, an unknown workflow,
  // another workflow's key, and paths with no key or no workflow.
  await expectNotFound(page, linkOf("wf-a", AUDIT_KEY));
  await expectNotFound(page, linkOf("wf-a", "org-a/workflows/po/never.pdf"));
  await expectNotFound(page, linkOf("missing", PO_KEY));
  await expectNotFound(page, linkOf("wf-b", PO_KEY));
  await expectNotFound(page, "/api/endpoints/workflows/form-file/wf-a");
  await expectNotFound(page, "/api/endpoints/workflows/form-file/wf-a/");
  await expectNotFound(page, "/api/endpoints/workflows/form-file");

  // Another organization's workflow, and its own file, which it opens.
  await as(ldf, ORG_B);
  await expectNotFound(page, linkOf("wf-a", PO_KEY));
  await expectNotFound(page, linkOf("wf-a", NOTE_IMAGE_KEY));
  expectSignedFor(
    signedLink(await open(page, linkOf("wf-b", OTHER_ORG_KEY))),
    OTHER_ORG_KEY,
  );
});

// ── A pasted rich-text image ──────────────────────────────────────────────

// A 1x1 PNG, for the clipboard.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "*",
};

// The browser uploads straight to S3, and the placeholder bucket does not
// exist, so accept the upload (and its CORS preflight) here.
async function stubBucketUpload(page) {
  const uploads = [];
  await page.route(
    (url) => url.hostname.endsWith("amazonaws.com"),
    async (route) => {
      if (route.request().method() === "POST") {
        uploads.push(route.request().url());
      }
      await route.fulfill({ status: 204, headers: CORS });
    },
  );
  return uploads;
}

async function seedOpenAction(mdb) {
  await mdb.seed("workflows", [
    workflow({
      _id: "wf-b-open",
      organization_id: "org-b",
      form_data: {},
      extra: {
        entity: { connection_id: "deals", id: "D-0001", ref_key: "deal_ids" },
        summary: { done: 0, not_required: 0, total: 1 },
        groups: [],
      },
    }),
  ]);
  await mdb.seed("actions", [
    action({
      _id: "act-po-open",
      workflow_id: "wf-b-open",
      organization_id: "org-b",
      type: "upload-po",
      access: { view: true, edit: true },
      extra: {
        entity: { connection_id: "deals", id: "D-0001" },
        kind: "form",
        action_group: "order",
        status: [{ stage: "action-required", created: STAMP }],
      },
    }),
  ]);
}

const EDIT_URL =
  "/workflows/sales-pipeline-upload-po-edit?action_id=act-po-open";

async function pasteImage(editor) {
  await editor.click();
  await editor.evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "paste.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, PNG_BASE64);
}

test("an image pasted into a workflow rich-text field saves a form-file link and renders for a viewer", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedOpenAction(mdb);
  await as(ldf, ORG_B);
  const uploads = await stubBucketUpload(page);

  await ldf.goto(EDIT_URL);
  const editor = page
    .locator('[id="form.notes"] [contenteditable="true"]')
    .first();
  await expect(editor).toBeVisible();
  await pasteImage(editor);

  const image = editor.locator("img");
  await expect(image).toHaveAttribute(
    "src",
    /^\/api\/endpoints\/workflows\/form-file\/wf-b-open\/org-b\/workflows\/sales-pipeline\/upload-po\/[^/]+\/paste\.png$/,
  );
  expect(uploads).toHaveLength(1);

  const value = await ldf.state("form.notes").value();
  const src = await image.getAttribute("src");
  const key = value.fileList[0].key;
  expect(value.html).toContain(`src="${src}"`);
  expect(value.html).not.toContain("amazonaws");
  expect(value.fileList).toHaveLength(1);

  // Saved, the image is in a slot the caller may view, so its link opens.
  await ldf.block("button_progress").do.click();
  await expect
    .poll(async () => {
      const stored = await mdb
        .collection("workflows")
        .findOne({ _id: "wf-b-open" });
      return stored?.form_data?.["upload-po"]?.notes?.html ?? null;
    })
    .toBe(value.html);
  expectSignedFor(signedLink(await open(page, src)), key);

  // The browser's own load of the saved image, with its session cookie, is
  // redirected to the signed link. The placeholder bucket holds nothing, and
  // Playwright does not route a redirect's next hop, so the load stops there.
  const imageLoad = page.waitForResponse(
    (response) => new URL(response.url()).pathname === src,
  );
  await ldf.goto(EDIT_URL);
  const saved = page
    .locator('[id="form.notes"] [contenteditable="true"] img')
    .first();
  await expect(saved).toHaveAttribute("src", src);
  const loaded = await imageLoad;
  expect(loaded.status()).toBe(302);
  expectSignedFor(new URL(loaded.headers().location), key);

  // Organization A may not view organization B's workflow.
  await as(ldf, ORG_A);
  await expectNotFound(page, src);
});
