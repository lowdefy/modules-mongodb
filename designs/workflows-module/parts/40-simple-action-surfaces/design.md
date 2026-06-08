# Part 40 — Simple-action surfaces: signal buttons, error recovery, in-context modal

**Layer:** module shared pages + two new module components (surface + modal) + a generic `ActionSteps` block event + concept-doc reconciliation. The surfaces render **dumb** off [Part 46](../46-debundle-workflow-config/design.md)'s `GetAction` (per-verb `action_allowed` + per-signal `buttons`, resolved server-side); the `allow_not_required` flag's server machinery moved to Part 46. **Size:** M (smaller post-46 — the client button/access computation is gone). **Repo:** `modules/workflows/pages/`, `modules/workflows/components/`, `plugins/.../blocks/ActionSteps/`, concept docs.

The three shared simple-action pages (`workflow-action-edit` / `workflow-action-view` / `workflow-action-review`, renamed `task-*` → `simple-*` by [Part 35](../_completed/35-rename-task-kind-to-simple/design.md), then `simple-*` → `workflow-action-*` by [Part 38 task 18](../_completed/38-engine-rebuild/tasks/18-display-surface-renames.md) per review-14 #1) still run the **old interaction model**: `workflow-action-edit` carries a status **selector** with a `_js` priority filter (`workflow-action-edit.yaml:135`) and a `current_status` payload, and all three pages fire `interaction:` rather than `signal:`. The engine moved to **signals + FSM** ([state-machine](../../../workflows-module-concept/state-machine/design.md), [Part 38](../_completed/38-engine-rebuild/design.md)), and the form templates were migrated by [Part 39](../_completed/39-form-submit-buttons/design.md), which shipped the `enums/button_signal_sources.yaml` build-time visibility enum (read via `_ref`) and **explicitly handed the simple surfaces to this sibling** ([Part 39 § Simple actions are separate](../_completed/39-form-submit-buttons/design.md)).

This part rewrites the three shared pages to the signal model, deletes the status selector, resolves the simple-action **error-recovery** question, and adds an **in-context modal** so the live working surfaces (`actions-on-entity` and the event-timeline action items) can open a simple action without a full page navigation. With [Part 46](../46-debundle-workflow-config/design.md) sequenced first, the surfaces **consume `GetAction`'s server-resolved `action.buttons` and `action_allowed`** — no client-side visibility computation, no `action_role_check` mirror, no `button_signal_sources` `_ref`.

## Proposed change

1. **Delete the `workflow-action-edit` status selector** and its `current_status` / `target_status` payload (`workflow-action-edit.yaml:121–156, 210–211`). Replace with the same nullary signal button bar as the form edit template — `submit`, `progress`, `not_required`. `submit` carries no target; the engine resolves `in-review` vs `done` from the action's `review` verb.
2. **`interaction:` → `signal:` on all three pages** (`submit_edit` → `submit`; `approve` / `request_changes` keep their names), dropping `current_status`. No interaction→status logic on the page — the engine's FSM owns it.
3. **Each signal button reads its server-resolved `action.buttons.{signal}` boolean** from `GetAction` ([Part 46 D5](../46-debundle-workflow-config/design.md)) — the FSM source-stage check, per-verb role gate, and `allow_not_required` are AND-ed server-side. No client visibility computation, no enum `_ref`, no `action_role_check` ([D2](#d2--button-visibility-reads-actionbuttons-from-getaction)).
4. **Add the `progress` button to `workflow-action-edit`** (titled "Mark Started"): `signal: progress`, persists the universal fields without advancing, lands `in-progress`.
5. **Resolve error recovery: a `resolve_error` button on `workflow-action-view`**, rendered only when stage is `error` (FSM `error → resolve_error → in-review`). **No `simple-error` page.** Closes [ui Open Question 4](../../../workflows-module-concept/ui/design.md).
6. **One per-action policy flag: `allow_not_required`** — authored at the action root, gating the `not_required` signal for **every** kind. Its validation, server-side enforcement, and button resolution live in [Part 46](../46-debundle-workflow-config/design.md) (D5); this part only consumes `action.buttons.not_required`. No other per-action button config ([D3](#d3--allow_not_required-the-single-engine-enforced-opt-in-all-other-buttons-fixed)).
7. **Extract the body into a shared `simple-action-surface` component** (universal fields + comment + signal buttons, `mode: edit|view|review`). The three pages and the modal both `_ref` it — one body, two containers.
8. **Ship a standalone `simple-action-modal` component** and a generic `onActionClick` event on the `ActionSteps` block. `actions-on-entity` bundles the modal and wires the event; any page hosting the event timeline can drop the modal and wire it independently ([D5](#d5--in-context-modal-standalone-component--generic-onactionclick)).

## Why a dedicated part (sibling to Part 39)

Part 39 owns the four **generated** form `.yaml.njk` templates; this part owns the three **static shared** pages plus the modal that opens simple actions in place. [Part 39 § Simple actions are separate](../_completed/39-form-submit-buttons/design.md) records the split as a file-locality call: form and simple share the signal vocabulary and FSM, but the page *files* differ (static shared pages vs generated templates) and the *content* differs (universal-fields + comment vs a form schema). Both kinds' button visibility is now resolved server-side by [Part 46](../46-debundle-workflow-config/design.md)'s `GetAction` (the `button_signal_sources` `_ref` is deleted from both surfaces); this part consumes that contract plus Part 39's concept reconciliation.

**Dependencies.** Sequences after [Part 46](../46-debundle-workflow-config/design.md) (the `GetAction` contract — per-verb `action_allowed` + per-signal `buttons` resolved server-side; **this part is paused until 46 lands**), [Part 34](../_completed/34-action-access-model/design.md) (the **per-verb access model** — `action[slug].links` keyed by verb [D7/D9] and the `{ view, edit, review, error }` verb bag, now surfaced via `GetAction` rather than the retired `action_role_check` [D8]), [Part 35](../_completed/35-rename-task-kind-to-simple/design.md) (`task-*` → `simple-*` renames, `kind: simple`), [Part 38](../_completed/38-engine-rebuild/design.md) (the `update-action-{type}` endpoint accepts `signal`, drops `force`/`current_status`), and [Part 24](../24-universal-fields/design.md) (the real `universal-fields` renderer — today a stub, `universal-fields.yaml:1` — including its `state_path` namespace var, D1). [Part 39](../_completed/39-form-submit-buttons/design.md) shipped the signal-model form templates; Part 46 rewrites their button bars to consume `GetAction`, so this part no longer shares Part 39's `button_signal_sources` `_ref` (46 deletes it from the surfaces).

> **Part 34 sequencing.** Part 34 reworks the access model the whole UI wave reads from. Part 40 builds on its **per-verb** shape throughout (role gates are `visible_verbs.{verb}`, navigation uses `action.links.{verb}`). This requires Part 34 to land before (or with) this part, and means siblings [Part 24](../24-universal-fields/design.md) and [Part 39](../_completed/39-form-submit-buttons/design.md) — which still reference the binary `action_allowed` / single `action.link` — migrate to the per-verb model too. Slotting Part 34 into the parent dependency graph and aligning 24/39 is cross-wave work tracked at the parent design, not owned here.

## Surfaces, the engine link, and where the modal fits

Every surface that renders an action reads a **single server-resolved `action.link`**: the engine writes the per-verb map `action[app_name].links = { view, edit, review, error }` — one `{ pageId, urlQuery }` per verb, `null` where the stage has no page for that verb — on every transition ([Part 34 D7/D9](../_completed/34-action-access-model/design.md), implemented by [Part 38](../_completed/38-engine-rebuild/design.md)), and the reads collapse that map to the one user-appropriate link by static priority `edit > review > error > view` ([Part 42 D5](../_completed/42-timeline-action-cards/design.md) moved this server-side in the shared `visible_verbs.yaml` + `resolve_action_link.yaml` stages; [Part 46 D2](../46-debundle-workflow-config/design.md) ports it into the engine read methods for the entity/overview reads, leaving the YAML stages on the timeline path only — D6). The blocks stay dumb and keep reading the singular `action.link`. The page is therefore the **canonical, addressable target** and ships regardless — a notification can only deep-link to a module-owned page (the engine never learns the host app's entity-page URL), so it always navigates.

The modal is an **in-app shortcut layered on the live working surfaces**, never a replacement for the page:

| Surface | Renderer | Default behaviour | Modal? |
| ------- | -------- | ----------------- | ------ |
| `actions-on-entity` | `ActionSteps` block | navigate via the server-resolved `action.link` | **Yes** — bundled (D5) |
| event timeline (action items) | `EventsTimeline` block | navigate via the server-resolved `action.link` | **Yes** — host composes the modal ([Part 42](#event-timeline-action-items-part-42--shipped)) |
| `workflow-overview` / `group-overview` | `Link` button | navigate | No — these *are* full pages |
| notifications / email | URL | navigate | No — no page loaded to host a modal |

**The "separate component" design keeps the modules decoupled.** The `EventsTimeline` and `ActionSteps` blocks fire a **generic** `onActionClick(action)` event — neither knows what a workflow simple-action surface is. The workflows module ships the modal as a standalone component, and the **host app page composes the two** (drops the modal, wires the event). So there is no events→workflows *code* coupling — the wiring lives in app composition, exactly where module composition belongs. Navigation remains the block default, so notifications, overviews, and direct deep-links are unaffected.

## Current state

Verified against the shipped pages (`modules/workflows/pages/workflow-action-*.yaml`). **Note:** [Part 46](../46-debundle-workflow-config/design.md) lands before this part and already reroutes `get_action` → `GetAction` and deletes `action_role_check` (the per-verb bag now arrives in the `GetAction` response); the descriptions below are the pre-46 shipped state, and this part's rewrite builds on the post-46 tree.

- **`workflow-action-edit.yaml`** — 8-step `onMount` (action_id guard → `get_action` → stale-URL guard allowlisting `[action-required, in-progress, changes-required]` → `get_workflow` → `action_role_check` → prime `fields.*` + `status` state). Body: workflow-closed banner, universal-fields (`mode: edit`), **status `Selector`** with a `_js` priority filter (`:135–156`) plus a "No transitions available" Alert when stage is `not-required`, comment `TiptapInput`, and a single **Save** button firing `interaction: submit_edit` + `current_status: {_state: status}` (`:196–215`).
- **`workflow-action-view.yaml`** — read-only: action header (title + status badge), universal-fields (`mode: display`), **Status History** card (List over `status`), **Comments** card (aggregation over `events` where `action_ids` ∋ this action and `metadata.comment` exists). No button bar, no stale-URL guard. **Note:** [Part 33](../33-comment-rendering/design.md), ordered before this part, deletes the Comments card and replaces it with the shared `events-timeline` `_ref` filtered to the action — by the time this part runs, the view body carries the timeline, not the card.
- **`workflow-action-review.yaml`** — workflow-closed banner, header, universal-fields (`mode: display`), comment field, a **floating-actions** bar with **Request Changes** (opens a comment `Modal`) + **Approve** (fires `interaction: approve`), and a `request_changes_modal` firing `interaction: request_changes`. Stale-URL guard allowlists `[in-review, error]`.
- **`ActionSteps.js`** — renders each action row as a hard `Link` to `action.link.pageId`/`urlQuery` (`:162–171`). No click event today.

Stale concept prose is already mostly reconciled: [ui Decision 7](../../../workflows-module-concept/ui/design.md) is current (signal buttons, no selector) and Part 39 reconciled `ui` D2/D4 and `submit-pipeline` D3. The remaining open item is [ui Open Question 4](../../../workflows-module-concept/ui/design.md) (simple-action error recovery), which this part resolves.

## Decisions

### D1 — Shared `simple-action-surface` component; pages and modal both `_ref` it

The body of a simple action — header + universal fields + comment + the signal button bar — becomes one component, `components/simple-action-surface.yaml`, parameterised by `mode`:

| `mode`   | Renders                                                                          | Button bar                                          |
| -------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| `edit`   | universal fields (editable) + comment                                            | `submit`, `progress`, `not_required`                |
| `view`   | header + universal fields (read-only) + status-history (a List over `current_action.status` — no request) | `resolve_error` (only at stage `error` — D4)        |
| `review` | header + universal fields (read-only) + comment                                  | `approve`, `request_changes` (modal)                |

The three `simple-*` pages `_ref` it; the `simple-action-modal` (D5) `_ref`s the same. One body, two containers — this DRY payoff is the reason the surface is extracted now rather than editing three pages in place.

**The [Part 33](../33-comment-rendering/design.md) events timeline is page-level chrome, not part of the surface** (review-2 #4). `workflow-action-view` renders the action-filtered timeline below the surface `_ref`; the modal omits it. Rationale: the modal's hosts are entity pages whose own entity timeline already shows the action's events and comments, so an in-modal copy duplicates what's directly behind the modal — and the full action-filtered stream lives on `workflow-action-view`, one navigation away (the modal is a shortcut, never the canonical surface). It also avoids a hard conflict: a second `events-timeline` instance on an entity page would collide on the component's fixed `get-events` request id (Lowdefy build throws `Duplicate requestId`; request ids are not `_ref`-scoped). Part 33's "the timeline rides the surface's `view` mode" line is amended to page-level accordingly.

**State contract.** The surface reads from a single `_state.current_action` namespace. The **`GetAction` response is spread into it** — the action doc plus the server-resolved `action_allowed` (`{ view, edit, review, error }`) and `buttons` (`{ submit, progress, … }` booleans) sit at the top (`current_action.status`, `current_action.buttons.submit`, `current_action.action_allowed.edit`), with the working inputs on sub-keys (`current_action.fields`, `current_action.comment`). The page's `onMount` populates `current_action` from the `get_action` request (now routed to `GetAction`, Part 46) and seeds `current_action.fields`; the modal's open handler does the same for the clicked `action_id`. One read convention, two writers.

**No client role-check (supersedes review-2 #3).** The shipped `action_role_check` mirror is deleted by [Part 46 D8](../46-debundle-workflow-config/design.md); access and button visibility arrive resolved in the `GetAction` response, so there is no per-page role computation and no `SetState` copy into the namespace — the surface reads `current_action.action_allowed.{verb}` and `current_action.buttons.{signal}` directly. The earlier trailing-`SetState` workaround (a copy from root `action_allowed` because the shared component's write target was fixed) is retired entirely.

**Universal-fields namespace contract ([Part 24](../24-universal-fields/design.md) — review-2 #5).** `Validate` matches state keys, and inputs bind state at their block IDs — so the renderer's edit-mode inputs must live at `current_action.fields.*` for the scoped `Validate` and the `fields` payload to see them. Part 24's renderer takes a `state_path` var (default `fields`, so the form sidebars and shared-page defaults are untouched); the surface passes `state_path: current_action.fields`, making the input block IDs `current_action.fields.{assignees, due_date, description}` (threading into the `user-multi-selector` id passthrough). Recorded on both sides — Part 24's design carries the var.

Each button's `CallAPI` payload is nullary on target:

```yaml
payload:
  action_id: { _state: current_action._id }
  signal: submit             # or progress / not_required / approve / request_changes / resolve_error
  current_key: { _state: current_action.key }
  fields: { _state: current_action.fields }   # assignees / due_date / description
  comment: { _state: current_action.comment }
```

No `form` / `form_review` (simple actions have no form body), and **no `current_status` / `target_status`** — the v0 selector payload is gone ([state-machine "What disappears"](../../../workflows-module-concept/state-machine/design.md)). The endpoint resolves to `_module.endpointId: { _build.string.concat: [update-action-, <action type>] }`, aligning with the form templates. `progress` has no `Validate` step (a draft is intentionally partial) but, like the form template ([Part 39 D2](../_completed/39-form-submit-buttons/design.md)), fires its own author hook — `onProgress` — before the engine call; the engine-side `progress_saved` log event is Part 38 (scoped out below). `submit` keeps a `Validate` step, **scoped** to the surface's own field namespace — `params: { regex: ^current_action\.fields\. }` (the repo idiom for namespaced validation, cf. `^entity\.` on edit pages). The scope matters because the surface is rendered both as a page and inside the modal: an unscoped `Validate` inside the modal would validate the **entire host entity page** (every unrelated input). Scoping to `current_action.fields.*` makes validation identical in both containers and confined to this action's fields.

### D2 — Button visibility reads `action.buttons` from GetAction

Each signal button's `visible` is a single server-resolved boolean — the client computes nothing:

```yaml
visible: { _state: current_action.buttons.submit }   # or progress / not_required / approve / request_changes / resolve_error
```

[Part 46 D5](../46-debundle-workflow-config/design.md) resolves `buttons.{signal}` server-side as the AND of the three read-time-knowable dimensions — FSM source-stage, the per-verb role gate (`action_allowed.{verb}` for the signal's required verb, [Part 34 D6/D8](../_completed/34-action-access-model/design.md)), and `allow_not_required` (for `not_required` only). No `button_signal_sources` `_ref`, no per-verb AND on the page, no `allow_not_required` term — all of it collapses into the boolean.

**The per-verb gate still applies — server-side.** A button's required verb (`submit`/`progress`/`not_required` → `edit`; `approve`/`request_changes` → `review`; `resolve_error` → `error`, [Part 34 D6](../_completed/34-action-access-model/design.md)) is folded into its `buttons.{signal}` boolean by `GetAction`. This is what lets **one shared surface** gate a mixed-verb button bar correctly: the server resolves each signal against the action's own verbs, stage, and the requesting user, so the same surface renders right for an editor, a reviewer, or an error-recoverer. The client never sees `action_allowed.{verb}` for button purposes (it stays available on the response for the modal's mode derivation — D5).

This deletes the `_js` priority lookup on the selector (`workflow-action-edit.yaml:144–156`) outright. A button shows exactly when its signal is coherent from the action's current stage — and [Part 38 D13(3)](../_completed/38-engine-rebuild/design.md) makes that matter: a **user-driven** signal with no FSM entry **throws**, so a button shown from an incoherent stage would surface a user error. Buttons the server marks `false` are still FSM-checked at submit (a concurrent stage push the read didn't see resolves to an undefined cell and no-ops). The `resolve_error` button on `workflow-action-view` falls straight out — `buttons.resolve_error` is true only at stage `error` for an `error`-verb user.

### D3 — `allow_not_required`: the single engine-enforced opt-in; all other buttons fixed

An earlier draft imported Part 39's full per-button author opt-out map to simple actions as "form parity", carried by a resolver-emitted runtime global. Review-2 #2 showed the mechanism didn't exist, and the requirements dig behind it showed the *requirement* didn't either: [ui](../../../workflows-module-concept/ui/design.md) specifies simple actions as "**no per-action customisation; identical experience for every simple action across every workflow**", and no button except `not_required` has a per-action story — hiding `submit` makes the page useless, `progress` is a harmless draft-save, and the rest are already stage- and role-gated. The opt-out was also UX-only: the engine accepts any user-driven signal with an FSM entry, so a hidden button never restricted anything.

`not_required` *is* a per-action policy ("is skipping this check ever legitimate?" — varies per action in a way FSM and roles can't express). It becomes the **single** authored flag, validated and enforced server-side (its machinery moved into Part 46 under the order flip):

- **Semantics** — `allow_not_required: true` at the action root, **any kind** (default absent = `false`, opt-in — preserving [Part 39 D3](../_completed/39-form-submit-buttons/design.md)'s safety rationale).
- **Server machinery — [Part 46](../46-debundle-workflow-config/design.md) (D5)** — validation (`makeWorkflowsConfig`, boolean); the kind-agnostic load-phase gate rejecting a **user-driven** `not_required` off **live config** (`access_denied`, ahead of pre-hooks — closing the gap where Part 39's client opt-out was only advisory); and the `not_required`-button resolution inside `GetAction`. Because `GetAction` reads the flag from live config, **no doc-persist-for-display is needed** — the earlier per-transition denormalisation plan is dropped. Engine-driven signals are unaffected.
- **Client (this part)** — the surface gates the `not_required` button on the server-resolved `_state: current_action.buttons.not_required`; zero config plumbing.
- **Form alignment ([Part 46](../46-debundle-workflow-config/design.md))** — `edit.yaml.njk`'s `not_required` term reads the same server-resolved boolean; the form's `page_config.buttons.not_required.visible` remains a plain author opt-out (default **`true`**), ANDed client-side (D5 layer 2).

All other buttons (`submit`, `progress`, `approve`, `request_changes`, `resolve_error`) are **fixed** on the simple surface — no config map, no resolver, no global. This is justified **structurally**, not just on "build for what exists": author button config (`.visible`/`.disabled`) only earns its place as a **runtime operator** reacting to live client state, which must be baked into the page at build time — and only the **generated form pages** have a per-action baking point. The three shared simple pages have none, so a simple action structurally **cannot** host per-action runtime button config (short of generating per-simple pages, rejected by [Part 46 D4](../46-debundle-workflow-config/design.md)). [Part 46](../46-debundle-workflow-config/design.md) resolves the *engine-policy* button booleans (FSM source-stage ∧ per-verb gate ∧ `allow_not_required`) server-side for every kind via `GetAction` — uniform by construction, and all a shared-page surface can consume. So 46 does **not** "reopen" configurable simple buttons; it confirms the boundary: form buttons can react to page state (generated pages), simple buttons obey engine policy only (shared pages).

### D4 — Error recovery: `resolve_error` on `workflow-action-view`

A simple action reaches `error` only via a pre-hook `error` cascade ([state-machine "Simple kind"](../../../workflows-module-concept/state-machine/design.md)) — no simple page surfaces an `error` button (the engine never self-sets `error`). [ui Open Question 4](../../../workflows-module-concept/ui/design.md) left the recovery surface open. **This part resolves it as the lighter option: a `resolve_error` button on `workflow-action-view`, rendered only when stage is `error`** (FSM `error → resolve_error → in-review`).

Rationale:

- A fourth static page for a rare cascade is heavier than the case warrants, and `workflow-action-view` already loads the full action — it's the natural recovery context.
- The Part 38 engine's per-verb link table needs one matching special case (Part 38 review-14 #4): for `kind: simple`, the `error` verb links to the **view** page (`workflow-action-view`) — there is no error page to link to — so an error-verb-only user still gets a working link from timeline cards and overviews. (The old engine's `linkDefaults` already routed the `error` stage to the view page, per the [Part 30 D4 table](../_rejected/30-status-map-rendering/design.md); the rebuilt table initially pointed the error verb at a nonexistent `simple-error` page — fixed via Part 38 task 18's link-table coordination.) Form kind is unaffected: generated `{workflow_type}-{action_type}-error` pages exist per verb.
- Visibility is the server-resolved `action.buttons.resolve_error` (true only at stage `error` for an `error`-verb user — [Part 46 D5](../46-debundle-workflow-config/design.md)).

`resolve_error` reuses the comment field (recovery note) and fires the standard payload. There is **no `simple-error` page** in v1.

### D5 — In-context modal: standalone component + generic `onActionClick`

Two new pieces plus one generic block event.

**`components/simple-action-modal.yaml` (standalone, reusable).** A single **`Modal`** block, fixed blockId `simple_action_modal`, whose body `_ref`s `simple-action-surface` with `mode` derived from the action's stage. With the events timeline page-only (D1 / review-2 #4), every mode is light — universal fields, status history, comment, signal buttons — so a centred `Modal` fits the content better than a `Drawer` (an earlier draft chose a `Drawer` to hold a timeline-bearing `view` mode; that rationale died with the in-modal timeline). One block type for all modes keeps the one fixed blockId / one open contract intact (a runtime block cannot switch its type by mode, so two container types would mean two blockIds and break the contract).

- stage `error` → `view` (surfaces `resolve_error`); stage `in-review` and `action_allowed.review` → `review`; an actionable stage with `action_allowed.edit` → `edit`; otherwise → `view`. (The per-verb bools come from the `GetAction` response — `current_action.action_allowed` — see the open sequence in this decision.)

Open contract (fixed, so any host wires it the same way):

```yaml
# Host wiring — both ActionSteps and EventsTimeline fire onActionClick(action),
# where action carries { _id, kind, status, link, … }. Branch on kind: only
# `check` actions open in the modal; every other kind navigates via action.link.
- type: SetState
  skip: { _ne: [{ _event: action.kind }, check] }
  params: { simple_action_modal: { action_id: { _event: action._id } } }
- type: CallMethod
  skip: { _ne: [{ _event: action.kind }, check] }
  params: { blockId: simple_action_modal, method: setOpen, args: [{ open: true }] }
- type: Link               # non-check kinds: navigate to the resolved page
  skip: { _eq: [{ _event: action.kind }, check] }
  params:
    pageId: { _event: action.link.pageId }
    urlQuery: { _event: action.link.urlQuery }
```

The branch reads `_event.action.{kind, _id, link}` — so the feeding read must carry `_id` **and** `kind` per action. `GetEntityWorkflows`'s projection adds both ([Part 46](../46-debundle-workflow-config/design.md) todo item E); `timeline_action_lookup.yaml` already projects `_id` and gains `kind` (below). Linkless rows never reach the `Link` branch — the blocks suppress the click for them (next paragraph).

On open the modal runs the **same fetch sequence the page's `onMount` runs**, for `simple_action_modal.action_id` — the surface depends on it (D6), and none of it runs unless the modal replicates it:

1. `get_action` (now `GetAction`, fresh — the list/timeline data may be stale) → spread the response into `current_action` (action doc **+ resolved `action_allowed` + `buttons`**) and seed `current_action.fields`. One read; no separate role-check.
2. `get_workflow` → drives the workflow-closed banner and the `required_after_close` gate on the submit buttons.

Then it renders — D2's button visibility and the mode derivation both read straight off `current_action`. On a successful signal call it runs the host-supplied `onComplete` refetch (passed as a `_var`) and closes. `mode: view` renders the surface's status history (a List over `current_action.status` — no request, modal-safe); the [Part 33](../33-comment-rendering/design.md) events timeline is **not** rendered in the modal (page-level only — D1 / review-2 #4): the host entity page's own timeline already carries the action's events and comments, and the full action-filtered stream lives on `workflow-action-view`.

**Both blocks fire a generic `onActionClick(action)` event.** When the host wires `onActionClick`, the block fires it with the clicked **action object** (`{ _id, kind, status, link, … }`) **instead of** navigating; when not wired, it navigates via the server-resolved `action.link`. This is `ActionSteps`' existing default (unchanged — notifications/overviews/deep-links preserved); **this part converges `EventsTimeline` onto the identical contract** (see *Event-timeline action items*, below — it shipped firing `{ pageId, urlQuery }` and with no navigate-default). Both blocks also **suppress the click for linkless rows** (keeping `ActionSteps`' existing disabled-row behaviour, `ActionSteps.js:170`), so `onActionClick` only ever fires for actionable rows — the host's `Link` branch never sees a null link. The event is **generic** (carries the action object); neither block gains workflow-surface knowledge.

**`actions-on-entity` — bundles the single modal instance.** The component drops `simple-action-modal` once and wires `ActionSteps.onActionClick` to it with the kind-branch above (`check` → open the modal; other kinds → `Link` to `action.link`), passing `entity-workflows-refetch` as `onComplete`. Apps that already use `actions-on-entity` get the modal for free — no per-app wiring (satisfies "one correct way"). Because the blockId is fixed (`simple_action_modal`), any other action surface on the same page (e.g. a co-present event timeline) targets **this same instance** by id — it does **not** drop its own. The rule is simple: **the modal is dropped exactly once per page, and `actions-on-entity` is what drops it when present.**

**Reusable without `actions-on-entity` — and graceful when absent.** The modal is **opt-in**, so there is no collision and no broken wiring on a page that lacks `actions-on-entity`:

- A page that renders the event timeline but not `actions-on-entity`, and **wants** the in-context modal, drops `simple-action-modal` itself (once) and wires `EventsTimeline.onActionClick` to it (passing its own timeline refetch as `onComplete`).
- A page with the timeline and **no modal at all** simply leaves `EventsTimeline.onActionClick` unwired — the timeline falls back to its default and **navigates to the action page** (the same server-resolved `action.link` default as `ActionSteps`). No missing-blockId target, no double-drop.

A developer never drops the standalone modal on a page that already has `actions-on-entity` (it's already bundled there), so the "exactly once" rule has no failure mode. The `EventsTimeline.onActionClick` event shipped with [Part 42](#event-timeline-action-items-part-42--shipped); this part defines the modal component and its open contract that the timeline hosts consume, and **converges the `EventsTimeline` event/default onto the `ActionSteps` contract** so the same kind-branch wiring drives both (see *Event-timeline action items*, below).

### D6 — What carries over unchanged

The shared-page scaffolding stays: the `action_id` presence guard, the `get_action` (now `GetAction`) / `get_workflow` requests, the workflow-closed banner + `required_after_close` gate on the submit buttons, the stale-URL guard on `workflow-action-edit` (`[action-required, in-progress, changes-required]`) and `workflow-action-review` (`[in-review, error]`), and `workflow-action-view`'s status-history card (absorbed into the surface's `view` mode) + the events-timeline `_ref` (Part 33's swap — rendered by the page below the surface, not inside it; D1 / review-2 #4). Replaced: the selector, the `interaction:`/`current_status` payloads, and the per-button `_js` visibility. **Gone** (deleted by [Part 46](../46-debundle-workflow-config/design.md) before this part runs): the `action_role_check` step and its `SetState`-into-namespace copy — access and buttons now arrive in the `GetAction` response (D1, D2).

## Event-timeline action items (Part 42 — shipped)

The reference project's entity timeline shows the **most recent event per action** as a status-coloured card linking to the action. This was a discovered gap when this part was first drafted; it is now **[Part 42 — Timeline action cards](../_completed/42-timeline-action-cards/design.md), shipped** (end-to-end testing pending the wave coming together). Part 42 wired the module-side aggregation (shared `timeline_action_lookup.yaml`), passes `actionStatusConfig`, ships the shared `visible_verbs.yaml` + `resolve_action_link.yaml` stages that the three read APIs adopted (the server-side link selection the navigation defaults above rely on), and the `EventsTimeline` block fires `onActionClick`.

A host page that wants in-context opening composes **this part's** `simple-action-modal` with the timeline (D5). **Convergence (this part) — was the "payload caveat".** As shipped, `EventsTimeline.onActionClick` fires `{ pageId, urlQuery }` (the resolved link) and the block has no navigate-default, while the modal contract and the kind-branch need `_event.action.{_id, kind, link}`. Since **nothing consumes the timeline's action click yet** (workflows aren't live; no migration concern), this part converges the block rather than carrying the caveat forward:

- **`EventsTimeline` block** — `onActionClick` fires the **action object** (matching `ActionSteps`), and the block **navigates via `action.link` by default** when `onActionClick` is unwired (it previously only fired the event). Identical contract to `ActionSteps`; linkless rows suppress the click.
- **`timeline_action_lookup.yaml`** — the `$project` already carries `_id`; it **gains `kind`** so the branch has it. (This is a small edit to the shipped Part 42 lookup, which Part 46 D6 leaves in place until the timeline-port follow-up; the `kind` field rides along when that port lands.)

With both, the same kind-branch wiring (D5) drives the timeline exactly as it drives `actions-on-entity`.

## Concept-doc reconciliation

| File | Change |
| ---- | ------ |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) Open Question 4 | **Resolve:** simple-action error recovery is a `resolve_error` button on `workflow-action-view` (D4), no `simple-error` page. Move from Open Questions into Decision 7's body. |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) Decision 7 | Already signal-based — add the D3 note (`not_required` gated by the root `allow_not_required`, resolved server-side; no other per-action button config), the resolved error-recovery line, and the in-context modal (D5) as the in-app open path alongside the page. |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) "no per-action customisation" (simple-pages para) | Record the single exception: the `allow_not_required` flag (D3). |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) Decision 2 button table | `not_required` row: the opt-in moves from `pages.edit.buttons.not_required.visible` to the root `allow_not_required` (engine-enforced, any kind); `page_config.buttons.not_required.visible` becomes a plain opt-out, default `true` (D3 form alignment). |
| [`ui/design.md`](../../../workflows-module-concept/ui/design.md) Decision 3 (`actions-on-entity`) | Note the bundled `simple-action-modal` + `ActionSteps.onActionClick` wiring. |
| [state-machine `Next step` item 3](../../../workflows-module-concept/state-machine/design.md) | Mark the remaining sub-question (how simple pages surface `error` recovery) as resolved by this part. |

No change to `submit-pipeline` D3 or `ui` D2/D4 — Part 39 already reconciled those.

## Files changed

### Module pages + components

| File | Change |
| ---- | ------ |
| `modules/workflows/pages/workflow-action-edit.yaml` | Delete the status `Selector`, the "No transitions available" Alert, and the `current_status` payload. Body moves to the shared surface (`mode: edit`). `interaction: submit_edit` → `signal: submit`. Align endpoint to `_module.endpointId`. |
| `modules/workflows/pages/workflow-action-view.yaml` | Body moves to the shared surface (`mode: view`); add the conditional `resolve_error` button (D4). The Part 33 events-timeline `_ref` stays page-level, below the surface (D1). |
| `modules/workflows/pages/workflow-action-review.yaml` | Body moves to the shared surface (`mode: review`); keep `request_changes_modal`. `interaction:` → `signal:`. Align endpoint. |
| `modules/workflows/components/simple-action-surface.yaml` (new) | The shared body — header + universal fields + comment + signal button bar, `mode` param. Reads `_state.current_action.*` only; each button's `visible` is the server-resolved `current_action.buttons.{signal}` (no `button_signal_sources` `_ref`, no `action_role_check`). |
| `modules/workflows/components/simple-action-modal.yaml` (new) | Standalone `Modal` block (fixed blockId, `setOpen` open contract, `onComplete` var) wrapping the surface (D5). |
| `modules/workflows/components/actions-on-entity.yaml` | Bundle `simple-action-modal`; wire `ActionSteps.onActionClick` with the kind-branch (`check` → open modal, else `Link` to `action.link`), `entity-workflows-refetch` as `onComplete`. |
| `modules/shared/workflow/timeline_action_lookup.yaml` (Part 42, shipped) | Add `kind` to the action `$project` (already projects `_id`) so timeline action cards carry the modal/branch inputs (#2). |
| _(`makeWorkflowsConfig.js` `allow_not_required` validation + `edit.yaml.njk` form button-bar alignment)_ | **Moved to [Part 46](../46-debundle-workflow-config/design.md)** — validated and resolved server-side; not in this part. |

### Plugin

| File | Change |
| ---- | ------ |
| `plugins/.../blocks/ActionSteps/ActionSteps.js` | Generic `onActionClick(action)` event: fire the clicked action object when wired, navigate via the server-resolved `action.link` otherwise (default unchanged). Suppress the click for linkless rows (`:170`). |
| `plugins/.../blocks/ActionSteps/ActionSteps.test.js` | Cover both modes (event fires when wired; link navigates when not) + linkless rows inert. |
| `plugins/.../blocks/EventsTimeline/EventsTimeline.js` (Part 42, shipped) | **Converge onto the `ActionSteps` contract** (#2): `onActionClick` fires the **action object** (was `{ pageId, urlQuery }`, `:404–407`); navigate via `action.link` by default when unwired (previously it only fired the event); suppress the click for linkless rows. |
| `plugins/.../blocks/EventsTimeline/{EventsTimeline.test.js, meta.js, README.md}` | Update the `onActionClick` payload + default-navigate coverage and docs. |
| _(`WorkflowAPI` load-phase gate + `allow_not_required`)_ | **Moved to [Part 46](../46-debundle-workflow-config/design.md)** (D5) — the kind-agnostic load-phase enforcement gate lives there; no doc-persist (`GetAction` reads live config). Not in this part. |

### Tests

- **E2E (Part 22 supplements)** on the demo's `schedule-followup` simple action: (a) Mark Started (`progress`) on `action-required` lands `in-progress`, persists due-date without advancing; (b) `submit` resolves `in-review` vs `done` per the `review` verb (nullary); (c) a button the `GetAction` response marks `false` (wrong stage or missing verb) is not rendered; (d) error recovery: a cascaded `error` shows `resolve_error` on `workflow-action-view`/modal and recovers to `in-review`; (e) clicking a `check` action in `actions-on-entity` opens the modal and submits without navigation, then the list refetches; (f) clicking a non-check (e.g. form) action in `actions-on-entity` navigates to its page instead of opening the modal; (g) the event-timeline action card opens the modal for a `check` action and navigates for others.
- **E2E supplement** — `not_required` hidden by default on the check edit surface; authored `allow_not_required: true` on a demo action shows it (via `GetAction`'s resolved `buttons.not_required`) and the signal lands `not-required`.

(The `allow_not_required` engine-unit coverage — `makeWorkflowsConfig` validation, the load-phase `access_denied` gate for form + simple, and `GetAction` resolving `buttons.not_required` off live config — moves with the machinery to [Part 46](../46-debundle-workflow-config/design.md).)

### Concept docs

Per [Concept-doc reconciliation](#concept-doc-reconciliation): `ui/design.md` (OQ4, Decisions 3 + 7), `state-machine/design.md` (Next-step item 3).

### Parent design

Add a Part 40 row to [`designs/workflows-module/design.md`](../../design.md) follow-on parts (depends on Parts 46, 34, 35, 38, 24; after 39/46 — 46 lands first and owns the `GetAction` contract this part renders from). Flag that Part 34 (per-verb access model) is not yet in the parent dependency graph — Part 40 adopts its model, so the parent should slot Part 34 ahead of the 24/39/40 UI wave and note that 24/39 migrate to per-verb alongside. Note that [Part 42](../_completed/42-timeline-action-cards/design.md) (timeline action cards, shipped) consumes this part's modal via host composition.

## Out of scope

- **Form-action surfaces** — Part 39. This part touches only the three static simple pages, the surface/modal components, `actions-on-entity`, `ActionSteps`, and the resolver.
- **The event-timeline aggregation + cards** — [Part 42](../_completed/42-timeline-action-cards/design.md), shipped. This part *does* converge `EventsTimeline.onActionClick` + its navigate-default and add `kind` to the lookup `$project` (#2) so timeline hosts can drive the modal; the timeline read's full engine-method port stays deferred ([Part 46 D6](../46-debundle-workflow-config/design.md)).
- **Modal on overview pages** — they *are* full pages; they navigate.
- **The `update-action-{type}` endpoint / engine FSM** — Part 38.
- **`GetAction` / server-side config reads / button + access resolution / the `allow_not_required` validation + load-gate** — [Part 46](../46-debundle-workflow-config/design.md); this part consumes the response.
- **A `simple-error` page** — resolved against (D4).
- **Per-action button config on simple actions** — structurally impossible (shared pages have no per-action build-time baking point; D3). Form actions retain their generated-page `.visible`/`.disabled` runtime config ([Part 46 D5](../46-debundle-workflow-config/design.md) layer 2); simple actions obey server-resolved engine policy only.
- **`progress` engine behaviour** (`progress_saved` event, field persistence) — Part 38.

## Related

- [Part 39 — Form submit buttons](../_completed/39-form-submit-buttons/design.md) — sibling; ships `enums/button_signal_sources.yaml` and the concept reconciliation this part consumes; scopes simple actions out to here.
- [state-machine](../../../workflows-module-concept/state-machine/design.md) — signal inventory, FSM tables, "Simple kind" (identical to form), "Default v1 button bars".
- [Part 38 — Engine rebuild](../_completed/38-engine-rebuild/design.md) — the `signal` contract; user-driven unlisted signals throw (D2 rationale).
- [Part 34 — Action access model](../_completed/34-action-access-model/design.md) — the per-verb access model this part builds on: `visible_verbs` / per-verb `action_allowed` (D8) gate the mixed-verb surface, and `action.links.{verb}` (D7/D9) drive navigation.
- [Part 30 — Status-map rendering](../_rejected/30-status-map-rendering/design.md) — the engine-written link consumed by every display surface (single `link` per D4, superseded by Part 34 D7's per-verb `links`); makes the page the canonical target.
- [Part 42 — Timeline action cards](../_completed/42-timeline-action-cards/design.md) — shipped; the server-side link selection (`visible_verbs.yaml` + `resolve_action_link.yaml` in the read APIs) the blocks' navigation default relies on, and the timeline surface whose hosts compose this part's modal.
- [Part 35](../_completed/35-rename-task-kind-to-simple/design.md), [Part 24](../24-universal-fields/design.md) — upstream renames + the real universal-fields renderer.
- [ui](../../../workflows-module-concept/ui/design.md) Decisions 3 + 7, Open Question 4 — the simple-action UX this part implements and resolves.
