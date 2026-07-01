# Task 4: Lead-side demo wiring — `leads-create` starts onboarding, `lead-view` cleanup, delete the raw-insert API

## Context

The new onboarding workflow is **started by the `leads-create` API routine, not a button** — the workflow exists, fully populated, from lead birth. That makes `lead-view`'s "Start onboarding" button obsolete, and the rebuild (task 3) already deleted the installation child workflow the page's admin close/cancel buttons and `installation_child_id` JS were built around. The `onboarding-spawn-proof-of-installation-actions` API was a raw-insert engine bypass (MongoDBInsertMany directly into the actions collection) serving the deleted `proof-of-installation` action — it goes too.

Current state:

- `apps/demo/api/leads-create.yaml` — routine: `insert` (MongoDBInsertOne into `leads-collection`, doc `_id`/`name`/`email` from payload) → `log_lead_created` (CallApi → events `new-event`, type `create-lead`) → `:return:`.
- `apps/demo/pages/leads/lead-view.yaml` — carries the `start_onboarding_btn` block (lines ~89–162), an onMount `compute_installation_child_id` SetState with inline `_js` (lines ~29–44), and a whole `workflows_section` Box with the two `[admin]` close/cancel-child buttons, each with its own `installation_child_id` recompute JS (lines ~211–336).
- `apps/demo/lowdefy.yaml` — `apis:` includes `- _ref: api/onboarding-spawn-proof-of-installation-actions.yaml` (line ~122).

## Task

1. **`apps/demo/api/leads-create.yaml`** — add a `CallApi` step that starts onboarding, after the insert (place it after `log_lead_created` so the `create-lead` event precedes the workflow's events, and before `:return:`):

   ```yaml
   - id: start_onboarding
     type: CallApi
     properties:
       endpointId:
         _module.endpointId:
           id: start-workflow
           module: workflows
       payload:
         workflow_type: onboarding
         entity_id:
           _payload: _id
         entity_collection: leads-collection
   ```

   (Match the `CallApi` + `properties:` shape of the existing `log_lead_created` step. `entity_id` uses `_payload: _id` — the same source the insert and the event references use.)

2. **`apps/demo/pages/leads/lead-view.yaml`** — remove:
   - the `start_onboarding_btn` block (button + its onClick chain incl. the `start`/`log_onboarding_started`/`refetch_events` steps, the `entity-workflows-refetch` ref, and the `recompute_installation_child_id` step);
   - the onMount `compute_installation_child_id` SetState action;
   - the entire `workflows_section` Box (both `[admin]` buttons and their action chains).

   **Keep:** the `actions-on-entity` workflows panel ref, the lead-information card, and the events timeline. The workflows card body Box that wrapped panel + button can collapse to just the panel ref if nothing else remains.

3. **Delete `apps/demo/api/onboarding-spawn-proof-of-installation-actions.yaml`** and remove its `_ref` entry from the `apis:` section of `apps/demo/lowdefy.yaml`.

## Acceptance Criteria

- Creating a lead through the demo's lead-new flow inserts the doc, logs `create-lead`, **and** starts an `onboarding` workflow on it — `lead-view` then renders four groups and five rows (qualify actionable, the rest blocked with their `status_map.blocked` messages) with no button click.
- `lead-view.yaml` contains no reference to `installation_child_id`, `start-workflow`, `close-workflow`, or `cancel-workflow`; the workflows panel and events timeline still render.
- `onboarding-spawn-proof-of-installation-actions` exists nowhere in the repo (file + `apis:` ref + any other references — grep to confirm).
- Demo app builds.

## Notes

- Audit state refs when removing blocks (repo rule): `installation_child_id` and `entity_workflows` reads — `entity_workflows` is still written by the `actions-on-entity` component's own machinery, so only the references inside the removed blocks should disappear; confirm no surviving block reads `installation_child_id`.
- No admin-only escape hatches are re-added anywhere in the path (design: "No admin-only escape hatches anywhere in the path"). Cancel/close flows are Part 22 territory.
