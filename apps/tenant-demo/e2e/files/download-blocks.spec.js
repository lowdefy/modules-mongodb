import { test, expect } from "../fixtures.js";

// The plugin's download blocks as a member uses them, with two organizations
// on one in-memory MongoDB. Every block renders each file as a plain link to
// the files module's file link endpoint, which loads the record on every open,
// so a member of organization B gets a 404 for an organization A file whatever
// key or record id the page holds, and a key no record holds is a 404 too.
//
// file-downloads (pages/files/file-downloads.yaml) holds FileDownload,
// FileManager, EventsTimeline and DataDescriptions on a page whose own config
// uses no CallAPI and no _event, so a cold load of it proves the links need
// neither. files-demo carries the files components, the events module's
// timeline linked to the file endpoint, and a record the app's access check
// refuses (api/files-access-check.yaml).
//
// Signing is computed locally, so the placeholder bucket secrets in
// playwright.config.js are enough to read the 302's Location. A clicked link
// opens a tab that follows the redirect to S3, which the tests answer
// themselves.

const FILES = "files";
const EVENTS = "log-events";
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

// The keys file-downloads.yaml writes into its blocks. Records saved before
// keys carried the organization, as the record of an upgraded app is.
const OLD_A = `lot/20240101_000000000/${UUID}/old.pdf`;
const PRIVATE_A = `lot/20240101_000000000/${UUID}/private.pdf`;
const NOT_A_RECORD = `lot/20240101_000000000/${UUID}/not-a-record.pdf`;

// files-demo's file-card and file-list show the files-demo/showcase record.
const CARD_A = `org-a/files/files-demo/showcase/20260701_090000000/${UUID}/card-a.pdf`;
const CARD_B = `org-b/files/files-demo/showcase/20260701_090000000/${UUID}/card-b.pdf`;

const PRIVATE = "The files of this record are private.";

function record({
  key,
  organization_id,
  collection = "lot",
  doc_id = "lot-1",
}) {
  return {
    _id: key,
    organization_id,
    collection,
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
    deleted: null,
  };
}

function eventWithFiles({ _id, organization_id, title, files }) {
  return {
    _id,
    organization_id,
    type: "upload-file",
    entity_type: "files-demo",
    entity_id: "showcase",
    date: STAMP.timestamp,
    created: STAMP,
    "tenant-demo": { title },
    files,
  };
}

const fileOf = (key) => ({ key, name: key.split("/").pop() });

test.beforeEach(async ({ page, mdb }) => {
  await mdb.collection(FILES).deleteMany({});
  await mdb.collection(EVENTS).deleteMany({});
  await mdb.seed(FILES, [
    record({ key: OLD_A, organization_id: "org-a" }),
    record({ key: PRIVATE_A, organization_id: "org-a", doc_id: "private-1" }),
    record({
      key: CARD_A,
      organization_id: "org-a",
      collection: "files-demo",
      doc_id: "showcase",
    }),
    record({
      key: CARD_B,
      organization_id: "org-b",
      collection: "files-demo",
      doc_id: "showcase",
    }),
  ]);
  await mdb.seed(EVENTS, [
    eventWithFiles({
      _id: "event-a",
      organization_id: "org-a",
      title: "Contract signed",
      files: [fileOf(CARD_A), fileOf(NOT_A_RECORD)],
    }),
    eventWithFiles({
      _id: "event-b",
      organization_id: "org-b",
      title: "Other organization's contract",
      files: [fileOf(CARD_B)],
    }),
  ]);
  // A clicked link's tab follows the 302 to S3; answer it as S3 would.
  await page
    .context()
    .route(/amazonaws\.com/, (route) =>
      route.fulfill({ status: 200, contentType: "text/plain", body: "file" }),
    );
});

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

async function open(page, href) {
  const response = await page.request.get(href, { maxRedirects: 0 });
  return { status: response.status(), location: response.headers().location };
}

async function expectRedirectTo(page, href, key) {
  const { status, location } = await open(page, href);
  expect(status, href).toBe(302);
  const signed = new URL(location);
  expect(decodeURIComponent(signed.pathname).endsWith(`/${key}`)).toBe(true);
  expect(signed.searchParams.get("X-Amz-Expires")).toBe("60");
}

async function expectNotFound(page, href) {
  const { status, location } = await open(page, href);
  expect(status, href).toBe(404);
  expect(location).toBeUndefined();
}

// Clicks a link, which opens a new tab, and returns the URL that tab ends on.
async function clickToTab(page, link) {
  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    link.click(),
  ]);
  await tab.waitForLoadState();
  const url = tab.url();
  await tab.close();
  return url;
}

// Records the CallAPI requests a page sends.
function callApiRequests(page) {
  const sent = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().includes("/api/endpoints/")
    ) {
      sent.push(request.url());
    }
  });
  return sent;
}

