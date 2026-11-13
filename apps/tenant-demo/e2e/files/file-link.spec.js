import { test, expect } from "../fixtures.js";

// The files module's `file` link endpoint, opened as a browser opens a link:
// a GET on /api/endpoints/files/file/<key> with the session cookie, redirects
// not followed. Two organizations share one in-memory MongoDB, and the app's
// files-access-check (api/files-access-check.yaml) refuses every record whose
// id starts with "private-".
//
// Signing is computed locally, so the placeholder bucket secrets in
// playwright.config.js are enough to read the 302's Location. The
// second-host project in playwright.config.js runs this file again on
// 127.0.0.1, so the same links are proven on a second host name. Lowdefy's
// e2e server serves link endpoints only through serve-link-endpoints.mjs,
// without the production server's Cache-Control header, so that header is
// not checked here.

const FILES = "files";
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
const UUID = "0b7c6a8e-3f2d-4c1b-9a8e-1d2c3b4a5f60";
const PREFIX_A = `org-a/files/lot/lot-1/20260701_090000000/${UUID}`;

const PNG_A = `${PREFIX_A}/photo.png`;
const HTML_A = `${PREFIX_A}/page.html`;
const ODD_NAME_A = `${PREFIX_A}/a b+c&d.pdf`;
const DELETED_A = `${PREFIX_A}/gone.pdf`;
// A record saved before keys carried the organization.
const OLD_A = `lot/20240101_000000000/${UUID}/old.pdf`;
const PRIVATE_A = `lot/20240101_000000000/${UUID}/private.pdf`;
const OTHER_B = `org-b/files/lot/lot-1/20260701_090000000/${UUID}/other.pdf`;

function record({ key, organization_id, type, doc_id = "lot-1", deleted }) {
  return {
    _id: key,
    organization_id,
    collection: "lot",
    doc_id,
    file: {
      key,
      name: key.split("/").pop(),
      type,
      bucket: "e2e-bucket",
      size: 10,
    },
    created: STAMP,
    updated: STAMP,
    deleted: deleted ? STAMP : null,
  };
}

async function seed(mdb) {
  await mdb.seed(FILES, [
    record({ key: PNG_A, organization_id: "org-a", type: "image/png" }),
    record({ key: HTML_A, organization_id: "org-a", type: "text/html" }),
    record({
      key: ODD_NAME_A,
      organization_id: "org-a",
      type: "application/pdf",
    }),
    record({
      key: DELETED_A,
      organization_id: "org-a",
      type: "application/pdf",
      deleted: true,
    }),
    record({ key: OLD_A, organization_id: "org-a", type: "application/pdf" }),
    record({
      key: PRIVATE_A,
      organization_id: "org-a",
      type: "application/pdf",
      doc_id: "private-1",
    }),
    record({ key: OTHER_B, organization_id: "org-b", type: "application/pdf" }),
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

// The link a block builds: each key segment encoded, its "/" kept.
function linkOf(key) {
  return `/api/endpoints/files/file/${key
    .split("/")
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
  const result = await open(page, linkOf(PNG_A));
  expect(result.status).toBe(401);
  expect(result.headers.location).toBeUndefined();
});

test("a member's file redirects to a 60-second signed link", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);

  const result = await open(page, linkOf(PNG_A));
  const location = signedLink(result);
  expectSignedFor(location, PNG_A);
  expect(location.searchParams.get("X-Amz-Expires")).toBe("60");
  expect(location.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(location.searchParams.get("response-content-type")).toBe("image/png");
  expect(location.searchParams.get("response-content-disposition")).toBe(
    "inline; filename*=UTF-8''photo.png",
  );

  // A record saved before keys carried the organization opens the same way.
  expectSignedFor(signedLink(await open(page, linkOf(OLD_A))), OLD_A);
});

test("an HTML file downloads rather than opens", async ({ ldf, page, mdb }) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  const location = signedLink(await open(page, linkOf(HTML_A)));
  expect(location.searchParams.get("response-content-type")).toBe("text/html");
  expect(location.searchParams.get("response-content-disposition")).toBe(
    "attachment; filename*=UTF-8''page.html",
  );
});

test("a name with a space, + and & reaches its own file", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  const link = linkOf(ODD_NAME_A);
  expect(link).toContain("a%20b%2Bc%26d.pdf");
  const location = signedLink(await open(page, link));
  expectSignedFor(location, ODD_NAME_A);
  expect(location.searchParams.get("response-content-disposition")).toBe(
    "inline; filename*=UTF-8''a%20b%2Bc%26d.pdf",
  );
});

test("every refusal is a bare 404", async ({ ldf, page, mdb }) => {
  await seed(mdb);
  await as(ldf, ORG_A);
  // Another organization's file, a deleted one, one the access check refuses,
  // a key no record holds, and no key at all.
  await expectNotFound(page, linkOf(OTHER_B));
  await expectNotFound(page, linkOf(DELETED_A));
  await expectNotFound(page, linkOf(PRIVATE_A));
  await expectNotFound(page, linkOf(`${PREFIX_A}/not-a-record.pdf`));
  await expectNotFound(page, "/api/endpoints/files/file");
  await expectNotFound(page, "/api/endpoints/files/file/");

  // The other organization opens its own file, and not organization A's.
  await as(ldf, ORG_B);
  signedLink(await open(page, linkOf(OTHER_B)));
  await expectNotFound(page, linkOf(PNG_A));
});
