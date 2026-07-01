# Task 9: Worked-example fixture smoke

## Context

The design's [§ Verification](../design.md#verification) commits a handler-level integration smoke against the worked-example workflow:

- Submitting `qualify` writes an event in the events collection with the expected `display`, `references`, and `metadata`.
- The notification routine receives a payload when wired; no error when unwired.

This runs against a **fixture app** that stands up the minimum module entries inline in the test file (the real `apps/demo` wiring isn't available until [Part 20](../../20-module-manifest/design.md) lands). The worked example is described in [workflows-module-concept/design.md § Worked example](../../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) — generic onboarding on a `lead` entity, four actions, the user-submitted action is `qualify`.

This task is broader than [task 8](./08-event-id-round-trip-regression.md): task 8 asserts the one-id-per-invocation invariant; task 9 asserts the full event payload shape (`type`, `display` keying, `references` entity-ref derivation, all six `metadata` fields) plus the notifications side dispatching the right `event_ids` payload.

## Task

### 1. Create the fixture-app smoke test

Create [plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/worked-example.test.js](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/worked-example.test.js).

Boots `mongodb-memory-server` via the shared `inMemoryMongo` helper. Reuses the `callApi` stub pattern from [task 8](./08-event-id-round-trip-regression.md), extended to record what `send-notification` was called with.

Structure:

```js
import { inMemoryMongo } from "../../shared/inMemoryMongo.js";
import SubmitWorkflowAction from "./SubmitWorkflowAction.js";

describe("Part 8 — worked-example onboarding smoke", () => {
  let mongo;
  let notificationCalls;

  beforeAll(async () => {
    mongo = await inMemoryMongo();
  });

  afterAll(async () => {
    await mongo.cleanup();
  });

  beforeEach(async () => {
    notificationCalls = [];
    await resetCollections(mongo);
    await seedWorkedExample(mongo);
  });

  describe("with send_routine wired", () => {
    it("writes a log event with the expected default shape", async () => {
      const result = await SubmitWorkflowAction(
        buildContext({ mongo, notificationCalls, sendRoutineWired: true }),
      );

      const eventDoc = await mongo.db
        .collection("events")
        .findOne({ _id: result.event_id });

      expect(eventDoc.type).toBe("action-submit_edit");
      // display keyed by the fixture app's app_name ('test-app')
      expect(eventDoc["test-app"]).toBeDefined();
      expect(eventDoc["test-app"].title._nunjucks.template).toBe(
        "{{ user.profile.name }} marked {{ action_type }} as {{ status_after }}",
      );
      // references include the entity-ref convention derived from
      // entity_collection (`leads-collection` → `leads_ids`)
      expect(eventDoc.workflow_ids).toEqual(["W1"]);
      expect(eventDoc.action_ids).toEqual(["A1"]);
      expect(eventDoc.leads_ids).toEqual(["L1"]);
      // all six metadata fields
      expect(eventDoc.metadata).toEqual({
        action_type: "qualify",
        workflow_type: "onboarding",
        interaction: "submit_edit",
        current_key: null,
        status_before: "action-required",
        status_after: "done", // worked example: qualify has no review verb, so default is 'done'
      });
    });

    it("dispatches send-notification with the just-emitted event_id", async () => {
      const result = await SubmitWorkflowAction(
        buildContext({ mongo, notificationCalls, sendRoutineWired: true }),
      );

      expect(notificationCalls).toHaveLength(1);
      expect(notificationCalls[0]).toEqual({ event_ids: [result.event_id] });
    });
  });

  describe("with send_routine unwired", () => {
    it("does not throw — notifications module no-ops silently", async () => {
      // The notifications module's send-notification Api is wired but its
      // send_routine is the empty default. The engine's dispatchNotifications
      // call still fires and returns { success: true }; nothing breaks.
      const result = await SubmitWorkflowAction(
        buildContext({ mongo, notificationCalls, sendRoutineWired: false }),
      );

      expect(result.event_id).toBeDefined();
      // No assertions on notificationCalls — the stub's "unwired" path records nothing.
    });
  });
});
```

### 2. Implement the fixture helpers

In the same test file:

```js
async function resetCollections(mongo) {
  await mongo.db.collection("workflows").deleteMany({});
  await mongo.db.collection("actions").deleteMany({});
  await mongo.db.collection("events").deleteMany({});
  await mongo.db.collection("notifications").deleteMany({});
}

async function seedWorkedExample(mongo) {
  // Single workflow: onboarding on a lead. Single action: qualify.
  await mongo.db.collection("workflows").insertOne({
    _id: "W1",
    workflow_type: "onboarding",
    entity_id: "L1",
    entity_collection: "leads-collection",
    status: [{ stage: "active", created: { timestamp: new Date() } }],
    summary: { done: 0, not_required: 0, total: 1 },
    groups: [],
    created: { timestamp: new Date() },
    updated: { timestamp: new Date() },
  });

  await mongo.db.collection("actions").insertOne({
    _id: "A1",
    workflow_id: "W1",
    type: "qualify",
    key: null,
    status: [{ stage: "action-required", created: { timestamp: new Date() } }],
    created: { timestamp: new Date() },
    updated: { timestamp: new Date() },
  });
}

function buildContext({ mongo, notificationCalls, sendRoutineWired }) {
  return {
    request: {
      action_id: "A1",
      interaction: "submit_edit",
    },
    connection: {
      databaseUri: mongo.uri,
      workflowsCollection: "workflows",
      actionsCollection: "actions",
      app_name: "test-app",
      workflowsConfig: [
        {
          type: "onboarding",
          entity_collection: "leads-collection",
          starting_actions: [{ type: "qualify", status: "action-required" }],
          actions: [
            { type: "qualify", kind: "form", access: { roles: ["admin"] } },
          ],
        },
      ],
      actionsEnum: {
        "action-required": { priority: 10 },
        done: { priority: 100 },
      },
      changeStamp: { timestamp: new Date() },
    },
    user: { id: "U1", profile: { name: "Test User" }, roles: ["admin"] },
    callApi: makeCallApiStub({ mongo, notificationCalls, sendRoutineWired }),
  };
}

function makeCallApiStub({ mongo, notificationCalls, sendRoutineWired }) {
  return async ({ id, module }, payload, options) => {
    if (module === "events" && id === "new-event") {
      // Mirror new-event.yaml with task 1's _if_none extension.
      const _id = payload._id ?? require("node:crypto").randomUUID();
      const doc = {
        _id,
        ...payload.display,
        ...payload.references,
        date: new Date(),
        created: { timestamp: new Date(), user: options.user },
        type: payload.type,
        metadata: payload.metadata,
        files: payload.files,
      };
      await mongo.db.collection("events").insertOne(doc);
      return { success: true, response: { eventId: _id } };
    }
    if (module === "notifications" && id === "send-notification") {
      if (sendRoutineWired) {
        notificationCalls.push(payload);
      }
      // Unwired or wired: both return success — matches the design's
      // "silent no-op when the app hasn't wired a send_routine" contract.
      return { success: true, response: {} };
    }
    throw new Error(`unexpected callApi: ${module}/${id}`);
  };
}
```

### 3. Confirm the worked-example assumptions

The `qualify` action in the worked example does **not** have a `review` verb in its `access` map ([workflows-module-concept/design.md § Worked example](../../../../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs)) — so the engine's default for `submit_edit` is `done` (per [handleSubmit.js:36](../../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/handleSubmit.js): `hasReviewVerb ? 'in-review' : 'done'`). That's the `status_after: 'done'` assertion above.

If the seeded `workflowsConfig` adds `review` to `access`, update both the assertion and the comment.

## Acceptance Criteria

- `worked-example.test.js` runs under `pnpm test`.
- All three `it` blocks pass.
- The event doc's `display` is keyed by `'test-app'` (the fixture's `app_name`), matching the design's app-name-keyed display contract.
- The event doc carries `leads_ids: ['L1']` — confirms the entity-ref derivation works end-to-end.
- The notification call payload is exactly `{ event_ids: [<eventId>] }` — no extras, matching the design's contract.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/SubmitWorkflowAction/worked-example.test.js` — create.

