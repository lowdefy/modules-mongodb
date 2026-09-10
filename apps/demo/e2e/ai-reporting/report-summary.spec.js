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
