import { test, expect } from "../fixtures.js";
import { ORDERS, REPORTS, USER_A, reportDoc } from "./helpers.js";

// The AI summary drawer's model-free half: the compiled header button reaches
// the STATIC drawer by id (the same compiled-to-static path Rename takes to
// rename_modal), the drawer opens on its empty state, and its Generate button
// carries the endpoint. Generation itself needs a live gateway key and is a
// dev-test step, not an autonomous gate.
//
// Like the ⋯ specs, this is the only automated proof the drawer OPENS:
// compileReport's tests assert the emitted button and `ldf:b` proves the page
// compiles, but neither can see a CallMethod that reaches nothing.
test("the header's AI summary opens the drawer on its empty state", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-summary", title: "Summarize me", owner: USER_A }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/ai-reporting/report?report_id=e2e-summary");
  await expect(
    page.getByRole("heading", { name: "Summarize me" }),
  ).toBeVisible();

  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "AI summary" }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("AI summary")).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Generate summary" }),
  ).toBeVisible();
  // Nothing generated yet: no stale notice, no generated line, no Refresh.
  await expect(drawer.getByText("Filters changed")).toBeHidden();
  await expect(drawer.getByText(/^Generated /)).toBeHidden();
  await expect(drawer.getByRole("button", { name: "Refresh" })).toBeHidden();

  // No mask, and the page behind is not scroll-locked: the summary names the
  // report's own sections, so the reader has to be able to see them and scroll
  // to them while the drawer stays open.
  await expect(page.locator(".ant-drawer-mask")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Summarize me" }),
  ).toBeVisible();
  const bodyOverflow = await page.evaluate(
    () => getComputedStyle(document.body).overflow,
  );
  expect(bodyOverflow).not.toBe("hidden");
});

// Generate sends the controls' own `filters` state, so the summary describes the
// selection on screen. The endpoint is stood in for: generation needs a live
// gateway key, and what this guards is the payload the page builds, which a
// change to where filter values live would silently empty.
test("Generate sends the selection on screen, and a filter change marks the summary stale", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-summary-filters", title: "Filtered", owner: USER_A }),
  ]);

  let payload = null;
  await page.route(
    "**/api/endpoints/ai-reporting/summarize-report",
    async (route) => {
      payload = JSON.parse(route.request().postData()).payload;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          response: {
            text: "Paid orders carry the revenue.",
            scope: "Status: paid",
            generatedAt: new Date().toISOString(),
            excluded: [],
          },
        }),
      });
    },
  );

  await ldf.user(USER_A);
  await ldf.goto("/ai-reporting/report?report_id=e2e-summary-filters");
  await expect(page.getByRole("heading", { name: "Filtered" })).toBeVisible();

  await pickStatus(page, "paid");
  await expect(page.locator(".ant-select-content")).toContainText("paid");

  await page.getByRole("button", { name: "AI summary" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Generate summary" }).click();
  await expect(
    drawer.getByText("Paid orders carry the revenue."),
  ).toBeVisible();
  expect(payload.report_id).toBe("e2e-summary-filters");
  expect(payload.filters).toEqual({ status: "paid" });
  await expect(drawer.getByText("Filters changed")).toBeHidden();

  // A filter change moves the numbers the summary describes.
  await pickStatus(page, "pending");
  await expect(drawer.getByText("Filters changed")).toBeVisible();
});

// The table beside the filter shows the same status values, so the option is
// found inside the open dropdown rather than by its text alone.
async function pickStatus(page, status) {
  await page.getByRole("combobox").click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: new RegExp(`^${status}$`) })
    .click();
}
