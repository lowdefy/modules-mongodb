# Task 3: Rewrite the `onboarding` config, delete `installation`, rewire `workflows.yaml`

## Context

The old demo config — `onboarding` (qualify → send-quote/schedule-followup → proof-of-installation/track-installation, old grammar, hook files under `hooks/`) and the placeholder `installation` child — is **deleted, not migrated**. The new `onboarding` workflow is four groups, five standard actions plus one conditional:

```
onboarding (on lead — started by leads-create)
├── qualification  "Qualify"
│   └── qualify (form)                          action-required at start
│         contact name, notes, site visit needed? (yes_no_selector)
│         pre-submit hook: site visit needed → spawn site-visit (upsert)
├── quoting  "Quote"
│   ├── site-visit (check)                      CONDITIONAL — hook-spawned, not in starting_actions
│   ├── send-quote (form + review)              blocked_by [qualify]
│   └── schedule-followup (check)               blocked_by [qualify]
├── order  "Purchase order"
│   └── upload-po (form)                        blocked_by [quoting]  (group target)
└── conversion  "Convert to customer"
    └── track-company-setup (tracker)           blocked_by [upload-po]
          start_link → companies/new (action_id + entity_id sentinels)
```

Two conventions this config canonically demonstrates (design D1/D2):

- **`starting_actions` lists every standard action** — entry at `action-required`, downstream at `blocked`. Conditional actions (`site-visit`) are excluded; the qualify pre-submit hook spawns them with `upsert: true`.
- **Conditional actions are never `blocked_by` targets** — a `blocked_by` entry naming a type with zero docs resolves _unsatisfied_ forever (`planAutoUnblock.js`). Downstream gating on conditional work goes through a **group target**: `upload-po` is `blocked_by: [quoting]` (group id), so a spawned site visit holds the Purchase-order phase until checked off, while a lead with no visit sails through.

Task 2 has already created the `company-setup` config this workflow's tracker points at.

## Task

### 1. Delete the old config

- `apps/demo/modules/workflows/workflow_config/installation/` — entire folder (`installation.yaml`, `install-step.yaml`).
- Under `apps/demo/modules/workflows/workflow_config/onboarding/`: delete `proof-of-installation.yaml`, `track-installation.yaml`, and the whole `hooks/` folder (`qualify-pre-submit.yaml`, `send-quote-pre-submit.yaml`, `send-quote-post-approve.yaml`). The send-quote pre/post hooks are not replaced — engine events + notifications cover their logging. The only hook in the new config is the qualify pre-submit spawn, authored inline.

### 2. Author the new onboarding files

**`onboarding/onboarding.yaml`** (rewrite):

```yaml
type: onboarding
title: Onboarding
entity_collection: leads-collection
entity_ref_key: lead_ids
display_order: 1

starting_actions:
  - type: qualify
    status: action-required
  - type: send-quote
    status: blocked
  - type: schedule-followup
    status: blocked
  - type: upload-po
    status: blocked
  - type: track-company-setup
    status: blocked
  # site-visit is deliberately absent — conditional, spawned by the
  # qualify pre-submit hook when the user flags a site visit.

# No blocked_by on groups — groups are blocked_by *targets* (an action's
# blocked_by entry may name a group id), never carriers; the engine reads
# blocked_by only on actions. Sequencing lives on the actions below.
action_groups:
  - id: qualification
    title: Qualify
    icon: AiOutlineUserAdd
  - id: quoting
    title: Quote
    icon: GrDocumentText
  - id: order
    title: Purchase order
    icon: AiOutlineFileDone
  - id: conversion
    title: Convert to customer
    icon: AiOutlineShop

actions:
  - _ref: modules/workflows/workflow_config/onboarding/qualify.yaml
  - _ref: modules/workflows/workflow_config/onboarding/site-visit.yaml
  - _ref: modules/workflows/workflow_config/onboarding/send-quote.yaml
  - _ref: modules/workflows/workflow_config/onboarding/schedule-followup.yaml
  - _ref: modules/workflows/workflow_config/onboarding/upload-po.yaml
  - _ref: modules/workflows/workflow_config/onboarding/track-company-setup.yaml
```

