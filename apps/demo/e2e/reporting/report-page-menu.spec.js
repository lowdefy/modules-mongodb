import { test, expect } from "../fixtures.js";
import { ORDERS, REPORTS, USER_A, USER_B, reportDoc } from "./helpers.js";

// The report page's ⋯ — a `DropdownMenu` compiled into the header by
// compileReport, not static page config. A dropdown owns the block that opens it,
// and nothing can open one by id the way `CallMethod` opens a Modal, so the menu
// has to be emitted where the ⋯ is: inside the Dynamic block's resolved content.
//
// These ran as `test.fixme` for one commit: resolve-report reads
// `_payload: urlQuery.report_id`, and @lowdefy/server-e2e did not thread urlQuery
// into Dynamic resolution, so the page always rendered the "Report not found"
// fallback and there was no header to click. lowdefy/lowdefy#2295 threads it, and
// this repo now pins the build that carries it.
//
// They are the only automated proof that the popover OPENS. compileReport's unit
// tests assert the emitted config exhaustively and `ldf:b` proves the block and
// operators are in the page's Dynamic allowlist, but neither can see a menu that
// renders inert — and the list's menu cell shipped inert twice, once clipped by the
// cell's overflow and once destroyed by a re-render, building green both times.

test(
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
test(
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
test(
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
test(
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

// Duplicate is the item whose NAVIGATION can only be checked in a browser. It fires
// a Link after an async CallAPI, into a new tab, on the report_id the endpoint
// returns — and a config that looks right can still land nowhere: passing the
// endpoint's `url` instead sends Link down its external-address branch, which
// prefixes https:// and resolves the root-relative path to a host named after the
// module entry. Following the popup is what catches that.
test(
  "Duplicate opens the copy in a new tab, owned by the copier",
  async ({ ldf, page, mdb }) => {
    await mdb.seed("demo_orders", ORDERS);
    await mdb.seed(REPORTS, [
      reportDoc({
        id: "e2e-menu-dup",
        title: "Worth copying",
        owner: USER_A,
        visibility: "shared",
      }),
    ]);

    // A reader, not the owner: duplicate is the one write a non-owner may make.
    await ldf.user(USER_B);
    await ldf.goto("/reporting/report?report_id=e2e-menu-dup");

    await page.locator("#report_menu_trigger").click();
    const popupOpened = page.waitForEvent("popup");
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    const copyTab = await popupOpened;

    const copy = await mdb
      .collection(REPORTS)
      .findOne({ "owner.user_id": USER_B.id });
    expect(copy).toBeTruthy();
    expect(copy._id).not.toBe("e2e-menu-dup");
    // Same origin, entry-scoped path, the copy's id — not the original's.
    expect(new URL(copyTab.url()).pathname).toBe("/reporting/report");
    expect(new URL(copyTab.url()).searchParams.get("report_id")).toBe(
      String(copy._id),
    );
    // And it resolves: the copy renders rather than 404ing or falling back.
    await expect(
      copyTab.getByRole("heading", { name: "Worth copying" }),
    ).toBeVisible();
    await expect(copyTab.getByText("Report not found")).toBeHidden();
  },
);
