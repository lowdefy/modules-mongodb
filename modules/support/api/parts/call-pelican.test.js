/**
 * Runs the `_js` that maps Pelican's answer onto state.pelican_error
 * (call-pelican.yaml), and the one that picks the tickets sync-tickets fetches
 * in full (sync-tickets.yaml), against stubbed Pelican answers.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const readYaml = (path) => loadYaml(readFileSync(join(here, path), "utf8"));

function runJs(code, state) {
  return new Function("state", code)((key) => state[key]);
}

const callPelican = readYaml("call-pelican.yaml");
const mapAnswer = (answer) =>
  runJs(
    callPelican.find((step) => step[":set_state"]?.pelican_error)[":set_state"]
      .pelican_error._js,
    { pelican_answer: answer },
  );

const syncTickets = readYaml("../sync-tickets.yaml");
const staleIdsStep = syncTickets.routine
  .find((step) => step[":then"])
  [":then"].find((step) => step[":set_state"]?.stale_ids);
const staleIds = (listed, storedVersions) =>
  runJs(staleIdsStep[":set_state"].stale_ids._js, {
    listed,
    stored_versions: storedVersions,
  });

const pelicanError = (code, message, extra = {}) => ({
  error: { code, message, ...extra },
});

describe("Pelican's answer", () => {
  test.each([200, 201, 204])("a %i is no error", (status) => {
    expect(mapAnswer({ status, data: { id: "t1" } })).toBeNull();
  });

  test.each([
    [400, "invalid_request"],
    [404, "not_found"],
    [413, "file_too_large"],
    [415, "file_type"],
  ])(
    "a %i with a code is the reporter's to fix, with Pelican's message",
    (status, code) => {
      expect(
        mapAnswer({ status, data: pelicanError(code, "Pelican says why.") }),
      ).toEqual({
        kind: "fix",
        status,
        code,
        message: "Pelican says why.",
        retry_after: null,
      });
    },
  );

  test("a 401 is unavailable, whatever Pelican says", () => {
    expect(
      mapAnswer({
        status: 401,
        data: pelicanError("unauthorized", "Unknown key."),
      }),
    ).toEqual({
      kind: "unavailable",
      status: 401,
      code: "unauthorized",
      message: "Support is unavailable.",
      retry_after: null,
    });
  });

  test("a 429 is retried after retry_after", () => {
    expect(
      mapAnswer({
        status: 429,
        data: pelicanError("rate_limited", "Too many tickets.", {
          retry_after: 1800,
        }),
      }),
    ).toEqual({
      kind: "retry",
      status: 429,
      code: "rate_limited",
      message: "Too many tickets.",
      retry_after: 1800,
    });
  });

  test("a 500 is retried", () => {
    expect(
      mapAnswer({ status: 500, data: pelicanError("internal", "Broke.") }),
    ).toMatchObject({
      kind: "retry",
      status: 500,
      retry_after: null,
    });
  });

  test.each([
    ["no body", undefined],
    ["a body without a code", { error: { message: "Bad gateway" } }],
    ["an HTML page", "<html>Bad gateway</html>"],
  ])("a 400 with %s is retried", (_, data) => {
    expect(mapAnswer({ status: 400, data })).toMatchObject({
      kind: "retry",
      code: null,
    });
  });

  test("a status Pelican does not send, such as a 502 from a proxy, is retried", () => {
    expect(mapAnswer({ status: 502, data: "Bad gateway" })).toEqual({
      kind: "retry",
      status: 502,
      code: null,
      message: "Support could not take this right now. Try again in a moment.",
      retry_after: null,
    });
  });

  test("no answer is retried", () => {
    expect(mapAnswer(null)).toEqual({
      kind: "retry",
      status: null,
      code: null,
      message: "Support did not answer. Try again in a moment.",
      retry_after: null,
    });
  });
});

describe("the tickets sync-tickets fetches in full", () => {
  const listed = [
    { id: "new", version: 1 },
    { id: "behind", version: 4 },
    { id: "current", version: 2 },
    { id: "ahead", version: 1 },
  ];

  test("are the ones the copy lacks or holds at a lower version", () => {
    expect(
      staleIds(listed, [
        { _id: "behind", view: { version: 3 } },
        { _id: "current", view: { version: 2 } },
        { _id: "ahead", view: { version: 2 } },
        { _id: "unlisted", view: { version: 9 } },
      ]),
    ).toEqual(["new", "behind"]);
  });

  test("are every listed ticket when the copy is empty", () => {
    expect(staleIds(listed, [])).toEqual(["new", "behind", "current", "ahead"]);
  });

  test("are none when Pelican lists nothing", () => {
    expect(staleIds([], [{ _id: "x", view: { version: 1 } }])).toEqual([]);
  });
});
