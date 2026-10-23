/**
 * Runs the `_js` in check-input.yaml, which refuses a report or a message
 * before Pelican is called.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const checkInput = loadYaml(
  readFileSync(join(here, "check-input.yaml"), "utf8"),
);
const code = checkInput.find((step) => step[":set_state"]?.input_error)[
  ":set_state"
].input_error._js;

const TYPES = ["bug", "question", "feature_request", "feedback"].map(
  (value) => ({
    value,
    label: value,
  }),
);
const PREFIX = "support/u1/";

const ORG_PREFIX = "org1/support/u1/";

const check = (input, ticket = true, key_prefix = PREFIX) =>
  new Function("state", code)(() => ({
    input,
    types: TYPES,
    key_prefix,
    ticket,
  }));

const report = {
  type: "bug",
  title: "Export fails",
  message: "It shows an error.",
  files: [{ key: `${PREFIX}a/shot.png`, name: "shot.png" }],
};

const refusal = (message) => ({
  kind: "fix",
  status: null,
  code: "invalid_request",
  message,
  retry_after: null,
});

test("a good report passes", () => {
  expect(check(report)).toBeNull();
  expect(check({ ...report, files: undefined })).toBeNull();
});

test("a type the app does not offer is refused", () => {
  expect(check({ ...report, type: "complaint" })).toEqual(
    refusal("Choose one of the ticket types."),
  );
});

test.each([
  ["empty", ""],
  ["blank", "   "],
  ["too long", "x".repeat(121)],
])("a %s title is refused", (_, title) => {
  expect(check({ ...report, title })).toEqual(
    refusal("Give the ticket a title of up to 120 characters."),
  );
});

test("a message checks neither type nor title", () => {
  expect(check({ message: "Still broken." }, false)).toBeNull();
});

test.each([
  ["empty", ""],
  ["missing", undefined],
  ["too long", "x".repeat(4001)],
])("a %s message is refused", (_, message) => {
  expect(check({ message }, false)).toEqual(
    refusal("Write a message of up to 4,000 characters."),
  );
});

test("a sixth file is refused", () => {
  const files = Array.from({ length: 6 }, (_, i) => ({
    key: `${PREFIX}${i}/f.png`,
    name: "f.png",
  }));
  expect(check({ ...report, files })).toEqual(
    refusal("Attach up to five files."),
  );
});

test.each([
  ["another user's upload", { key: "support/u2/a/shot.png", name: "shot.png" }],
  [
    "a key outside support/",
    { key: "uploads/u1/a/shot.png", name: "shot.png" },
  ],
  ["a file with no name", { key: `${PREFIX}a/shot.png`, name: "" }],
  ["a file with no key", { name: "shot.png" }],
  ["a null file", null],
])("%s is refused", (_, file) => {
  expect(check({ ...report, files: [file] })).toEqual(
    refusal("Attach only files you uploaded here."),
  );
});

test("a user with an organization attaches files under its prefix", () => {
  const files = [{ key: `${ORG_PREFIX}a/shot.png`, name: "shot.png" }];
  expect(check({ ...report, files }, true, ORG_PREFIX)).toBeNull();
});

test.each([
  ["another organization's prefix", "org2/support/u1/a/shot.png"],
  ["another user's upload", "org1/support/u2/a/shot.png"],
  ["the prefix of a user with no organization", "support/u1/a/shot.png"],
])("for a user with an organization, %s is refused", (_, key) => {
  expect(
    check({ ...report, files: [{ key, name: "shot.png" }] }, true, ORG_PREFIX),
  ).toEqual(refusal("Attach only files you uploaded here."));
});
