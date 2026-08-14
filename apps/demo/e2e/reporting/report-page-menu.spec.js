import { test, expect } from "../fixtures.js";
import { ORDERS, REPORTS, USER_A, USER_B, reportDoc } from "./helpers.js";

// The report page's ⋯ — a `DropdownMenu` compiled into the header by
// compileReport, not static page config. A dropdown owns the block that opens it,
// and nothing can open one by id the way `CallMethod` opens a Modal, so the menu
// has to be emitted where the ⋯ is: inside the Dynamic block's resolved content.
//
// BLOCKED ON THE SAME urlQuery HARNESS GAP as report-render / report-resolve-shared:
// resolve-report reads `_payload: urlQuery.report_id`, which @lowdefy/server-e2e
// does not thread, so under e2e this page always renders the "Report not found"
// fallback and there is no header to click. These are written out in full and
// `test.fixme` so they light up the moment it is threaded — and the fix is no longer
// hypothetical: lowdefy/lowdefy#2295 (`fix/server-e2e-url-query`, merged 2026-08-06)
// does exactly that, upstream of the 2026-07-07 experimental build this repo pins.
// Bumping past it should be all these need.
//
// What IS verified today, and what is not, is worth stating plainly:
//   - compileReport's unit tests assert the emitted config exhaustively — which
//     items each viewer gets, that every action is claimed by a shown item, and the
//     endpoint and payload behind each one.
//   - `pnpm ldf:b` proves DropdownMenu, `_event` and `_ne` are in the page's
//     Dynamic types allowlist, so the report resolves instead of blanking.
//   - NOTHING here proves the popover actually opens. That is not a hypothetical
//     gap: the list's menu cell shipped inert twice — once mounted inside a cell
//     that clips its overflow, once destroyed by a re-render — and both built green.
//     Until these specs run, that check is a dev-server one.

test.fixme(
  "the ⋯ opens as a dropdown, and the owner sees every item they may use",
  async ({ ldf, page, mdb }) => {
    await mdb.seed("demo_orders", ORDERS);
    await mdb.seed(REPORTS, [
      reportDoc({ id: "e2e-menu-own", title: "My report", owner: USER_A }),
    ]);

    await ldf.user(USER_A);
    await ldf.goto("/reporting/report?report_id=e2e-menu-own");
    await expect(page.getByRole("heading", { name: "My report" })).toBeVisible();

    await page.locator("#report_menu_trigger").click();

    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    // USER_A holds report-publisher, the demo's share_roles, and the report is
    // private — so Publish shows and Unpublish does not.
    await expect(
      page.getByRole("menuitem", { name: "Publish to the app" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Unpublish" }),
    ).toBeHidden();
    await expect(
      page.getByRole("menuitem", { name: "Duplicate" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();

    // No Open item: this menu only opens on the page Open would navigate to.
    await expect(page.getByRole("menuitem", { name: "Open" })).toBeHidden();
  },
);

// Rename is the item that proves the compiled menu still reaches the STATIC modals
// — the half of the menu that is not duplicated in the compiler. Both the modal and
// its seed are asserted: an unseeded form opens blank and clears the title on save.
test.fixme(
  "Rename opens the static edit form, seeded from the report",
  async ({ ldf, page, mdb }) => {
    await mdb.seed("demo_orders", ORDERS);
    await mdb.seed(REPORTS, [
      reportDoc({ id: "e2e-menu-rename", title: "Rename me", owner: USER_A }),
    ]);

    await ldf.user(USER_A);
    await ldf.goto("/reporting/report?report_id=e2e-menu-rename");

    await page.locator("#report_menu_trigger").click();
    await page.getByRole("menuitem", { name: "Rename" }).click();

    await expect(page.getByText("Edit report")).toBeVisible();
    await expect(page.getByPlaceholder("Report title")).toHaveValue("Rename me");
  },
);

// A reader gets read-plus-duplicate, and the items they cannot use are ABSENT
// rather than disabled. USER_B holds no share_roles role, so a shared report they
// do not own leaves them Duplicate alone — no Unpublish, which is the item whose
// gate is not is_owner (a share_roles holder may retract someone else's report).
test.fixme(
  "a reader without share_roles sees Duplicate alone",
  async ({ ldf, page, mdb }) => {
    await mdb.seed("demo_orders", ORDERS);
    await mdb.seed(REPORTS, [
      reportDoc({
        id: "e2e-menu-shared",
        title: "Someone else's report",
        owner: USER_A,
        visibility: "shared",
      }),
    ]);

    await ldf.user(USER_B);
    await ldf.goto("/reporting/report?report_id=e2e-menu-shared");

    await page.locator("#report_menu_trigger").click();

    await expect(
      page.getByRole("menuitem", { name: "Duplicate" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeHidden();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeHidden();
    await expect(page.getByRole("menuitem", { name: "Unpublish" })).toBeHidden();
    await expect(
      page.getByRole("menuitem", { name: "Publish to the app" }),
    ).toBeHidden();
  },
);

// Publish is the compiled half — the CallAPI compileReport emits rather than the
// shared actions/report_publish.yaml the list _refs. Asserted through the document
// so it covers the wiring the unit tests can only assert as config: the item
// dispatches, the endpoint runs, the write lands.
test.fixme(
  "Publish makes the report shared, from the compiled item",
  async ({ ldf, page, mdb }) => {
    await mdb.seed("demo_orders", ORDERS);
    await mdb.seed(REPORTS, [
      reportDoc({ id: "e2e-menu-publish", title: "To publish", owner: USER_A }),
    ]);

    await ldf.user(USER_A);
    await ldf.goto("/reporting/report?report_id=e2e-menu-publish");

    await page.locator("#report_menu_trigger").click();
    await page.getByRole("menuitem", { name: "Publish to the app" }).click();

    // The item re-navigates to re-resolve, and the re-resolved menu offers the
    // reverse — which is also how a viewer can tell the write landed.
    await page.locator("#report_menu_trigger").click();
    await expect(page.getByRole("menuitem", { name: "Unpublish" })).toBeVisible();

    const doc = await mdb.collection(REPORTS).findOne({ _id: "e2e-menu-publish" });
    expect(doc.visibility).toBe("shared");
    // Publishing does not stamp `updated` — it changes who may see a report, not
    // what it is. See docs/reporting/concepts/ownership.md.
    expect(doc.updated.timestamp.getTime()).toBe(doc.created.timestamp.getTime());
  },
);
