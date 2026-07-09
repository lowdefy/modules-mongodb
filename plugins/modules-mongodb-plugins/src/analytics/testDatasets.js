// Shared data-dictionary fixture for analytics tests — mirrors the design
// document's orders example.
const testDatasets = [
  {
    id: "orders",
    label: "Orders",
    description: "Customer orders with totals and status.",
    roles: ["analyst", "admin"],
    source: { collection: "orders" },
    dimensions: [
      {
        id: "status",
        type: "string",
        description: "Order status",
        values: ["pending", "paid", "shipped", "cancelled"],
      },
      { id: "region", type: "string", description: "Customer region" },
      { id: "createdAt", type: "date", description: "When the order was placed" },
    ],
    measures: [
      {
        id: "total",
        type: "number",
        description: "Order total (ZAR)",
        format: "currency",
        currency: "ZAR",
        locale: "en-ZA",
        aggregations: ["sum", "avg", "min", "max"],
      },
      { id: "count", type: "count", description: "Number of orders" },
    ],
  },
  {
    id: "signups",
    label: "Signups",
    description: "User signups.",
    source: { collection: "signups" },
    dimensions: [{ id: "plan", type: "string", description: "Plan" }],
    measures: [{ id: "count", type: "count", description: "Signups" }],
  },
];

export default testDatasets;
