# Review 1 — Verification against dependencies, source, and the access model

Verified the design's factual claims against Parts 30/34/35/38/39, the `state-machine` / `ui` concept docs, and the shipped source (`task-*.yaml`, `ActionSteps.js`, `EventsTimeline.js`, `action_role_check.yaml`, `makeWorkflowsConfig.js`). Most cross-reference claims check out — the FSM table identity, the signal inventory, `resolve_error: error → in-review`, the nullary-`submit` rule, "What disappears", the `error`-via-cascade-only invariant, Part 38 D13(3) throw policy, the `task-*.yaml` line citations, the `ActionSteps`/`EventsTimeline` block facts, and that `makeWorkflowsConfig` emits no button config today. Three substantive problems and several gaps remain.

## Blocking — factual / model errors

### 1. `global.workflow_button_sources` does not exist — Part 39 ships a build-time `_ref` enum, not a runtime global

> **Resolved.** Verified against Part 39 D3 (`design.md:125`): the module ships `enums/button_signal_sources.yaml` read at build time via `_ref`, with no enum→`global` wiring. Corrected every `global.workflow_button_sources` reference (§intro, proposed-change 3, §"Why a dedicated part", Dependencies, D2 heading/body/code block, Files-changed table, Related) to the build-time `_ref` form. D3's `global.simple_action_buttons` is left as a runtime global — correctly, since it carries per-action author opt-outs across one static page per verb.

The design repeatedly says it "reuses Part 39's `global.workflow_button_sources` map" and the D2 code block reads `_global: workflow_button_sources.submit` (design §7 intro, line 7; D2 lines 83–93; Files-changed line 179). Part 39 explicitly decided the opposite:

> "The module ships `modules/workflows/enums/button_signal_sources.yaml`, read at build time via `_ref` **(not loaded into a runtime global — there is no enum→`global` wiring in this module**…" — Part 39 design.md:125

Part 39's actual `visible` term is build-time:

```yaml
- _array.includes:
    - _ref: { path: enums/button_signal_sources.yaml, key: submit }
    - _state: action.status.0.stage
```

So there is no `global.workflow_button_sources` to reuse. The fix is mechanical and keeps "reuse verbatim" intact: the shared surface should read the FSM source-stages with the same **build-time `_ref`** Part 39 uses (`_ref` works in a static component, not just `.yaml.njk`). Correct every `_global: workflow_button_sources.*` reference in §7, D1, D2, and the files-changed table to the `_ref` form.

Note this is distinct from D3's `global.simple_action_buttons` — _that_ one genuinely must be a runtime global (per-action author opt-out, one static page serving all simple actions of a verb), and is correctly reasoned. The design conflates the two under "globals"; only the author-opt-out map is a global.

### 2. A single `action_allowed` boolean cannot gate the mixed-verb shared surface / modal

> **Resolved.** Via Finding 3's adoption of Part 34. D2's role gate is now per-verb: each button reads `action_allowed.{required_verb}` (`edit` for submit/progress/not_required, `review` for approve/request_changes, `error` for resolve_error — Part 34 D6/D8). Added a signal→verb→gate-term table to D2 and updated the modal's mode derivation to read `action_allowed.review` / `.edit`. One shared surface now gates a mixed-verb bar correctly.

D2's role-gate term is one boolean: `_eq: [{ _state: surface.action_allowed }, true]` (lines 92, and the D4/D3 reuse). But `action_role_check.yaml` produces a **single** `action_allowed` from the action-wide `access.roles` list (`action_role_check.yaml:4–29`) — it does not distinguish edit-verb from review-verb access.

On the three static pages today this is fine: each page is a single verb context (edit page → edit, review page → review). But this part's whole premise (D1) is **one shared surface across `edit`/`view`/`review`**, and the modal (D5) renders **edit buttons or review buttons depending on the runtime-derived mode**. A single boolean can't correctly gate both — and the design half-knows this: D5's mode derivation says "stage `in-review` and the user **has the `review` verb** → `review`" (line 126), i.e. it already needs per-verb access, while D2 gates every button with one verb-agnostic boolean. Internally inconsistent and under-specified.

