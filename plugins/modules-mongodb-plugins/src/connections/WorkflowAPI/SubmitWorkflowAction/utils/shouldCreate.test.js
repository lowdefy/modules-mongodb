import shouldCreate from "./shouldCreate.js";

test("shouldCreate: returns true when no matching docs AND upsert === true", () => {
  expect(
    shouldCreate({
      actionEntry: { type: "device-install", key: "device-1", upsert: true },
      fetchedActions: [],
    }),
  ).toBe(true);

  expect(
    shouldCreate({
      actionEntry: { type: "device-install", upsert: true },
      fetchedActions: null,
    }),
  ).toBe(true);

  expect(
    shouldCreate({
      actionEntry: { type: "device-install", upsert: true },
      fetchedActions: undefined,
    }),
  ).toBe(true);
});

test("shouldCreate: returns false when matching docs exist (regardless of upsert)", () => {
  expect(
    shouldCreate({
      actionEntry: { type: "qualify", upsert: true },
      fetchedActions: [{ _id: "a1" }],
    }),
  ).toBe(false);

  expect(
    shouldCreate({
      actionEntry: { type: "qualify", upsert: false },
      fetchedActions: [{ _id: "a1" }],
    }),
  ).toBe(false);
});

test("shouldCreate: returns false when upsert is missing / false / non-strict-true", () => {
  expect(
    shouldCreate({
      actionEntry: { type: "device-install" },
      fetchedActions: [],
    }),
  ).toBe(false);

  expect(
    shouldCreate({
      actionEntry: { type: "device-install", upsert: false },
      fetchedActions: [],
    }),
  ).toBe(false);

  expect(
    shouldCreate({
      actionEntry: { type: "device-install", upsert: "yes" },
      fetchedActions: [],
    }),
  ).toBe(false);

  expect(
    shouldCreate({
      actionEntry: { type: "device-install", upsert: 1 },
      fetchedActions: [],
    }),
  ).toBe(false);
});
