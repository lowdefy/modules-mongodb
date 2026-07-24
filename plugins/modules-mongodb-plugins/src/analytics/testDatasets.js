// Shared collections-catalog fixture for analytics tests — keyed by collection
// name, mirroring the demo catalog's shape (fields with types / enum `values` /
// display hints, optional `roles` gate, `relationships`). Replaces the old
// dataset-list fixture: the open engine validates pipelines against a catalog,
// not a dimension/measure dictionary.
const testCatalog = {
  demo_orders: {
    // No `roles` → queryable by any authenticated user (role-gating is opt-in).
    description: "Synthetic customer orders — one document per order.",
    fields: {
      region: {
        type: "string",
        description: "Customer region",
        values: ["North", "South", "East", "West"],
      },
      category: {
        type: "string",
        description: "Product category",
        values: ["Electronics", "Clothing", "Home"],
      },
      status: {
        type: "string",
        description: "Order status",
        values: ["pending", "paid", "shipped", "cancelled"],
      },
      channel: {
        type: "string",
        description: "Sales channel",
        values: ["online", "retail", "partner"],
      },
      month: { type: "string", description: "Order month, YYYY-MM" },
      createdAt: { type: "date", description: "When the order was placed" },
      total: {
        type: "number",
        description: "Order total, money",
        format: "currency",
        currency: "USD",
        locale: "en-US",
        decimals: 2,
      },
      quantity: { type: "number", description: "Units ordered" },
      company_id: {
        type: "string",
        description: "Owning company id — join key",
      },
    },
    relationships: [
      {
        field: "company_id",
        collection: "demo_companies",
        foreignField: "_id",
      },
    ],
  },
  demo_companies: {
    // Role-gated: only `analyst`/`admin` may query it (directly or via $lookup).
    roles: ["analyst", "admin"],
    description: "Company records — a join target for orders.",
    fields: {
      _id: { type: "string", description: "Company id — join key" },
      name: { type: "string", description: "Company name" },
      region: { type: "string", description: "Company region" },
    },
  },
};

export default testCatalog;