The clean resolution is Finding 3 (adopt Part 34's per-verb `visible_verbs`). Absent that, the design must at minimum say which verb `action_role_check` is run for in each mode, and how the modal computes edit-vs-review access for its mixed button bar.

### 3. The design is built on the pre-Part-34 access/link model and never mentions Part 34

> **Resolved.** Adopted Part 34's per-verb model throughout. Added Part 34 as a dependency (with a sequencing callout: it must land before/with this part, and siblings 24/39 migrate too — cross-wave work flagged to the parent design, which doesn't yet list Part 34 in its dependency graph). Role gates are now `action_allowed.{verb}` (D2), navigation uses `action.links.{verb}` (engine-link section), and the parent-design row + Related section name Part 34.

[Part 34 — Action access model](../../34-action-access-model/design.md) is foundational and upstream of Part 24 (which Part 34 says it "unblocks", 34:9) — and Part 40 depends on Part 24. Part 34 replaces exactly the two mechanisms Part 40 leans on:

- **D8:** the binary `action_allowed` becomes a per-verb `visible_verbs: { view, edit, review, error }` map returned by `get-entity-workflows` (34:20, 81).
- **D9:** the engine-written `action[slug].link` becomes `action[slug].links` keyed by verb; "the UI picks the user-appropriate link at render time" (34:21).