## Notes

- Don't extract the fixture helpers into a `fixtures/` directory yet — Part 8 is the first part to set up this pattern, and there's only one consumer. If [Part 9](../../09-hook-invocation/design.md), [Part 10](../../10-tracker-subscription/design.md), or [Part 11](../../11-group-on-complete-fanout/design.md) want the same fixture shape, that's the time to extract.
- The `sendRoutineWired: false` case isn't testing that the notifications module's empty default routine is `[]` — that's the notifications module's contract. We're testing the engine handles either case without throwing. The stub returns `{ success: true }` regardless because that's the real-world behaviour.
- Don't add assertions about `notifications` collection contents. The notifications module's `send_routine` is what writes to that collection, and the routine is app-supplied. The engine's only obligation is firing `send-notification` with the right payload — covered by the wired-routine assertion.
- This task complements task 8 — task 8 is the narrow regression for the `event_id` invariant; this task is the broader shape check. Both stay; the overlap is intentional. Task 8 will catch the regression quickly during development; task 9 will catch shape drift over the part's lifetime.
- E2E coverage of the same flow against the real `apps/demo` (running the actual `new-event.yaml` routine through `@lowdefy/api`) lands in [Part 22](../../22-workflows-e2e-suite/design.md)'s `side-effects.spec.js`. This task is the handler-level smoke; Part 22 is the runtime-level smoke.
