import { test, expect } from "../fixtures.js";
import { USER_A } from "./helpers.js";

// Each chart/table card's ⤢ seeds the clicked card into expanded_chart /
// expanded_table state and opens a panel-level modal via CallMethod — a build
// proves the actions compile, but only a real click shows the seed landing
// before setOpen and the modal rendering the right card's snapshot. The parts
// are seeded straight onto the conversation document in the shape
// buildDataParts persists (data-report-chart carries title/option/height,
// data-report-table carries title/rows/row_count/spec.columns), restored
// through the same get-conversation-results deep-link path chat-deep-link.spec
// pins down.
const CONVERSATIONS = "conversations";

function conversationDoc({ id, owner = USER_A, data_parts = [] }) {
  return {
    _id: id,
    owner: { user_id: owner.id, name: owner.name },
    title: "Seeded by the expand-result spec",
    messages: [],
    data_parts,
    deleted: null,
    created: {
      timestamp: new Date(),
      user: { name: owner.name, id: owner.id },
    },
    updated: {
      timestamp: new Date(),
      user: { name: owner.name, id: owner.id },
    },
  };
}

const CHART_PART = {
  type: "data-report-chart",
  data: {
    title: "Revenue by region",
    option: {
      xAxis: { type: "category", data: ["North", "South"] },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: [120, 80] }],
    },
    height: 320,
    created: "2026-08-01T00:00:00.000Z",
    spec: {
      chart: "bar",
      query: { collection: "demo_orders", pipeline: [] },
      x: "region",
      y: ["revenue"],
    },
  },
};

// rows shorter than row_count, so the modal must repeat the card's
// truncation line rather than let the bigger grid imply completeness.
const TABLE_PART = {
  type: "data-report-table",
  data: {
    title: "East by category",
    rows: [
      { category: "Electronics", revenue: 188402 },
      { category: "Clothing", revenue: 142910 },
    ],
    row_count: 5,
    created: "2026-08-01T00:00:00.000Z",
    spec: {
      query: { collection: "demo_orders", pipeline: [] },
      columns: [
        { key: "category", label: "Category" },
        { key: "revenue", label: "Revenue" },
      ],
    },
  },
};

test("the table card's expand opens the snapshot in a modal", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({ id: "e2e-expand-table", data_parts: [TABLE_PART] }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/reporting/chat?conversation_id=e2e-expand-table");

  await expect(page.getByText("East by category")).toBeVisible();
  // hideTitle buttons carry their name on the icon, not the button element —
  // Playwright's role snapshot shows an unnamed button wrapping img "Expand
  // table", so the button is found through the icon it wraps.
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("img", { name: "Expand table" }) })
    .click();

  // Assert inside the dialog: the title and grid cells also exist on the card
  // behind it, so only dialog-scoped locators prove the modal has content.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("East by category")).toBeVisible();
  await expect(dialog.getByText("Electronics")).toBeVisible();
  await expect(dialog.getByText("first 2 of 5 rows")).toBeVisible();
});

test("the chart card's expand opens the snapshot in a modal", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({ id: "e2e-expand-chart", data_parts: [CHART_PART] }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/reporting/chat?conversation_id=e2e-expand-chart");

  await expect(page.getByText("Revenue by region")).toBeVisible();
  // Found through the icon for the same reason as the table's expand.
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("img", { name: "Expand chart" }) })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Revenue by region")).toBeVisible();
  // The EChart block paints a canvas; its presence in the dialog is what
  // separates "modal opened with a chart" from "modal opened empty".
  await expect(dialog.locator("canvas")).toBeVisible();
});
