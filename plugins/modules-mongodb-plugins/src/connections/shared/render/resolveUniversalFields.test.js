import resolveUniversalFields from "./resolveUniversalFields.js";

// These branches must stay identical to `normalizeUniversalFields` in
// `modules/workflows/resolvers/makeActionPages.js` — a form page and a check page
// showing the same action must agree on which fields are present.
describe("resolveUniversalFields", () => {
  test("undefined (author declared nothing) → both fields", () => {
    expect(resolveUniversalFields(undefined)).toEqual([
      "assignees",
      "due_date",
    ]);
  });

  test("false (opted out) → empty list", () => {
    expect(resolveUniversalFields(false)).toEqual([]);
  });

  test("empty array → empty list", () => {
    expect(resolveUniversalFields([])).toEqual([]);
  });

  test("partial list passes through verbatim", () => {
    expect(resolveUniversalFields(["due_date"])).toEqual(["due_date"]);
    expect(resolveUniversalFields(["assignees"])).toEqual(["assignees"]);
  });

  test("authored order is preserved", () => {
    expect(resolveUniversalFields(["due_date", "assignees"])).toEqual([
      "due_date",
      "assignees",
    ]);
  });

  test("the default is a fresh array per call (no shared mutable default)", () => {
    const first = resolveUniversalFields(undefined);
    first.push("mutated");
    expect(resolveUniversalFields(undefined)).toEqual([
      "assignees",
      "due_date",
    ]);
  });
});
