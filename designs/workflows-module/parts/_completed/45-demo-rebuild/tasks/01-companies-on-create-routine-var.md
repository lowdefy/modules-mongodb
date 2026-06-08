# Task 1: Companies module `on_create_routine` var

## Context

The demo needs app-specific behavior after a company is created (start a `company-setup` workflow, log a `convert-lead` event). Per design D4, the extension point is a **routine var spliced into the `create-company` API**, not actions injected into the new page's save button: server-side placement makes company insert + workflow start one API invocation and covers every create path through the API.

`modules/companies/api/create-company.yaml` already composes its routine with `_build.array.concat` and already carries a consumer extension in exactly this shape (`request_stages.write`, the second concat segment). Today the concat has three segments:

1. the `insert` step (`MongoDBInsertConsecutiveId`),
2. the `_build.if`-guarded `apply-write-stages` step (emits `[]` when `request_stages.write` is empty),
3. `link-contacts` + `new-event` + `:return:`.

This task adds an `on_create_routine` var (array of API routine steps, default `[]`) concatenated **after** the insert/link/event steps and **before** the `:return:`, and forwards the new page's URL query to the API so injected steps can read start-link sentinel params (`action_id`, `entity_id`) server-side.

This task touches only `modules/companies/` — no workflows-engine dependency; it can land before Parts 38/43/44 complete.

## Task

1. **`modules/companies/module.lowdefy.yaml`** — add the var to the `vars:` schema (manifest is the source of truth for var schema; every var carries `description:`, `type:`, `default:`):

   ```yaml
   on_create_routine:
     type: array
     default: []
     description: >
       API routine steps appended to the create-company routine after the
       insert, contact-link, and event steps, before the :return:. Steps run
       server-side with the routine's context: `_step: insert.insertedId` is
       the new company's id, and the request payload is readable via
       `_payload`, including the reserved `url_query` key — the new page
       forwards its full URL query under `url_query`, which is how
       start-link params reach the server.
   ```

2. **`modules/companies/api/create-company.yaml`** — split the third concat segment so the var lands before the `:return:`:
   - Third segment now ends at the `new-event` step (`link-contacts` + `new-event`).
   - New fourth segment: `_module.var: on_create_routine` (the var itself is the segment — it's already an array of steps).
   - New fifth segment: `- :return:` (the existing return, moved verbatim).

   Plain concatenation — the var defaults to `[]`, so **no `_build.if` guard** (the existing `request_stages.write` guard skips its *wrapper step*, not the concat; an empty array concatenates to nothing).

3. **`modules/companies/pages/new.yaml`** — the save button's `create_company` CallAPI payload (`_build.object.assign`, first object) gains:

   ```yaml
   url_query:
     _url_query: true
   ```

   This forwards the page's URL query wholesale under the reserved `url_query` key.

4. **`modules/companies/README.md`** — add `on_create_routine` to the Vars section, restating the manifest contract in narrative form: steps run after the company exists; may read `_step: insert.insertedId` and the request payload including the reserved `url_query` key (the new page forwards its URL query); default `[]` is a no-op.

## Acceptance Criteria

- Manifest var carries `type`, `default`, `description`.
- `create-company.yaml`'s routine concat has the new segment order: insert → write-stages guard → link-contacts + new-event → `on_create_routine` → `:return:`. With the var unset, the built routine is behaviorally identical to today's.
- `new.yaml`'s create payload includes `url_query: { _url_query: true }`.
- README Vars section documents the contract.
- The demo app build does not break on the companies module (`pnpm build` in `apps/demo`, or the repo's standard demo build check). Note: at this point in the sequence the demo build may still fail on the *workflows* config (see tasks.md Prerequisites) — the check here is that no **new** companies-module error appears.

## Files

- `modules/companies/module.lowdefy.yaml` — modify — add `on_create_routine` var schema
- `modules/companies/api/create-company.yaml` — modify — segment split + concat the var before `:return:`
- `modules/companies/pages/new.yaml` — modify — forward `url_query` in the save payload
- `modules/companies/README.md` — modify — document the var

## Notes

- Update the manifest first, then the README (repo rule: manifest wins on disagreement).
- Do not add a `skip:`/guard variant or per-step conditionality to the var contract — conditional logic belongs inside the injected steps (the demo's `:if` step in task 5 shows how).
