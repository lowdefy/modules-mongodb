import { test, expect } from "../fixtures.js";
import { USER_A } from "./helpers.js";

// Select all bulk-marks whatever the scope tab shows — All ticks every card, a
// narrowed tab only its own kind. The write is an _array.map over the part
// arrays inside SetState skips keyed on results_scope: exactly the layer a
// build cannot exercise, so this drives it — select on the Charts tab and the
// table card must stay unticked; untick on All and everything clears.
const CONVERSATIONS = "conversations";

function conversationDoc({ id, owner = USER_A, data_parts = [] }) {
  return {
    _id: id,
    owner: { user_id: owner.id, name: owner.name },
    title: "Seeded by the select-all spec",
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

const PARTS = [
  {
    type: "data-report-chart",
    data: {
      title: "Revenue by region",
      option: {
        xAxis: { type: "category", data: ["North", "South"] },
        yAxis: { type: "value" },
        series: [{ type: "bar", data: [120, 80] }],
      },
      height: 320,
      spec: {
        chart: "bar",
        query: { collection: "demo_orders", pipeline: [] },
        x: "region",
        y: ["revenue"],
      },
    },
  },
  {
    type: "data-report-table",
    data: {
      title: "East by category",
      rows: [{ category: "Electronics", revenue: 188402 }],
      row_count: 1,
      spec: {
        query: { collection: "demo_orders", pipeline: [] },
        columns: [
          { key: "category", label: "Category" },
          { key: "revenue", label: "Revenue" },
        ],
      },
    },
  },
];

test("select all marks only the scoped cards and untick clears them", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(CONVERSATIONS, [
    conversationDoc({ id: "e2e-select-all", data_parts: PARTS }),
  ]);

  await ldf.user(USER_A);
  await ldf.goto("/reporting/chat?conversation_id=e2e-select-all");

  const save = page.getByRole("button", { name: "Save as report" });
  await expect(page.getByText("Revenue by region")).toBeVisible();
  await expect(save).toBeDisabled();

  // Narrow to Charts, then select all: the chart is ticked (the save gate
  // opens), the table — hidden by the tab — stays unticked.
  await page.getByText("Charts", { exact: true }).click();
  await page.getByText("Select all").click();
  await expect(save).toBeEnabled();

  // List block ids resolve `$` to the item index; the Checkbox input is
  // `${blockId}_input`.
  const chartTick = page.locator('[id="charts.0.selected_input"]');
  const tableTick = page.locator('[id="tables.0.selected_input"]');
  await page.getByText("All", { exact: true }).click();
  await expect(chartTick).toBeChecked();
  await expect(tableTick).not.toBeChecked();

  // Untick on All: everything in scope clears and the save gate shuts.
  await page.getByText("Select all").click();
  await expect(chartTick).not.toBeChecked();
  await expect(save).toBeDisabled();
});