// The four download blocks on file-downloads, each listing OLD_A.
const BLOCKS = {
  FileDownload: "#bl-download_file_download",
  FileManager: "#download_file_manager",
  EventsTimeline: "#download_events_timeline",
  DataDescriptions: "#download_data_descriptions",
};
const linkIn = (page, block, name) =>
  page.locator(block).getByRole("link", { name, exact: true }).first();

test("every download block renders a plain link and opens it on a cold load of a page with no CallAPI", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  const sent = callApiRequests(page);
  await ldf.goto("/file-downloads");
  for (const [name, block] of Object.entries(BLOCKS)) {
    const link = linkIn(page, block, "old.pdf");
    await expect(link, name).toHaveAttribute("href", linkOf(OLD_A));
    await expect(link, name).toHaveAttribute("target", "_blank");
    await expect(link, name).toHaveAttribute("rel", /noopener/);
    const url = await clickToTab(page, link);
    expect(url, name).toContain("X-Amz-Signature=");
    expect(decodeURIComponent(new URL(url).pathname), name).toContain(OLD_A);
  }
  await expectRedirectTo(page, linkOf(OLD_A), OLD_A);
  expect(sent).toEqual([]);
});

test("FileManager's download button is the same link", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/file-downloads");
  const button = page
    .locator("#download_file_manager")
    .locator("a", { has: page.locator("#download_file_manager_file_0_dl") });
  await expect(button).toHaveAttribute("href", linkOf(OLD_A));
  await expect(button).toHaveAttribute("target", "_blank");
});

test("another organization's member gets the same links and a 404 from each, by key or record id", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_B);
  await ldf.goto("/file-downloads");
  for (const [name, block] of Object.entries(BLOCKS)) {
    const link = linkIn(page, block, "old.pdf");
    // A record's id is its key, so the key on the page is its record id too.
    await expect(link, name).toHaveAttribute("href", linkOf(OLD_A));
    await expectNotFound(page, await link.getAttribute("href"));
  }
});

test("a key no record holds and a record the access check refuses are bare 404s", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/file-downloads");
  const notARecord = linkIn(page, BLOCKS.EventsTimeline, "not-a-record.pdf");
  await expect(notARecord).toHaveAttribute("href", linkOf(NOT_A_RECORD));
  await expectNotFound(page, linkOf(NOT_A_RECORD));
  const refused = linkIn(page, BLOCKS.FileDownload, "private.pdf");
  await expect(refused).toHaveAttribute("href", linkOf(PRIVATE_A));
  await expectNotFound(page, linkOf(PRIVATE_A));
});

test("the timeline links an event's file record and a file that is not one gets a 404", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/files-demo");
  const timeline = page.locator("#events_timeline_list");
  await expect(timeline).toContainText("Contract signed");
  await expect(timeline).not.toContainText("Other organization's contract");

  const card = timeline.getByRole("link", { name: "card-a.pdf" });
  await expect(card).toHaveAttribute("href", linkOf(CARD_A));
  const url = await clickToTab(page, card);
  expect(decodeURIComponent(new URL(url).pathname)).toContain(CARD_A);

  await expect(
    timeline.getByRole("link", { name: "not-a-record.pdf" }),
  ).toHaveAttribute("href", linkOf(NOT_A_RECORD));
  await expectNotFound(page, linkOf(NOT_A_RECORD));
});

test("clicking a FileManager link logs a download-file event and runs on_download", async ({
  ldf,
  page,
  mdb,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/files-demo");
  const card = page.locator("#demo_file_card").first();
  const link = card.getByRole("link", { name: "card-a.pdf", exact: true });
  await expect(link).toHaveAttribute("href", linkOf(CARD_A));
  await clickToTab(page, link);
  await expect(page.getByText("Downloading card-a.pdf")).toBeVisible();
  await expect
    .poll(() =>
      mdb.collection(EVENTS).countDocuments({ type: "download-file" }),
    )
    .toBe(1);
  const logged = await mdb
    .collection(EVENTS)
    .findOne({ type: "download-file" });
  expect(logged.metadata.file_key).toBe(CARD_A);
});

test("the files components list only the caller's organization's files", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_B);
  await ldf.goto("/files-demo");
  const card = page.locator("#demo_file_card").first();
  const list = page.locator("#demo_file_list");
  await expect(card).toContainText("card-b.pdf");
  await expect(list).toContainText("card-b.pdf");
  await expect(card).not.toContainText("card-a.pdf");
  await expect(list).not.toContainText("card-a.pdf");
  await expect(page.locator("#events_timeline_list")).not.toContainText(
    "Contract signed",
  );

  const link = list.getByRole("link", { name: "card-b.pdf" });
  await expect(link).toHaveAttribute("href", linkOf(CARD_B));
  const url = await clickToTab(page, link);
  expect(decodeURIComponent(new URL(url).pathname)).toContain(CARD_B);
});

test("a record the access check refuses lists nothing and shows the check's message", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/files-demo");
  await expect(page.getByText(PRIVATE).first()).toBeVisible();
  await expect(page.locator("#demo_private_card").first()).not.toContainText(
    ".pdf",
  );
});
