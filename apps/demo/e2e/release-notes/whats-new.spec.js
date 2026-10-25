import { test, expect } from "../fixtures.js";

// What's new, a reading page: the notes announced to the signed-in person as
// one-line rows, the one shown open beside them, its embeds from the public
// bucket, the gold unread dot and the release email switch at the foot.

const USER = {
  id: "e2e-release-user",
  sub: "e2e-release-user-sub",
  name: "Release User",
  email: "release@example.com",
  organization_id: "demo",
  roles: ["admin"],
  profile: { name: "Release User" },
};
const OTHER_USER_ID = "e2e-release-other";

// The demo's region and the bucket playwright.config.js sets.
const ORIGIN = "https://e2e-bucket-pub.s3.us-east-1.amazonaws.com/";

const SCREEN = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="560">
<rect width="1200" height="560" fill="#F4F6F7"/>
<rect x="0" y="0" width="1200" height="64" fill="#fff"/>
<text x="32" y="40" font-family="sans-serif" font-size="22" fill="#14324F">Dispatch: week</text>
${[0, 1, 2, 3, 4, 5, 6]
  .map(
    (d) =>
      `<rect x="${32 + d * 164}" y="96" width="150" height="430" rx="8" fill="#fff" stroke="#E1E6E9"/>` +
      `<rect x="${44 + d * 164}" y="${120 + (d % 3) * 60}" width="126" height="48" rx="6" fill="#DFF3EE"/>` +
      `<rect x="${44 + d * 164}" y="${260 + (d % 2) * 80}" width="126" height="48" rx="6" fill="#E8F2FC"/>`,
  )
  .join("")}
</svg>`;

const note = (version, released_at, extra = {}) => ({
  _id: `acme/field-app@${version}`,
  release_id: `rel-${version}`,
  repository: "acme/field-app",
  version,
  released_at: new Date(released_at),
  title: `Release ${version}`,
  preview: `What changed in ${version}.`,
  body: `Notes for ${version}.`,
  media: [],
  ...extra,
});

const media = (version, name, content_type, copied) => ({
  name,
  content_type,
  key: `release-notes/acme/field-app@${version}/${name}`,
  source_url: `https://pelican.example/${name}`,
  copied,
});

const NOTES = [
  note("2.15", "2026-10-16", {
    title:
      "Plan a week of jobs on one screen, and offline photos that never get lost",
    preview:
      "Dispatchers get a week planner with drag-and-drop, technicians' photos now upload on their own once a signal returns, and three fixes.",
    body: [
      "## New",
      "",
      "### Plan the week on one screen",
      "",
      "The new **Week** view on Dispatch shows every technician's jobs for seven days. Drag a job to another day or another person, and they hear about the change straight away.",
      "",
      "[[file:week.png]]",
      "",
      "[[file:week.mp4]]",
      "",
      "### Photos upload on their own once you're back online",
      "",
      "Take photos on a job with no signal. The app keeps them on your phone and uploads them as soon as you're connected.",
      "",
      "[[file:offline.png]]",
      "",
      "[[file:gone.png]]",
      "",
      "## Fixed",
      "",
      "- Signatures taken on a tablet in landscape no longer come out cut off.",
      "- Search finds a site by its street address, not only its name.",
    ].join("\n"),
    media: [
      media("2.15", "week.png", "image/png", true),
      media("2.15", "week.mp4", "video/mp4", true),
      media("2.15", "offline.png", "image/png", false),
    ],
  }),
  note("2.14", "2026-10-02", {
    title: "Assign jobs in bulk, and search that finds addresses",
  }),
  note("2.13", "2026-09-11", {
    title: "Photos on every job card, and a calmer home screen",
  }),
  note("2.12", "2026-08-20", { title: "Someone else's release" }),
];

const recipient = (version, userId, opened_at = null) => ({
  _id: `acme/field-app@${version}:${userId}`,
  note_id: `acme/field-app@${version}`,
  user_id: userId,
  organization_id: null,
  email: true,
  notified: true,
  opened_at,
  created: new Date("2026-10-16"),
});

const RECIPIENTS = [
  recipient("2.15", USER.id),
  recipient("2.14", USER.id),
  recipient("2.13", USER.id, new Date("2026-09-12")),
  recipient("2.12", OTHER_USER_ID),
  recipient("2.15", OTHER_USER_ID),
];

const rows = (page) => page.locator("[id^='notes.'][id$='.headline']");
const rowFor = (page, title) =>
  page.locator("[id^='notes.'][id$='.headline']", { hasText: title });
// The dot is rendered only while a note is unread.
const newMarks = (page) => page.locator("[id^='notes.'][id$='.new_mark']");

const openedAt = async (mdb, version, userId = USER.id) =>
  (
    await mdb
      .collection("release-notes-recipients")
      .findOne({ _id: `acme/field-app@${version}:${userId}` })
  ).opened_at;

test.beforeEach(async ({ mdb, ldf, page }) => {
  for (const name of [
    "release-notes",
    "release-notes-recipients",
    "release-notes-preferences",
  ]) {
    await mdb.collection(name).deleteMany({});
  }
  await mdb.collection("release-notes").insertMany(NOTES);
  await mdb.collection("release-notes-recipients").insertMany(RECIPIENTS);
  await page.route(`${ORIGIN}**`, (route) =>
    route.request().url().endsWith(".png")
      ? route.fulfill({ contentType: "image/svg+xml", body: SCREEN })
      : route.fulfill({ status: 404, body: "" }),
  );
  await ldf.user(USER);
});

