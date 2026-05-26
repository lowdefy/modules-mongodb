import mergeFormOverrides from "./mergeFormOverrides.js";

describe("mergeFormOverrides", () => {
  test("all three empty → {}", () => {
    expect(mergeFormOverrides({})).toEqual({});
  });

  test("undefined sources contribute nothing", () => {
    expect(
      mergeFormOverrides({
        form: undefined,
        formReview: undefined,
        preHookOverrides: undefined,
      }),
    ).toEqual({});
  });

  test("form only", () => {
    expect(mergeFormOverrides({ form: { a: 1 } })).toEqual({ a: 1 });
  });

  test("form + form_review distinct fields", () => {
    expect(
      mergeFormOverrides({ form: { a: 1 }, formReview: { b: 2 } }),
    ).toEqual({ a: 1, b: 2 });
  });

  test("pre-hook adds new field alongside user form (field-path merge)", () => {
    expect(
      mergeFormOverrides({ form: { a: 1 }, preHookOverrides: { b: 2 } }),
    ).toEqual({ a: 1, b: 2 });
  });

  test("pre-hook wins on field collision with form", () => {
    expect(
      mergeFormOverrides({ form: { a: 1 }, preHookOverrides: { a: 99 } }),
    ).toEqual({ a: 99 });
  });

  test("pre-hook wins on field collision with form_review", () => {
    expect(
      mergeFormOverrides({
        formReview: { a: 1 },
        preHookOverrides: { a: 99 },
      }),
    ).toEqual({ a: 99 });
  });

  test("form_review wins over form, pre-hook wins over both", () => {
    expect(
      mergeFormOverrides({
        form: { a: 1, b: 2 },
        formReview: { b: "review" },
        preHookOverrides: { c: 3 },
      }),
    ).toEqual({ a: 1, b: "review", c: 3 });
  });

  test("empty pre-hook overrides behaves like undefined", () => {
    expect(
      mergeFormOverrides({ form: { a: 1 }, preHookOverrides: {} }),
    ).toEqual({ a: 1 });
  });
});
