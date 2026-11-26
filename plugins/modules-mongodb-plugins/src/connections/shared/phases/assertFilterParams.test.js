import { ObjectId } from "mongodb";
import assertFilterParams from "./assertFilterParams.js";

test("scalar and ObjectId ids pass; absent params pass", () => {
  expect(() =>
    assertFilterParams({
      action_id: "a-1",
      workflow_id: "wf-1",
      group_id: null,
      reference_value: 42,
      entity: { connection_id: "leads", id: new ObjectId() },
    }),
  ).not.toThrow();
  expect(() => assertFilterParams({})).not.toThrow();
});

test.each([
  [{ workflow_id: { $ne: null } }, "workflow_id"],
  [{ action_id: { $gt: "" } }, "action_id"],
  [{ group_id: ["g1", "g2"] }, "group_id"],
  [{ parent_action_id: { $exists: true } }, "parent_action_id"],
  [{ reference_value: { $exists: true } }, "reference_value"],
  [{ entity: { connection_id: "leads", id: { $ne: null } } }, "entity.id"],
  [
    { entity: { connection_id: { $ne: null }, id: "x" } },
    "entity.connection_id",
  ],
])("rejects an operator object in a filter param (%o)", (params, path) => {
  expect(() => assertFilterParams(params)).toThrow(
    expect.objectContaining({
      code: "invalid_params",
      message: expect.stringContaining(path),
    }),
  );
});
