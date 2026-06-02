# Demo rebuild — realistic lead-onboarding demo with a cross-entity company-setup child

The demo app's `workflow_config` is rebuilt from scratch as a **realistic demo**: a lead-onboarding workflow any business recognizes (qualify → quote → purchase order → convert to customer), started automatically when the lead is created, with a cross-entity **company-setup** child workflow started from the companies module's own new-company page via the Part 44 tracker `start_link`. The current config (onboarding + placeholder installation child) is deleted, not migrated — it was built as an engine coverage matrix, accumulated a raw-insert engine bypass and an undrivable tracker leg, and its `starting_actions` authoring (only `qualify` listed, nothing spawning the rest) dead-ends the workflow after group 1. Exhaustive functional coverage (keyed actions, error/retry, cancel paths, every FSM transition) is **not** this demo's job — that lands in a dedicated test workflow owned by [Part 22](../_next/22-workflows-e2e-suite/design.md). The new config is authored directly in the post-rebuild grammar (Part 38 signals + signal-keyed hooks, Part 34 per-verb access maps, Part 43 `kind: check` and `action-*` pages, Part 44 `start_link`), making it the canonical authoring example.

## Proposed change

1. **New `onboarding` workflow** on `leads-collection` — four groups, five standard actions plus one conditional. Started by the `leads-create` API routine (not a button): the workflow exists, fully populated, from lead birth.
2. **New `company-setup` workflow** on `companies-collection` — one group, three actions. Started by the `create-company` API routine (see 5–6), linked to the onboarding tracker when creation was reached via the tracker's start link.
3. **`starting_actions` authoring convention**, demonstrated by the config and documented in the workflows README + action-authoring concept doc: *list every standard action that makes up the workflow* — entry actions at `action-required`, everything downstream at `blocked` — so the user sees the workflow's full scope the moment it starts. *Conditional actions* (existence depends on user input) are **not** listed; hooks spawn them with `upsert: true`. No engine change — this is the engine working as designed, used correctly.
4. **Tracker via Part 44 `start_link`** — `track-company-setup` declares `start_link` pointing at the companies module's `new` page with both URL-query sentinels (`action_id`, `entity_id`). No new tracker mechanics beyond [Part 44](../44-tracker-start-link/design.md).
5. **Companies module `on_create_routine` var** — a new manifest var (array of API routine steps, default `[]`) spliced into the `create-company` API routine via its existing `_build.array.concat` composition, after the insert/link/event steps and before the `:return:` — the same consumer-extension idiom the routine already carries for `request_stages.write`. The new page's save payload additionally forwards the page's URL query under a reserved `url_query` key, so injected steps can read start-link params server-side.
6. **Demo `on_create_routine`** — `CallApi` → workflows `start-workflow` (`workflow_type: company-setup`, the new company as entity, `parent_action_id` from `url_query.action_id` — absent when the page wasn't reached via the start link; `StartWorkflow` already treats that as "no parent"), plus a `convert-lead` event referencing lead + company behind an `:if` on `url_query.entity_id`. **Every** new company gets a setup workflow; conversion-from-lead is the linked special case, not a separate path.
7. **Workflows `entities` var** gains a `companies-collection` entry so the workflows pages' entity back-links resolve for the child workflow — `vars.entities` is consumed by `workflow-overview.yaml` / `group-overview.yaml` (the part 20 back-link), not by the engine's link computation.
8. **Demo cleanup** — delete the installation workflow config, the `onboarding-spawn-proof-of-installation-actions` raw-insert API (and its `apis:` ref), the send-quote pre/post hooks (engine events + notifications cover their logging), lead-view's "Start onboarding" button and admin close/cancel-child buttons + `installation_child_id` JS, and the stale `tracker-only-onboarding.spec.js`.
9. **One notification wired** — the demo notifications `send_routine` handles one workflow event type: **`action-approve`** (Part 38's `SubmitWorkflowAction → action-{interaction}` event-type table), filtered to the `send-quote` action type — *every* approve in *any* workflow emits `action-approve`, so the routine branches on both the event type and the action type. The demo's `send_routine` var is currently commented out (`apps/demo/modules/notifications/vars.yaml:5-6`); per the module contract the routine receives `event_ids` in the payload, so it fetches the event doc(s) by id, matches `type == action-approve` + action type `send-quote`, and dispatches the notification — everything else falls through default-ignored, same policy as Part 38 task 20.
10. **Happy-path e2e** replacing the stale spec: lead create → full-scope render → qualify (site visit on) → site-visit check-off → quote → review/approve → PO upload → convert via start link → company-setup → onboarding completes.
11. **Part 38 task 20 is superseded** — its migrate-in-place scope is replaced by this rebuild; its non-config concerns (per-verb `action_allowed` template consumers, lifecycle notification policy) carry over here. Task 20 should be re-pointed at implementing this part's config rather than converting the old one. This extends Part 38's completion gate: the new task 20 lands after Part 38 tasks 1–19 → Part 43 (`kind: check` + `action-*` pages) → Part 44 (`start_link`) → this part — the supersession note in `tasks/20-demo-migration.md` must state that chain so an implementer picking it up from Part 38's task list knows two other parts land first.

## The demo story

```
onboarding (on lead — started by leads-create)
├── qualification  "Qualify"
│   └── qualify (form)                          action-required at start
│         contact name, notes, site visit needed? (yes_no_selector)
│         pre-submit hook: site visit needed → spawn site-visit (upsert)
├── quoting  "Quote"
│   ├── site-visit (check)                      CONDITIONAL — hook-spawned, not in starting_actions
│   ├── send-quote (form + review)              blocked_by [qualify]
│   │     quote total, notes; review verb → submit lands in-review; admin approves
│   └── schedule-followup (check)               blocked_by [qualify]
├── order  "Purchase order"
│   └── upload-po (form)                        blocked_by [quoting]  (group target)
│         PO number, PO document (file_upload)
└── conversion  "Convert to customer"
    └── track-company-setup (tracker)           blocked_by [upload-po]
          start_link → companies/new (action_id + entity_id sentinels)
          mirrors company-setup: active → in-progress, completed → done

company-setup (on company — started by the create-company routine)
└── setup  "Setup"
    ├── billing-details (form)                  action-required at start
    │     billing email, VAT number
    ├── assign-account-manager (check)          action-required at start
    └── kickoff-call (check)                    blocked_by [assign-account-manager]
```

Happy-path narrative: a lead is created and onboarding appears on `lead-view` showing all four groups up front. The user qualifies the lead (flagging that a site visit is needed — a `site-visit` check appears in the Quote group), builds the quote, an admin reviews and approves it, the customer's purchase order is uploaded, and the tracker row "Convert to customer" becomes a live link to the new-company page. Saving the company starts `company-setup` on the company and flips the tracker `in-progress`; when billing details, account manager, and kickoff call are done, the child completes, the tracker mirrors `done`, and onboarding completes. No admin-only escape hatches anywhere in the path.

## Authoring sketches

`onboarding/onboarding.yaml`:

```yaml
type: onboarding
title: Onboarding
entity_collection: leads-collection
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
  - _ref: .../onboarding/qualify.yaml
  - _ref: .../onboarding/site-visit.yaml
  - _ref: .../onboarding/send-quote.yaml
  - _ref: .../onboarding/schedule-followup.yaml
  - _ref: .../onboarding/upload-po.yaml
  - _ref: .../onboarding/track-company-setup.yaml
```

`qualify.yaml` — pre-submit hook returns the conditional spawn (post-38 grammar: signal-keyed hooks, spawn entries `{ type, signal, upsert }`; `signal: activate` creates at `action-required` via the FSM `none` row):

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
  - key: contact_name
    component: text_input
    title: Contact name
    required: true
  - key: notes
    component: text_area
    title: Qualification notes
  - key: site_visit_required
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
                    - _payload: fields.site_visit_required
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

`track-company-setup.yaml` — Part 44 `start_link`, both sentinels:

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

`send-quote.yaml` keeps the review cycle (declaring the `review` verb makes `submit` land `in-review` — `hasReview`, `fsm/tables.js:26`) with `review: [admin]` as the demo's one role-gated verb; `upload-po.yaml` is a plain form with `po_number` (`text_input`, required) + `po_document` (`file_upload`); `schedule-followup`, `site-visit`, and the three child actions are `kind: check` rows served by the shared `action-*` pages — no per-action sketches needed, they're single-purpose.

The injected subroutine (demo `modules/companies/vars.yaml`):

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

Server-side routine steps with the routine's own context (`_step: insert.insertedId`, `_payload.url_query`), and cross-module `_module.endpointId` resolving at app level (see D4).

## Key decisions

### D1 — `starting_actions` lists the full standard scope; the engine is unchanged

The earlier-considered alternative — replace `starting_actions` with "create every configured action at `blocked` + run the unblock pass at start" — is rejected: the engine works as designed, and the fix for the old config's dead-end (actions neither listed nor spawned never exist) is a **convention enforced by example and documentation**, not an engine change. The convention: standard actions are all listed (entry at `action-required`, downstream at `blocked`) so the rendered workflow shows its full scope on day one; conditional actions are excluded and hook-spawned. The demo is the canonical example; the workflows README and the action-authoring concept doc state it normatively.

### D2 — Conditional actions are never `blocked_by` targets

Verified engine semantics: `planAutoUnblock` (the Part 38 planner replacing `computeAutoUnblocks.js`) resolves a `blocked_by` entry naming an action type by `terminalByType.get(entry) === true` (`planAutoUnblock.js:86-88`) — a type with **zero docs** returns `undefined`, i.e. *unsatisfied*. A standard action blocked by a conditional type that never spawns would block forever. So the convention in D1 carries a hard rule: conditional actions may *be* blocked, but must never *appear in* another action's `blocked_by`. The conditional-safe way to gate on conditional work is a **group target**: a `blocked_by` entry naming a group id resolves as "group status is done", and group status derives from whatever member docs exist — a never-spawned conditional simply isn't counted, so it can't block forever. (Group-level `blocked_by` keys, by contrast, are dead config: the engine reads `blocked_by` only on actions; groups are targets, never carriers — review 1 #1.)

In the demo, `site-visit` spawns at `action-required` parallel to the quote (realistic — the visit happens while the quote is prepared) and is never named in any `blocked_by`; it counts toward the `quoting` group's status, and downstream gating goes through the group: `upload-po` is `blocked_by: [quoting]`, so a spawned site visit holds the Purchase order phase until it's checked off, while a lead that needs no visit sails through — the group-target pattern in action.

### D3 — Conversion goes through the companies module's own new page (Part 44), with `company-setup` started for *every* company

Per [Part 44](../44-tracker-start-link/design.md), the tracker's `action-required` row links to `companies/new` with the `action_id` sentinel; the company's create routine starts the child and links it via `parent_action_id`. The tracker is seeded `blocked` in `starting_actions` and unblocked by the normal pass (`tracker.blocked.unblock → action-required`, `fsm/tables.js:103-104`).

**Seeding mechanism (resolved in review 1 #2):** `starting_actions` and the `start-workflow` payload's `actions:` override keep the `{ type, status }` grammar; Part 38 task 17's Start planner seeds drafts **directly at the declared status** (legal seeds: `action-required`, `blocked`) — creation at workflow start is declarative config validated at build time, not an FSM transition, so seeding a tracker needs no creation signal. The FSM `none` row remains the pre-hook spawn path — and as part of the same decision the tracker table gained a `none` row (`activate`/`block`) so pre-hooks can conditionally spawn trackers (state-machine.md "Creation"; not exercised by this demo, whose only conditional spawn is the `site-visit` check). Part 38's design.md, task 17, and task 19 were amended to match.

The create routine starts `company-setup` **unconditionally** — a company created outside the conversion path (no `action_id` in the URL) still gets its setup workflow, just unlinked. This makes conversion the *linked special case of the standard path* rather than a one-off branch: no `skip:` gating, no second creation flow, and the demo shows both entity types starting their workflow at entity creation (leads via `leads-create`, companies via `create-company`). `StartWorkflow` already treats absent `parent_action_id` as "no parent" — no engine change.

### D4 — A routine-level `on_create_routine` var on the companies module (server-side subroutine, not page actions)

The companies create flow is module-owned; the demo needs app-specific behavior after the company is created. The extension point is a **routine var spliced into the `create-company` API**, not actions injected into the new page's save button: `create-company.yaml` already composes its routine with `_build.array.concat` and already carries a consumer extension in exactly this shape (`request_stages.write`), so `on_create_routine` (array of routine steps, default `[]`, documented in manifest + README per the var-schema rule) concatenates after the insert/link/event steps, before the `:return:`. Server-side placement keeps the page's event chain module-owned and untouched, makes company insert + workflow start one API invocation (no client hop between them, no half-created state if the user navigates away mid-chain), and covers **every** create path through the API — a future quick-create surface calling `create-company` gets the workflow for free, where page-injected actions would not.

The var's documented contract: steps run after the company exists and may read `_step: insert.insertedId` and the request payload, including the reserved `url_query` key — the new page forwards its URL query wholesale (`url_query: { _url_query: true }` added to the save payload), which is how start-link sentinel params (`action_id`, `entity_id`) reach the server.

The injected steps call the workflows and events endpoints directly via `_module.endpointId: { module: ... }`. Cross-module operators inside entry vars resolve at app level — the historical parse-order limitation recorded at `apps/demo/modules/companies/vars.yaml:29-34` was fixed by the deferred two-phase entry-vars resolve (lowdefy `22d4e60`, "Resolve cross-module refs in entry vars"; present in the pinned experimental build, verified against the installed `@lowdefy/build`) — so no demo-owned bridging API is needed. `CallApi` from inside an API routine is the proven pattern (`create-company` itself calls events `new-event` this way), and the conditional `convert-lead` event uses the routine `:if` control (`packages/api/.../control/controlIf.js`).

### D5 — Cross-entity child: `entities` var entry, workflows panel slotted into the companies view page

The workflows `entities` var gains `companies-collection: { page_id: companies/view, id_query_key: _id, title: Company }` — module page ids are entry-scoped as `{entryId}/{pageId}` (verified against the demo build output: `build/pages/companies/view`).

The demo wires the workflows panel into the companies view page via the existing `components.main_slots`/`sidebar_slots` var — the same cross-module `_ref { module: workflows, component: actions-on-entity }` shape lead-view uses inline. This is newly possible: the entry-vars cross-module-`_ref` limitation recorded at `apps/demo/modules/companies/vars.yaml:29-34` was fixed by the deferred entry-vars resolve (see D4), so the slot wiring the comment always intended now builds. The user drives `company-setup` from the company page itself; the engine's tracker view-link to `workflow-overview` (unchanged Part 44 behavior) remains as the cross-entity hop from the lead side. The stale limitation comment is removed, and re-slotting the inlined activities tile becomes possible the same way — flagged as a companies-module cleanup outside this part's scope.

### D6 — Scope split: realistic demo here, exhaustive coverage in Part 22

Deliberately **not** in this demo: keyed action instances, error/`resolve_error` paths, cancel/close flows, `changes-required` loops walked to completion, group `on_complete` routines, and hook return-value overrides (`event_overrides`, `message`). The old config carried several of these as demo freight (hooks that only logged "hook fired" events); they made the config read like a test fixture. The Part 22 e2e suite and its dedicated test workflow own that coverage. What the demo *does* showcase: API-started workflows on two entity types, full-scope `starting_actions`, group + action `blocked_by` sequencing, all three shipped kinds, the review cycle with a role-gated verb, a conditional hook spawn, a file-upload form, the Part 44 start link with both sentinels, cross-entity parent/child with tracker mirroring, engine-computed links, one wired notification, and natural workflow completion.

## Files changed

| File | Change |
| --- | --- |
| `apps/demo/modules/workflows/workflow_config/onboarding/*` | Rewrite — `onboarding.yaml` + six action files per the sketches; old hooks deleted (only the qualify pre-submit spawn remains). |
| `apps/demo/modules/workflows/workflow_config/company-setup/*` | Create — `company-setup.yaml` + three action files. |
| `apps/demo/modules/workflows/workflow_config/installation/*` | Delete. |
| `apps/demo/modules/workflows/workflow_config/workflows.yaml` | Point at `onboarding` + `company-setup`. |
| `apps/demo/modules/workflows/vars.yaml` | `entities` gains the `companies-collection` entry. |
| `apps/demo/api/leads-create.yaml` | Add `CallApi` → workflows `start-workflow` (`workflow_type: onboarding`) after the insert. |
| `apps/demo/api/onboarding-spawn-proof-of-installation-actions.yaml` | Delete (+ its `apis:` ref). |
| `apps/demo/pages/leads/lead-view.yaml` | Remove "Start onboarding" + admin close/cancel-child buttons and `installation_child_id` JS; keep workflows panel + events timeline. |
| `apps/demo/modules/companies/vars.yaml` | Add the `on_create_routine` subroutine (sketch above) + workflows panel slot wiring (D5); remove the stale entry-vars limitation comment. |
| `modules/companies/module.lowdefy.yaml` + `modules/companies/api/create-company.yaml` + `modules/companies/pages/new.yaml` + `modules/companies/README.md` | New `on_create_routine` var (manifest schema + routine concat segment before `:return:` + README contract); the `:return:` currently sits inside the third concat segment after `new-event`, so that segment splits — segment ends at `new-event`, `_module.var: on_create_routine` becomes its own segment, `:return:` moves to a final segment. Plain concatenation works (the var defaults to `[]`); no `_build.if` guard needed — `request_stages.write`'s guard skips its *wrapper step*, not the concat. New page forwards `url_query: { _url_query: true }` in the save payload. |
| `apps/demo/modules/notifications/*` (send_routine config) | Handle the send-quote approve event type; rest ignored. |
| `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` | Delete; replace with `onboarding-happy-path.spec.js` per the worked example. |
| `modules/workflows/README.md` + [action-authoring](../../../workflows-module-concept/action-authoring/design.md) | Document the D1 `starting_actions` convention and the D2 blocked_by rule. |
| `designs/workflows-module/parts/38-engine-rebuild/tasks/20-demo-migration.md` | Re-point at this part (supersession note; carry over the `action_allowed` template-consumer and notification-policy items). |

## Worked example — happy path (the e2e spec)

1. Create a lead on `lead-new` → `leads-create` inserts the doc, logs `create-lead`, and starts `onboarding`. `lead-view` renders four groups and five rows — `qualify` actionable, the rest blocked with their `status_map.blocked` messages.
2. Qualify the lead with "Site visit needed?" = yes → pre-hook spawns `site-visit` at `action-required`; the unblock pass fires `send-quote` and `schedule-followup` to `action-required`. The Quote group now shows three rows.
3. Check off `site-visit` and `schedule-followup` (shared `action-edit` page); fill and submit `send-quote` → `in-review` (review verb declared). As admin, approve on `action-review` → `done`; the wired notification fires.
4. The approve completes the Quote group, so `upload-po` unblocks (its group-target `blocked_by: [quoting]` resolves); upload the PO document and submit → `done`; `track-company-setup` unblocks (action target `[upload-po]`) and renders "Convert the lead to a customer" as a live edit link (`action_id` + `entity_id` substituted).
5. Click through to `companies/new`, fill the company form, save → the `create-company` routine inserts the company, then the injected `on_create_routine` steps call `start-workflow` (linking the child and flipping the tracker `in-progress`) and log the `convert-lead` event referencing lead + company. The user lands on `companies/view`, where the slotted workflows panel (D5) shows `company-setup` with its full scope.
6. Complete `billing-details` and `assign-account-manager` from the company page; `kickoff-call` unblocks; check it off → `company-setup` auto-completes → the subscription mirrors the tracker to `done` → `conversion` group done → `onboarding` completes. (From the lead side, the tracker row links to the child's `workflow-overview` throughout.)

## Non-goals

- **Prefilling `companies/new` from lead data** — the `entity_id` sentinel feeds the convert event, not form prefill; add only when a concrete need surfaces.
- **Re-slotting the inlined activities tile** on the companies view page — now possible with the entry-vars fix (D5), but it's a companies-module cleanup, not demo work.
- **Exhaustive FSM/e2e coverage** — Part 22 and its test workflow (D6).
- **Auto-starting the child when the tracker unblocks** — per Part 44's non-goal; the human clicks through.
