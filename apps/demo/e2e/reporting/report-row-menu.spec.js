import { test, expect } from "../fixtures.js";
import { REPORTS, USER_A, USER_B, reportDoc } from "./helpers.js";

// The reports list's ⋯ column, which is an AgGrid `cell.type: menu` popover —
// a patched-in cell type (patches/@lowdefy__blocks-aggrid.patch), so its
// behaviour is ours to prove rather than the block library's.
//
// These specs exist because a build check cannot see this surface at all. The
// first cut of the cell built green, shipped into the bundle, and rendered an
// inert ⋯: antd mounted the popover inside a grid cell that hides its overflow,
// because the cell did not pass `getPopupContainer: () => document.body` the way
// SelectorCell does. Nothing short of clicking it in a browser fails on that.
//
// The second cut built green too and opened only if you clicked late enough: the
// block rebuilt every cell renderer on every render, and ag-grid treats a new
// renderer function as a different component, so the mounted cell — and the open
// popover inside it — was destroyed by the next unrelated re-render. Both specs
// below click immediately after mount, while `load_scope` is still landing, which
// is what makes them a guard on that too rather than only on the clipping.
//
// Two things are asserted, and they are different claims:
//   1. The popover OPENS and its items are reachable — the regressions above.
//   2. The right items are on it, per row and per viewer. The cell resolves
//      `hide_*` booleans that `rowData` computes from `is_owner`, `visibility`
//      and a `can_share` state key seeded once from the share_roles module var.
//      That is display logic; the endpoints are what authorize (covered by
//      report-visibility / report-title-restore / report-scopes).
//
// USER_A holds `report-publisher`, the demo's share_roles. USER_B does not —
// which is what makes the non-owner case also a can_share case.

// ag-grid stamps each cell with its colId; the ⋯ column's is `menu`. Scoped to
// .ag-row so the (empty) header cell of the same colId cannot match.
const TRIGGER = '.ag-row [col-id="menu"] button';

test("the ⋯ menu opens as a popover, and the owner sees every item", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER_A);
  await mdb.seed(REPORTS, [
    reportDoc({ id: "menu-own", title: "Own private report", owner: USER_A }),
  ]);

  await ldf.goto("/reporting/reports-list");
  await expect(page.getByText("Own private report")).toBeVisible();

  await page.locator(TRIGGER).first().click();

  // Visible AND enabled: a clipped popover can still satisfy a bare visibility
  // check, so the click in the next spec is what really proves reachability.
  await expect(page.getByRole("menuitem", { name: "Open" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Publish to the app" }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();

  // Private, so there is nothing to retract.
  await expect(page.getByRole("menuitem", { name: "Unpublish" })).toBeHidden();

  // The popover is mounted on the body rather than inside the cell — the exact
  // property whose absence made the first cut inert.
  await expect(page.locator("body > div .ant-dropdown-menu")).toBeVisible();
});

test("an item click runs the shared action — Rename opens the edit form", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER_A);
  await mdb.seed(REPORTS, [
    reportDoc({ id: "menu-rename", title: "Rename me", owner: USER_A }),
  ]);

  await ldf.goto("/reporting/reports-list");
  await expect(page.getByText("Rename me")).toBeVisible();

  await page.locator(TRIGGER).first().click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  // actions/report_rename_open.yaml seeds the form from the clicked row and
  // opens rename_modal. Both halves are asserted: the modal, and the seed —
  // an unseeded form would open blank and clear the title on save.
  await expect(page.getByText("Edit report")).toBeVisible();
  await expect(page.getByPlaceholder("Report title")).toHaveValue("Rename me");
});

test("a non-owner without share_roles sees only Open and Duplicate", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER_B);
  await mdb.seed(REPORTS, [
    reportDoc({
      id: "menu-shared",
      title: "Someone else's shared report",
      owner: USER_A,
      visibility: "shared",
    }),
  ]);

  await ldf.goto("/reporting/reports-list");
  await page.getByText("Shared", { exact: true }).click();
  await expect(page.getByText("Someone else's shared report")).toBeVisible();

  await page.locator(TRIGGER).first().click();

  await expect(page.getByRole("menuitem", { name: "Open" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();

  // Owner-only, and Unpublish additionally needs the role USER_B lacks — so a
  // hidden Unpublish here is the can_share seed doing its job, not is_owner.
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Unpublish" })).toBeHidden();
  await expect(
    page.getByRole("menuitem", { name: "Publish to the app" }),
  ).toBeHidden();
});
