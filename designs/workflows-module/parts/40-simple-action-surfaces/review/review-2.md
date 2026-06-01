# Review 2 — Verification against shipped source (post Part-38 wave)

Review 1 verified the design's cross-references and all eight findings are resolved in the
prose. This pass checks the design against the **code that has since shipped** — the
per-verb `action_role_check.yaml` + `evaluateVerbGate.js` (Part 38 task 8), the resolver →
connection wiring (`makeWorkflowsConfig.js`, `validated_workflows_config.yaml`,
`action_form_configs.yaml`), the simple pages, and `ActionSteps.js` / `EventsTimeline.js`.
The cross-part facts hold; two structural problems and several gaps surface only when the
design meets the actual wiring.

## Blocking — structural

### 1. The per-verb link *selection* in the blocks is unowned — and Part 38 breaks navigation before this part fixes it

The design's navigation default (the "Surfaces, the engine link" section; D5; Files-changed
`ActionSteps.js` row) reads *"navigate via the user-selected per-verb link `action.links.{verb}`
… default unchanged by this part — per-verb link selection itself is [Part 34 D7]."* Task 02
repeats this: *"Per-verb link selection … is Part 34's scope, not this task's … keep using
whatever link field the block reads today."*

That hand-off has no landing pad:

- **Part 34 ships no code.** `34-action-access-model/design.md:7`: *"completed as a design/
  contract without a standalone implementation … implemented as part of Part 38 … Part 38 is
  the implementation vehicle."*
