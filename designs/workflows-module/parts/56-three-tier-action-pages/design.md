# Part 56 — Three-tier action pages (entity workspace)

**Source rationale:** a production app extended the module's action-surface pages into a three-column "entity workspace" (left = the entity's workflows/actions, middle = the action being worked, right = entity detail + history in tabs). This part generalises that layout into the module so every action page ships it. **Layer:** UI delivery (resolver templates + a shared layout component) plus one contained engine-link change. **Size:** M. **Repo:** `modules/workflows/templates/`, `modules/workflows/components/`, `modules/workflows/resolvers/makeActionPages.js`, `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js`.

Today an action page is a single centred column (`content_width: 750`): the form body + a read-only universal-fields sidebar, or — for check actions — the shared `check-action-surface`. To see the entity's other actions, its details, or its history, the user leaves the page. This part wraps every action surface in a three-tier shell so that context sits alongside the action being worked, without changing the surface itself.

## Proposed change

1. **A shared three-tier shell component** (`components/action-workspace.yaml`): left column = `actions-on-entity` (the entity's workflows + steps), middle column = a caller-supplied surface (block array var), right column = a `Tabs` block with **Details** (a read-only `entity_view` slot; tab omitted when empty) and **History** (`workflows-events-timeline`; always present). One shell, every action page `_ref`s it — the layout lives in exactly one file.
2. **`entity_view` on the workflow config** (raw YAML, read-only, `_ref`-able): `{ slot }` — the Details panel only. `makeActionPages` reads it from the raw workflow and bakes the slot into the emitted pages via build-time `_var` (the mechanism the templates already use for `formHeader`/`formFooter`). `makeWorkflowsConfig` excludes it from the materialised engine config — build-time UI only, never reaches engine logic. **History sources its match field from the existing mandatory `workflow.entity_ref_key`** (the event-references key the engine already writes onto every event doc — `planEventDispatch.js:157`, required by `schema.js:91`), not from `entity_view`; the shell bakes `reference_field` from `entity_ref_key` the same way it bakes `entity_collection` from `workflow.entity_collection`.
3. **Form templates adopt the shell.** `templates/{view,edit,review,error}.yaml.njk` keep their existing body (form card + universal-fields) and pass it to the shell as the `middle` var; the page widens from `content_width: 750` to full width.
4. **Check actions get a per-workflow page (Option A).** `makeActionPages` — today form-only — also emits, per workflow that has ≥1 `check` action, a **single** `{workflow_type}-check` page that derives mode the way `check-action-modal` already does, drops `check-action-surface` as the `middle`, and bakes the same `entity_view`. `computeEngineLinks` points the check branch at `{workflow_type}-check` instead of the fixed `workflow-action-*` pages, which are retired. The in-context `check-action-modal` is untouched.
5. **`entity_view` is read-only.** The slot renders display blocks only — no inputs, save handlers, or state writes. (The motivating screenshot is a disabled copy of an edit component; read-only is the committed restriction.)

## Key decisions

### D1 — `entity_view` lives on the workflow config, not the `entities` var

The `entities` var (`module.lowdefy.yaml:69`) is a thin scalar lookup table (`{ page_id, id_query_key, title }` keyed by `entity_collection`) the module uses to deep-link back into host entity pages. A full view-component block tree has no place there. The natural, author-intuitive home is the workflow that owns the page. **Per-workflow, not per-entity:** one entity can host several workflows, and a workflow may want a different entity view than its siblings; identical views share via a single `_ref`. This also pairs cleanly with D3 (per-workflow check page) — both the form pages and the check page of a workflow bake that workflow's one `entity_view`.

### D2 — The slot is baked at build time, because Lowdefy can't inject block trees at runtime

A Lowdefy block tree is static YAML resolved by the build walker; there is no way to render an arbitrary, app-authored block subtree from runtime state. So the entity view **must** be baked into a page that knows the entity at build time. The resolver has `workflow.entity_collection` and (now) `workflow.entity_view` in hand and injects them via `_var` — the same path `page_config.formHeader`/`formFooter` already take (`templates/view.yaml.njk:121-136`). This is also why a *declarative* entity-detail spec (a field list the module renders generically) was not pursued: the screenshot's detail panel is a real, if read-only, component, and a spec language would re-invent forms for no gain.

### D3 — Per-workflow check page, single page, mode-derived (Option A, variant i)

Check actions use one shared page set (`pages/workflow-action-{view,edit,review}.yaml`) serving every workflow, so there is nowhere to bake a per-entity slot. Option A emits a workflow-specific check page instead. Of the two variants:

- **(i) chosen** — a single `{workflow_type}-check` page that derives `current_action.mode` from the loaded action (the exact derivation `check-action-modal.yaml` already proves: stage `error` → view, `in-review` + `allowed.review` → review, the editable stages + `allowed.edit` → edit, else view). One page per workflow, fewest pages, matches "a workflow-specific actions page".
- (ii) rejected — three verb pages `{workflow_type}-check-{view,edit,review}` for strict parity with the retired shared pages. More pages, and the per-verb distinction is redundant once the page derives mode.

`computeEngineLinks` keeps its per-verb `links` cells (the display layer still uses them for `visible_verbs`), but every non-null check cell now points at the same `{workflow_type}-check` page; the page reads `?action_id` and derives mode. This **collapses the existing `error`-verb special case** (`computeEngineLinks.js:116-121` currently maps the check `error` verb to `workflow-action-view`): the per-workflow page derives `view` mode at stage `error` anyway, so all non-null check cells — `error` included — target `{workflow_type}-check`. The check change is confined to `computeEngineLinks.js:116-121`; `computeEngineLinks.test.js:66-79`'s error-verb test is **rewritten** (not merely edited) to assert the new target.

**Mode derivation is new page code, copied from the modal — not the retired pages.** The old shared pages wrote a *literal* mode per verb. The per-workflow check page must instead replicate `check-action-modal.yaml`'s load-bearing pattern (`:50-64,98-146`): derive mode from the `GetWorkflowAction` **response** (`_request: …`, not `_state: current_action.*`), inside the **same** `SetState` that spreads the response. Params evaluate against pre-`SetState` state, so a `_state`-based derive reads an empty `current_action.status`; splitting the writes prunes `current_action.status` before mode is set. One response-derived `SetState`, as the modal proves.

### D4 — Navigation reuses the existing no-modal degrade path

`actions-on-entity` bakes in `check-action-click` (`components/check-action-click.yaml`), which **navigates to the action's page when no `check_action_modal` is on the page** (Part 55 D2/D3, the `catch` arm). The workspace pages deliberately drop no modal, so a click on any row — check included — navigates via the server-resolved `action.link`. No new flag, no new handler: the user's "link to the action page even for check" falls out of the shipped degrade behaviour.

### D5 — Option B recorded as considered-and-rejected

Option B kept the shared check pages simple (left + middle + History, no custom Details; check stays modal-first on the entity page). It needed near-zero work and no engine change, but left check pages permanently second-class — no entity context where a deep-linked check action lands. With the check-link change contained to one file and the shell shared, A's extra cost is small and the result is uniform. B is documented here rather than built.

## The three-tier shell

```
┌────────────────┬─────────────────────────┬──────────────────────────┐
│ actions-on-    │  <middle> (caller var)  │  Tabs:                   │
│ entity         │   form body + universal │   • Details (entity_view │
│ (entity's      │   fields  — or —        │      .slot, read-only)   │
│  workflows +   │   check-action-surface  │   • History (workflows-  │
│  steps,        │                         │      events-timeline)    │
│  current row   │                         │                          │
│  highlighted)  │                         │                          │
└────────────────┴─────────────────────────┴──────────────────────────┘
   stacks to full width on small breakpoints (sm: span 24)
```

**Shell vars** (`components/action-workspace.yaml`, plain `.yaml`, all inputs in operator/block-array positions):

- `middle` — block array, the action surface (required).
- `entity_collection` — scalar, baked from `workflow.entity_collection` (for `actions-on-entity`).
- `reference_field` — scalar, baked from `workflow.entity_ref_key` (for the History timeline). Mandatory engine config, so always available — which is why History is unconditionally present.
- `details_slot` — block array, baked from `entity_view.slot`; the **Details** tab renders it and is omitted entirely when the array is empty.

**State contract the shell relies on:** the loaded action lives at `_state.action` (form pages) / `_state.current_action` (check surface). The shell reads `entity_id` for the left panel and History `reference_value` from the loaded action; the `details_slot` blocks may read the same `action.entity_id` / `action.entity_collection` and author their own read-only request for entity data. (Form templates additionally have the legacy `get_entity` request available; the portable contract the slot should depend on is `action.entity_id`.)

**Mount sequencing:** `actions-on-entity` and `workflows-events-timeline` fire their `onMount` reads off the loaded action's `entity_id`, so the left/right columns must mount *after* the action loads. The shell gates the columns' render on the action being present (`visible: _ne [ <action>, null ]`) so their `onMount` fires once `entity_id` is available, rather than firing with a null id on first paint.

## Config shape

```yaml
workflows:
  - type: nc-internal
    entity_collection: nc-collection
    entity_ref_key: nc_ids                            # existing mandatory field — History matches events on it
    entity_view:
      slot:
        _ref: modules/workflows/workflow_config/shared/nc-detail.yaml  # Details tab — read-only blocks (config-root-relative)
    actions:
      - type: accept-or-reopen        # form action -> three-tier {workflow}-{action}-{verb} pages
        kind: form
        # ...
      - type: rca-acceptance          # check action -> three-tier {workflow}-check page
        kind: check
        # ...
```

History always renders — it sources its match field from the mandatory `workflow.entity_ref_key`, which every workflow has. `entity_view` is optional and carries only the Details `slot`: omitted ⇒ no Details tab (History still shows); present with `slot` ⇒ Details tab renders alongside History.

## Files changed

- `modules/workflows/components/action-workspace.yaml` — **new** three-tier shell.
- `modules/workflows/templates/{view,edit,review,error}.yaml.njk` — wrap the existing body in the shell (`middle` var); widen the page.
- `modules/workflows/templates/check.yaml.njk` — **new** per-workflow check page: derives mode, drops `check-action-surface` as `middle`, bakes `entity_view`.
- `modules/workflows/resolvers/makeActionPages.js` — read `workflow.entity_view.slot`; pass the slot, `entity_collection`, and `entity_ref_key` (as `reference_field`) to the templates; emit `{workflow_type}-check` when the workflow has ≥1 `check` action.
- `modules/workflows/resolvers/makeWorkflowsConfig.js` — strip `entity_view` from the materialised engine config (build-time UI field, not engine input).
- `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js` — check branch → `{workflow_type}-check` (lines 116-121).
- `modules/workflows/pages/workflow-action-{view,edit,review}.yaml` — **retire** (replaced by emitted per-workflow check pages).
- `modules/workflows/module.lowdefy.yaml` — drop the three retired shared pages from `pages`; document `entity_view` in the workflow-config var description; re-point the export-description constraint (`:137-138`) off the retired `workflow-action-*` pages.
- `modules/workflows/README.md`, `docs/idioms.md` — document `entity_view` and the workspace layout. README also re-points the Exports table rows for the three retired pages and the "check actions use the shared `workflow-action-*` pages" line (`:300-302,308,317`).
- **Re-point the "canonical page" / duplicate-`get_workflow_action` constraint comments.** D3 retires the shared pages, so the comments naming them as canonical and as the duplicate-request hazard are now stale — the new `{workflow_type}-check` page is itself a URL-bound `get_workflow_action` page, so the "never drop the modal on a page that already defines `get_workflow_action`" constraint moves to it:
  - `modules/workflows/components/check-action-modal.yaml:6-7,22-25`
  - `modules/workflows/components/check-action-surface.yaml:4`
- Tests (unit — check-link retarget asserts the page value verbatim across the handler suite; every `workflows/workflow-action-{view,edit,review}` expectation for a **check** action becomes `workflows/{workflow_type}-check`; form-action expectations are unaffected):
  - `makeActionPages.test.js` (check-page emission + `entity_view` baking)
  - `computeEngineLinks.test.js:16-17,62,66-79` (check link target; the dedicated error-verb test is rewritten)
  - `GetEntityWorkflows.test.js:151-152,316,329,342,465,492`
  - `GetEventsTimeline.test.js:151-153`
  - `StartWorkflow.test.js:335,348,352`
  - `GetWorkflowAction.test.js:245-247`
  - `GetWorkflowActionGroupOverview.test.js:152-153,484`
  - `GetWorkflowOverview.test.js:157-158`
  - `planActionTransition.test.js:244,419-423,508`
- Tests (e2e — retargeting check links to `{workflow_type}-check` breaks specs that navigate to / assert the retired ids):
  - `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` — `waitForURL`/assertions on `workflow-action-edit`/`-review` for check steps (e.g. `:124,314,361,425,595`) plus the negative `not.toContain('workflow-action-edit')` checks; retarget to `{workflow_type}-check`.
  - `apps/demo` Part 22 e2e — three-tier render + cross-action navigation.
  - `apps/workflows-test/e2e/workflows/check-blocked-by.spec.js:79,95,102,124` — URLs and `toHaveURL(/workflow-action-*/)` assertions retarget to `{workflow_type}-check`; update the surrounding fixtures/comments (`check-blocked-by.yaml:12`, `second-check.yaml:3`).

## Depends on / amends

- **Part 16 page-templates** (shipped) — edits the four `.yaml.njk` templates in place.
- **Part 17 shared-pages** (shipped) — retires the three shared `workflow-action-*` pages it introduced; `entities` var unchanged.
- **Part 40 check-action surfaces** (shipped) — reuses `check-action-surface` + the modal's mode derivation unchanged; the standalone check pages move from shared to per-workflow.
- **Part 42 / Part 55** — relies on the `actions-on-entity` + `check-action-click` no-modal degrade path.
- **Part 46 / Part 50** — reuses `workflows-events-timeline`; the History tab here is the module-baked counterpart to Part 50's app-composed `events_tile`.
- **Part 24 universal-fields**, **Part 4 config schema** (adds optional `entity_view` to the workflow grammar + validates `slot` is a block ref; `entity_ref_key` is already a required string in the schema and is reused unchanged for History).

## Verification

- Form action page renders three columns; the middle is byte-identical to today's body; left lists the entity's workflows; History shows the entity's timeline.
- A `check` action's `action.link` resolves to `{workflow_type}-check`; opening it derives the correct mode per stage/allowed (parity with `check-action-modal`); the retired `workflow-action-*` ids no longer resolve.
- `entity_view.slot` renders in the Details tab read-only; omitting `entity_view` drops the Details tab while History (sourced from `entity_ref_key`) still renders.
- Clicking another action in the left panel navigates to its page (check included) via the degrade path.
- `entity_view` does not appear in the materialised `workflows_config` consumed by the engine.
- Narrow viewport: the three columns stack to full width.
- E2E: covered by Part 22 once a workflow fixture declares `entity_view`.

## Open questions

- **Current-action highlight.** `ActionSteps` has no `active`/`selected` prop today (`plugins/.../ActionSteps`). Highlighting the current row (as the screenshot does) needs a small block prop fed the loaded `action._id`, or a CSS-only treatment. Lean: add a minimal `activeActionId` prop to `ActionSteps`; defer if it slips scope — the layout works without it.
- **Slot entity-data fetch.** The read-only `slot` authors its own read off `action.entity_id`. Whether the module should standardise that fetch via Part 26's `get_entity_endpoint` (so slots consume one shaped object instead of each writing a request) is left to Part 26; this part only guarantees `action.entity_id`/`action.entity_collection` in state.
- **Right-panel sizing.** Default column spans (e.g. 6/12/6 on `lg`, 24 on `sm`) and a max-height/scroll on the History tab are sensible defaults; tune during implementation against real content.

## Non-goals

- **Editable entity views** — the slot is read-only (D5).
- **A declarative entity-detail spec** — rejected in D2; the slot is app blocks.
- **Per-entity (rather than per-workflow) config** — rejected in D1.
- **Changing the in-context `check-action-modal`** — untouched; it remains the entity-page shortcut.
- **Moving entity-page furniture into the module** — the workspace is the module's *own* action pages; entity view pages keep composing `actions-on-entity` / `events_tile` themselves (Part 50).
