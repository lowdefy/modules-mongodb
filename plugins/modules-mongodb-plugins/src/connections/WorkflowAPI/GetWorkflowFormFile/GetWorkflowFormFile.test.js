/**
 * Integration tests for GetWorkflowFormFile against an in-memory Mongo: a key
 * is found only in the form slots of actions the caller may see, at any depth.
 */
import { clearMongoClientCache } from "../../mongo/getMongoDb.js";
import inMemoryMongo from "../../shared/inMemoryMongo.js";
import GetWorkflowFormFile from "./GetWorkflowFormFile.js";

jest.setTimeout(60000);

const SLUG = "test-app";

const changeStamp = {
  timestamp: new Date("2026-05-20T00:00:00Z"),
  user: { id: "u1", name: "Stamper" },
};

const file = (key) => ({ key, name: key.split("/").pop(), type: "text/plain" });

let mongo;

beforeAll(async () => {
  mongo = await inMemoryMongo();
});

afterAll(async () => {
  await clearMongoClientCache();
  await mongo.cleanup();
});

beforeEach(async () => {
  await clearMongoClientCache();
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
});

function buildContext({
  request,
  roles = ["member"],
  tenant = null,
  organization_id,
}) {
  return {
    request,
    tenant,
    connection: {
      databaseUri: mongo.uri,
      useTransactions: false,
      entry_id: "workflows",
      workflowsCollection: "workflows",
      actionsCollection: "actions",
      slug: SLUG,
      endpoints: {
        new_event: "events/new-event",
        send_notification: "notifications/send-notification",
      },
      workflowsConfig: [],
      changeStamp,
      user: { id: "U1", roles, organization_id },
    },
    callApi: async () => null,
  };
}

async function seedWorkflow({ _id = "wf-1", form_data, extra = {} }) {
  await mongo.db
    .collection("workflows")
    .insertOne({ _id, workflow_type: "onboarding", form_data, ...extra });
}

async function seedAction({
  _id,
  type,
  key = null,
  access = { view: true },
  workflow_id = "wf-1",
  extra = {},
}) {
  await mongo.db.collection("actions").insertOne({
    _id,
    workflow_id,
    type,
    key,
    access: { [SLUG]: access },
    ...extra,
  });
}

const find = (request, options = {}) =>
  GetWorkflowFormFile(buildContext({ request, ...options }));

test("finds a key in a { fileList } upload value of a viewable action", async () => {
  await seedWorkflow({
    form_data: {
      inspect: {
        photos: { file: file("a/1.png"), fileList: [file("a/1.png")] },
      },
    },
  });
  await seedAction({ _id: "act-1", type: "inspect" });

  expect(await find({ workflow_id: "wf-1", file_id: "a/1.png" })).toEqual(
    file("a/1.png"),
  );
});

test("finds a key nested in lists and sections at any depth", async () => {
  await seedWorkflow({
    form_data: {
      inspect: {
        rooms: [
          { name: "Kitchen", evidence: { fileList: [file("a/2.png")] } },
          {
            name: "Hall",
            evidence: { fileList: [file("a/3.png"), file("a/4.png")] },
          },
        ],
        contract: file("a/5.pdf"),
      },
    },
  });
  await seedAction({ _id: "act-1", type: "inspect" });

  expect(await find({ workflow_id: "wf-1", file_id: "a/4.png" })).toEqual(
    file("a/4.png"),
  );
  expect(await find({ workflow_id: "wf-1", file_id: "a/5.pdf" })).toEqual(
    file("a/5.pdf"),
  );
});

test("finds a key in a keyed slot the caller may view", async () => {
  await seedWorkflow({
    form_data: {
      sign: {
        "site-a": { scan: { fileList: [file("a/site-a.pdf")] } },
      },
    },
  });
  await seedAction({ _id: "act-a", type: "sign", key: "site-a" });

  expect(await find({ workflow_id: "wf-1", file_id: "a/site-a.pdf" })).toEqual(
    file("a/site-a.pdf"),
  );
});

test("refuses a key in a keyed slot the caller may not view", async () => {
  await seedWorkflow({
    form_data: {
      sign: {
        "site-a": { scan: { fileList: [file("a/site-a.pdf")] } },
        "site-b": { scan: { fileList: [file("a/site-b.pdf")] } },
      },
    },
  });
  await seedAction({ _id: "act-a", type: "sign", key: "site-a" });
  await seedAction({
    _id: "act-b",
    type: "sign",
    key: "site-b",
    access: { view: ["admin"], edit: ["admin"] },
  });

  expect(
    await find({ workflow_id: "wf-1", file_id: "a/site-b.pdf" }),
  ).toBeNull();
});

test("refuses a key in the slot of an action the caller has no verb on", async () => {
  await seedWorkflow({
    form_data: {
      inspect: { photos: { fileList: [file("a/open.png")] } },
      audit: { report: { fileList: [file("a/secret.pdf")] } },
    },
  });
  await seedAction({ _id: "act-1", type: "inspect" });
  await seedAction({
    _id: "act-2",
    type: "audit",
    access: { view: ["admin"], edit: ["admin"], review: ["admin"] },
  });

  expect(
    await find({ workflow_id: "wf-1", file_id: "a/secret.pdf" }),
  ).toBeNull();
  expect(
    await find(
      { workflow_id: "wf-1", file_id: "a/secret.pdf" },
      { roles: ["admin"] },
    ),
  ).toEqual(file("a/secret.pdf"));
});

test("refuses a key in no slot, or form data with no action", async () => {
  await seedWorkflow({
    form_data: {
      inspect: { photos: { fileList: [file("a/1.png")] } },
      orphan: { photos: { fileList: [file("a/orphan.png")] } },
    },
  });
  await seedAction({ _id: "act-1", type: "inspect" });

  expect(await find({ workflow_id: "wf-1", file_id: "a/other.png" })).toBe(
    null,
  );
  expect(
    await find({ workflow_id: "wf-1", file_id: "a/orphan.png" }),
  ).toBeNull();
});

