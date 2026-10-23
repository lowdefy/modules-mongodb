import { test, expect } from "../fixtures.js";

// The workflows module's download-form-file endpoint, called as the browser
// calls it, with two organizations on one in-memory MongoDB. It signs a key
// only when the key is in the form slots of actions the caller holds a verb
// on, in a workflow the tenant wall lets the caller read. Signing is computed
// locally, so the placeholder bucket secrets in playwright.config.js are enough.

const SLUG = "tenant-demo";
const STAMP = {
  timestamp: new Date("2026-07-01T09:00:00.000Z"),
  user: { id: "user-e2e", name: "E2E User" },
};
const ORG_A = { organization_id: "org-a", email: "a@example.com" };
const ORG_B = { organization_id: "org-b", email: "b@example.com" };

// Form files carry no organization in their key; uploads go through the app's
// own policy request.
const PO_KEY = "workflows/po/20260701/po.pdf";
const SITE_A_KEY = "workflows/sign/site-a.pdf";
const SITE_B_KEY = "workflows/sign/site-b.pdf";
const AUDIT_KEY = "workflows/audit/report.pdf";
const OTHER_ORG_KEY = "workflows/po/20260701/other-org.pdf";

const fileValue = (key) => {
  const file = { key, name: key.split("/").pop(), type: "application/pdf" };
  return { file, fileList: [file] };
};

function workflow({ _id, organization_id, form_data }) {
  return {
    _id,
    organization_id,
    workflow_type: "sales-pipeline",
    status: [{ stage: "active", created: STAMP }],
    form_data,
    created: STAMP,
    updated: STAMP,
  };
}

function action({
  _id,
  workflow_id,
  organization_id,
  type,
  key = null,
  access,
}) {
  return {
    _id,
    workflow_id,
    organization_id,
    workflow_type: "sales-pipeline",
    type,
    key,
    status: [{ stage: "done", created: STAMP }],
    access: { [SLUG]: access },
    created: STAMP,
    updated: STAMP,
  };
}

async function seed(mdb) {
  await mdb.seed("workflows", [
    workflow({
      _id: "wf-a",
      organization_id: "org-a",
      form_data: {
        "upload-po": { po_files: fileValue(PO_KEY) },
        "sign-site": {
          "site-a": { scan: fileValue(SITE_A_KEY) },
          "site-b": { scan: fileValue(SITE_B_KEY) },
        },
        audit: { report: fileValue(AUDIT_KEY) },
      },
    }),
    workflow({
      _id: "wf-b",
      organization_id: "org-b",
      form_data: { "upload-po": { po_files: fileValue(OTHER_ORG_KEY) } },
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
      _id: "act-site-a",
      workflow_id: "wf-a",
      organization_id: "org-a",
      type: "sign-site",
      key: "site-a",
      access: { view: true },
    }),
    action({
      _id: "act-site-b",
      workflow_id: "wf-a",
      organization_id: "org-a",
      type: "sign-site",
      key: "site-b",
      access: { view: ["auditor"] },
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

async function download(page, payload) {
  const raw = await page.request.post(
    "/api/endpoints/workflows/download-form-file",
    { data: { payload } },
  );
  const body = await raw.json().catch(() => null);
  return { status: raw.status(), body, text: JSON.stringify(body ?? "") };
}

const NOT_FOUND = "This file was not found in this workflow's forms.";

function refused(result) {
  expect(result.body?.response ?? null).toBeNull();
  expect(result.text).toContain(NOT_FOUND);
}

test("signs a form file in a slot the caller may view, keyed slots included", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  for (const key of [PO_KEY, SITE_A_KEY]) {
    const result = await download(page, { workflow_id: "wf-a", file_id: key });
    expect(result.status).toBe(200);
    expect(result.body.response.url).toContain(key);
    expect(result.body.response.url).toContain("X-Amz-Signature=");
  }
});

test("refuses a key in no form slot of the workflow", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  refused(
    await download(page, {
      workflow_id: "wf-a",
      file_id: "workflows/po/20260701/never-uploaded.pdf",
    }),
  );
});

test("refuses a key in the slot of an action the caller has no verb on", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  refused(await download(page, { workflow_id: "wf-a", file_id: AUDIT_KEY }));
  refused(await download(page, { workflow_id: "wf-a", file_id: SITE_B_KEY }));

  await as(ldf, ORG_A, ["auditor"]);
  const result = await download(page, {
    workflow_id: "wf-a",
    file_id: AUDIT_KEY,
  });
  expect(result.body.response.url).toContain(AUDIT_KEY);
});

test("refuses another organization's workflow and a key from it", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_B);
  refused(await download(page, { workflow_id: "wf-a", file_id: PO_KEY }));
  refused(await download(page, { workflow_id: "wf-b", file_id: PO_KEY }));
  const own = await download(page, {
    workflow_id: "wf-b",
    file_id: OTHER_ORG_KEY,
  });
  expect(own.body.response.url).toContain(OTHER_ORG_KEY);
});
