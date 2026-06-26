import { test, expect } from "./fixtures.js";

// Boot smoke spec. Proves only the harness substrate, against the EMPTY
// workflow_config (no fixture workflows exist yet — those arrive in task 3):
//   - the server boots and serves the test app on port 3001,
//   - `/things` renders the list page,
//   - `mdb` connects (seed + read a `things` doc),
//   - `/thing-view?_id={seeded}` renders the entity page and the
//     `actions-on-entity` surface without error.
//
// Does NOT call workflow.start — no fixture workflow exists yet.

test("scaffold — server boots, /things and /thing-view render, mdb connects", async ({
  ldf,
  mdb,
  page,
}) => {
  // ── mdb connects: seed + read a things doc ──────────────────────────────
  // Entity ids in this module are strings (the demo uses string lead/company
  // ids; thing-view's get_thing matches `_id` against the `_id` url-query
  // string). Seed a string `_id` so the page request matches and so it lines
  // up with the string entity_id the workflow fixture passes to start-workflow.
  // Seed BEFORE rendering /things: an empty `#things-list` renders as a
  // zero-height <ul> that Playwright treats as hidden, so the list must have at
  // least one item for the visibility assertion to be meaningful.
  const thingId = "scaffold-smoke-thing";
  await mdb.seed("things", [{ _id: thingId, title: "Scaffold Smoke Thing" }]);

  const seeded = await mdb.collection("things").findOne({ _id: thingId });
  expect(seeded).toBeTruthy();
  expect(seeded.title).toBe("Scaffold Smoke Thing");

  // ── /things renders ─────────────────────────────────────────────────────
  await ldf.goto("/things");
  // The list page's onMount fetch + Html block render the #things-list ul,
  // now populated with the seeded thing.
  await expect(page.locator("#things-list")).toBeVisible();

  // ── /thing-view?_id={seeded} renders title + actions-on-entity surface ───
  await ldf.goto(`/thing-view?_id=${thingId}`);

  // The thing title renders from the get_thing request.
  await expect(page.locator("#thing-title")).toHaveText("Scaffold Smoke Thing");

  // The actions-on-entity surface mounts (its onMount CallAPI hits
  // get-entity-workflows, which returns an empty list against the empty
  // config — the Box still renders without error).
  await expect(page.locator("#actions_on_entity")).toBeAttached();
});
