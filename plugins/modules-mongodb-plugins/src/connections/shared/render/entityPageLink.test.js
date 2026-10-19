import entityPageLink from "./entityPageLink.js";

const base = { page_id: "lead-view", title: "Lead" };

test("id_query_key puts the id in the query string", () => {
  expect(entityPageLink({ ...base, id_query_key: "_id" }, "L1")).toEqual({
    pageId: "lead-view",
    urlQuery: { _id: "L1" },
  });
});

test("id_path_key puts the id in the path", () => {
  expect(entityPageLink({ ...base, id_path_key: "lead_id" }, "L1")).toEqual({
    pageId: "lead-view",
    pathParams: { lead_id: "L1" },
  });
});

test("both keys set put the id in both", () => {
  expect(
    entityPageLink(
      { ...base, id_query_key: "_id", id_path_key: "lead_id" },
      "L1",
    ),
  ).toEqual({
    pageId: "lead-view",
    urlQuery: { _id: "L1" },
    pathParams: { lead_id: "L1" },
  });
});
