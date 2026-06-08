# Task 5: Company-side demo wiring — `on_create_routine` steps, workflows panel slot, `entities` entry

## Context

Task 1 gave the companies module an `on_create_routine` var (routine steps spliced into `create-company` before the `:return:`; the new page forwards its URL query under the reserved `url_query` payload key). Task 2 authored the `company-setup` workflow. This task wires the demo app's side:

- **Every** new company gets a `company-setup` workflow (design D3): the injected steps call the workflows `start-workflow` endpoint unconditionally, with `parent_action_id` from `url_query.action_id` — absent when the page wasn't reached via the onboarding tracker's start link; `StartWorkflow` already treats that as "no parent". Conversion-from-lead is the *linked special case*, not a separate path: a `convert-lead` event is logged behind a routine `:if` on `url_query.entity_id`.
- The workflows panel is slotted into the companies **view** page via the module's existing `components.sidebar_slots`/`main_slots` var (design D5) — newly possible because the entry-vars cross-module-`_ref` limitation recorded at `apps/demo/modules/companies/vars.yaml:29-46` was fixed by the deferred two-phase entry-vars resolve (lowdefy `22d4e60`, present in the pinned build). The stale limitation comment is removed.
- The workflows module's `entities` var gains a `companies-collection` entry so workflow pages' entity back-links resolve for the child workflow. Module page ids are entry-scoped as `{entryId}/{pageId}` — verified against the demo build output: `build/pages/companies/view`.

Cross-module operators (`_module.endpointId: { module: ... }`, `_ref: { module: ... }`) inside entry vars resolve at app level — this is the proven `CallApi`-from-API-routine pattern `create-company` itself uses for events.

## Task

### 1. `apps/demo/modules/companies/vars.yaml`

Add the injected subroutine (design sketch, verbatim intent):

```yaml
on_create_routine:
  - id: start_company_setup
    type: CallApi
    properties:
      endpointId:
        _module.endpointId: { id: start-workflow, module: workflows }
      payload:
        workflow_type: company-setup
        entity_id:
          _step: insert.insertedId
        entity_collection: companies-collection
        parent_action_id:
          _payload: url_query.action_id
  - ":if":
      _ne:
        - _payload: url_query.entity_id
        - null
    ":then":
      - id: log_convert_lead
        type: CallApi
        properties:
          endpointId:
            _module.endpointId: { id: new-event, module: events }
          payload:
            type: convert-lead
            display:
              demo:
                title: Lead converted to customer.
            references:
              lead_ids:
                - _payload: url_query.entity_id
              company_ids:
                - _step: insert.insertedId
```

Add the workflows panel slot wiring under `components:` — the same cross-module `_ref { module: workflows, component: actions-on-entity }` shape `lead-view.yaml` uses inline, wrapped in a layout card, e.g.:

```yaml
components:
  sidebar_slots:
    - _ref:
        module: layout
        component: card
        vars:
          title: Workflows
          blocks:
            - _ref:
                module: workflows
                component: actions-on-entity
                vars:
                  entity_id:
                    _url_query: _id
                  entity_collection: companies-collection
```

(`sidebar_slots` mirrors lead-view's narrow workflows column; `main_slots` is equally valid per the design — pick whichever renders better on the view page, but slot it via the var, not inline in the module page.)

Remove the stale entry-vars limitation comment block (current lines 29–46, the `# Slot wiring for activities tile...` comment and the commented-out `components:` example).

### 2. `apps/demo/modules/workflows/vars.yaml`

`entities` gains the companies entry alongside the existing leads one:

```yaml
entities:
  leads-collection:
    page_id: lead-view
    id_query_key: _id
    title: Lead
  companies-collection:
    page_id: companies/view
    id_query_key: _id
    title: Company
```

(`vars.entities` is consumed by `workflow-overview.yaml` / `group-overview.yaml` for the entity back-link — not by the engine's link computation.)

## Acceptance Criteria

- Saving a company on `companies/new` (reached *without* URL params) creates the company **and** a `company-setup` workflow on it with no parent link and no `convert-lead` event.
- Saving a company on `companies/new?action_id=<tracker_id>&entity_id=<lead_id>` additionally links the child to the tracker (tracker flips `in-progress`) and logs a `convert-lead` event referencing both the lead and the company.
- `companies/view` renders the slotted workflows panel showing `company-setup` with its full scope.
- The workflows module's overview pages back-link "Company" to `companies/view?_id=...` for child workflows.
- The stale limitation comment is gone from `apps/demo/modules/companies/vars.yaml`.
- Demo app builds (this is also the verification that cross-module refs in entry vars resolve — if the build fails on the `_ref { module: ... }` in `components.sidebar_slots`, the pinned `@lowdefy/build` predates `22d4e60` and that must be surfaced, not worked around with a bridging API).

## Files

- `apps/demo/modules/companies/vars.yaml` — modify — `on_create_routine` steps + `components.sidebar_slots` wiring + remove stale comment
- `apps/demo/modules/workflows/vars.yaml` — modify — `entities.companies-collection` entry

## Notes

- No `skip:` gating on `start_company_setup` — the workflow starts for **every** company (design D3). Only the `convert-lead` event is conditional, via the routine `:if` control (`controlIf.js`).
- Re-slotting the companies view page's inlined activities tile is explicitly out of scope (design non-goal) — leave it inlined.
- No prefill of `companies/new` from lead data — the `entity_id` sentinel feeds the convert event only (design non-goal).
