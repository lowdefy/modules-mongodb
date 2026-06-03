# Task 2: Author the `company-setup` workflow config

## Context

The demo gains a second workflow: **`company-setup`** on `companies-collection` — one group, three actions — started by the `create-company` API routine for *every* new company (design D3), and linked to the onboarding tracker when creation was reached via the tracker's start link. From the demo story:

```
company-setup (on company — started by the create-company routine)
└── setup  "Setup"
    ├── billing-details (form)                  action-required at start
    │     billing email, VAT number
    ├── assign-account-manager (check)          action-required at start
    └── kickoff-call (check)                    blocked_by [assign-account-manager]
```

Authoring follows the post-rebuild grammar: `kind: check` actions (Part 43) are single-purpose rows served by the shared `action-*` pages — no form block, no per-action pages. Per design D1, `starting_actions` lists **every standard action** — entry actions at `action-required`, downstream at `blocked` — so the workflow shows its full scope the moment it starts. There are no conditional actions in this workflow.

`entity_ref_key` is **required** on workflow configs (Part 38 task 21; `makeWorkflowsConfig.js` hard-errors without it). Use `company_ids`, matching the event-references key the `convert-lead` event and the companies module's own `create-company` event already use.

## Task

Create `apps/demo/modules/workflows/workflow_config/company-setup/` with four files.

**`company-setup.yaml`:**

```yaml
type: company-setup
title: Company setup
entity_collection: companies-collection
entity_ref_key: company_ids
display_order: 2

starting_actions:
  - type: billing-details
    status: action-required
  - type: assign-account-manager
    status: action-required
  - type: kickoff-call
    status: blocked

action_groups:
  - id: setup
    title: Setup
    icon: AiOutlineSetting

actions:
  - _ref: modules/workflows/workflow_config/company-setup/billing-details.yaml
  - _ref: modules/workflows/workflow_config/company-setup/assign-account-manager.yaml
  - _ref: modules/workflows/workflow_config/company-setup/kickoff-call.yaml
```

(Match the `_ref` path style the existing config files use — relative to the demo app root, as `workflows.yaml` does today.)

**`billing-details.yaml`** — `kind: form`, group `setup`, `sort_order: 10`, access `demo: { view: true, edit: true }` (per-verb map — Part 34 grammar; `true` = no role gate). Form fields:

- `form.billing_email` — `text_input`, title "Billing email", required
- `form.vat_number` — `text_input`, title "VAT number"

(Form keys are full state paths including the `form.` prefix — field components bind block id verbatim from the key, and the edit template primes/submits the `form` state subtree.)

Status map (per-slug `message` cells for the stages the action passes through), e.g.:

```yaml
status_map:
  action-required:
    demo:
      message: Capture the company's billing details.
  in-progress:
    demo:
      message: Billing details in progress.
  done:
    demo:
      message: Billing details captured.
```

**`assign-account-manager.yaml`** — `kind: check`, group `setup`, `sort_order: 20`, same access shape, description "Assign an account manager to the company." Status-map messages for `action-required` / `done` (e.g. "Assign an account manager." / "Account manager assigned.").

**`kickoff-call.yaml`** — `kind: check`, group `setup`, `sort_order: 30`, `blocked_by: [assign-account-manager]`, same access shape, description for the kickoff call. Status-map messages including `blocked` (e.g. "Awaiting account manager.") and `action-required` / `done`.

Do **not** add `workflows.yaml` wiring here — the old `onboarding`/`installation` configs still occupy it and fail the post-38 access validator; task 3 rewrites `workflows.yaml` to reference both new configs and is where build validation goes green.

## Acceptance Criteria

- Four files exist under `workflow_config/company-setup/` matching the structure above.
- Grammar is post-rebuild throughout: per-verb access maps (`view: true, edit: true` — no shorthand verb lists, no top-level `roles:`), `kind: check` (not `simple`), no `link:` cells in `status_map` (engine computes links), no hooks (none needed here).
- `starting_actions` lists all three actions — the two entry actions at `action-required`, `kickoff-call` at `blocked` — exercising the D1 convention.
- `kickoff-call` is the only action carrying `blocked_by`, targeting the action type `assign-account-manager`.
- `entity_ref_key: company_ids` present.
- Validation is deferred to task 3 (these files are unreferenced until then); if a standalone check is wanted, a temporary local run of the config through `makeWorkflowsConfig` may be used but is not required.

## Files

- `apps/demo/modules/workflows/workflow_config/company-setup/company-setup.yaml` — create
- `apps/demo/modules/workflows/workflow_config/company-setup/billing-details.yaml` — create
- `apps/demo/modules/workflows/workflow_config/company-setup/assign-account-manager.yaml` — create
- `apps/demo/modules/workflows/workflow_config/company-setup/kickoff-call.yaml` — create

## Notes

- Keep it lean (design D6): no keyed actions, no hooks, no `event_overrides`, no review verbs in this workflow. The review cycle lives on onboarding's `send-quote` only.
- Field component names come from `modules/workflows/components/fields/README.md` (`text_input` is the right component for both fields; emails don't have a dedicated component).
- Choose icons from the AiOutline/GrDocument sets the existing config uses; `AiOutlineSetting` is a suggestion, not a contract.
