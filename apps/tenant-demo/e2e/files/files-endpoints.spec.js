import { test, expect } from "../fixtures.js";

// The files module's endpoints, called as the browser calls them, with two
// organizations on one in-memory MongoDB. The tenant wall keeps each
// organization's records apart, the endpoints sign and soft-delete only a
// stored record, save-file accepts only a key upload-policy minted, and the
// app's files-access-check (api/files-access-check.yaml) refuses every
// operation on a record whose id starts with "private-".
//
// Signing a link or an upload policy is computed locally, so placeholder
// bucket secrets are enough (playwright.config.js). save-file's check that the
// object reached S3 needs a bucket, so its happy path is not run here.

const FILES = "files";
const STAMP = {
  timestamp: new Date("2026-07-01T09:00:00.000Z"),
  user: { id: "user-e2e", name: "E2E User" },
};
const ORG_A = { organization_id: "org-a", email: "a@example.com" };
const ORG_B = { organization_id: "org-b", email: "b@example.com" };
const UUID = "0b7c6a8e-3f2d-4c1b-9a8e-1d2c3b4a5f60";
const MINTED_A = `org-a/files/lot/lot-1/20260701_090000000/${UUID}/minted.pdf`;
// A record saved before keys carried the organization.
const OLD_A = `lot/20240101_000000000/${UUID}/old.pdf`;
const OLD_B = `lot/20240101_000000000/${UUID}/other-org.pdf`;
const DELETED_A = `org-a/files/lot/lot-1/20260701_090000000/${UUID}/gone.pdf`;
const PRIVATE_A = `lot/20240101_000000000/${UUID}/private.pdf`;

function record({ key, organization_id, doc_id = "lot-1", deleted }) {
  return {
    _id: key,
    organization_id,
    collection: "lot",
    doc_id,
    file: {
      key,
      name: key.split("/").pop(),
      type: "application/pdf",
      bucket: "e2e-bucket",
      size: 10,
    },
    created: STAMP,
    updated: STAMP,
    ...(deleted ? { deleted: STAMP } : { deleted: null }),
  };
}

async function seed(mdb) {
  await mdb.seed(FILES, [
    record({ key: OLD_A, organization_id: "org-a" }),
    record({ key: OLD_B, organization_id: "org-b" }),
    record({ key: DELETED_A, organization_id: "org-a", deleted: true }),
    record({ key: PRIVATE_A, organization_id: "org-a", doc_id: "private-1" }),
  ]);
}

async function as(ldf, caller) {
  await ldf.user({
    name: caller.email,
    email: caller.email,
    roles: ["admin"],
    ...caller,
  });
}

async function call(page, endpoint, payload) {
  const raw = await page.request.post(`/api/endpoints/files/${endpoint}`, {
    data: { payload },
  });
  const body = await raw.json().catch(() => null);
  return { status: raw.status(), body, text: JSON.stringify(body ?? "") };
}

function refusedWith(result, message) {
  expect(result.body?.response ?? null).toBeNull();
  expect(result.text).toContain(message);
}

const NOT_FOUND = "This file was not found. It may have been deleted.";
const PRIVATE = "The files of this record are private.";
const NOT_HERE = "This file was not uploaded here. Upload it again.";

test("download-file signs a stored record, old keys included", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  const result = await call(page, "download-file", { file_id: OLD_A });
  expect(result.status).toBe(200);
  expect(result.body.response.url).toContain(
    "lot/20240101_000000000/0b7c6a8e-3f2d-4c1b-9a8e-1d2c3b4a5f60/old.pdf",
  );
  expect(result.body.response.url).toContain("X-Amz-Signature=");
});

test("another organization's record is neither signed nor deleted", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_B);
  refusedWith(await call(page, "download-file", { file_id: OLD_A }), NOT_FOUND);
  refusedWith(await call(page, "delete-file", { file_id: OLD_A }), NOT_FOUND);
  const listed = await call(page, "list-files", {
    entity_type: "lot",
    entity_id: "lot-1",
  });
  expect(listed.body.response.map((file) => file._id)).toEqual([OLD_B]);

  const stored = await mdb.collection(FILES).findOne({ _id: OLD_A });
  expect(stored.deleted).toBeNull();
});

