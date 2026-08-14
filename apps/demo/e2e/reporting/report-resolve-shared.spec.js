import { test, expect } from "../fixtures.js";
import {
  ORDERS,
  REPORTS,
  USER_A,
  USER_B,
  changeStamp,
  reportDoc,
} from "./helpers.js";

// `resolve-report` opened from owner-only to readable: not deleted, and owned by
// the caller OR visibility: "shared". Publishing means nothing until this read
// changes, so these are the specs that prove it.
//
// Both directions are asserted: the fallback for a report the caller may not read,
// and the rendered report for one they may. The positive half was parked as
// `test.fixme` while @lowdefy/server-e2e omitted `urlQuery` where @lowdefy/server
// threads it, which made "Report not found" the only reachable outcome — the
// divergence, and the upstream fix this repo now pins, are documented at length in
// formatted-report.spec.js.

test("a private report is not readable by a non-owner", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({ id: "e2e-private", title: "Private report", owner: USER_A }),
  ]);

  await ldf.user(USER_B);
  await ldf.goto("/reporting/report?report_id=e2e-private");

  await expect(page.getByText("Report not found")).toBeVisible();
});

test("a soft-deleted shared report is not readable by anyone", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed("demo_orders", ORDERS);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "e2e-deleted-shared",
      title: "Deleted shared report",
      owner: USER_A,
      visibility: "shared",
      deleted: changeStamp(USER_A),
    }),
  ]);

  // Not for its owner...
  await ldf.user(USER_A);
  await ldf.goto("/reporting/report?report_id=e2e-deleted-shared");
  await expect(page.getByText("Report not found")).toBeVisible();

  // ...and not for anyone it was shared with. Deleting a published report drops
  // it from every read without a separate unpublish step, because every read
  // filters the stamp.
  await ldf.user(USER_B);
  await ldf.goto("/reporting/report?report_id=e2e-deleted-shared");
  await expect(page.getByText("Report not found")).toBeVisible();
});

// The positive half: a report the caller MAY read renders, and renders as theirs
// or not. These were the specs parked on the urlQuery harness gap above.
test(
  "a shared report is readable by a non-owner, who is not the owner",
  async ({ ldf, page, mdb }) => {
    await mdb.seed("demo_orders", ORDERS);
    await mdb.seed(REPORTS, [
      reportDoc({
        id: "e2e-shared",
        title: "Shared report",
        owner: USER_A,
        visibility: "shared",
      }),
    ]);

    await ldf.user(USER_B);
    await ldf.goto("/reporting/report?report_id=e2e-shared");

    await expect(page.getByText("Report not found")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Shared report" }),
    ).toBeVisible();
  },
);

test(
  "the owner of a shared report still resolves it as the owner",
  async ({ ldf, page, mdb }) => {
    await mdb.seed("demo_orders", ORDERS);
    await mdb.seed(REPORTS, [
      reportDoc({
        id: "e2e-shared-own",
        title: "My shared report",
        owner: USER_A,
        visibility: "shared",
      }),
    ]);

    await ldf.user(USER_A);
    await ldf.goto("/reporting/report?report_id=e2e-shared-own");

    await expect(page.getByText("Report not found")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "My shared report" }),
    ).toBeVisible();
  },
);
