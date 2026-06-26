import { test as base } from "@lowdefy/e2e-utils/fixtures";
import { expect } from "@playwright/test";

// The `workflow` fixture: thin wire drivers + DB readers, NOT a DSL. Every
// helper either POSTs a real emitted Lowdefy endpoint (the per-workflow write
// endpoints) or reads the engine collections directly via `mdb`. No test-only
// endpoint, no direct engine call (design Principle 2) — the only thing skipped
// is the browser.
//
// TARGET STATE — Part 48 (render-config-off-connection, in flight). Part 48 D5
// retires the generic operational endpoints and makes every write endpoint
// PER-WORKFLOW, keyed by workflow type:
//   start  → `workflows/{workflow_type}-start`
//   cancel → `workflows/{workflow_type}-cancel`
//   close  → `workflows/{workflow_type}-close`
//   submit → `workflows/{workflow_type}-submit`   (per-WORKFLOW, not per-action;
//            the action is identified by `action_id` in the payload, and the
//            handler re-slices `hooks` by the loaded action's type — Part 48 D7)
// Endpoint ids are module-scoped to the `workflows` module entry, hence the
// `workflows/` prefix. These tests are written against this target; until
// Part 48 lands they will fail against the current per-action / generic ids
// (expected — the suite is the spec, it guides the in-flight implementation).
//
// Wire envelope: the built server serves `POST /api/endpoints/{endpointId}`
// with JSON body `{ blockId, payload, pageId }` and responds with
// `{ error, response, status, success }`. `response` is the routine's
// `:return:` object (dates serialize to `{ '~d': ... }`; ids are UUID strings
// — the engine mints `_id`s with randomUUID, so they come back, and are stored,
// as plain strings). `success` is false when status is error/reject.

const ENDPOINT_BASE = "/api/endpoints/";

// Engine `_id`s are UUID strings (createEngineContext: newId: randomUUID), so
// query by `_id` with the raw wire id — no ObjectId coercion.
function toId(id) {
  return String(id);
}

