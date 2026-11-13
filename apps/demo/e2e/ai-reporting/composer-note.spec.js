import { test, expect } from "../fixtures.js";
import { USER_A } from "./helpers.js";

// The ai-reporting module's default composer note under the chat page's
// composer: what not to type, that an AI service processes chats, the retention
// period, and a Privacy Notice link that opens in a new tab. The demo sets only
// privacy_notice_url, so the rest is the module's default.

const NOTE =
  "Don't enter personal information such as names, ID or employee numbers, salaries or contact details. Chats are processed by an AI service and kept for 90 days. Privacy Notice";
const PRIVACY_URL = "https://example.com/privacy";

test("the chat page shows the default note under the composer, and its link opens a new tab", async ({
  ldf,
  page,
  context,
}) => {
  await context.route(`${PRIVACY_URL}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Privacy" }),
  );
  await ldf.user(USER_A);
  await ldf.goto("/ai-reporting/chat");

  const note = page.locator("#composer_note");
  await expect(note).toBeVisible();
  await expect(note).toHaveText(NOTE);
  const link = note.getByRole("link", { name: "Privacy Notice" });
  await expect(link).toHaveAttribute("href", PRIVACY_URL);

  // Under the composer, and inside the chat column: the chat gives up room for it.
  const composer = await page.locator("#chat textarea").boundingBox();
  const noteBox = await note.boundingBox();
  const column = await page.locator("#chat_panel").boundingBox();
  expect(noteBox.y).toBeGreaterThan(composer.y + composer.height);
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(
    column.y + column.height,
  );

  const url = page.url();
  const [tab] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await tab.waitForLoadState();
  expect(tab.url()).toBe(PRIVACY_URL);
  expect(page.url()).toBe(url);
});