(`entity_ref_key` is required by the validator; `lead_ids` matches the existing config and the singular-entity convention.)

**`qualify.yaml`** (rewrite) — pre-submit hook returns the conditional spawn. Post-38 grammar: hooks are keyed by **signal** (`submit`), spawn entries are `{ type, signal, upsert }`; `signal: activate` creates at `action-required` via the FSM `none` row:

```yaml
type: qualify
kind: form
action_group: qualification
sort_order: 10
description: Confirm the lead's details and capture qualification notes.
access:
  demo:
    view: true
    edit: true
form:
  # Keys are full state paths including the form. prefix — field components
  # bind block id verbatim from the key, and the edit template primes/submits
  # the form state subtree. Hooks receive the values under the payload's
  # form bag (without the prefix): _payload: form.site_visit_required.
  - key: form.contact_name
    component: text_input
    title: Contact name
    required: true
  - key: form.notes
    component: text_area
    title: Qualification notes
  - key: form.site_visit_required
    component: yes_no_selector
    title: Site visit needed?
hooks:
  submit:
    pre:
      routine:
        - :return:
            actions:
              _if:
                test:
                  _eq:
                    - _payload: form.site_visit_required
                    - true
                then:
                  - type: site-visit
                    signal: activate
                    upsert: true
                else: []
status_map:
  action-required:
    demo:
      message: Qualify the lead.
  in-progress:
    demo:
      message: Qualifying the lead.
  done:
    demo:
      message: Lead qualified.
```

**`site-visit.yaml`** (create) — `kind: check`, group `quoting`, `sort_order: 10`, description "Visit the site before quoting.", access `demo: { view: true, edit: true }`. **Never** named in any `blocked_by`, and not in `starting_actions`. Status-map messages for `action-required` / `done` (e.g. "Complete the site visit." / "Site visit completed."). No `blocked` cell needed — it spawns at `action-required` and is never blocked.

**`send-quote.yaml`** (rewrite) — `kind: form`, group `quoting`, `sort_order: 20`, `blocked_by: [qualify]`. Keeps the review cycle: declaring the `review` verb makes `submit` land `in-review` (`hasReview`, `fsm/tables.js`), with **`review: [admin]` as the demo's one role-gated verb**:

```yaml
access:
  demo:
    view: true
    edit: true
    review:
      - admin
```

Form fields: `form.quote_total` (`number`, title "Quote total", required), `form.notes` (`text_area`, title "Quote notes"). No hooks (the old pre/post hook logging is gone). Status-map messages covering `blocked` ("Awaiting qualification."), `action-required`, `in-progress`, `in-review` ("Quote awaiting approval."), `changes-required`, `done`.

**`schedule-followup.yaml`** (rewrite) — `kind: check`, group `quoting`, `sort_order: 30`, `blocked_by: [qualify]`, access `demo: { view: true, edit: true }`. Served by the shared `action-*` pages; no `link:` cells (the old file's link cells die with Part 34/38's engine-computed links). Status-map messages for `blocked` / `action-required` / `done`.

**`upload-po.yaml`** (create) — `kind: form`, group `order`, `sort_order: 10`, **`blocked_by: [quoting]`** — a _group target_: resolves as "the `quoting` group's status is done", counting whatever member docs exist (this is the conditional-safe gate over `site-visit`). Access `demo: { view: true, edit: true }`. Form fields: `form.po_number` (`text_input`, title "PO number", required), `form.po_document` (`file_upload`, title "PO document"). Status-map messages for `blocked` ("Awaiting quote approval."), `action-required`, `in-progress`, `done`.

**`track-company-setup.yaml`** (create) — Part 44 `start_link` with both sentinels:

