import { test, expect } from "../fixtures.js";
import {
  MUST_BLOCK,
  MUST_PASS,
  PII_MESSAGE,
  interceptAgent,
} from "../pii-strings.js";

// The ai-assistant module's personal-information guard (pii_guard, on by
// default): a typed message that looks like personal information is refused in
// the browser, with the guard's message, the text left in the composer, and
// nothing posted to the agent. Driven in the embedded chat on /assistant-demo.

const USER = {
  id: "e2e-pii-assistant-user",
  name: "Guard User",
  email: "guard@example.com",
  roles: ["admin"],
  profile: { name: "Guard User" },
};

const REPLY = "Noted.";

async function openChat({ ldf, page }) {
  const posted = await interceptAgent(page, REPLY);
  await ldf.user(USER);
  await ldf.goto("/assistant-demo");
  const composer = page
    .locator("#ai_embedded")
    .getByPlaceholder("Ask about the demo app…");
  await expect(composer).toBeEditable();
  return { posted, composer };
}

test("refuses each personal-information string and posts nothing", async ({
  ldf,
  page,
}) => {
  const { posted, composer } = await openChat({ ldf, page });

  for (const value of MUST_BLOCK) {
    const message = `Please look up ${value} for me`;
    await composer.fill(message);
    await composer.press("Enter");
    await expect(page.getByText(PII_MESSAGE).last()).toBeVisible();
    // The refused text stays for the user to edit.
    await expect(composer).toHaveValue(message);
  }
  expect(posted).toHaveLength(0);
});

test("sends each string that is not personal information", async ({
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
