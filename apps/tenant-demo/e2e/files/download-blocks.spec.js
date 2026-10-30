import { test, expect } from "../fixtures.js";

// The plugin's download blocks, clicked as a member uses them, with two
// organizations on one in-memory MongoDB. Every block signs through the files
// module's download-file, which loads the record, so a member of organization
// B gets no link for an organization A file whatever key or record id the
// page holds, and a key no record holds is refused.
//
// file-downloads (pages/files/file-downloads.yaml) holds FileDownload,
// FileManager, EventsTimeline and DataDescriptions on a page whose own config
// uses no CallAPI and no _event, so a cold load of it proves the block metas
// declare both. files-demo carries the files components, the events module's
// timeline wired to download-file, and a record the app's access check
// refuses (api/files-access-check.yaml).
//
// Signing is computed locally, so the placeholder bucket secrets in
// playwright.config.js are enough.

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

const NOT_FOUND = "This file was not found. It may have been deleted.";
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
  // A download opens the signed link; keep it instead of opening a tab.
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(url);
      return null;
    };
  });
});

async function as(ldf, caller) {
  await ldf.user({
    name: caller.email,
    email: caller.email,
    roles: ["admin"],
    ...caller,
  });
}

const opened = (page) => page.evaluate(() => window.__opened);

// The four download blocks on file-downloads, each listing OLD_A.
const DOWNLOADS = {
  FileDownload: (page) =>
    page.locator("#bl-download_file_download").getByText("old.pdf"),
  FileManager: (page) => page.locator("#download_file_manager_file_0_dl"),
  EventsTimeline: (page) =>
    page.locator("#download_events_timeline").getByText("old.pdf"),
  DataDescriptions: (page) =>
    page.locator("#download_data_descriptions").getByText("old.pdf"),
};

test("every download block signs a stored record on a cold load of a page with no CallAPI", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/file-downloads");
  let count = 0;
  for (const [name, link] of Object.entries(DOWNLOADS)) {
    await link(page).click();
    count += 1;
    await expect
      .poll(async () => (await opened(page)).length, { message: name })
      .toBe(count);
    const url = (await opened(page))[count - 1];
    expect(url, name).toContain(OLD_A);
    expect(url, name).toContain("X-Amz-Signature=");
  }
});

test("another organization's member gets no link through any block, by key or record id", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_B);
  await ldf.goto("/file-downloads");
  for (const [name, link] of Object.entries(DOWNLOADS)) {
    await link(page).click();
    await expect(page.getByText(NOT_FOUND).first(), name).toBeVisible();
  }
  // A record's id is its key, so the key on the page is its record id too.
  expect(await opened(page)).toEqual([]);
});

test("a key no record holds and a record the access check refuses are refused, with the message shown", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/file-downloads");
  await page
    .locator("#download_events_timeline")
    .getByText("not-a-record.pdf")
    .click();
  await expect(page.getByText(NOT_FOUND).first()).toBeVisible();
  await page
    .locator("#bl-download_file_download")
    .getByText("private.pdf")
    .click();
  await expect(page.getByText(PRIVATE).first()).toBeVisible();
  expect(await opened(page)).toEqual([]);
});

test("the timeline signs an event's file record and refuses a file that is not one", async ({
  ldf,
  page,
}) => {
  await as(ldf, ORG_A);
  await ldf.goto("/files-demo");
  const timeline = page.locator("#events_timeline_list");
  await expect(timeline).toContainText("Contract signed");
  await expect(timeline).not.toContainText("Other organization's contract");

  await timeline.getByText("card-a.pdf").click();
  await expect.poll(async () => (await opened(page)).length).toBe(1);
  expect((await opened(page))[0]).toContain(CARD_A);

  await timeline.getByText("not-a-record.pdf").click();
  await expect(page.getByText(NOT_FOUND).first()).toBeVisible();
  expect(await opened(page)).toHaveLength(1);
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

  await list.getByText("card-b.pdf").click();
  await expect.poll(async () => (await opened(page)).length).toBe(1);
  expect((await opened(page))[0]).toContain(CARD_B);
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
