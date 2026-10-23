import { test, expect } from "../fixtures.js";

// The workflows module's download-form-file endpoint and the per-workflow
// submit endpoint, called as the browser calls them, with two organizations on
// one in-memory MongoDB. A key is signed only when it is in the form slots of
// actions the caller holds a verb on, in a workflow the tenant wall lets the
// caller read, and is the caller's own {organization_id}/workflows/ key or a
// key from before form files carried the organization. Submit refuses any
// other new form file key. Signing is computed locally, so the placeholder
// bucket secrets in playwright.config.js are enough.

const SLUG = "tenant-demo";
const STAMP = {
  timestamp: new Date("2026-07-01T09:00:00.000Z"),
  user: { id: "user-e2e", name: "E2E User" },
};
const ORG_A = { organization_id: "org-a", email: "a@example.com" };
const ORG_B = { organization_id: "org-b", email: "b@example.com" };

// Form files upload through the app's own policy request, under
// {organization_id}/workflows/. LEGACY_* keys are the shape form files had
// before that: no module prefix.
const PO_KEY = "org-a/workflows/po/20260701/po.pdf";
const SITE_A_KEY = "org-a/workflows/sign/site-a.pdf";
const SITE_B_KEY = "org-a/workflows/sign/site-b.pdf";
const AUDIT_KEY = "org-a/workflows/audit/report.pdf";
const LEGACY_A_KEY = "workflows/po/20260701/legacy-a.pdf";
const OTHER_ORG_KEY = "workflows/po/20260701/other-org.pdf";
// Planted in org B's own form slot: another organization's form file and a
// files module key, neither of which org B may have signed.
const PLANTED_A_KEY = "org-a/workflows/po/20260701/planted.pdf";
const PLANTED_FILES_KEY = "org-b/files/deal/D-0001/20260701_090000000/u/x.pdf";

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
        "upload-po": {
          po_files: fileValue(PO_KEY),
          old_files: fileValue(LEGACY_A_KEY),
        },
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
      form_data: {
        "upload-po": {
          po_files: fileValue(OTHER_ORG_KEY),
          planted: {
            fileList: [
              fileValue(PLANTED_A_KEY).file,
              fileValue(PLANTED_FILES_KEY).file,
            ],
          },
        },
      },
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
  for (const key of [PO_KEY, SITE_A_KEY, LEGACY_A_KEY]) {
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

test("refuses another organization's key and a files module key planted in the caller's own form", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_B);
  refused(
    await download(page, { workflow_id: "wf-b", file_id: PLANTED_A_KEY }),
  );
  refused(
    await download(page, { workflow_id: "wf-b", file_id: PLANTED_FILES_KEY }),
  );
});

// ── Submit ────────────────────────────────────────────────────────────────

async function seedSubmittable(mdb) {
  await mdb.seed("workflows", [
    {
      ...workflow({
        _id: "wf-b-open",
        organization_id: "org-b",
        form_data: {},
      }),
      entity: { connection_id: "deals", id: "D-0001", ref_key: "deal_ids" },
      summary: { done: 0, not_required: 0, total: 1 },
      groups: [],
    },
  ]);
  await mdb.seed("actions", [
    {
      ...action({
        _id: "act-po-open",
        workflow_id: "wf-b-open",
        organization_id: "org-b",
        type: "upload-po",
        access: { view: true, edit: true },
      }),
      kind: "form",
      action_group: "order",
      status: [{ stage: "action-required", created: STAMP }],
    },
  ]);
}

async function submit(page, form) {
  const raw = await page.request.post(
    "/api/endpoints/workflows/sales-pipeline-submit",
    {
      data: {
        payload: { action_id: "act-po-open", signal: "progress", form },
      },
    },
  );
  const body = await raw.json().catch(() => null);
  return { status: raw.status(), body, text: JSON.stringify(body ?? "") };
}

test("refuses a submitted form file under another organization, and writes nothing", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedSubmittable(mdb);
  await as(ldf, ORG_B);
  const result = await submit(page, {
    po_number: "PO-1",
    po_document: fileValue(PLANTED_A_KEY),
  });
  expect(result.body?.success).not.toBe(true);
  expect(result.text).toContain("form.po_document");

  const stored = await mdb
    .collection("workflows")
    .findOne({ _id: "wf-b-open" });
  expect(stored.form_data).toEqual({});
  const act = await mdb.collection("actions").findOne({ _id: "act-po-open" });
  expect(act.status[0].stage).toBe("action-required");

  // A new key with no organization is refused the same way.
  const legacy = await submit(page, {
    po_document: fileValue("workflows/po/20260701/new.pdf"),
  });
  expect(legacy.text).toContain("form.po_document");
});

test("saves a form file under the caller's own organization, and it downloads", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedSubmittable(mdb);
  await as(ldf, ORG_B);
  const OWN_KEY = "org-b/workflows/sales-pipeline/upload-po/u/po.pdf";
  const result = await submit(page, {
    po_number: "PO-2",
    po_document: fileValue(OWN_KEY),
  });
  expect(result.status).toBe(200);
  expect(result.body?.success).not.toBe(false);

  const stored = await mdb
    .collection("workflows")
    .findOne({ _id: "wf-b-open" });
  expect(stored.form_data["upload-po"].po_document.file.key).toBe(OWN_KEY);

  const signed = await download(page, {
    workflow_id: "wf-b-open",
    file_id: OWN_KEY,
  });
  expect(signed.body.response.url).toContain(OWN_KEY);
});