```yaml
type: track-company-setup
kind: tracker
action_group: conversion
sort_order: 10
blocked_by: [upload-po]
description: Tracks the company-setup workflow on the converted company.
access:
  demo:
    view: true
    edit: true # the start link
tracker:
  workflow_type: company-setup
  start_link:
    pageId:
      _module.pageId: { id: new, module: companies }
    urlQuery:
      action_id: true # → tracker action _id (the parent_action_id)
      entity_id: true # → lead _id (referenced by the convert event)
status_map:
  blocked:
    demo:
      message: Awaiting purchase order.
  action-required:
    demo:
      message: Convert the lead to a customer.
  in-progress:
    demo:
      message: Company setup in progress.
  done:
    demo:
      message: Company setup complete.
  not-required:
    demo:
      message: Conversion skipped.
```

The tracker is seeded `blocked` in `starting_actions` and unblocked by the normal pass (no creation signal needed — Part 38 task 17's Start planner seeds drafts directly at the declared status).

### 3. Rewire `workflows.yaml`

`apps/demo/modules/workflows/workflow_config/workflows.yaml` points at exactly the two new configs:

```yaml
- _ref: modules/workflows/workflow_config/onboarding/onboarding.yaml
- _ref: modules/workflows/workflow_config/company-setup/company-setup.yaml
```

## Acceptance Criteria

- `installation/`, the two old g3 action files, and the `hooks/` folder are gone; no file under `workflow_config/` carries old grammar (shorthand access lists, top-level `roles:` under access, `kind: simple`, interaction-keyed hooks like `submit_edit`, `status_map` `link:` cells, `blocked_by` on groups).
- `onboarding.yaml` matches the sketch: five standard actions in `starting_actions` (qualify at `action-required`, four at `blocked`), `site-visit` absent, four groups without `blocked_by`.
- `site-visit` appears in no `blocked_by` anywhere; `upload-po`'s gate is the group id `quoting`; `track-company-setup`'s gate is the action type `upload-po`.
- `send-quote` is the only action declaring a role-gated verb (`review: [admin]`).
- The only hook in the config is qualify's signal-keyed `submit.pre` returning the conditional `{ type: site-visit, signal: activate, upsert: true }` spawn.
- The demo app builds: config passes `makeWorkflowsConfig` validation (per-verb access maps, `start_link` shape, `entity_ref_key`, hook grammar). This is the commit where the demo build goes green again after the Part 38 task 6 validator window.
- Module tests still pass (`pnpm test` in the workflows module / plugins package — no engine code changes expected, this is config only).

## Files

- `apps/demo/modules/workflows/workflow_config/installation/installation.yaml` — delete
- `apps/demo/modules/workflows/workflow_config/installation/install-step.yaml` — delete
- `apps/demo/modules/workflows/workflow_config/onboarding/hooks/` — delete (all three files)
- `apps/demo/modules/workflows/workflow_config/onboarding/proof-of-installation.yaml` — delete
- `apps/demo/modules/workflows/workflow_config/onboarding/track-installation.yaml` — delete
- `apps/demo/modules/workflows/workflow_config/onboarding/onboarding.yaml` — rewrite
- `apps/demo/modules/workflows/workflow_config/onboarding/qualify.yaml` — rewrite
- `apps/demo/modules/workflows/workflow_config/onboarding/send-quote.yaml` — rewrite
- `apps/demo/modules/workflows/workflow_config/onboarding/schedule-followup.yaml` — rewrite
- `apps/demo/modules/workflows/workflow_config/onboarding/site-visit.yaml` — create
- `apps/demo/modules/workflows/workflow_config/onboarding/upload-po.yaml` — create
- `apps/demo/modules/workflows/workflow_config/onboarding/track-company-setup.yaml` — create
- `apps/demo/modules/workflows/workflow_config/workflows.yaml` — modify — point at `onboarding` + `company-setup`

## Notes

- Deliberately **not** in this config (design D6): keyed action instances, error/`resolve_error` paths, `changes-required` loops as demo content, group `on_complete` routines, hook return-value overrides (`event_overrides`, `message`). Exhaustive coverage is Part 22's test workflow.
- After this task, `lead-view`'s "Start onboarding" button and admin child buttons reference workflow types/flows that changed — they are removed in task 4. Sequence 4 promptly after 3 if the demo needs to stay manually drivable in between.
- The `description:` field on actions: the old files carry it; keep one-line descriptions on every new action.
