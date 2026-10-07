/**
 * Runs the `_js` in error_message.yaml, the line a form shows for an
 * endpoint's error.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const code = loadYaml(readFileSync(join(here, "error_message.yaml"), "utf8"))
  ._js.fn;

const message = (error) => new Function("args", code)({ error });

test("a fix error shows Pelican's message", () => {
  expect(message({ kind: "fix", message: "shot.png is over 10 MB." })).toBe(
    "shot.png is over 10 MB.",
  );
});

test("a fix error without a message asks to check the report", () => {
  expect(message({ kind: "fix", message: null })).toBe(
    "Check the report and try again.",
  );
});

test("an unavailable error says support is unavailable", () => {
  expect(message({ kind: "unavailable", message: "Unauthorized" })).toBe(
    "Support is unavailable right now.",
  );
});

test("a retry error says to try again, with the wait when given", () => {
  expect(message({ kind: "retry", retry_after: null })).toBe(
    "Something went wrong, try again.",
  );
  expect(message({ kind: "retry", retry_after: 30 })).toBe(
    "Something went wrong, try again in 30 seconds.",
  );
  expect(message({ kind: "retry", retry_after: 60 })).toBe(
    "Something went wrong, try again in a minute.",
  );
  expect(message({ kind: "retry", retry_after: 900 })).toBe(
    "Something went wrong, try again in 15 minutes.",
  );
});

test("no error object reads as a failed call", () => {
  expect(message(null)).toBe("Something went wrong, try again.");
});