test("lists the person's own notes once each, newest first, and shows the newest", async ({
  ldf,
  page,
}) => {
  await ldf.goto("/release-notes/view");
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page)).toHaveText([
    /Plan a week of jobs/,
    /Assign jobs in bulk/,
    /Photos on every job card/,
  ]);
  await expect(page.getByText("Someone else's release")).toHaveCount(0);
  await expect(page.locator("#note_date")).toHaveText("16 October 2026");
  await expect(page.locator("#note_title")).toContainText("Plan a week");
  // A reading page: no heading and no uppercase kicker.
  await expect(page.locator("#notes_title")).toHaveCount(0);
  await expect(page.locator("#note_kicker")).toHaveCount(0);
  // 2.15 and 2.14 are unopened; 2.13 was opened before.
  await expect(newMarks(page)).toHaveCount(2);
  await expect(page.locator("#note_body img")).toHaveCount(1);
  await page.screenshot({
    path: test.info().outputPath("whats-new-desktop.png"),
    fullPage: true,
  });
});

test("embeds: an image and a video from the public bucket, a placeholder for the rest", async ({
  ldf,
  page,
}) => {
  await ldf.goto("/release-notes/view");
  const body = page.locator("#note_body");
  await expect(body.locator("img")).toHaveAttribute(
    "src",
    `${ORIGIN}release-notes/acme/field-app@2.15/week.png`,
  );
  await expect
    .poll(() =>
      body.locator("img").evaluate((img) => img.complete && img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(body.locator("video")).toHaveAttribute(
    "src",
    `${ORIGIN}release-notes/acme/field-app@2.15/week.mp4`,
  );
  await expect(body.locator("video")).toHaveAttribute("controls", "");
  await expect(body).toContainText("offline.png is not available yet.");
  await expect(body).toContainText("gone.png is not available yet.");
  await expect(body).not.toContainText("[[file:");
});

test("opening a note clears its New mark, across reloads and organisations", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/release-notes/view");
  await expect.poll(() => openedAt(mdb, "2.15")).not.toBeNull();
  // The note on screen keeps its mark until the person moves on.
  await expect(newMarks(page)).toHaveCount(2);

  await rowFor(page, "Assign jobs in bulk").click();
  await expect(page.locator("#note_title")).toHaveText(
    "Assign jobs in bulk, and search that finds addresses",
  );
  await expect.poll(() => openedAt(mdb, "2.14")).not.toBeNull();
  await expect(newMarks(page)).toHaveCount(1);
  // Another person's row for the same note is untouched.
  expect(await openedAt(mdb, "2.15", OTHER_USER_ID)).toBeNull();

  await ldf.user({ ...USER, organization_id: "another-org" });
  await ldf.goto("/release-notes/view");
  await expect(rows(page)).toHaveCount(3);
  await expect(newMarks(page)).toHaveCount(0);
});

test("a note link opens that note; an unknown or unseen note falls back to the newest", async ({
  ldf,
  page,
}) => {
  await ldf.goto("/release-notes/view?note=acme/field-app@2.13");
  await expect(page.locator("#note_title")).toHaveText(
    "Photos on every job card, and a calmer home screen",
  );

  await ldf.goto("/release-notes/view?note=acme/field-app@9.99");
  await expect(page.locator("#note_title")).toContainText("Plan a week");

  await ldf.goto("/release-notes/view?note=acme/field-app@2.12");
  await expect(page.locator("#note_title")).toContainText("Plan a week");
  await expect(page.getByText("Someone else's release")).toHaveCount(0);
});

test("the email switch persists the person's choice", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.goto("/release-notes/view?section=email");
  const toggle = page.locator("#email_releases [role=switch]");
  await expect(toggle).toBeInViewport();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await toggle.click();
  await expect
    .poll(async () =>
      mdb.collection("release-notes-preferences").findOne({ _id: USER.id }),
    )
    .toMatchObject({ email: false });

  await ldf.goto("/release-notes/view");
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await toggle.click();
  await expect
    .poll(async () =>
      mdb.collection("release-notes-preferences").findOne({ _id: USER.id }),
    )
    .toMatchObject({ email: true });
});

test("someone with no notes sees the empty state and the switch", async ({
  ldf,
  page,
}) => {
  await ldf.user({ ...USER, id: "e2e-release-nobody" });
  await ldf.goto("/release-notes/view");
  await expect(page.locator("#notes_empty")).toHaveText("Nothing new yet.");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator("#note_card")).toHaveCount(0);
  await expect(page.locator("#email_releases")).toBeVisible();
});

test("the unread count drives the What's new launcher on other pages", async ({
  ldf,
  page,
  mdb,
}) => {
  const launcher = page.locator("#whats_new_launcher");
  await ldf.goto("/home");
  await expect(launcher).toBeVisible();

  await mdb
    .collection("release-notes-recipients")
    .updateMany({ user_id: USER.id }, { $set: { opened_at: new Date() } });
  await ldf.goto("/home");
  await expect(page.locator("main")).toBeVisible();
  await expect(launcher).toHaveCount(0);
});

test("on a phone the rows are one line each, newest first, above the note", async ({
  ldf,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ldf.goto("/release-notes/view");
  await expect(rows(page)).toHaveCount(3);
  const list = await page.locator("#notes").boundingBox();
  const first = await rows(page).first().boundingBox();
  const second = await rows(page).nth(1).boundingBox();
  expect(first.y).toBeLessThan(second.y);
  expect(first.height).toBeLessThan(30);
  const card = await page.locator("#note_card").boundingBox();
  expect(card.y).toBeGreaterThan(list.y + list.height - 1);
  expect(card.x + card.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("whats-new-phone.png"),
    fullPage: true,
  });
});