Part 40 uses `action_allowed` (D2/D4) and `action.link` (the entire "Surfaces, the engine link" section, lines 28–39; D5's `EventsTimeline.js:399–416` navigation) throughout, and **lists no dependency on Part 34** (line 24). This is broader than Part 40 — Parts 24 and 39 also still reference `action_allowed` — so the real ask is a sequencing decision: either Part 34 is deferred and these parts stay on the binary model, or Part 34 lands first and 24/39/40 adopt the per-verb model. Part 40 is where it bites hardest, because the mixed-verb surface (Finding 2) is _only_ clean under `visible_verbs`. State the ordering explicitly; if after Part 34, the role gate becomes `visible_verbs.edit` / `.review` / `.error` per button and the link section becomes `action.links.{verb}`.

## Gaps — under-specified mechanics

### 4. The modal's open handler needs `get_workflow` + `action_role_check`, not just `get_action`

> **Resolved.** D5's open sequence now spells out the full page-equivalent gating: `get_action` (seed `surface.action`/`fields`) → `get_workflow` (closed banner + `required_after_close` gate) → `action_role_check` (per-verb `surface.action_allowed`, Part 34 D8) → render. The modal replicates the page's `onMount` scaffolding the surface depends on (D6).

D5 says "on open the modal fetches `get_action` … populates `_state.surface`, and renders" (line 138). But D6 lists the **page** scaffolding the surface depends on: the workflow-closed banner + `required_after_close` gate (driven by `get_workflow`) and the role gate (`action_role_check` → `action_allowed`). Inside the modal none of that runs, so the closed-workflow gate and the role/visibility gates silently break. Spell out the modal's full open sequence: `get_action` → `get_workflow` → `action_role_check` (for the correct verb) → seed `surface.*`.

### 5. Fixed blockId `simple_action_modal` collides when a page hosts both `actions-on-entity` and the event timeline

> **Resolved.** Single shared instance, dropped exactly once. `actions-on-entity` bundles the one `simple_action_modal`; a co-present surface (timeline) targets that same fixed blockId by id and drops nothing. The modal is **opt-in**, so there's no failure mode: a timeline page without `actions-on-entity` either drops the standalone modal itself (and wires to it) or leaves `EventsTimeline.onActionClick` unwired, in which case the timeline falls back to navigating to the action page (the per-verb-link default). No double-drop, no missing target.

D5 fixes the blockId to `simple_action_modal` "so any host wires it the same way" (lines 124, 130–136) **and** has `actions-on-entity` _bundle_ the modal (line 142), while a timeline host "drops `simple-action-modal` itself" (line 144). The reference project's entity page has **both** `actions-on-entity` and the action-items timeline (this design cites that exact layout in the Part 41 gap, lines 150–157). Such a page would instantiate two blocks with the same fixed id → duplicate-blockId collision, and both `onActionClick` handlers would target the same id. Reconcile: a host with both surfaces should drop **one** shared modal that both `onActionClick`s target — which contradicts "`actions-on-entity` bundles it, no per-app wiring." Decide whether the modal is host-owned-once or component-bundled, not both.

### 6. `Validate` on `submit` inside the modal is unscoped

> **Resolved.** Scoped the `submit` `Validate` to the surface's field namespace — `params: { regex: ^surface\.fields\. }` (the repo idiom, cf. `^entity\.` on edit pages; Lowdefy `Validate` scopes by state-key regex, not blockId). Because the surface lives entirely under `_state.surface`, this confines validation to the action's own fields and behaves identically on the page and inside the modal — never reaching the host entity page's unrelated inputs.

D1 says "`submit` keeps `Validate` on `fields.*`" (line 79). On a static page that validates the page; inside the modal an unscoped `Validate` validates the **entire host entity page**, including unrelated inputs. Lowdefy `Validate` must be scoped to the surface/modal area (see `r:lowdefy-form-validation` — scope validation to a form/modal). Specify the scope for the modal context.

### 7. Drawer-vs-Modal container is left ambiguous despite a fixed blockId

> **Resolved.** Picked one container: `simple_action_modal` is a `Drawer` for all modes. A drawer holds the heavy `view` mode (fields + status-history + comments) and the lighter edit/review surfaces equally, and one block type preserves the single fixed-blockId open contract (a block can't switch type by runtime mode). Removed the "container choice is implementation detail" deferral.

D5 says "a `Drawer` may suit `view`, a centered `Modal` `edit`/`review` — container choice is implementation detail" (line 138), but the open contract targets a **single** fixed blockId `simple_action_modal` with `CallMethod: open`. A single component/block cannot switch its block _type_ (Modal vs Drawer) by runtime mode. Per CLAUDE.md "resolve the open question; don't defer," pick one container type for `simple_action_modal`. (Two container types means two blockIds, which breaks the single fixed-id open contract.)

## Minor

### 8. "`progress` fires no author verb" contradicts Part 39 D2

> **Resolved.** Verified against Part 39 D2 (`design.md:115`): `progress` _does_ fire its own author hook `onProgress` before the engine call; only the `progress_saved` log event is engine-side. Rewrote the D1 parenthetical: `progress` has no `Validate` but fires `onProgress` like the form template, with `progress_saved` scoped to Part 38.

Line 79: "`progress` has no `Validate` step and fires no author verb (mirrors [Part 39 D2])." Part 39 D2 says the opposite — `progress` "fires its own author event verb — `onProgress`" (Part 39 design.md:115). The surface-side facts the design needs are right (no `Validate`, fire `signal: progress`); the verb is engine-side and already scoped out (line 214). Fix the parenthetical to match Part 39: no `Validate`; the engine fires `onProgress`.

### 9. `action.link` (singular) in the engine-link section is stale under Part 34

> **Resolved.** Via Finding 3. The "Surfaces, the engine link" section now describes `action[app_name].links = { view, edit, review, error }` and the `edit > review > error > view` selection rule (Part 34 D7); the surface table and both `ActionSteps` navigation-default mentions (D5 + files-changed) read "user-selected per-verb link." Current-state/already-built descriptions of today's shipped `action.link` code (lines 50, 166) are left as accurate facts about pre-34 code.

Tied to Finding 3: the "Surfaces, the engine link" section (lines 28–39) and the navigation default both lean on `action[app_name].link = { pageId, urlQuery }`. Under Part 34 D9 this is `action[slug].links` (per-verb). If Part 34 lands first, `ActionSteps`/`EventsTimeline` navigate via the user-appropriate per-verb link and `onActionClick` carries an action whose `link` is a map — reconcile alongside Finding 3.

## Verified accurate (no action)

FSM table form/simple identity; six-signal inventory; `resolve_error: error → in-review`; nullary `submit` resolving review-verb → `in-review` else `done`; "What disappears" (selector + `current_status`/`target_status` gone); `error`-only-via-cascade; Part 38 D13(3) throw; ui OQ4 / Decision 3 / Decision 7 / D2 "(opt-in)"; Part 30 D4 "display is dumb" + `error → simple-view` default routing (so no Part 30 change for D4 — correct); Part 35 page renames; Part 24 ships the real renderer and the stub exists; all `task-*.yaml` line citations; `ActionSteps`/`EventsTimeline` block facts; `events-timeline.yaml` omits `actionStatusConfig`; `makeWorkflowsConfig` emits no button config today.
