import {
  inferSchemaFromSample,
  buildCatalogEntry,
} from "./gen-reporting-catalog.mjs";

// Regression tests for two catalog-generator output defects found by running
// the generator against a seeded demo domain:
//   1. A field observed only as null across the whole sample emitted `type: ''`.
//   2. The enum merge fell back to the inference candidate when the model's
//      draft omitted `values`, so the model's deliberate drop of an id/name/
//      free-text enum was silently undone.

describe("inferSchemaFromSample — null-only fields (fix 1)", () => {
  test("a field null across the whole sample is typed `unknown`, not empty", () => {
    const docs = [
      { _id: "a", deleted: null },
      { _id: "b", deleted: null },
      { _id: "c", deleted: null },
    ];
    const { fields } = inferSchemaFromSample(docs);
    // The field is kept (it appeared in documents) and marked `unknown`.
    expect(fields.deleted).toBeDefined();
    expect(fields.deleted.type).toBe("unknown");
    // The specific regression: it must never be the empty string.
    expect(fields.deleted.type).not.toBe("");
  });

  test("no field ever emits an empty-string type", () => {
    const docs = [
      { _id: "a", always_null: null, name: "Ada" },
      { _id: "b", always_null: null, name: "Ben" },
    ];
    const { fields } = inferSchemaFromSample(docs);
    for (const f of Object.values(fields)) {
      expect(f.type).not.toBe("");
    }
    // A field with real values still types normally.
    expect(fields.name.type).toBe("string");
  });
});

describe("buildCatalogEntry — model enum authority (fix 2)", () => {
  // One id-ish field that inference flags as an enum candidate, and one genuine
  // enum. The model, when it drafts the collection, drops the id and confirms
  // the enum.
  const inferred = {
    fields: {
      company_id: {
        type: "string",
        types: ["string"],
        values: ["C-1", "C-2", "C-3", "C-4", "C-5"],
      },
      status: {
        type: "string",
        types: ["string"],
        values: ["paid", "pending"],
      },
    },
  };
  const collectionNames = ["orders", "companies"];

  test("model drafted the collection: an omitted `values` is a deliberate drop", () => {
    const draft = {
      description: "Orders",
      fields: {
        // confirmed enum — model echoes the values
        status: { description: "Order status", values: ["paid", "pending"] },
        // dropped enum — model returns a description but no `values`
        company_id: { description: "Company identifier" },
      },
    };
    const entry = buildCatalogEntry({ inferred, draft, collectionNames });
    // The genuine enum survives...
    expect(entry.fields.status.values).toEqual(["paid", "pending"]);
    // ...and the id candidate the model dropped is NOT resurrected from inference.
    expect(entry.fields.company_id.values).toBeUndefined();
  });

  test("model did NOT draft the collection: inference candidates are kept", () => {
    // draft undefined models the no-gateway / model-failure / --no-model path.
    const entry = buildCatalogEntry({
      inferred,
      draft: undefined,
      collectionNames,
    });
    expect(entry.fields.company_id.values).toEqual([
      "C-1",
      "C-2",
      "C-3",
      "C-4",
      "C-5",
    ]);
    expect(entry.fields.status.values).toEqual(["paid", "pending"]);
  });
});
