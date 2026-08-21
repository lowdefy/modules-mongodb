import cleanTitle, { MAX_TITLE_CHARS } from "./cleanTitle.js";

describe("cleanTitle", () => {
  test("returns null for non-strings and empty results", () => {
    expect(cleanTitle(undefined)).toBeNull();
    expect(cleanTitle(null)).toBeNull();
    expect(cleanTitle(42)).toBeNull();
    expect(cleanTitle("")).toBeNull();
    expect(cleanTitle("   ")).toBeNull();
    expect(cleanTitle('"..."')).toBeNull();
  });

  test("collapses whitespace and trims", () => {
    expect(cleanTitle("  Moving  an\n employee  assignment ")).toBe(
      "Moving an employee assignment",
    );
  });

  test("strips wrapping quotes and trailing punctuation", () => {
    expect(cleanTitle('"Evidence for board charter"')).toBe(
      "Evidence for board charter",
    );
    expect(cleanTitle("“Outstanding onboarding items”")).toBe(
      "Outstanding onboarding items",
    );
    expect(cleanTitle("Outstanding onboarding items.")).toBe(
      "Outstanding onboarding items",
    );
    expect(cleanTitle("Payroll run schedule:")).toBe("Payroll run schedule");
  });

  test("keeps internal quotes and punctuation", () => {
    expect(cleanTitle(`Editing a contact's address`)).toBe(
      `Editing a contact's address`,
    );
  });

  test("truncates past the cap with an ellipsis", () => {
    const long = "a".repeat(MAX_TITLE_CHARS + 20);
    const result = cleanTitle(long);
    expect(result.length).toBeLessThanOrEqual(MAX_TITLE_CHARS + 1);
    expect(result.endsWith("…")).toBe(true);
  });
});