test("a deleted record is not signed", async ({ ldf, page, mdb }) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  refusedWith(
    await call(page, "download-file", { file_id: DELETED_A }),
    NOT_FOUND,
  );
});

test("delete-file soft-deletes the caller's record", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  const result = await call(page, "delete-file", { file_id: OLD_A });
  expect(result.body.response).toEqual({ success: true });
  const stored = await mdb.collection(FILES).findOne({ _id: OLD_A });
  expect(stored.deleted.timestamp).toBeTruthy();
});

test("save-file refuses a key it did not mint or already holds", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  const save = (changes) =>
    call(page, "save-file", {
      entity_type: "lot",
      entity_id: "lot-1",
      key: MINTED_A,
      ...changes,
    });

  refusedWith(
    await save({ key: MINTED_A.replace("org-a/", "org-b/") }),
    NOT_HERE,
  );
  refusedWith(await save({ key: OLD_A }), NOT_HERE);
  refusedWith(await save({ entity_id: "lot-2" }), NOT_HERE);
  refusedWith(
    await save({ entity_type: "lot/x" }),
    'The record type and ID must be set and cannot contain \\"/\\".',
  );
  // Soft-deleted, so no live list shows it, but the key is still taken.
  refusedWith(
    await save({ key: DELETED_A }),
    "This file is already saved. Upload it again to add another copy.",
  );

  expect(await mdb.collection(FILES).countDocuments({})).toBe(4);
});

test("upload-policy mints a key under the organization and record", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  const result = await call(page, "upload-policy", {
    entity_type: "lot",
    entity_id: "lot-1",
    file: { name: "a/b.pdf", type: "application/pdf", size: 1000 },
  });
  const policy = result.body.response;
  expect(policy.key).toMatch(
    /^org-a\/files\/lot\/lot-1\/\d{8}_\d{9}\/[0-9a-f-]{36}\/a-b\.pdf$/,
  );
  const conditions = JSON.parse(
    Buffer.from(policy.fields.Policy, "base64").toString("utf8"),
  ).conditions;
  expect(conditions).toContainEqual(["content-length-range", 1, 26214400]);
  expect(conditions).toContainEqual({ "Content-Type": "application/pdf" });

  refusedWith(
    await call(page, "upload-policy", {
      entity_type: "lot/x",
      entity_id: "lot-1",
      file: { name: "a.pdf", type: "application/pdf", size: 1000 },
    }),
    'The record type and ID must be set and cannot contain \\"/\\".',
  );
  refusedWith(
    await call(page, "upload-policy", {
      entity_type: "lot",
      entity_id: "lot-1",
      file: { name: "a.pdf", type: "application/pdf", size: 26214401 },
    }),
    "This file is larger than the 25 MB limit.",
  );
  // modules.yaml limits the types to documents and images.
  refusedWith(
    await call(page, "upload-policy", {
      entity_type: "lot",
      entity_id: "lot-1",
      file: { name: "a.exe", type: "application/x-msdownload", size: 1000 },
    }),
    'Files of type \\"application/x-msdownload\\" cannot be uploaded here.',
  );
});

test("the app's access check stops every operation", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  const privateRecord = { entity_type: "lot", entity_id: "private-1" };
  refusedWith(await call(page, "list-files", privateRecord), PRIVATE);
  refusedWith(
    await call(page, "upload-policy", {
      ...privateRecord,
      file: { name: "a.pdf", type: "application/pdf", size: 1000 },
    }),
    PRIVATE,
  );
  refusedWith(
    await call(page, "save-file", {
      ...privateRecord,
      key: `org-a/files/lot/private-1/20260701_090000000/${UUID}/a.pdf`,
    }),
    PRIVATE,
  );
  refusedWith(
    await call(page, "download-file", { file_id: PRIVATE_A }),
    PRIVATE,
  );
  refusedWith(await call(page, "delete-file", { file_id: PRIVATE_A }), PRIVATE);

  const stored = await mdb.collection(FILES).findOne({ _id: PRIVATE_A });
  expect(stored.deleted).toBeNull();
  expect(await mdb.collection(FILES).countDocuments({})).toBe(4);
});
