# Part 56 — Three-tier action pages (entity workspace)

**Source rationale:** a production app extended the module's action-surface pages into a three-column "entity workspace" (left = the entity's workflows/actions, middle = the action being worked, right = entity detail + history in tabs). This part generalises that layout into the module so every action page ships it. **Layer:** UI delivery (resolver templates + a shared layout component) plus one contained engine-link change. **Size:** M. **Repo:** `modules/workflows/templates/`, `modules/workflows/components/`, `modules/workflows/resolvers/makeActionPages.js`, `plugins/modules-mongodb-plugins/src/connections/shared/render/computeEngineLinks.js`.

Today an action page is a single centred column (`content_width: 750`): the form body + a read-only universal-fields sidebar, or — for check actions — the shared `check-action-surface`. To see the entity's other actions, its details, or its history, the user leaves the page. This part wraps every action surface in a **shared** three-tier shell so that context sits alongside the action being worked.

**No-jarring-shift is the binding constraint.** The left panel (`actions-on-entity`) lets the user jump between a workflow's actions — form *and* check — without leaving the workspace. So the column scaffold must be identical across page kinds: same left, same right, and only the **middle's content** swaps. Everything below follows from that. The shell is one component every action page `_ref`s; what differs per kind is the block arrays passed into its slots, never the layout.

## Proposed change

