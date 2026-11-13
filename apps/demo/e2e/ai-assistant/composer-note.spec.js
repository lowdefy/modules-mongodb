import { test, expect } from "../fixtures.js";

// The ai-assistant module's default composer note: what not to type, that an AI
// service processes chats, the retention period, and a Privacy Notice link that
// opens in a new tab. The demo sets only privacy_notice_url, so the rest is the
// module's default. Inside the docked panel the note has a fixed 56px, so it
// must fit there uncut, down to a phone's width.

const USER = {
  id: "e2e-note-assistant-user",
  name: "Note User",
  email: "note@example.com",
  roles: ["admin"],
  profile: { name: "Note User" },
};

const NOTE =
  "Don't enter personal information such as names, ID or employee numbers, salaries or contact details. Chats are processed by an AI service and kept for 90 days. Privacy Notice";
const PRIVACY_URL = "https://example.com/privacy";

const isCut = (locator) =>
  locator.evaluate((element) => element.scrollHeight > element.clientHeight);

async function expectNote(note) {
  await expect(note).toBeVisible();
  await expect(note).toHaveText(NOTE);
  await expect(
    note.getByRole("link", { name: "Privacy Notice" }),
  ).toHaveAttribute("href", PRIVACY_URL);
  expect(await isCut(note)).toBe(false);
}

test("the docked panel shows the default note uncut, at desktop and phone width", async ({
  ldf,
  page,
}) => {
  await ldf.user(USER);
  await ldf.goto("/home");
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expectNote(page.locator("#ai_panel_composer_note"));

  await page.setViewportSize({ width: 360, height: 740 });
  await expectNote(page.locator("#ai_panel_composer_note"));
});

test("the embedded chat shows the default note, and its link opens a new tab", async ({
  ldf,
  page,
  context,
}) => {
  await context.route(`${PRIVACY_URL}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Privacy" }),
  );
  await ldf.user(USER);
  await ldf.goto("/assistant-demo");
  const note = page.locator("#ai_embedded_composer_note");
  await expectNote(note);

  const url = page.url();
  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    note.getByRole("link", { name: "Privacy Notice" }).click(),
  ]);
  await tab.waitForLoadState();
  expect(tab.url()).toBe(PRIVACY_URL);
  expect(page.url()).toBe(url);
  await expect(note).toBeVisible();
});
