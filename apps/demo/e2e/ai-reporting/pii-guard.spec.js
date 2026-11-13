import { test, expect } from "../fixtures.js";
import {
  MUST_BLOCK,
  MUST_PASS,
  PII_MESSAGE,
  interceptAgent,
} from "../pii-strings.js";
import { USER_A } from "./helpers.js";

// The ai-reporting module's personal-information guard (pii_guard, on by
// default): a typed question that looks like personal information is refused
// in the browser, with the guard's message, the text left in the composer, and
// nothing posted to the reporting agent.

const REPLY = "Here is what the data shows.";

async function openChat({ ldf, page }) {
  const posted = await interceptAgent(page, REPLY);
  await ldf.user(USER_A);
  await ldf.goto("/ai-reporting/chat");
  const composer = page.locator("#chat textarea");
  await expect(composer).toBeEditable();
  return { posted, composer };
}

test("refuses each personal-information string and posts nothing", async ({
  ldf,
  page,
}) => {
  const { posted, composer } = await openChat({ ldf, page });

  for (const value of MUST_BLOCK) {
    const message = `How many orders did ${value} place?`;
    await composer.fill(message);
    await composer.press("Enter");
    await expect(page.getByText(PII_MESSAGE).last()).toBeVisible();
    // The refused text stays for the user to edit.
    await expect(composer).toHaveValue(message);
  }
  expect(posted).toHaveLength(0);
});

test("sends each question that is not personal information", async ({
  ldf,
  page,
}) => {
  const { posted, composer } = await openChat({ ldf, page });

  for (const [index, value] of MUST_PASS.entries()) {
    await composer.fill(value);
    await composer.press("Enter");
    await expect.poll(() => posted.length).toBe(index + 1);
    expect(posted[index]).toContain(value);
    await expect(composer).toHaveValue("");
    // The next send waits for this reply to finish streaming.
    await expect(page.getByText(REPLY).nth(index)).toBeVisible();
  }
  await expect(page.getByText(PII_MESSAGE)).toHaveCount(0);
});
