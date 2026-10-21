/**
 * Runs the webhook routine's event checks (webhook.yaml) against stubbed
 * deliveries: which branch each event reaches, in the routine's order, and the
 * users.lookup check on user_ids.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const webhook = loadYaml(readFileSync(join(here, "webhook.yaml"), "utf8"));

function runJs(code, state) {
  return new Function("state", code)((key) => state[key]);
}

// Evaluates the two condition shapes the routine's top-level :if steps use:
// _eq on delivery.event, and _js reading state.
function condition(test, state) {
  if (test._js) return runJs(test._js, state);
  const [left, right] = test._eq;
  if (left._state !== "delivery.event") {
    throw new Error(`Unexpected _eq: ${JSON.stringify(test)}`);
  }
  const delivery = state.delivery;
  const event =
    delivery && typeof delivery === "object" ? delivery.event : undefined;
  return event === right;
}

// Walks the routine's top-level steps up to the ticket write and names the
// first branch the delivery takes.
function route(delivery) {
  const state = { delivery };
  for (const step of webhook.routine) {
    if (step.id === "stored_row") break;
    if (step[":set_state"] && !step[":set_state"].delivery) {
      Object.assign(state, step[":set_state"]);
      continue;
    }
    if (!step[":if"]) continue;
    if (!condition(step[":if"], state)) continue;
    const then = step[":then"];
    if (then["_build.if"]) return "release-or-lookup";
    if (then[0]?.[":return"]?.ok) return "test";
    if (then[0]?.[":reject"] === "Unknown event") return "unknown";
    if (then[0]?.[":reject"]) return "bad-ticket";
    throw new Error(`Unexpected branch: ${JSON.stringify(then)}`);
  }
  return "ticket";
}

const ifSteps = webhook.routine.filter((step) => step[":if"]);
const branchFor = (event) =>
  ifSteps.find((step) => step[":if"]._eq && step[":if"]._eq[1] === event)[
    ":then"
  ]["_build.if"];
const lookupBranch = branchFor("users.lookup");
const userIdsCheck = lookupBranch.then[0][":if"]._js;
const checkUserIds = (userIds) =>
  runJs(userIdsCheck, {
    delivery: { event: "users.lookup", user_ids: userIds },
  });

const ticketDelivery = (event) => ({
  event,
  at: "2026-10-21T10:00:00.000Z",
  user_id: "u1",
  ticket: { id: "t1", version: 2 },
});

describe("the webhook's event routing", () => {
  test("test answers ok", () => {
    expect(route({ event: "test" })).toBe("test");
  });

  test.each([
    "ticket.created",
    "ticket.message",
    "ticket.message_deleted",
    "ticket.stage",
    "ticket.updated",
  ])("%s with a good body writes the ticket", (event) => {
    expect(route(ticketDelivery(event))).toBe("ticket");
  });

  test("a known ticket event with a bad body answers the ticket error", () => {
    expect(route({ event: "ticket.message", user_id: "u1" })).toBe(
      "bad-ticket",
    );
    const reject = ifSteps.find((step) =>
      step[":then"][0]?.[":reject"]?.startsWith?.("A support"),
    )[":then"][0];
    expect(reject[":status"]).toBeUndefined();
  });

  test("users.lookup goes to its own branch, before the unknown-event check", () => {
    expect(route({ event: "users.lookup", user_ids: ["u1"] })).toBe(
      "release-or-lookup",
    );
  });

  test("release.* goes to its own branch", () => {
    expect(route({ event: "release.announced" })).toBe("release-or-lookup");
  });

  test.each([
    ["an unknown event", { event: "users.delete", user_id: "u1" }],
    ["a missing event", { user_id: "u1", ticket: { id: "t1", version: 1 } }],
    ["a null body", null],
    ["a string body", "ticket.message"],
    ["an array body", [ticketDelivery("ticket.message")]],
  ])("%s answers 404 Unknown event", (_, delivery) => {
    expect(route(delivery)).toBe("unknown");
    const reject = ifSteps.find(
      (step) => step[":then"][0]?.[":reject"] === "Unknown event",
    )[":then"][0];
    expect(reject[":status"]).toBe(404);
  });
});

describe("users.lookup", () => {
  test("off answers 404, This app does not share user details", () => {
    expect(lookupBranch.test).toEqual({
      "_build.eq": [{ "_module.var": "user_lookup" }, true],
    });
    expect(lookupBranch.else).toEqual([
      {
        ":reject": "This app does not share user details",
        ":status": 404,
      },
    ]);
  });

  test("a bad user_ids answers 422", () => {
    expect(lookupBranch.then[0][":then"]).toEqual([
      { ":reject": "A users.lookup names 1 to 200 user ids.", ":status": 422 },
    ]);
  });

  test.each([
    ["missing", undefined],
    ["not an array", "u1"],
    ["empty", []],
    ["201 ids", Array.from({ length: 201 }, (_, i) => `u${i}`)],
    ["a non-string id", ["u1", 2]],
    ["an empty-string id", ["u1", ""]],
    ["a null id", ["u1", null]],
  ])("%s is refused", (_, userIds) => {
    expect(checkUserIds(userIds)).toBe(true);
  });

  test.each([
    ["one id", ["u1"]],
    ["exactly 200 ids", Array.from({ length: 200 }, (_, i) => `u${i}`)],
  ])("%s passes", (_, userIds) => {
    expect(checkUserIds(userIds)).toBe(false);
  });

  test("the answer reads only the app's members, then their users", () => {
    const aggregation = lookupBranch.then.find(
      (step) => step.type === "MongoDBAggregation",
    );
    expect(aggregation.connectionId).toEqual({
      "_module.connectionId": "support-members",
    });
    const [match, group, lookup, unwind, project] =
      aggregation.properties.pipeline;
    const byPolicy = match.$match["_build.if"];
    expect(byPolicy.then).toEqual({
      user_id: { $in: { _state: "delivery.user_ids" } },
    });
    expect(byPolicy.else).toEqual({
      user_id: { $in: { _state: "delivery.user_ids" } },
      organization_id: { _organization: "id" },
    });
    expect(group).toEqual({ $group: { _id: "$user_id" } });
    expect(lookup.$lookup.from).toBe("users");
    expect(unwind).toEqual({ $unwind: "$user" });
    expect(Object.keys(project.$project)).toEqual([
      "_id",
      "id",
      "email",
      "name",
    ]);
  });
});
