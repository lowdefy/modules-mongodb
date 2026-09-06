import deriveReportSpec from "./deriveReportSpec.js";
import validateReportSpec from "./validateReportSpec.js";
import testCatalog from "./testDatasets.js";

const roles = ["analyst"];

const ordersTable = {
  collection: "demo_orders",
  pipeline: [{ $project: { _id: 0, company_id: 1, status: 1 } }],
};

// A table over demo_orders, which declares both company_id (a relationship to
// demo_companies) and status (an enum). Filters over either bind to it.
const dataSection = {
  type: "table",
  label: "Orders",
  query: ordersTable,
  columns: [{ key: "company_id" }, { key: "status" }],
};

test("derives a looked-up filter's optionsQuery, binds it, and strips labelKey", () => {
  const spec = {
    title: "Orders by Company",
    sections: [
      dataSection,
      {
        type: "filter",
        control: "multiselect",
        field: "company_id",
        label: "Company",
        labelKey: "name",
      },
    ],
  };

  const derived = deriveReportSpec({ spec, catalog: testCatalog });
  const filter = derived.sections[1];

  expect(filter.optionsQuery).toEqual({
    collection: "demo_companies",
    pipeline: [{ $project: { name: 1, _id: 1 } }, { $sort: { name: 1 } }],
    valueKey: "_id",
    labelKey: "name",
  });
  expect("labelKey" in filter).toBe(false);
  expect(derived.sections[0].filterBy).toEqual(["company_id"]);
});

test("binds an enum filter without deriving an optionsQuery", () => {
  const spec = {
    title: "Orders by Status",
    sections: [
      dataSection,
      {
        type: "filter",
        control: "multiselect",
        field: "status",
        label: "Status",
      },
    ],
  };

  const derived = deriveReportSpec({ spec, catalog: testCatalog });

  expect(derived.sections[1].optionsQuery).toBeUndefined();
  expect("labelKey" in derived.sections[1]).toBe(false);
  expect(derived.sections[0].filterBy).toEqual(["status"]);
});

test("throws when labelKey is given for a field with no relationship", () => {
  const spec = {
    title: "Bad Lookup",
    sections: [
      dataSection,
      {
        type: "filter",
        control: "multiselect",
        field: "status",
        label: "Status",
        labelKey: "name",
      },
    ],
  };

  expect(() => deriveReportSpec({ spec, catalog: testCatalog })).toThrow(
    'filter field "status": labelKey "name" was given but no relationship for that field is declared in the catalog.',
  );
});

test("leaves an existing optionsQuery untouched and only strips labelKey", () => {
  const authored = {
    collection: "demo_companies",
    pipeline: [{ $project: { name: 1, _id: 1 } }],
    valueKey: "_id",
    labelKey: "name",
  };
  const spec = {
    title: "Pre-built",
    sections: [
      dataSection,
      {
        type: "filter",
        control: "multiselect",
        field: "company_id",
        label: "Company",
        labelKey: "name",
        optionsQuery: authored,
      },
    ],
  };

  const derived = deriveReportSpec({ spec, catalog: testCatalog });

  expect(derived.sections[1].optionsQuery).toEqual(authored);
  expect("labelKey" in derived.sections[1]).toBe(false);
});

test("returns a spec with no filter sections unchanged", () => {
  const spec = {
    title: "No Filters",
    sections: [dataSection],
  };

  expect(deriveReportSpec({ spec, catalog: testCatalog })).toEqual(spec);
});

test("does not mutate the input spec", () => {
  const spec = {
    title: "Immutable",
    sections: [
      dataSection,
      {
        type: "filter",
        control: "multiselect",
        field: "company_id",
        label: "Company",
        labelKey: "name",
      },
    ],
  };
  const before = JSON.parse(JSON.stringify(spec));

  deriveReportSpec({ spec, catalog: testCatalog });

  expect(spec).toEqual(before);
});

test("derive output validates for the looked-up and enum cases", () => {
  const spec = {
    title: "Round Trip",
    sections: [
      dataSection,
      {
        type: "filter",
        control: "multiselect",
        field: "company_id",
        label: "Company",
        labelKey: "name",
      },
      {
        type: "filter",
        control: "multiselect",
        field: "status",
        label: "Status",
      },
    ],
  };

  const derived = deriveReportSpec({ spec, catalog: testCatalog });
  expect(() =>
    validateReportSpec({ spec: derived, catalog: testCatalog, roles }),
  ).not.toThrow();
});