export const workflowTest = base.extend({
  // Depends on `page` (so ldf.user() session cookies apply via page.request)
  // and `mdb` (for reads + the seed-state write).
  workflow: async ({ page, mdb }, use) => {
    // Shared POST helper. POSTs via the authenticated Playwright context, parses
    // the JSON envelope, and throws on non-2xx OR `body.success === false` with
    // the body's error message — UNLESS `{ expectError: true }` is passed, in
    // which case it returns `{ error, status, success }` for the caller to
    // assert (access-verb / close-rejection specs assert rejections).
    async function post(endpointId, payload, { expectError = false } = {}) {
      const res = await page.request.post(ENDPOINT_BASE + endpointId, {
        data: { blockId: "e2e", pageId: "e2e", payload },
      });
      const body = await res.json();
      if (expectError) {
        return {
          error: body.error,
          status: body.status,
          success: body.success,
        };
      }
      if (!res.ok() || body.success === false) {
        const message =
          (body.error && (body.error.message || body.error)) ||
          `endpoint ${endpointId} failed (HTTP ${res.status()})`;
        throw new Error(
          `workflow POST ${endpointId} failed: ${
            typeof message === "string" ? message : JSON.stringify(message)
          }`,
        );
      }
      return body.response;
    }

    // Resolve a workflow doc's type from its _id (used to build the per-workflow
    // endpoint id for cancel/close).
    async function workflowTypeOf(workflowId) {
      const wf = await mdb
        .collection("workflows")
        .findOne({ _id: toId(workflowId) });
      if (!wf) {
        throw new Error(
          `workflow: no workflow doc for workflow_id ${workflowId}`,
        );
      }
      return wf.workflow_type;
    }

    // Derive the per-WORKFLOW submit endpoint id from only an action_id (Part 48
    // D5): read the action doc → workflow_id → read the workflow doc →
    // workflow_type → `workflows/${workflow_type}-submit`. The submit endpoint is
    // per-workflow, not per-action — the action is identified by `action_id` in
    // the payload (the handler re-slices `hooks` by the loaded action's type).
    async function submitEndpointId(actionId) {
      const action = await mdb
        .collection("actions")
        .findOne({ _id: toId(actionId) });
      if (!action) {
        throw new Error(
          `workflow.submit: no action doc for action_id ${actionId}`,
        );
      }
      const workflow_type = await workflowTypeOf(action.workflow_id);
      return `workflows/${workflow_type}-submit`;
    }

    const workflow = {
      // ── Operational endpoints ──────────────────────────────────────────────

      // POSTs the per-workflow start endpoint `workflows/{workflow_type}-start`
      // (Part 48 D5). Returns the parsed `response`: { workflow_id, action_ids,
      // event_id }. `action_ids` is an ARRAY of UUID strings
      // (commitPlan.js: plan.actions.map((a) => a.doc._id)), NOT a map keyed by
      // action type — handle it as an array at call sites. `overrides` may carry
      // actions / references / metadata / parent_action_id.
      //
      // `workflow_type` is also kept in the payload: Part 48 bakes the type into
      // the endpoint at build, so a passthrough is harmless if ignored and
      // correct if the handler still reads it.
      async start({
        workflow_type,
        entity_id,
        entity_collection = "things-collection",
        ...overrides
      } = {}) {
        const payload = {
          workflow_type,
          entity_id,
          entity_collection,
          ...overrides,
        };
        return post(`workflows/${workflow_type}-start`, payload);
      },

      // POSTs the derived per-workflow submit endpoint. `signal` is the wire
      // field (part 38) — there is no interaction / target_status / force.
      async submit(
        action_id,
        {
          signal,
          fields,
          form,
          form_review,
          comment,
          current_key,
          metadata,
        } = {},
        options = {},
      ) {
        const endpointId = await submitEndpointId(action_id);
        const payload = {
          action_id,
          signal,
          fields,
          form,
          form_review,
          comment,
          current_key,
          metadata,
        };
        return post(endpointId, payload, options);
      },

      // POSTs the per-workflow cancel endpoint `workflows/{workflow_type}-cancel`
      // (Part 48 D5); workflow_type is resolved from the workflow doc. Payload:
      // workflow_id + reason.
      async cancel(workflow_id, { reason } = {}, options = {}) {
        const workflow_type = await workflowTypeOf(workflow_id);
        return post(
          `workflows/${workflow_type}-cancel`,
          { workflow_id, reason },
          options,
        );
      },

      // POSTs the per-workflow close endpoint `workflows/{workflow_type}-close`
      // (Part 48 D5); workflow_type is resolved from the workflow doc. Payload:
      // workflow_id.
      async close(workflow_id, options = {}) {
        const workflow_type = await workflowTypeOf(workflow_id);
        return post(
          `workflows/${workflow_type}-close`,
          { workflow_id },
          options,
        );
      },

      // ── Operational read endpoints (Part 19) ───────────────────────────────
      // Static module-scoped Apis (manifest `api:`), so their endpoint ids are
      // `workflows/{id}` — not per-workflow. Each returns its documented
      // `:return:` shape; the operational-lifecycle cluster asserts the
      // load-bearing keys.

      // GET-style read over POST (the Lowdefy endpoint envelope is always POST):
      // returns { workflows: [...] } for an entity.
      async getEntityWorkflows({
        entity_id,
        entity_collection = "things-collection",
      }) {
        return post("workflows/get-entity-workflows", {
          entity_id,
          entity_collection,
        });
      },

      // Returns { workflow, groups } for a workflow_id.
      async getWorkflowOverview(workflow_id) {
        return post("workflows/get-workflow-overview", { workflow_id });
      },

      // Returns { workflow, group, actions } for a workflow_id + group_id.
      async getActionGroupOverview(workflow_id, group_id) {
        return post("workflows/get-action-group-overview", {
          workflow_id,
          group_id,
        });
      },

      // ── Assertion helpers (poll the engine collections via mdb) ────────────
      // expect.poll because UI-triggered writes land asynchronously.

      // Poll the `workflows` doc and assert expect.objectContaining(expected)
      // against the whole doc (use for summary fields { done, not_required,
      // total } or any top-level workflow field).
      async assertSummary(workflow_id, expected) {
        await expect
          .poll(
            () =>
              mdb.collection("workflows").findOne({ _id: toId(workflow_id) }),
            { timeout: 10_000 },
          )
          .toEqual(expect.objectContaining(expected));
      },

      // Poll the `workflows` doc's group-status field and assert against it.
      // The workflow doc field is `groups`: an array of
      // { id, status, summary: { done, not_required, total } }
      // (recomputeGroups.js / deriveGroupStatus.js). `expected` is matched with
      // expect.objectContaining, so pass e.g. { groups: [...] } or a partial.
      async assertGroups(workflow_id, expected) {
        await expect
          .poll(
            () =>
              mdb.collection("workflows").findOne({ _id: toId(workflow_id) }),
            { timeout: 10_000 },
          )
          .toEqual(expect.objectContaining(expected));
      },

      // Poll the `actions` doc. If `expected` is a string, match
      // status[0].stage; if an object, expect.objectContaining against the doc.
      async assertStatus(action_id, expected) {
        if (typeof expected === "string") {
          await expect
            .poll(
              async () => {
                const doc = await mdb
                  .collection("actions")
                  .findOne({ _id: toId(action_id) });
                return doc?.status?.[0]?.stage;
              },
              { timeout: 10_000 },
            )
            .toBe(expected);
          return;
        }
        await expect
          .poll(
            () => mdb.collection("actions").findOne({ _id: toId(action_id) }),
            { timeout: 10_000 },
          )
          .toEqual(expect.objectContaining(expected));
      },

      // ── Seed-state helper ──────────────────────────────────────────────────
      // Deliberate thin seed-state write (the tail technique): place an action
      // doc at a source stage via a direct mdb write, then fire the real signal
      // through the real endpoint. This is NOT a backdoor into the engine — it
      // is a fixture pre-condition only, mutating the same status[0].stage shape
      // the engine writes (status is an array; status[0] is current).
      async setStage(action_id, stage) {
        await mdb
          .collection("actions")
          .updateOne(
            { _id: toId(action_id) },
            { $set: { "status.0.stage": stage } },
          );
      },
    };

    await use(workflow);
  },
});

export { expect } from "@playwright/test";
