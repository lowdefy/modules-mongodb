/**
 * Pins the AI chat modules' default personal-information patterns
 * (pii_patterns.yaml), joined as pii_regex.yaml joins them, against the strings
 * docs/shared/personal-information.md lists: each must-block string is matched
 * whole (so masking leaves nothing behind), and each must-pass string is not
 * matched at all.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const patterns = loadYaml(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "pii_patterns.yaml"),
    "utf8",
  ),
);
const joined = patterns.join("|");

const mustBlock = [
  "8001015009087",
  "80010150090",
  "800101 5009 087",
  "(082) 123 4567",
  "082-123-4567",
  "+27 82 123 4567",
  "+27-82-123-4567",
  "+27 82-123-4567",
  "+27 (0)82 123 4567",
  "082 123 4567 890",
  "A12345678",
  "jane@example.com",
  "62 1234 5678",
];

const mustPass = [
  "payroll for 2026-10-20 08:00",
  "2026-01-01 2026-03-31",
  "R1 500 000.50",
  "employee 12345",
  // Known limits, kept visible: a dashed ID and a short employee number pass.
  "800101-5009-087",
];

test.each(mustBlock)("masks %s whole", (text) => {
  expect(text.replace(new RegExp(joined, "g"), "[removed]")).toBe("[removed]");
});

test.each(mustBlock)("blocks %s inside a sentence", (text) => {
  // _regex's default flags, as the browser guard runs it.
  expect(new RegExp(joined, "gm").test(`Please check ${text} for me`)).toBe(
    true,
  );
});

test.each(mustPass)("passes %s", (text) => {
  expect(new RegExp(joined, "gm").test(text)).toBe(false);
});

test("blocks a long business number, a known limit", () => {
  expect(new RegExp(joined, "gm").test("PO 4500012345")).toBe(true);
});
