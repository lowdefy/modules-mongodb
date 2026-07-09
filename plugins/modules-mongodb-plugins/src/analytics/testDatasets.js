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
      {
        id: "createdAt",
        type: "date",
        description: "When the order was placed",
      },
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
  {
    // Exercises author-declared dotted `field` paths (embedded sub-documents,
    // reached via a flattening view in the demo) and a date `bucket`.
    id: "activities",
    label: "Activities",
    description: "Activity records at activity grain (view).",
    source: { collection: "activities_report" },
    dimensions: [
      {
        id: "stage",
        type: "string",
        field: "status.stage",
        description: "Current stage",
      },
      {
        id: "channel",
        type: "string",
        field: "source.channel",
        description: "Channel",
      },
      {
        id: "created",
        type: "date",
        field: "created.timestamp",
        bucket: "month",
        description: "Month created",
      },
    ],
    measures: [
      { id: "count", type: "count", description: "Number of activities" },
    ],
  },
];

export default testDatasets;