- **Part 38 is engine-only.** It writes `action[slug].links` (per-verb map) and **deletes** the
  singular `action[slug].link` write (`34:417`: *"Part 30's `buildActionStageUpdate` is deleted
  by Part 38"*). The UI selection rule — *"Update `actions-on-entity` rendering to read
  `visible_verbs` and select per-verb links"* (`34:419`) — is a **block/UI** change, not engine
  work, so Part 38 does not do it.
- **The blocks still read singular `link`.** `ActionSteps.js:171–174` reads
  `action?.link?.pageId/urlQuery`; `:146` disables on `!action?.link`. `EventsTimeline.js:364`:
  `const link = action.link;`. Neither reads `action.links` or `visible_verbs`.

Net: once Part 38 lands, the engine writes `links` (plural) and stops writing `link`, so
`action.link` is `undefined` → every `ActionSteps`/`EventsTimeline` row renders a disabled link
and navigation is dead — for notifications, overviews, and the `onActionClick`-unwired fallback
this part leans on as "backward-compatible." No part owns the fix: Part 34 is contract-only,
Part 38 is engine-only, and Part 40 explicitly disclaims it.

**Fix.** Part 40 is the natural owner — it is already editing `ActionSteps.js`'s navigation path
(adding `onActionClick` *alongside* the navigate branch) and `EventsTimeline` is its sibling
(Part 41). Implement the `visible_verbs`-driven selection (`edit > review > error > view` over
`action.links`, the rule at `34:202–211`) in the navigate branch as part of this part, **or**
name the explicit part that does and sequence it before Part 38 reaches the demo. Either way,
drop "default unchanged" — Part 38 changes the doc shape out from under the current default.

### 2. `global.simple_action_buttons` is mis-wired to a resolver that has no global path — and is unnecessary

D3 and Files-changed say *"the `makeWorkflowsConfig` resolver emits a per-simple-action button
map into `global.simple_action_buttons.{action_type}`"*, read via `_global`. Two problems:

1. **`makeWorkflowsConfig` cannot emit a global.** Its output has a single fixed consumer: it
   flows through `components/validated_workflows_config.yaml` (`_ref: { resolver: … }`) into the
   **`workflow-api` connection's `workflowsConfig` property** (`connections/workflow-api.yaml:11`)
   — a server-side connection config, an array, not a runtime global. A Lowdefy resolver `_ref`
   resolves to one value; you cannot bolt a second `global.*` output onto it without changing the
   array shape the connection consumes. The module's per-action build-time config uses a
   **dedicated** resolver-backed `_ref` component instead — `makeActionFormConfigs.js` →
   `components/action_form_configs.yaml`, `_ref`'d into the overview pages.
2. **There is no resolver→runtime-global mechanism in this module at all.** Task 01 step 2 admits
   it: *"There is no existing enum→global wiring in this module, so this is the first global-config
   emission"* and then offers two hand-waves ("through a module-provided component referenced from
   the host's global block, or extend the resolver"). Per CLAUDE.md *"resolve the open question;
   don't defer,"* a first-of-its-kind global mechanism shouldn't be left to "convention."

And it is **unnecessary**: `actions-on-entity.yaml:75–76` already reads the authored config
client-side as `workflowsConfig: { _module.var: workflows_config }` (the raw module var). The
author button opt-outs are authored *in* `workflows_config`, so the surface can read them the
exact way `actions-on-entity` already does — `_module.var: workflows_config`, find the action by
type, read `…buttons.{signal}.visible` with a `default:`. No new resolver output, no new global.

**Fix.** Drop the `simple_action_buttons` global. Either (a) read author opt-outs from
`_module.var: workflows_config` at runtime in the surface, mirroring `actions-on-entity`
(simplest, "build for what exists"); or (b) if a curated/defaulted shape is wanted, add a
**dedicated** resolver + `_ref` component in parity with `action_form_configs.yaml` (build-time,
`_ref`'d into the surface) — *not* a runtime global and *not* an extra output on
`makeWorkflowsConfig`. Update D3, Files-changed, Task 01, and the concept-doc reconciliation
(Task 07 line 19/29 still says `global.simple_action_buttons`).

## Gaps — under-specified mechanics

### 3. The "single `_state.surface` namespace" doesn't survive the shared `action_role_check` component

D1's state contract puts everything under one namespace — `_state.surface.{action, fields,
comment, action_allowed}` — and D2 gates on `_state: surface.action_allowed.edit`. But the
shipped `components/action_role_check.yaml:13–15` is a `SetState` with a **hardcoded** target
key `action_allowed` (root, not `surface.action_allowed`), and `simple-edit.yaml:171` reads
`_state: action_allowed.edit` to match. The component is *shared* across pages, so its write
target is fixed.

D6 lists `action_role_check` under "what carries over unchanged" and says it "now sets the
per-verb `action_allowed`" — but never states that its output must be **relocated** under
`surface.` for the single-namespace contract to hold. Task 04 (line 61) caught this and proposes
"parameterise the component's target key, or a following `SetState` that maps it"; the **design**
should make that call explicitly (parameterising the shared component's target key is the "one
correct way" — a trailing remap `SetState` is opt-in glue every caller must remember). Pick one
and record it; right now D1/D2 and the shipped component disagree on where `action_allowed` lives.

(Note: the design's dependency framing and Tasks 03/04/tasks.md still describe
`action_role_check` as *"emits a single boolean … the per-verb migration must land before this
part."* That migration **already shipped** — `action_role_check.yaml` + `evaluateVerbGate.js`
write the per-verb `{ view, edit, review, error }` map today (commit 68b9b09, "Part 38 task 8").
The design's D6 is correct; the cross-wave "must land before" caveat is stale and should be cut.)

### 4. The modal's `view` mode needs the comments aggregation, which D5's open sequence omits

D5 says `mode: view` in the modal renders *"status history, comments"* and lists the open
sequence as `get_action → get_workflow → action_role_check → render`. But `simple-view`'s comments
are **not** on the action doc — they come from a separate aggregation `get_comment_events` over
the `events` collection (`simple-view.yaml:207–233`), fetched by a nested `onMount` inside the
comments card and filtered to the page's action. In the modal there is no `?action_id` URL query
and no page-level request, so:

- the comments timeline needs its own request **wired to `surface.action._id`** (not the URL
  query), and
- for the surface to be genuinely container-agnostic (D1's whole premise), it must **own** that
  fetch relative to `surface.*` — otherwise the comments card works on the page and renders empty
  in the modal.

Add the comments aggregation to the surface's self-contained data fetching (keyed off
`surface.action._id`) and to D5's open-sequence description, or state that `view`-mode comments
are page-only and the modal's `view` shows status-history only.

### 5. The `^surface\.fields\.` Validate scope imposes an unstated contract on Part 24's universal-fields

D1 scopes `submit`'s `Validate` to `params: { regex: ^surface\.fields\. }`. Lowdefy `Validate`
matches **state keys**, so this only validates the universal-fields inputs if their block IDs are
`surface.fields.assignees` etc. (the "input IDs match data paths" idiom). Today
`universal-fields.yaml` is still the Part 24 stub (`Box, visible: false`), and `simple-edit.yaml`
currently primes top-level `fields.*` with Validate regex `^fields\.`. So the surface's scope
silently depends on Part 24's renderer namespacing its inputs under `surface.fields.*` — a
contract the design relies on but never states. Pin it: the universal-fields renderer (Part 24)
must accept a state-namespace so its inputs live under `surface.fields.` when hosted in the
surface, otherwise the scoped `Validate` matches nothing.

## Minor

### 6. `simple_action_buttons` keyed by `action.type` assumes global type uniqueness

If finding 2 is resolved toward a per-type map (Task 01 keys `simple_action_buttons[action.type]`),
note that `makeWorkflowsConfig` only enforces action-`type` uniqueness **within** a workflow
(`validateWorkflow`'s per-workflow `actionTypes` Set), not across workflows. A type-keyed global
(like `makeActionFormConfigs`'s `out[action.type] = entry`) collides if two workflows share a
simple action type. Pre-existing in `makeActionFormConfigs`, so low priority — but reading from
`_module.var: workflows_config` per workflow (finding 2 option a) sidesteps it entirely.

## Verified accurate (no action)

`action_role_check.yaml` now emits the per-verb `{ view, edit, review, error }` map gated by
`evaluateVerbGate` semantics (matches D2/D6); the action `access` map is per-app per-verb
(`makeWorkflowsConfig.validateActionAccess`); `simple-view` sources comments via a separate
`events` aggregation; the three simple pages still run the old selector/`interaction:`/
`current_status` model the design replaces; `ActionSteps`/`EventsTimeline` block facts; the FSM
identity, signal inventory, `resolve_error: error → in-review`, nullary-`submit`, and Part 30
`error → simple-view` routing carried over from Review 1.
