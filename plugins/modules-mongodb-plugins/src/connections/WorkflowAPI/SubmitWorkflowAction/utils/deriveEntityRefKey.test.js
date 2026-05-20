import deriveEntityRefKey from "./deriveEntityRefKey.js";

const cases = [
  { input: "leads-collection", expected: "leads_ids" },
  { input: "tickets-collection", expected: "tickets_ids" },
  { input: "user-contacts", expected: "user_contacts_ids" },
  { input: "contacts", expected: "contacts_ids" },
];

test.each(cases)(
  "deriveEntityRefKey: $input → $expected",
  ({ input, expected }) => {
    expect(deriveEntityRefKey(input)).toBe(expected);
  },
);

test("deriveEntityRefKey: throws on empty string", () => {
  expect(() => deriveEntityRefKey("")).toThrow(
    /entityCollection is required/,
  );
});

test("deriveEntityRefKey: throws on non-string input", () => {
  expect(() => deriveEntityRefKey(undefined)).toThrow(
    /entityCollection is required/,
  );
  expect(() => deriveEntityRefKey(null)).toThrow(
    /entityCollection is required/,
  );
  expect(() => deriveEntityRefKey(42)).toThrow(/entityCollection is required/);
});