1. **A shared three-tier shell component** (`components/action-workspace.yaml`) — the page layout, identical for form and check. Left = `actions-on-entity` (the entity's workflows + steps). Middle = a caller-supplied surface. Right = a `universal-fields` card (Part 24) above `workflows-events-timeline` (History), with an optional `Tabs` wrapper so the slot can sit beside History as a **Details** tab on form pages. The shell exposes three caller slots — `middle`, `universal_fields` (RHS top), `details_slot` (RHS Details tab) — plus baked entity context (`entity_collection`, `reference_field`) and the normalized `entity_id` read it gates on. One shell, every action page `_ref`s it.
2. **Universal fields render in the RHS for both kinds (Part 24 reconciliation).** Part 24 already renders the universal-fields card as a RHS sidebar on form pages; check rendered it as middle *primary* content. The shell unifies the placement — universal fields are the RHS-top card on **both** kinds — so the metadata surface never jumps when navigating form↔check. Each template/page composes the `universal-fields` component with its own kind-specific vars (form: `state_path: fields`, `action.*`; check: `state_path: current_action.fields`, `current_action.*`) and hands the result to the shell's `universal_fields` slot. The shell stays layout-only.
3. **Form templates adopt the shell.** Middle = the existing form body (form card). `universal_fields` = the Part 24 card. `details_slot` = `entity_view.slot` → renders as the RHS **Details** tab (the original plan: Details + History tabs). Page widens from `content_width: 750` to full width.
4. **Check actions get a per-workflow page that recomposes the check surface.** `makeActionPages` emits, per workflow with ≥1 `check` action, a **single** `{workflow_type}-check` page (mode derived as `check-action-modal` does — D3). Its middle is **not** `check-action-surface` verbatim: the surface **splits** (D6). The workspace check page recomposes from the shared leaf components — `entity_view.slot` (the review subject) + the comment input + the signal buttons **in the middle** — with the universal-fields card in the RHS and History below it. No Details tab on check: the slot is the middle content, so the right column is universal-fields + History only. `computeEngineLinks` points the check branch at `{workflow_type}-check`; the shared `workflow-action-*` pages are retired. The in-context `check-action-modal` is untouched.
5. **`entity_view` on the workflow config** (raw YAML, read-only, `_ref`-able): `{ slot }` — the Details/review block array. `makeActionPages` reads it from the raw workflow and bakes the slot into the emitted pages via build-time `_var` (the mechanism the templates already use for `formHeader`/`formFooter`). `makeWorkflowsConfig` excludes it from the materialised engine config — build-time UI only, never reaches engine logic. **History sources its match field from the existing mandatory `workflow.entity_ref_key`** (the event-references key the engine already writes onto every event doc — `planEventDispatch.js:157`, required by `schema.js:91`), not from `entity_view`; the shell bakes `reference_field` from `entity_ref_key` the same way it bakes `entity_collection` from `workflow.entity_collection`.
6. **`entity_view` is read-only.** The slot renders display blocks only — no inputs, save handlers, or state writes. (The motivating screenshot is a disabled copy of an edit component; read-only is the committed restriction.)

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

### D6 — The check surface splits: compact modal body vs decomposed workspace page

`check-action-surface.yaml` was "one body, two containers" (the modal + the retired shared pages). The workspace breaks that: a full page has room to spread the surface across three columns, a modal does not. So the surface **splits into two compositions sharing the same leaf components** (the universal-fields component, the signal-button bar, the comment input, the status-history list, the mode-derivation):

- **The in-context modal keeps its all-in-one body** — universal fields, comment, status, and buttons stacked in one card. Untouched; it remains the entity-page shortcut.
- **The workspace check page recomposes** the leaves across the shell: `entity_view.slot` + comment + signal buttons in the **middle**, universal fields in the **RHS** (D2), History below. The shell is shared with the form pages; only the middle/RHS block arrays differ.

This is what "duplicate the surface" means here — not the page layout (shared), the *surface content arrangement*. The cost is one extra composition file; both read the same leaves, so behaviour can't drift. It also keeps the modal genuinely unchanged (a non-goal), because the page no longer tries to reuse the modal's exact body.

### D7 — Details slot: RHS Details tab on form, middle on check

For a **form** action the work is filling the form, so the entity detail is reference material — it sits in the RHS as a **Details** tab beside History (the original three-tier plan). For a **check** action the work *is* reviewing the entity, so the entity detail is promoted to the **middle**, beside the decision controls, where it fills the column that would otherwise be near-empty once universal fields move to the RHS (D2). Same `entity_view.slot` block array, rendered in the position that matches the action's nature.

Consequence on the scaffold: the RHS Details *tab* is form-only (on check, the slot is in the middle, so the check RHS is universal-fields + History with no Details tab). This is the one place the columns differ by kind — accepted deliberately: the heavy scaffold (left steps; RHS universal-fields + History) stays put across form↔check, and the Details panel moving to centre-stage on a check reads as intentional (you're now reviewing it), not as a layout glitch. The alternative — Details always a RHS tab, check middle = decision-only — was rejected as leaving the check middle too thin.

## The three-tier shell

Same scaffold both kinds; only the middle content and whether the RHS has a Details tab differ.

```
FORM page
┌────────────────┬─────────────────────────┬──────────────────────────┐
│ actions-on-    │  form body + submit     │  universal-fields card   │
│ entity         │  buttons                │  Tabs[ Details | History ]│
│ (current row   │                         │   • Details = slot       │
│  highlighted)  │                         │   • History = timeline   │
└────────────────┴─────────────────────────┴──────────────────────────┘

CHECK page
┌────────────────┬─────────────────────────┬──────────────────────────┐
│ actions-on-    │  entity_view.slot +     │  universal-fields card   │
│ entity         │  comment + signal       │  History (timeline)      │
│ (current row   │  buttons                │   (no Details tab — slot │
│  highlighted)  │                         │    is in the middle)     │
└────────────────┴─────────────────────────┴──────────────────────────┘
   stacks to full width on small breakpoints (sm: span 24)
```

**Shell vars** (`components/action-workspace.yaml`, plain `.yaml`, all inputs in operator/block-array positions). The shell is layout-only — it renders whatever block arrays the caller passes into its slots:

- `middle` — block array, the action surface (required).
- `universal_fields` — block array, the Part 24 universal-fields card composed by the caller with its own kind-specific vars (RHS top, both kinds).
- `details_slot` — block array, baked from `entity_view.slot`. On form pages it renders as the RHS **Details** tab (omitted when empty, leaving History as the sole tab); check pages pass it empty here because the slot is in their `middle`.
- `entity_collection` — scalar, baked from `workflow.entity_collection` (for `actions-on-entity`).
- `reference_field` — scalar, baked from `workflow.entity_ref_key` (for the History timeline). Mandatory engine config, so always available — which is why History is unconditionally present.

**State contract — one normalized read.** The loaded action lives under different keys per kind (`_state.action` on form pages; `_state.current_action` on the check page / surface), so the shell cannot read a fixed action path. The shell needs only one runtime value: the entity id (left panel, History `reference_value`, and the mount gate). So **every action page sets a normalized scalar `_state.entity_id`** from its own loaded response, in the onMount/`SetState` it already runs (form templates beside `set_action`; the check page in the same response-derived `SetState` that derives mode — D3). The shell then reads a single fixed `_state: entity_id` everywhere. This is a single normalized "the entity this page is about" scalar — not a duplicated action object — and it leaves the check surface and the in-context modal (which keep `current_action`) untouched. The read-only `details_slot` likewise reads `_state: entity_id` for its own entity fetch (`entity_collection` is build-time-baked, no state needed).

**Mount sequencing:** `actions-on-entity` and `workflows-events-timeline` fire their `onMount` reads off `entity_id`, so the left/right columns must mount *after* the action loads. The shell gates the columns' render on `visible: _ne [ _state.entity_id, null ]` so their `onMount` fires once `entity_id` is set, rather than firing with a null id on first paint.

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

History always renders — it sources its match field from the mandatory `workflow.entity_ref_key`, which every workflow has. `entity_view` is optional and carries only the `slot` block array, rendered in the position that matches the action kind (D7): on **form** pages as the RHS **Details** tab (omitted ⇒ History is the sole RHS tab; present ⇒ Details + History tabs); on **check** pages in the **middle** as the review subject. The same `slot` serves both — `makeActionPages` bakes it into the form templates and the check page alike.

## Files changed

- `modules/workflows/components/action-workspace.yaml` — **new** shared three-tier shell: `middle` / `universal_fields` / `details_slot` slots, baked `entity_collection` / `reference_field`, columns gated on `_state: entity_id`.
- `modules/workflows/templates/{view,edit,review,error}.yaml.njk` — wrap the existing form body as the shell's `middle`; compose the Part 24 universal-fields card into the `universal_fields` slot; pass `entity_view.slot` as `details_slot` (RHS Details tab); set the normalized `_state.entity_id` in onMount; widen the page to full width.
- `modules/workflows/templates/check.yaml.njk` — **new** per-workflow check page. Recomposes the check surface across the shell (D6): `entity_view.slot` + comment + signal buttons as `middle`, universal-fields card as `universal_fields`, empty `details_slot`. Derives mode in the response-derived `SetState` (D3) and sets `_state.entity_id` there too.
- `modules/workflows/components/check-action-surface.yaml` — **extract the shared leaves** (signal-button bar, comment input, status-history list, mode derivation) so both the in-context modal body and the new workspace check page compose them (D6). No behavioural change to the modal; the modal keeps its all-in-one arrangement.
- `modules/workflows/components/universal-fields/universal-fields.yaml` (Part 24) — composed by both the form templates and the check page into the shell's RHS; the check page now passes it `state_path: current_action.fields` / `current_action.*` (its previous middle-primary placement moves to the RHS). No new component work, a placement change owned here.
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
- **Part 40 check-action surfaces** (shipped) — **splits the surface** (D6): the leaves (signal buttons, comment, status history, mode derivation) are extracted so the modal body and the new workspace check page both compose them. The modal's arrangement is unchanged; the standalone shared check pages are retired and replaced by the per-workflow recomposition.
- **Part 42 / Part 55** — relies on the `actions-on-entity` + `check-action-click` no-modal degrade path.
- **Part 46 / Part 50** — reuses `workflows-events-timeline`; the History tab here is the module-baked counterpart to Part 50's app-composed `events_tile`.
- **Part 24 universal-fields** (shipped) — central to the reshape: the universal-fields card is composed into the shell's RHS for **both** kinds (D2). On form pages this matches Part 24's existing RHS placement; on check pages it moves the card from middle-primary to the RHS. This part owns that placement change for the workspace check page (the modal keeps Part 24's in-body placement).
- **Part 4 config schema** — adds optional `entity_view` to the workflow grammar + validates `slot` is a block ref; `entity_ref_key` is already a required string in the schema and is reused unchanged for History.

## Verification

- Form action page renders three columns: middle = the form body; RHS = universal-fields card + Details/History tabs; left = the entity's workflows.
- Check action page renders the same scaffold: middle = `entity_view.slot` + comment + signal buttons; RHS = universal-fields card + History (no Details tab); left = the entity's workflows.
- **No-jarring-shift:** navigating form↔check via the left panel keeps the left column and the RHS universal-fields card in place; only the middle content (and the presence of the Details tab) changes.
- Universal fields render in the RHS on both kinds; the card is read/written via Part 24's `state_path` (form `fields`, check `current_action.fields`).
- A `check` action's `action.link` resolves to `{workflow_type}-check`; opening it derives the correct mode per stage/allowed (parity with `check-action-modal`); the retired `workflow-action-*` ids no longer resolve.
- `entity_view.slot` renders read-only — RHS Details tab on form, middle on check; omitting `entity_view` drops the Details tab (form) / leaves the middle decision-only (check) while History (sourced from `entity_ref_key`) still renders.
- Clicking another action in the left panel navigates to its page (check included) via the degrade path.
- `entity_view` does not appear in the materialised `workflows_config` consumed by the engine.
- The modal body is unchanged after the surface split (D6): the in-context `check-action-modal` renders and behaves exactly as before.
- Narrow viewport: the three columns stack to full width.
- E2E: covered by Part 22 once a workflow fixture declares `entity_view`.

## Open questions

- **Current-action highlight.** `ActionSteps` has no `active`/`selected` prop today (`plugins/.../ActionSteps`). Highlighting the current row (as the screenshot does) needs a small block prop fed the loaded `action._id`, or a CSS-only treatment. Lean: add a minimal `activeActionId` prop to `ActionSteps`; defer if it slips scope — the layout works without it.
- **Slot entity-data fetch.** The read-only `slot` authors its own read off the normalized `_state.entity_id`. Whether the module should standardise that fetch via Part 26's `get_entity_endpoint` (so slots consume one shaped object instead of each writing a request) is left to Part 26; this part only guarantees `_state.entity_id` (set by every action page) and the build-time-baked `entity_collection`.
- **Right-panel sizing.** Default column spans (e.g. 6/12/6 on `lg`, 24 on `sm`) and a max-height/scroll on the History tab are sensible defaults; tune during implementation against real content.

## Non-goals

- **Editable entity views** — the slot is read-only (D5).
- **A declarative entity-detail spec** — rejected in D2; the slot is app blocks.
- **Per-entity (rather than per-workflow) config** — rejected in D1.
- **Changing the in-context `check-action-modal`** — its body and behaviour are unchanged; it remains the entity-page shortcut. (The shared surface file is refactored to extract leaves per D6, but the modal's arrangement does not change.)
- **Moving entity-page furniture into the module** — the workspace is the module's *own* action pages; entity view pages keep composing `actions-on-entity` / `events_tile` themselves (Part 50).
