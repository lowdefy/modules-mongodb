# Part 40 — Simple-action surfaces: signal buttons, error recovery, in-context modal

**Layer:** module shared pages + two new module components (surface + modal) + a generic `ActionSteps` block event + resolver (per-action button config) + concept-doc reconciliation. **Size:** M. **Repo:** `modules/workflows/pages/`, `modules/workflows/components/`, `plugins/.../blocks/ActionSteps/`, `modules/workflows/resolvers/`, concept docs.

The three shared simple-action pages (`simple-edit` / `simple-view` / `simple-review`, currently `task-*.yaml` until [Part 35](../35-rename-task-kind-to-simple/design.md) renames them) still run the **old interaction model**: `simple-edit` carries a status **selector** with a `_js` priority filter (`task-edit.yaml:135`) and a `current_status` payload, and all three pages fire `interaction:` rather than `signal:`. The engine moved to **signals + FSM** ([state-machine](../../../workflows-module-concept/state-machine/design.md), [Part 38](../38-engine-rebuild/design.md)), and the form templates were migrated by [Part 39](../39-form-submit-buttons/design.md), which shipped the `enums/button_signal_sources.yaml` build-time visibility enum (read via `_ref`) and **explicitly handed the simple surfaces to this sibling** ([Part 39 § Simple actions are separate](../39-form-submit-buttons/design.md)).

This part rewrites the three shared pages to the signal model, deletes the status selector, resolves the simple-action **error-recovery** question, and adds an **in-context modal** so the live working surfaces (`actions-on-entity` and the event-timeline action items) can open a simple action without a full page navigation. Because the form and simple FSM tables are now **identical** ([state-machine "Simple kind"](../../../workflows-module-concept/state-machine/design.md)), it reuses Part 39's visibility map verbatim.

## Proposed change

