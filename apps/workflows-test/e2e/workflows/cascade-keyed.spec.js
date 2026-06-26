import { test, expect } from "../fixtures.js";

// Cluster: cascade-keyed (Part 22 task 5). Mode: Spine + Tail.
//
// Proves the PRODUCTION mechanism for engine-only signals fires through the
// wired app: a single real form submit on `driver` invokes its submit pre-hook,
// whose returned actions[] cascade block / error / activate at three siblings
// and `upsert: true`-spawn a KEYED action at its none-row birth stage. There is
// no test DSL — the cascade is written exactly as a real app writes it.
//
// Spine: render driver's emitted edit page, fill the form, click submit; assert
//   all four cascade effects in the DB and reflected on the entity surface.
// Tail:  drive the real submit endpoint headless (no browser) to prove upsert
//   idempotency against an existing key and the FSM no-op skip when a cascade
//   lands on a sibling already in the target stage.
//
// Cascade SEMANTICS (multi-level, depth guard, none-row upsert) are unit-owned
// (runTrackerCascade.test.js / resolveSignal.test.js); this proves the wiring.
//
// TARGET STATE (parts 40/46/48): driver is kind:form so makeActionPages emits
// /workflows/cascade-keyed-driver-edit; the submit endpoint is per-workflow
// cascade-keyed-submit (Part 48), with the per-action hooks baked in. Fails
// against pre-48 code by design — the suite is the spec.
//
// The `mdb` fixture wipes all collections between tests.

const WORKFLOW_TYPE = "cascade-keyed";

// Engine `_id`s and id refs are UUID strings (createEngineContext:
// newId: randomUUID), so query by the raw `workflow_id` — no ObjectId coercion.
function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

async function seedThingAndStart(ldf, mdb, workflow, thingId, title) {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });
  await mdb.seed("things", [{ _id: thingId, title }]);
  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });
  return workflow_id;
}

test("a single real submit cascades block / error / activate at siblings and upsert-spawns a keyed action — committed in the DB and reflected on the entity surface", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  const thingId = "thing-cascade-spine";
  const workflowId = await seedThingAndStart(
    ldf,
    mdb,
    workflow,
    thingId,
    "Cascade Thing",
  );

  // ── initial stages: driver + two siblings action-required, one blocked ─────
  const driver = await actionByType(mdb, workflowId, "driver");
  expect(driver.status[0].stage).toBe("action-required");
  expect(
    (await actionByType(mdb, workflowId, "gets-blocked")).status[0].stage,
  ).toBe("action-required");
  expect(
    (await actionByType(mdb, workflowId, "gets-errored")).status[0].stage,
  ).toBe("action-required");
  expect(
    (await actionByType(mdb, workflowId, "gets-activated")).status[0].stage,
  ).toBe("blocked");
  // keyed-spawn does not exist yet — it is spawned by the cascade.
  expect(await actionByType(mdb, workflowId, "keyed-spawn")).toBeNull();

  const driverId = driver._id.toString();
  const spawnKey = "widget-1";

  // ── SPINE: fill the driver form and submit through its emitted edit page ────
  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-driver-edit?action_id=${driverId}`,
  );
  await ldf.block("form.spawn_key").do.fill(spawnKey);
  await ldf.block("button_submit").do.click();

  // driver completes (no review verb → submit → done)…
  await workflow.assertStatus(driverId, "done");
  // …and its pre-hook's cascade landed all three sibling effects:
  await workflow.assertStatus(
    (await actionByType(mdb, workflowId, "gets-blocked"))._id.toString(),
    "blocked",
  );
  await workflow.assertStatus(
    (await actionByType(mdb, workflowId, "gets-errored"))._id.toString(),
    "error",
  );
  await workflow.assertStatus(
    (await actionByType(mdb, workflowId, "gets-activated"))._id.toString(),
    "action-required",
  );

  // …and the keyed action was upsert-spawned at its none-row birth stage, with
  // the key taken from the form input.
  await expect
    .poll(
      () =>
        mdb
          .collection("actions")
          .findOne({ workflow_id: String(workflowId), type: "keyed-spawn" }),
      { timeout: 10_000 },
    )
    .toEqual(
      expect.objectContaining({
        key: spawnKey,
        status: expect.arrayContaining([
          expect.objectContaining({ stage: "action-required" }),
        ]),
      }),
    );

  // ── SPINE CLOSURE: the entity surface reflects every cascade effect ────────
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText("Blocked by the cascade.")).toBeVisible();
  await expect(page.getByText("Errored by the cascade.")).toBeVisible();
  await expect(page.getByText("Activated by the cascade.")).toBeVisible();
  await expect(page.getByText("Spawned and action-required.")).toBeVisible();
});

test("upsert is idempotent against an existing key and a cascade landing on an already-blocked sibling is a no-op — through the real endpoint only", async ({
  ldf,
  mdb,
  workflow,
}) => {
  const thingId = "thing-cascade-tail";
  const workflowId = await seedThingAndStart(
    ldf,
    mdb,
    workflow,
    thingId,
    "Cascade Tail Thing",
  );

  const driverId = (
    await actionByType(mdb, workflowId, "driver")
  )._id.toString();
  const getsBlockedId = (
    await actionByType(mdb, workflowId, "gets-blocked")
  )._id.toString();
  const spawnKey = "shared-key";

  // Pre-position gets-blocked AT the cascade's target stage via the seed-state
  // technique (a fixture pre-condition, not an engine backdoor — it mutates the
  // same status[0].stage shape the engine writes). The first submit's `block`
  // cascade now lands on an already-blocked sibling.
  await workflow.setStage(getsBlockedId, "blocked");

  // First submit through the real endpoint, no browser.
  await workflow.submit(driverId, {
    signal: "submit",
    form: { spawn_key: spawnKey },
  });

  // FSM no-op skip: `block` from the `blocked` row has no entry, so the cascade
  // is a structural no-op — the endpoint succeeds (no throw) and gets-blocked
  // stays blocked.
  await workflow.assertStatus(getsBlockedId, "blocked");

  // The keyed action spawned exactly once.
  await expect
    .poll(
      () =>
        mdb.collection("actions").countDocuments({
          workflow_id: String(workflowId),
          type: "keyed-spawn",
          key: spawnKey,
        }),
      { timeout: 10_000 },
    )
    .toBe(1);

  // Second submit with the SAME key: the upsert resolves the existing (type,
  // key) doc instead of inserting — no duplicate. driver is `done`, and the
  // `done` row permits `submit` (→ done), so the re-submit fires the pre-hook
  // again through the real endpoint.
  await workflow.submit(driverId, {
    signal: "submit",
    form: { spawn_key: spawnKey },
  });

  // Still exactly one keyed-spawn doc for the key — upsert idempotency.
  await expect
    .poll(
      () =>
        mdb.collection("actions").countDocuments({
          workflow_id: String(workflowId),
          type: "keyed-spawn",
          key: spawnKey,
        }),
      { timeout: 10_000 },
    )
    .toBe(1);
});
