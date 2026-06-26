import { test, expect } from "../fixtures.js";

// Cluster: error-recovery (Part 22 task 6). Mode: Spine.
//
// Proves the error-verb path AND the suite's third "only e2e can prove" item —
// real cross-module callApi. Submitting `trigger` cascades `error` at `fragile`
// (production mechanism), and that single submit:
//   - lands fragile in the error stage,
//   - writes a timeline EVENT via the events module's real new-event endpoint
//     (asserted in `log-events`),
//   - dispatches a NOTIFICATION via the notifications module's real
//     send-notification endpoint (asserted in `notifications`) — not mocks.
// Then the emitted error-recovery-fragile-error page recovers it:
// resolve_error → in-review → approve → done.
//
// Verified collection names (Part 22 task baked-in facts):
//   events        → log-events    (modules/events/connections/events-collection.yaml)
//   notifications → notifications (modules/notifications/connections/notifications-collection.yaml)
// The new-event endpoint flattens `references` onto the event doc's top level,
// so reference arrays (workflow_ids, action_ids) are queried as top-level fields.
//
// TARGET STATE (parts 40/46/48): fragile is kind:form with the `error` verb, so
// makeActionPages emits /workflows/error-recovery-fragile-error from
// templates/error.yaml.njk; trigger is kind:check, submitting from the static
// workflow-action-edit page. The submit endpoint is per-workflow
// error-recovery-submit (Part 48). Fails against pre-40/48 code by design.
//
// The `mdb` fixture wipes all collections between tests.

const WORKFLOW_TYPE = "error-recovery";

function actionByType(mdb, workflowId, type) {
  return mdb
    .collection("actions")
    .findOne({ workflow_id: String(workflowId), type });
}

test("a submit cascades fragile into error — writing a real timeline event and notification — and the error page recovers it through to done", async ({
  ldf,
  mdb,
  page,
  workflow,
}) => {
  await ldf.user({
    name: "Test User",
    email: "test-user@example.com",
    roles: ["admin"],
  });

  const thingId = "thing-error-recovery";
  await mdb.seed("things", [{ _id: thingId, title: "Fragile Thing" }]);

  const { workflow_id } = await workflow.start({
    workflow_type: WORKFLOW_TYPE,
    entity_id: thingId,
    entity_collection: "things-collection",
  });

  const trigger = await actionByType(mdb, workflow_id, "trigger");
  const fragile = await actionByType(mdb, workflow_id, "fragile");
  expect(trigger.status[0].stage).toBe("action-required");
  expect(fragile.status[0].stage).toBe("action-required");
  const triggerId = trigger._id.toString();
  const fragileId = fragile._id.toString();

  // ── SPINE: submit trigger through its real (static check) edit page ────────
  await ldf.goto(`/workflows/workflow-action-edit?action_id=${triggerId}`);
  await ldf.block("button_submit").do.click();

  // trigger completes; its pre-hook cascade pushes fragile into error.
  await workflow.assertStatus(triggerId, "done");
  await workflow.assertStatus(fragileId, "error");

  // The entity surface reflects the committed error state.
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText("Errored — needs recovery.")).toBeVisible();

  // ── CROSS-MODULE DISPATCH: real event + notification, not mocks ────────────
  // The trigger submit wrote one event via the events module's new-event
  // endpoint; references flatten to top-level workflow_ids / action_ids.
  await expect
    .poll(
      () =>
        mdb.collection("log-events").findOne({
          type: "action-submit",
          "metadata.workflow_type": WORKFLOW_TYPE,
          "metadata.action_type": "trigger",
          workflow_ids: String(workflow_id),
        }),
      { timeout: 10_000 },
    )
    .not.toBeNull();

  // …and the engine dispatched a notification from that event via the
  // notifications module's send-notification endpoint (the test-app
  // send-routine matches the trigger submit event).
  await expect
    .poll(
      () =>
        mdb.collection("notifications").findOne({
          type: "workflow-error",
          workflow_ids: String(workflow_id),
        }),
      { timeout: 10_000 },
    )
    .not.toBeNull();

  // ── ERROR PAGE REACHABLE: the `error` verb's emitted page renders ──────────
  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-fragile-error?action_id=${fragileId}`,
  );
  await expect(page).toHaveURL(/error-recovery-fragile-error/);
  // The resolve affordance is present (the error page's only interaction button).
  await ldf.block("button_resolve_error").expect.visible();

  // ── RECOVERY: resolve_error → in-review, then approve → done ───────────────
  await ldf.block("button_resolve_error").do.click();
  await workflow.assertStatus(fragileId, "in-review");

  await ldf.goto(
    `/workflows/${WORKFLOW_TYPE}-fragile-review?action_id=${fragileId}`,
  );
  await expect(page).toHaveURL(/error-recovery-fragile-review/);
  await ldf.block("button_approve").do.click();
  await workflow.assertStatus(fragileId, "done");

  // ── SPINE CLOSURE: the entity surface reflects the recovered done state ────
  await ldf.goto(`/thing-view?_id=${thingId}`);
  await expect(page.getByText("Recovered and complete.")).toBeVisible();
});
