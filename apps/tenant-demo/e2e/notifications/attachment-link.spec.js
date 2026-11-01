import { test, expect } from "../fixtures.js";

// Notification attachments open only for the signed-in recipient. Emailed
// links open the protected file-download page, which forwards the browser to
// the notifications module's `file` link endpoint:
// /api/endpoints/notifications/file/<notification_id>/<index>. The endpoint
// matches the inbox's recipient rule (contact_id or user_id is the caller),
// takes files[index] and answers 302 to a 60-second link on the
// notifications bucket.
//
// Signing is computed locally, so the placeholder bucket secrets in
// playwright.config.js are enough to read the 302's Location. No test opens
// the S3 link, so none leaves the machine.

const COLLECTION = "notifications";
const BUCKET = "e2e-bucket-pub";
const STAMP = {
  app_name: "tenant-demo",
  timestamp: new Date("2026-07-01T09:00:00.000Z"),
};

const RECIPIENT = {
  id: "user-a",
  organization_id: "org-a",
  email: "a@example.com",
};
// A member of the same organization the notifications are not addressed to.
const OTHER_MEMBER = {
  id: "user-a2",
  organization_id: "org-a",
  email: "a2@example.com",
};

const REPORT_KEY = "notifications/report 1+2&3.pdf";
const PHOTO_KEY = "notifications/photo.png";

function notification({ _id, contact_id, user_id, files }) {
  return {
    _id,
    organization_id: "org-a",
    type: "report-ready",
    title: "Your report is ready",
    contact_id,
    user_id,
    read: false,
    files,
    created: STAMP,
  };
}

const FILES = [
  { key: REPORT_KEY, type: "application/pdf", name: "report 1+2&3.pdf" },
  { key: PHOTO_KEY, type: "image/png" },
];

async function seed(mdb) {
  await mdb.seed(COLLECTION, [
    notification({
      _id: "notification-1",
      contact_id: RECIPIENT.id,
      user_id: RECIPIENT.id,
      files: FILES,
    }),
    // Written before user_id was stored, or by an app whose contact ids are
    // user ids: only contact_id names the recipient.
    notification({
      _id: "notification-contact-only",
      contact_id: RECIPIENT.id,
      user_id: null,
      files: FILES,
    }),
    notification({
      _id: "notification-other",
      contact_id: OTHER_MEMBER.id,
      user_id: OTHER_MEMBER.id,
      files: FILES,
    }),
  ]);
}

async function as(ldf, caller) {
  await ldf.user({
    name: caller.email,
    email: caller.email,
    roles: ["user"],
    ...caller,
  });
}

function linkOf(notificationId, index) {
  return `/api/endpoints/notifications/file/${encodeURIComponent(
    notificationId,
  )}/${encodeURIComponent(index)}`;
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

function expectSignedFor(result, key) {
  expect(result.status).toBe(302);
  const location = new URL(result.headers.location);
  expect(location.hostname.startsWith(`${BUCKET}.`)).toBe(true);
  expect(decodeURIComponent(location.pathname)).toBe(`/${key}`);
  expect(location.searchParams.get("X-Amz-Expires")).toBe("60");
  expect(location.searchParams.get("X-Amz-Signature")).toBeTruthy();
  return location;
}

// Catches the browser's GET on the link endpoint: the endpoint's own answer is
// fetched without following its redirect, and the browser is answered here,
// so the signed S3 link is read and never opened. `answered` resolves with
// that answer.
async function catchLinkOpen(page) {
  let resolveAnswer;
  const answered = new Promise((resolve) => {
    resolveAnswer = resolve;
  });
  await page.route("**/api/endpoints/notifications/file/**", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    resolveAnswer({
      url: route.request().url(),
      status: response.status(),
      headers: response.headers(),
    });
    await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
  return { answered };
}

test("an emailed link opened signed out goes to sign-in, and signed in downloads", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  const emailed = "/notifications/file-download?_id=notification-1&index=0";

  // Signed out, the page is refused before it can forward anywhere. The
  // production server adds ?callbackUrl= back to the page; the e2e server
  // sends a refused page to sign-in without it, so the return is not checked
  // here.
  const endpointCalls = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/endpoints/notifications/file")) {
      endpointCalls.push(request.url());
    }
  });
  await page.goto(emailed);
  await expect(page).toHaveURL(/\/user-account\/login/);
  expect(endpointCalls).toEqual([]);

  await as(ldf, RECIPIENT);
  const { answered } = await catchLinkOpen(page);
  await page.goto(emailed);
  const answer = await answered;
  expect(new URL(answer.url).pathname).toBe(
    "/api/endpoints/notifications/file/notification-1/0",
  );
  const location = expectSignedFor(answer, REPORT_KEY);
  expect(location.searchParams.get("response-content-disposition")).toBe(
    "inline; filename*=UTF-8''report%201%2B2%263.pdf",
  );
});

test("the link endpoint signed out is 401", async ({ page, mdb }) => {
  await seed(mdb);
  const result = await open(page, linkOf("notification-1", "0"));
  expect(result.status).toBe(401);
  expect(result.headers.location).toBeUndefined();
});

test("the recipient's attachments redirect to 60-second links on the notifications bucket", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, RECIPIENT);

  const report = expectSignedFor(
    await open(page, linkOf("notification-1", "0")),
    REPORT_KEY,
  );
  expect(report.searchParams.get("response-content-type")).toBe(
    "application/pdf",
  );

  // A file with no name downloads under its key's last segment.
  const photo = expectSignedFor(
    await open(page, linkOf("notification-1", "1")),
    PHOTO_KEY,
  );
  expect(photo.searchParams.get("response-content-disposition")).toBe(
    "inline; filename*=UTF-8''photo.png",
  );

  // A recipient named only by contact_id opens it too.
  expectSignedFor(
    await open(page, linkOf("notification-contact-only", "0")),
    REPORT_KEY,
  );
});

test("another user's notification and a bad index are bare 404s", async ({
  ldf,
  page,
  mdb,
}) => {
  await seed(mdb);
  await as(ldf, RECIPIENT);

  await expectNotFound(page, linkOf("notification-other", "0"));
  await expectNotFound(page, linkOf("notification-1", "-1"));
  await expectNotFound(page, linkOf("notification-1", "x"));
  await expectNotFound(page, linkOf("notification-1", "2"));
  await expectNotFound(page, linkOf("notification-1", "1.5"));
  await expectNotFound(page, linkOf("notification-1", "99999999999"));
  await expectNotFound(page, linkOf("not-a-notification", "0"));
  await expectNotFound(
    page,
    "/api/endpoints/notifications/file/notification-1",
  );
  await expectNotFound(page, "/api/endpoints/notifications/file");
  await expectNotFound(page, `${linkOf("notification-1", "0")}/extra`);

  // The member it is addressed to opens it, and not the recipient's.
  await as(ldf, OTHER_MEMBER);
  expectSignedFor(
    await open(page, linkOf("notification-other", "0")),
    REPORT_KEY,
  );
  await expectNotFound(page, linkOf("notification-1", "0"));
});