test("refuses an unknown workflow and another workflow's key", async () => {
  await seedWorkflow({
    form_data: { inspect: { photos: { fileList: [file("a/1.png")] } } },
  });
  await seedAction({ _id: "act-1", type: "inspect" });
  await seedWorkflow({
    _id: "wf-2",
    form_data: { inspect: { photos: { fileList: [file("b/2.png")] } } },
  });
  await seedAction({ _id: "act-2", type: "inspect", workflow_id: "wf-2" });

  expect(await find({ workflow_id: "missing", file_id: "a/1.png" })).toBe(null);
  expect(await find({ workflow_id: "wf-1", file_id: "b/2.png" })).toBeNull();
});

test("refuses another organisation's workflow", async () => {
  const tenant = { field: "organizationId", value: "org-a" };
  await seedWorkflow({
    form_data: { inspect: { photos: { fileList: [file("b/1.png")] } } },
    extra: { organizationId: "org-b" },
  });
  await seedAction({
    _id: "act-1",
    type: "inspect",
    extra: { organizationId: "org-b" },
  });

  expect(
    await find({ workflow_id: "wf-1", file_id: "b/1.png" }, { tenant }),
  ).toBeNull();
  expect(
    await find(
      { workflow_id: "wf-1", file_id: "b/1.png" },
      { tenant: { field: "organizationId", value: "org-b" } },
    ),
  ).toEqual(file("b/1.png"));
});

test("signs only the caller's own organization's keys and legacy keys", async () => {
  const keys = {
    own: "org-a/workflows/po/1.pdf",
    legacy: "workflows/po/2.pdf",
    otherOrg: "org-b/workflows/po/3.pdf",
    filesModule: "org-a/files/deal/d1/20260101_000000000/u/4.pdf",
    support: "org-a/support/u1/u/5.pdf",
  };
  await seedWorkflow({
    form_data: {
      inspect: {
        docs: { fileList: Object.values(keys).map((key) => file(key)) },
      },
    },
  });
  await seedAction({ _id: "act-1", type: "inspect" });

  const asOrgA = (file_id) =>
    find({ workflow_id: "wf-1", file_id }, { organization_id: "org-a" });
  expect(await asOrgA(keys.own)).toEqual(file(keys.own));
  expect(await asOrgA(keys.legacy)).toEqual(file(keys.legacy));
  expect(await asOrgA(keys.otherOrg)).toBeNull();
  expect(await asOrgA(keys.filesModule)).toBeNull();
  expect(await asOrgA(keys.support)).toBeNull();

  // A caller with no organization gets only legacy keys.
  expect(await find({ workflow_id: "wf-1", file_id: keys.own })).toBeNull();
  expect(await find({ workflow_id: "wf-1", file_id: keys.legacy })).toEqual(
    file(keys.legacy),
  );
});

// A rich-text (Tiptap) value keeps each pasted image's upload in its
// fileList, beside the HTML that links to it through form-file.
const richText = (...keys) => ({
  html: keys
    .map(
      (key) =>
        `<img src="/api/endpoints/workflows/form-file/wf-1/${key}"><p>Enlarge Image</p>`,
    )
    .join(""),
  text: null,
  markdown: "",
  fileList: keys.map((key) => ({
    ...file(key),
    type: "image/png",
    bucket: "b",
    size: 10,
    status: "done",
    url: `/api/endpoints/workflows/form-file/wf-1/${key}`,
  })),
});

test("finds a rich-text image in a viewable slot", async () => {
  const key = "org-a/workflows/notes/u/paste.png";
  await seedWorkflow({
    form_data: { inspect: { notes: richText(key) } },
  });
  await seedAction({ _id: "act-1", type: "inspect" });

  const found = await find(
    { workflow_id: "wf-1", file_id: key },
    { organization_id: "org-a" },
  );
  expect(found).toMatchObject({ key, type: "image/png", name: "paste.png" });
});

test("refuses a rich-text image in a slot the caller may not view", async () => {
  const open = "org-a/workflows/notes/u/open.png";
  const secret = "org-a/workflows/audit/u/secret.png";
  await seedWorkflow({
    form_data: {
      inspect: { notes: richText(open) },
      audit: { notes: richText(secret) },
    },
  });
  await seedAction({ _id: "act-1", type: "inspect" });
  await seedAction({
    _id: "act-2",
    type: "audit",
    access: { view: ["admin"], edit: ["admin"] },
  });

  const asMember = (file_id) =>
    find({ workflow_id: "wf-1", file_id }, { organization_id: "org-a" });
  expect(await asMember(open)).toMatchObject({ key: open });
  expect(await asMember(secret)).toBeNull();
  expect(
    await find(
      { workflow_id: "wf-1", file_id: secret },
      { organization_id: "org-a", roles: ["admin"] },
    ),
  ).toMatchObject({ key: secret });
});

test("refuses a rich-text image outside the caller's organization prefix", async () => {
  const otherOrg = "org-b/workflows/notes/u/other.png";
  const filesModule = "org-a/files/deal/d1/20260101_000000000/u/x.png";
  await seedWorkflow({
    form_data: { inspect: { notes: richText(otherOrg, filesModule) } },
  });
  await seedAction({ _id: "act-1", type: "inspect" });

  const asOrgA = (file_id) =>
    find({ workflow_id: "wf-1", file_id }, { organization_id: "org-a" });
  expect(await asOrgA(otherOrg)).toBeNull();
  expect(await asOrgA(filesModule)).toBeNull();
});
