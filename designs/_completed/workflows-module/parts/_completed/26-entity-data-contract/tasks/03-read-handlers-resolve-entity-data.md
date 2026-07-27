# Task 3: Read handlers call `entity.data` via `callApi` and surface the result

## Context

Three single-workflow read handlers must resolve entity data server-side from the
`{type}-entity-data` endpoint (Task 2), carried as `wfConfig.entity.data_endpoint` (Task 1):

- `plugins/.../WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`
- `plugins/.../WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js`
- `plugins/.../WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js`

`GetEntityWorkflows` is **unchanged** — the entity hub runs on the entity's own page and no
consumer reads a per-workflow instance name there.

Each handler already resolves `wfConfig = workflowsConfig.find(wc => wc.type === doc.workflow_type)`
and builds `entity_link` from `wfConfig.entity` (see `GetWorkflowAction.js:153-242`,
`GetWorkflowOverview.js:197-206`, `GetWorkflowActionGroupOverview.js:157-166`). The engine context
already threads `callApi` into every handler (`createEngineContext.js`), and the shipped contract
is `callApi({ endpointId, payload })` (see `SubmitWorkflowAction/dispatchNotifications.js:22-27`).

The module owns two keys on the result: it **reads `name`** (instance display name → chrome) and,
for `GetWorkflowAction` only, **injects `id`** last so the always-present entity instance id wins
over any host-returned `id`.

## Task

1. **Add a shared helper** `resolveEntityData(context, wfConfig, entityId)` (place it under
   `plugins/.../WorkflowAPI/shared/` next to the other shared helpers; pick the existing shared
   location used by these handlers). Behavior:

   ```js
   // Returns the routine result object, or null. Never throws — a missing endpoint,
   // a throwing routine, or a deleted entity degrades to null (logged).
   async function resolveEntityData(context, wfConfig, entityId) {
     const endpointId = wfConfig?.entity?.data_endpoint;
     if (!endpointId) return null;
     try {
       return await context.callApi({
         endpointId,
         payload: { entity_id: entityId },
       });
     } catch (err) {
       context.logger?.error?.(/* ... */); // log; do not rethrow
       return null;
     }
   }
   ```

   - `data_endpoint` is the pre-scoped opaque string from Task 1; pass it to `callApi` verbatim.
   - Payload is `{ entity_id }` only.
   - Match whatever logging facility the other handlers use for the "log on failure" requirement.

2. **`GetWorkflowAction.js`** (`:231-294`):
   - Call `const data = await resolveEntityData(context, wfConfig, action.entity?.id);`
   - Lift `name` onto the link: `entity_link.name = data?.name ?? null;` (set after `entity_link`
     is built, only when `entity_link` is non-null).
   - Change the returned `entity` field from `{ connection_id, id }` to the merged object,
     injecting `id` **last** and dropping the dead `connection_id` subfield:
     ```js
     entity: { ...(data ?? {}), id: action.entity?.id ?? null },
     ```
     (No separate `entity_data` key.)

3. **`GetWorkflowOverview.js`** (`:197-213`) and **`GetWorkflowActionGroupOverview.js`**
   (`:157-173`):
   - Call `const data = await resolveEntityData(context, wfConfig, wfDoc.entity.id);`
   - Lift `name`: when `entity_link` is non-null, set `entity_link.name = data?.name ?? null;`.
   - Do **not** return an `entity` object (overview pages have no slot/form). The only change is
     `entity_link.name`.

4. Update the three `*.test.js` files:
   - `GetWorkflowAction.test.js`: with a stubbed `callApi` returning `{ name, email, status }`,
     the response has `entity_link.name === name` and `entity` deep-equals `{ email, status, id }`
     (id last / wins); with no `data_endpoint`, `entity_link.name === null` and `entity === { id }`;
     a host-returned `id` is overridden by the instance id; a throwing `callApi` degrades to
     `name: null` / `entity === { id }` and does not fail the read.
   - The two overview tests: `entity_link.name` is lifted from the stubbed `callApi`; no `entity`
     object is added; no `callApi` fires when `data_endpoint` is absent.

## Acceptance Criteria

- Exactly **one** `callApi({ endpointId, payload: { entity_id } })` per read when `data_endpoint`
  is set; **zero** calls when it is absent.
- `GetWorkflowAction` returns `entity: { ...routineResult, id }` with `id` always winning; the dead
  `connection_id` subfield is gone; no `entity_data` key.
- All three handlers lift `name` onto `entity_link.name` (falling back to `null`).
- A throwing routine / missing endpoint / deleted entity never fails the read; `name` falls to
  `null`, `entity` reduces to `{ id }`, the failure is logged.
- `GetEntityWorkflows` is untouched.
- `pnpm jest plugins/modules-mongodb-plugins/src/connections/WorkflowAPI` passes.

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/shared/resolveEntityData.js` —
  create — the shared `callApi` wrapper (adjust path to the existing shared helpers dir).
- `plugins/.../WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify — call helper, lift
  `name`, return merged `entity` object (id last), drop `connection_id` subfield.
- `plugins/.../WorkflowAPI/GetWorkflowOverview/GetWorkflowOverview.js` — modify — call helper, lift
  `name` onto `entity_link`.
- `plugins/.../WorkflowAPI/GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js` —
  modify — call helper, lift `name` onto `entity_link`.
- The three corresponding `*.test.js` — modify — add the cases above.

## Notes

- `callApi` runs the routine as the same authenticated user with the engine's depth-10 recursion
  guard — no extra guarding needed here.
- Keep the helper signature `(context, wfConfig, entityId)` so all three call sites are uniform.
