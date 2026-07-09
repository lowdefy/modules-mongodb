import parseNunjucks from "./parseNunjucks.js";

test("renders a template string against vars", () => {
  expect(parseNunjucks("Hello {{ name }}", { name: "Sam" })).toBe("Hello Sam");
});

test("renders missing vars as empty", () => {
  expect(parseNunjucks("x={{ missing }}", {})).toBe("x=");
});
