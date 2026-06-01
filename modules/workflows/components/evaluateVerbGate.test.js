// Runs the shared role-gate oracle (gates.fixtures.js) through the client gate
// helper, asserting it agrees with the query-time and submit-time runtimes
// (Part 38 task 5/8 / Part 34 D8). The component's inlined `_js` mirrors this
// helper verbatim.

import gateAllows, { computeActionAllowed } from "./evaluateVerbGate.js";
import gateCases from "../resolvers/__fixtures__/gates.fixtures.js";

test.each(gateCases)(
  "gateAllows matches the oracle: $name",
  ({ gate, userRoles, expected }) => {
    expect(gateAllows(gate, userRoles)).toBe(expected);
  },
);

test("computeActionAllowed projects the four-key bag for the host app", () => {
  const access = {
    demo: { view: true, edit: ["account-manager"] },
    support: { view: ["support-rep"] },
  };
  expect(computeActionAllowed(access, "demo", ["account-manager"])).toEqual({
    view: true,
    edit: true,
    review: false,
    error: false,
  });
});

test("computeActionAllowed: absent app block denies every verb", () => {
  expect(computeActionAllowed({ demo: { view: true } }, "other", [])).toEqual({
    view: false,
    edit: false,
    review: false,
    error: false,
  });
});

test("computeActionAllowed: array gate without role overlap denies", () => {
  const access = { demo: { view: true, review: ["manager"] } };
  expect(computeActionAllowed(access, "demo", ["rep"])).toEqual({
    view: true,
    edit: false,
    review: false,
    error: false,
  });
});
