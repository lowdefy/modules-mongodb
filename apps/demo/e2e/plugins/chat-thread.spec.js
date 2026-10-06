import { test, expect } from "../fixtures.js";

const USER = {
  id: "e2e-chat-thread",
  name: "Chat Thread",
  email: "chat-thread@example.com",
  roles: [],
};

test.describe("ChatThread", () => {
  test.beforeEach(async ({ ldf }) => {
    await ldf.user(USER);
  });

  test("renders both sides, attachments and day pills", async ({ page }) => {
    await page.goto("/user-components-demo");
    const thread = page.getByTestId("demo_chat_thread");
    await expect(thread).toBeVisible();

    await expect(
      thread.getByText("The export button on the reports page does nothing."),
    ).toBeVisible();
    await expect(thread.getByText("Grace Hopper")).toBeVisible();
    // The second reporter message is grouped under the first: one name label.
    await expect(thread.getByText("Ada Lovelace")).toHaveCount(2);

    await expect(
      thread.getByRole("img", { name: "reports-page.svg" }),
    ).toBeVisible();
    await expect(
      thread.getByRole("link", { name: "quarterly-report.pdf" }),
    ).toHaveAttribute("href", "https://example.com/quarterly-report.pdf");
    await expect(thread.getByText("removed-file.pdf")).toBeVisible();
    await expect(
      thread.getByRole("link", { name: "removed-file.pdf" }),
    ).toHaveCount(0);
    await expect(
      thread.getByRole("link", { name: "https://example.com/help/export" }),
    ).toBeVisible();
  });
});