1. **Delete the `simple-edit` status selector** and its `current_status` / `target_status` payload (`task-edit.yaml:121–156, 210–211`). Replace with the same nullary signal button bar as the form edit template — `submit`, `progress`, `not_required`. `submit` carries no target; the engine resolves `in-review` vs `done` from the action's `review` verb.
2. **`interaction:` → `signal:` on all three pages** (`submit_edit` → `submit`; `approve` / `request_changes` keep their names), dropping `current_status`. No interaction→status logic on the page — the engine's FSM owns it.
3. **Reuse Part 39's `enums/button_signal_sources.yaml` enum for visibility** (read at build time via `_ref`; three-way AND: FSM source-stage, role gate, author opt-out). No new enum — the FSMs are identical.
4. **Add the `progress` button to `simple-edit`** (titled "Mark Started"): `signal: progress`, persists the universal fields without advancing, lands `in-progress`.
5. **Resolve error recovery: a `resolve_error` button on `simple-view`**, rendered only when stage is `error` (FSM `error → resolve_error → in-review`). **No `simple-error` page.** Closes [ui Open Question 4](../../../workflows-module-concept/ui/design.md).
6. **Author button config matches form** — `not_required` opt-in, others default-shown — read at runtime from a resolver-emitted per-action global ([D3](#d3--author-button-config-match-form-read-at-runtime)).
7. **Extract the body into a shared `simple-action-surface` component** (universal fields + comment + signal buttons, `mode: edit|view|review`). The three pages and the modal both `_ref` it — one body, two containers.
8. **Ship a standalone `simple-action-modal` component** and a generic `onActionClick` event on the `ActionSteps` block. `actions-on-entity` bundles the modal and wires the event; any page hosting the event timeline can drop the modal and wire it independently ([D5](#d5--in-context-modal-standalone-component--generic-onactionclick)).

## Why a dedicated part (sibling to Part 39)

Part 39 owns the four **generated** form `.yaml.njk` templates; this part owns the three **static shared** pages plus the modal that opens simple actions in place. [Part 39 § Simple actions are separate](../39-form-submit-buttons/design.md) records the split as a file-locality call: form and simple share the signal vocabulary, FSM, and the `button_signal_sources.yaml` enum Part 39 ships, but the page *files* differ (static shared pages vs generated templates) and the *content* differs (universal-fields + comment vs a form schema). This part **consumes** Part 39's visibility map and concept reconciliation rather than duplicating them.

**Dependencies.** Sequences after [Part 34](../34-action-access-model/design.md) (the **per-verb access model** — `action[slug].links` keyed by verb [D7/D9] and `visible_verbs: { view, edit, review, error }` from `action_role_check` [D8], both of which this part's mixed-verb surface and modal require), [Part 35](../35-rename-task-kind-to-simple/design.md) (`task-*` → `simple-*` renames, `kind: simple`), [Part 38](../38-engine-rebuild/design.md) (the `update-action-{type}` endpoint accepts `signal`, drops `force`/`current_status`), [Part 24](../24-universal-fields/design.md) (the real `universal-fields` renderer — today a stub, `universal-fields.yaml:1`), and with/after [Part 39](../39-form-submit-buttons/design.md) (ships `enums/button_signal_sources.yaml`).

> **Part 34 sequencing.** Part 34 reworks the access model the whole UI wave reads from. Part 40 builds on its **per-verb** shape throughout (role gates are `visible_verbs.{verb}`, navigation uses `action.links.{verb}`). This requires Part 34 to land before (or with) this part, and means siblings [Part 24](../24-universal-fields/design.md) and [Part 39](../39-form-submit-buttons/design.md) — which still reference the binary `action_allowed` / single `action.link` — migrate to the per-verb model too. Slotting Part 34 into the parent dependency graph and aligning 24/39 is cross-wave work tracked at the parent design, not owned here.

## Surfaces, the engine link, and where the modal fits

Every surface that renders an action reads the **engine-written per-verb link map `action[app_name].links`** ([Part 34 D7/D9](../34-action-access-model/design.md), amending [Part 30 D4](../30-status-map-rendering/design.md): the engine writes `action[app_name].links = { view, edit, review, error }` — one `{ pageId, urlQuery }` per verb, `null` where the stage has no page for that verb — on every transition, and "display is dumb"). The display picks the user-appropriate link at render time via the static priority `edit > review > error > view` against the user's `visible_verbs` ([Part 34 D7](../34-action-access-model/design.md) selection rule). The page is therefore the **canonical, addressable target** and ships regardless — a notification can only deep-link to a module-owned page (the engine never learns the host app's entity-page URL), so it always navigates.

The modal is an **in-app shortcut layered on the live working surfaces**, never a replacement for the page:

| Surface | Renderer | Default behaviour | Modal? |
| ------- | -------- | ----------------- | ------ |
| `actions-on-entity` | `ActionSteps` block | navigate via the user-selected `action.links.{verb}` | **Yes** — bundled (D5) |
| event timeline (action items) | `EventsTimeline` block | navigate via the user-selected `action.links.{verb}` | **Yes** — host composes the modal ([Part 41](#discovered-gap--action-items-in-the-event-timeline-part-41)) |
| `workflow-overview` / `group-overview` | `Link` button | navigate | No — these *are* full pages |
| notifications / email | URL | navigate | No — no page loaded to host a modal |

**The "separate component" design keeps the modules decoupled.** The `EventsTimeline` and `ActionSteps` blocks fire a **generic** `onActionClick(action)` event — neither knows what a workflow simple-action surface is. The workflows module ships the modal as a standalone component, and the **host app page composes the two** (drops the modal, wires the event). So there is no events→workflows *code* coupling — the wiring lives in app composition, exactly where module composition belongs. Navigation remains the block default, so notifications, overviews, and direct deep-links are unaffected.

## Current state

Verified against the shipped pages (`modules/workflows/pages/task-*.yaml`):

- **`task-edit.yaml`** — 8-step `onMount` (action_id guard → `get_action` → stale-URL guard allowlisting `[action-required, in-progress, changes-required]` → `get_workflow` → `action_role_check` → prime `fields.*` + `status` state). Body: workflow-closed banner, universal-fields (`mode: edit`), **status `Selector`** with a `_js` priority filter (`:135–156`) plus a "No transitions available" Alert when stage is `not-required`, comment `TiptapInput`, and a single **Save** button firing `interaction: submit_edit` + `current_status: {_state: status}` (`:196–215`).
- **`task-view.yaml`** — read-only: action header (title + status badge), universal-fields (`mode: display`), **Status History** card (List over `status`), **Comments** card (aggregation over `events` where `action_ids` ∋ this action and `metadata.comment` exists). No button bar, no stale-URL guard.
- **`task-review.yaml`** — workflow-closed banner, header, universal-fields (`mode: display`), comment field, a **floating-actions** bar with **Request Changes** (opens a comment `Modal`) + **Approve** (fires `interaction: approve`), and a `request_changes_modal` firing `interaction: request_changes`. Stale-URL guard allowlists `[in-review, error]`.
- **`ActionSteps.js`** — renders each action row as a hard `Link` to `action.link.pageId`/`urlQuery` (`:162–171`). No click event today.

Stale concept prose is already mostly reconciled: [ui Decision 7](../../../workflows-module-concept/ui/design.md) is current (signal buttons, no selector) and Part 39 reconciled `ui` D2/D4 and `submit-pipeline` D3. The remaining open item is [ui Open Question 4](../../../workflows-module-concept/ui/design.md) (simple-action error recovery), which this part resolves.

## Decisions

### D1 — Shared `simple-action-surface` component; pages and modal both `_ref` it

The body of a simple action — header + universal fields + comment + the signal button bar — becomes one component, `components/simple-action-surface.yaml`, parameterised by `mode`:

| `mode`   | Renders                                                                          | Button bar                                          |
| -------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| `edit`   | universal fields (editable) + comment                                            | `submit`, `progress`, `not_required`                |
| `view`   | header + universal fields (read-only) + status-history + comments timeline       | `resolve_error` (only at stage `error` — D4)        |
| `review` | header + universal fields (read-only) + comment                                  | `approve`, `request_changes` (modal)                |

The three `simple-*` pages `_ref` it; the `simple-action-modal` (D5) `_ref`s the same. One body, two containers — this DRY payoff is the reason the surface is extracted now rather than editing three pages in place.

**State contract.** The surface reads from a single `_state.surface` namespace — `{ action, fields, comment, action_allowed }`. The page's `onMount` populates `surface.action` from `get_action` and seeds `surface.fields`; the modal's open handler fetches `get_action` for the clicked `action_id` and populates the same namespace. One read convention, two writers.

Each button's `CallAPI` payload is nullary on target:

```yaml
payload:
  action_id: { _state: surface.action._id }
  signal: submit             # or progress / not_required / approve / request_changes / resolve_error
  current_key: { _state: surface.action.key }
  fields: { _state: surface.fields }   # assignees / due_date / description
  comment: { _state: surface.comment }
```

No `form` / `form_review` (simple actions have no form body), and **no `current_status` / `target_status`** — the v0 selector payload is gone ([state-machine "What disappears"](../../../workflows-module-concept/state-machine/design.md)). The endpoint resolves to `_module.endpointId: { _build.string.concat: [update-action-, <action type>] }`, aligning with the form templates. `progress` has no `Validate` step (a draft is intentionally partial) but, like the form template ([Part 39 D2](../39-form-submit-buttons/design.md)), fires its own author hook — `onProgress` — before the engine call; the engine-side `progress_saved` log event is Part 38 (scoped out below). `submit` keeps a `Validate` step, **scoped** to the surface's own field namespace — `params: { regex: ^surface\.fields\. }` (the repo idiom for namespaced validation, cf. `^entity\.` on edit pages). The scope matters because the surface is rendered both as a page and inside the modal: an unscoped `Validate` inside the modal would validate the **entire host entity page** (every unrelated input). Scoping to `surface.fields.*` makes validation identical in both containers and confined to this action's fields.

### D2 — Button visibility reuses Part 39's `button_signal_sources.yaml` enum

Because the form and simple FSM tables are identical, this part **ships no new enum**. The surface reads the FSM source-stages at **build time via `_ref`** from `enums/button_signal_sources.yaml` (Part 39 — there is no enum→`global` wiring in this module; `_ref` resolves in a static component, not just `.yaml.njk`). Each button's `visible` is the same three-way AND as [Part 39 D3](../39-form-submit-buttons/design.md):

```yaml
visible:
  _and:
    - <author opt-out>                                    # D3
    - _array.includes:
        - _ref: { path: enums/button_signal_sources.yaml, key: submit }   # FSM source-stages (build-time)
        - _state: surface.action.status.0.stage
    - _eq: [{ _state: surface.action_allowed.edit }, true]   # per-verb role gate (Part 34 D8)
```

**The role gate is per-verb, not a single boolean.** Under [Part 34 D8](../34-action-access-model/design.md), `action_role_check` populates `_state.action_allowed: { view, edit, review, error }` (mirroring the query-time `visible_verbs`). Each button's third AND term reads the bool for **its interaction's required verb** ([Part 34 D6](../34-action-access-model/design.md)):

| Signal | Required verb | Role-gate term |
| ------ | ------------- | -------------- |
| `submit`, `progress`, `not_required` | `edit` | `_state: surface.action_allowed.edit` |
| `approve`, `request_changes` | `review` | `_state: surface.action_allowed.review` |
| `resolve_error` | `error` | `_state: surface.action_allowed.error` |

This is what lets **one shared surface** gate a mixed-verb button bar correctly — the `edit` buttons and the `review`/`error` buttons each read their own verb bool, so the same surface renders right for an editor, a reviewer, or an error-recoverer (a single boolean could not — it can't tell edit access from review access).

This deletes the `_js` priority lookup on the selector (`task-edit.yaml:144–156`) outright. A button shows exactly when its signal is coherent from the action's current stage — and [Part 38 D13(3)](../38-engine-rebuild/design.md) makes that matter: a **user-driven** signal with no FSM entry **throws**, so a button shown from an incoherent stage would surface a user error. Buttons hidden client-side are still FSM-checked server-side (a concurrent stage push the local UI didn't see resolves to an undefined cell and no-ops). The `resolve_error` button on `simple-view` falls straight out (its source list is `[error]`, gated on `action_allowed.error`).

### D3 — Author button config: match form (`not_required` opt-in), read at runtime

Form actions get per-action *generated* pages, so author opt-outs bake into the page's vars. Simple actions share **one static page per verb** across every simple action, so any per-action override must be **read at runtime** from the action's authored config.

The `makeWorkflowsConfig` resolver emits a per-simple-action button map into `global.simple_action_buttons.{action_type}`; the surface reads `_global: simple_action_buttons.<type>.<signal>.visible` as the first AND term, with the **same defaults as the form templates**:

- `submit`, `progress`, `approve`, `request_changes`, `resolve_error` → default **`true`** (author can hide).
- `not_required` → default **`false`** (opt-in), preserving form parity ([Part 39 D3](../39-form-submit-buttons/design.md), [ui D2 "(opt-in)"](../../../workflows-module-concept/ui/design.md)).

The author can *hide* a button but never *show* one the FSM rejects — the source-stage AND always applies. Per [CLAUDE.md "build for what exists"], this ships only the `visible` opt-out; full per-action *custom button sets* are out of scope until a concrete case appears.

### D4 — Error recovery: `resolve_error` on `simple-view`

A simple action reaches `error` only via a pre-hook `error` cascade ([state-machine "Simple kind"](../../../workflows-module-concept/state-machine/design.md)) — no simple page surfaces an `error` button (the engine never self-sets `error`). [ui Open Question 4](../../../workflows-module-concept/ui/design.md) left the recovery surface open. **This part resolves it as the lighter option: a `resolve_error` button on `simple-view`, rendered only when stage is `error`** (FSM `error → resolve_error → in-review`).

Rationale:

- A fourth static page for a rare cascade is heavier than the case warrants, and `simple-view` already loads the full action — it's the natural recovery context.
- The engine's `linkDefaults` for `kind: simple` **already** routes the `error` stage to `simple-view` ([Part 30 D4 table](../30-status-map-rendering/design.md): `error` → `task-view`, renamed `simple-view` by Part 35). **No Part 30 change is needed** — the button lands exactly where the engine already points.
- Visibility falls out of D2's map (`resolve_error` source = `[error]`).

`resolve_error` reuses the comment field (recovery note) and fires the standard payload. There is **no `simple-error` page** in v1.

### D5 — In-context modal: standalone component + generic `onActionClick`

Two new pieces plus one generic block event.

**`components/simple-action-modal.yaml` (standalone, reusable).** A single **`Drawer`** block, fixed blockId `simple_action_modal`, whose body `_ref`s `simple-action-surface` with `mode` derived from the action's stage. One container type for all modes: a `Drawer` holds the heavy `view` mode (fields + status-history + comments timeline) comfortably and serves the lighter `edit`/`review` surfaces equally — and a single block type keeps the one fixed blockId / one open contract intact (a runtime block cannot switch its type by mode, so two container types would mean two blockIds and break the contract).

- stage `error` → `view` (surfaces `resolve_error`); stage `in-review` and `action_allowed.review` → `review`; an actionable stage with `action_allowed.edit` → `edit`; otherwise → `view`. (The per-verb bools come from `action_role_check` — see the modal's open sequence in this decision.)

Open contract (fixed, so any host wires it the same way):

```yaml
# Host wiring (ActionSteps / EventsTimeline onActionClick):
- type: SetState
  params: { simple_action_modal: { action_id: { _event: action._id } } }
- type: CallMethod
  params: { blockId: simple_action_modal, method: open }
```

On open the modal runs the **same gating sequence the page's `onMount` runs**, for `simple_action_modal.action_id` — the surface depends on all of it (D6), and none of it runs unless the modal replicates it:

1. `get_action` (fresh — the list/timeline data may be stale) → seed `surface.action` + `surface.fields`.
2. `get_workflow` → drives the workflow-closed banner and the `required_after_close` gate on the submit buttons.
3. `action_role_check` → populates the per-verb `surface.action_allowed: { view, edit, review, error }` (Part 34 D8) that D2's role gates and the mode derivation read.

Then it renders. On a successful signal call it runs the host-supplied `onComplete` refetch (passed as a `_var`) and closes. `simple-view`-style timelines (status history, comments) are shown in the modal for `mode: view`; for `edit`/`review` the `Drawer` renders just the actionable surface.

**`ActionSteps` block — generic `onActionClick` event.** When the host wires `onActionClick`, the block fires it with the clicked action as event data **instead of** navigating; when not wired, it navigates via the user-selected per-verb link (`action.links.{verb}`, the selection [Part 34 D7](../34-action-access-model/design.md) adds to the block) — default behaviour, unchanged by this part, so notifications/overviews/deep-links are preserved and it is backward-compatible. The event is **generic** (carries the action object); the block gains no workflow-surface knowledge.

**`actions-on-entity` — bundles the single modal instance.** The component drops `simple-action-modal` once and wires `ActionSteps.onActionClick` to it, passing `entity-workflows-refetch` as `onComplete`. Apps that already use `actions-on-entity` get the modal for free — no per-app wiring (satisfies "one correct way"). Because the blockId is fixed (`simple_action_modal`), any other action surface on the same page (e.g. a co-present event timeline) targets **this same instance** by id — it does **not** drop its own. The rule is simple: **the modal is dropped exactly once per page, and `actions-on-entity` is what drops it when present.**

**Reusable without `actions-on-entity` — and graceful when absent.** The modal is **opt-in**, so there is no collision and no broken wiring on a page that lacks `actions-on-entity`:

- A page that renders the event timeline but not `actions-on-entity`, and **wants** the in-context modal, drops `simple-action-modal` itself (once) and wires `EventsTimeline.onActionClick` to it (passing its own timeline refetch as `onComplete`).
- A page with the timeline and **no modal at all** simply leaves `EventsTimeline.onActionClick` unwired — the timeline falls back to its default and **navigates to the action page** (the same per-verb-link default as `ActionSteps`). No missing-blockId target, no double-drop.

A developer never drops the standalone modal on a page that already has `actions-on-entity` (it's already bundled there), so the "exactly once" rule has no failure mode. The matching `EventsTimeline.onActionClick` event + the timeline action-items wiring belong to the timeline part ([Part 41](#discovered-gap--action-items-in-the-event-timeline-part-41)); this part defines the modal component and its open contract that Part 41 consumes.

### D6 — What carries over unchanged

The shared-page scaffolding stays: the `action_id` presence guard, `get_action` / `get_workflow` requests, `action_role_check` (now sets the per-verb `action_allowed: { view, edit, review, error }`, per [Part 34 D8](../34-action-access-model/design.md)), the workflow-closed banner + `required_after_close` gate on the submit buttons, the stale-URL guard on `simple-edit` (`[action-required, in-progress, changes-required]`) and `simple-review` (`[in-review, error]`), and `simple-view`'s status-history + comments cards (now inside the surface component). Only the selector, the `interaction:`/`current_status` payloads, and the per-button `_js` visibility are replaced.

## Discovered gap — action items in the event timeline (Part 41)

The reference project's entity timeline has a **history / actions / comments** filter; in **actions** mode it shows the **most recent event per action** (the rest filtered by aggregation) as a status-coloured antd-`Alert`-style box linking to the action. The capability is **half-shipped** here:

- **Block side — already built.** `EventsTimeline.js:356` (`EventAction`) renders an action as a status-coloured card (`border_color`/`card_color` from `actionStatusConfig`), hides `blocked`, shows `action.message`, and renders a `Link` to `action.link` (`:399–416`). It reads `event.actions[]` per event (`:477`).
- **Module side — missing.** `events-timeline.yaml` passes `eventTypeConfig` but **not** `actionStatusConfig` (`:74–110`); there is no aggregation that dedupes to most-recent-event-per-action and attaches `event.actions[]`, and no filter toggle.

Part 41 wires this and adds the generic `EventsTimeline.onActionClick` event, then consumes **this part's** `simple-action-modal` component (host-composed, per D5). It is a **display surface** (renders all action kinds, peer to `actions-on-entity`), orthogonal to the simple-action *submit* surfaces this part owns — hence a sibling part. Captured here so the finding isn't lost.

## Concept-doc reconciliation

| File | Change |
| ---- | ------ |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) Open Question 4 | **Resolve:** simple-action error recovery is a `resolve_error` button on `simple-view` (D4), no `simple-error` page. Move from Open Questions into Decision 7's body. |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) Decision 7 | Already signal-based — add the D3 note (button `visible` opt-outs read at runtime from `global.simple_action_buttons`, `not_required` opt-in), the resolved error-recovery line, and the in-context modal (D5) as the in-app open path alongside the page. |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) Decision 3 (`actions-on-entity`) | Note the bundled `simple-action-modal` + `ActionSteps.onActionClick` wiring. |
| [state-machine `Next step` item 3](../../../workflows-module-concept/state-machine/design.md) | Mark the remaining sub-question (how simple pages surface `error` recovery) as resolved by this part. |

No change to `submit-pipeline` D3 or `ui` D2/D4 — Part 39 already reconciled those.

## Files changed

### Module pages + components

| File | Change |
| ---- | ------ |
| `modules/workflows/pages/simple-edit.yaml` | Delete the status `Selector`, the "No transitions available" Alert, and the `current_status` payload. Body moves to the shared surface (`mode: edit`). `interaction: submit_edit` → `signal: submit`. Align endpoint to `_module.endpointId`. |
| `modules/workflows/pages/simple-view.yaml` | Body moves to the shared surface (`mode: view`); add the conditional `resolve_error` button (D4). |
| `modules/workflows/pages/simple-review.yaml` | Body moves to the shared surface (`mode: review`); keep `request_changes_modal`. `interaction:` → `signal:`. Align endpoint. |
| `modules/workflows/components/simple-action-surface.yaml` (new) | The shared body — header + universal fields + comment + signal button bar, `mode` param. Reads `_state.surface.*`, `_ref` of `enums/button_signal_sources.yaml` (build-time FSM source-stages), `_global: simple_action_buttons`. |
| `modules/workflows/components/simple-action-modal.yaml` (new) | Standalone modal (fixed blockId, open contract, `onComplete` var) wrapping the surface (D5). |
| `modules/workflows/components/actions-on-entity.yaml` | Bundle `simple-action-modal`; wire `ActionSteps.onActionClick` → open it with `entity-workflows-refetch` as `onComplete`. |
| `modules/workflows/resolvers/makeWorkflowsConfig.js` | Emit `global.simple_action_buttons.{type}.{signal}.visible` (D3 defaults). |

### Plugin

| File | Change |
| ---- | ------ |
| `plugins/.../blocks/ActionSteps/ActionSteps.js` | Generic `onActionClick` event: fire with the clicked action instead of navigating when wired; navigate via the user-selected per-verb link otherwise (default unchanged — per-verb link selection itself is [Part 34 D7](../34-action-access-model/design.md)). |
| `plugins/.../blocks/ActionSteps/ActionSteps.test.js` | Cover both modes (event fires when wired; link navigates when not). |

(`EventsTimeline.onActionClick` + timeline wiring → Part 41.)

### Tests

- **E2E (Part 22 supplements)** on the demo's `schedule-followup` simple action: (a) Mark Started (`progress`) on `action-required` lands `in-progress`, persists due-date without advancing; (b) `submit` resolves `in-review` vs `done` per the `review` verb (nullary); (c) a button absent from a stage's source list is not rendered; (d) error recovery: a cascaded `error` shows `resolve_error` on `simple-view`/modal and recovers to `in-review`; (e) clicking a simple action in `actions-on-entity` opens the modal and submits without navigation, then the list refetches.
- **Resolver unit** — `makeWorkflowsConfig` emits `simple_action_buttons` with `not_required` default `false`, others `true`; author override respected.

### Concept docs

Per [Concept-doc reconciliation](#concept-doc-reconciliation): `ui/design.md` (OQ4, Decisions 3 + 7), `state-machine/design.md` (Next-step item 3).

### Parent design

Add a Part 40 row to [`designs/workflows-module/design.md`](../../design.md) follow-on parts (depends on Parts 34, 35, 38, 24; with/after 39). Flag that Part 34 (per-verb access model) is not yet in the parent dependency graph — Part 40 adopts its model, so the parent should slot Part 34 ahead of the 24/39/40 UI wave and note that 24/39 migrate to per-verb alongside. Note the discovered Part 41 (action items in timeline) as a follow-on that consumes this part's modal.

## Out of scope

- **Form-action surfaces** — Part 39. This part touches only the three static simple pages, the surface/modal components, `actions-on-entity`, `ActionSteps`, and the resolver.
- **Action items in the event timeline + `EventsTimeline.onActionClick`** — Part 41; consumes this part's `simple-action-modal`.
- **Modal on overview pages** — they *are* full pages; they navigate.
- **The `update-action-{type}` endpoint / engine FSM** — Part 38.
- **A `simple-error` page** — resolved against (D4).
- **Full per-action custom button sets** — D3 ships only the `visible` opt-out parity with form.
- **`progress` engine behaviour** (`progress_saved` event, field persistence) — Part 38.

## Related

- [Part 39 — Form submit buttons](../39-form-submit-buttons/design.md) — sibling; ships `enums/button_signal_sources.yaml` and the concept reconciliation this part consumes; scopes simple actions out to here.
- [state-machine](../../../workflows-module-concept/state-machine/design.md) — signal inventory, FSM tables, "Simple kind" (identical to form), "Default v1 button bars".
- [Part 38 — Engine rebuild](../38-engine-rebuild/design.md) — the `signal` contract; user-driven unlisted signals throw (D2 rationale).
- [Part 34 — Action access model](../34-action-access-model/design.md) — the per-verb access model this part builds on: `visible_verbs` / per-verb `action_allowed` (D8) gate the mixed-verb surface, and `action.links.{verb}` (D7/D9) drive navigation.
- [Part 30 — Status-map rendering](../30-status-map-rendering/design.md) — the engine-written link consumed by every display surface (single `link` per D4, superseded by Part 34 D7's per-verb `links`); makes the page the canonical target.
- [Part 35](../35-rename-task-kind-to-simple/design.md), [Part 24](../24-universal-fields/design.md) — upstream renames + the real universal-fields renderer.
- [ui](../../../workflows-module-concept/ui/design.md) Decisions 3 + 7, Open Question 4 — the simple-action UX this part implements and resolves.
