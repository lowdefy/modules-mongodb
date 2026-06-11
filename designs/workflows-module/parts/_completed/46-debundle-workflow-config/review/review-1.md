# Review 1

Verified against shipped source on branch `workflows-module`. The design's *current-state* facts are almost all accurate — every cited line number checks out (`actions-on-entity.yaml:76`, `:38`; `workflow-group-overview.yaml:87`, `:110`; the `workflows_config.yaml`/`action_form_configs.yaml` `_ref`s at `workflow-overview:76,297` and `workflow-group-overview:87,333`), the three read APIs do query the docs and splice `visible_verbs_filter.yaml` + `resolve_action_link.yaml` exactly as described, and `makeWorkflowsConfig.js` does prune to `ACTION_FIELDS`/`WORKFLOW_FIELDS` server-side. The core thesis (move display config to read-time methods, delete client embeds) is sound and well-motivated.

The findings below are where the design's claims about reusable JS, the "one implementation" win, and — most importantly — the `buttons` mechanism diverge from what the code and the sibling parts actually contain.

## Blocking — cross-part inconsistency

### 1. The `buttons` field and D5 are built on a Part 40 design that was deleted

> **Resolved.** Finding validated against Part 40 (D3 dropped the authored per-action button map; "all other buttons fixed, no config map") and the concept `ui` spec. Rather than drop buttons, the part was **re-scoped**: it now adds a fourth read method `GetAction` and resolves button visibility *and* per-verb access **server-side** to final answers (`buttons` per-signal booleans + the `action_allowed` verb bag), so clients render dumb and the client verb mirror `action_role_check.yaml` is retired. D5 now folds in the missing **FSM source-stage** term (finding #1b) alongside the verb gate, `allow_not_required`, and the **form** per-instance opt-out (which migrates from baked generated pages into validated config). The bogus simple-kind `buttons` map is gone (point 4 reframed); the "overrule Part 40 #2/#6" framing is replaced by "Part 40 consumes this contract" — Part 40 is paused and re-sequenced to depend on Part 46. Part 39's shipped form button bars are rewritten to consume the booleans. See new D8, reworked D5/D2, point 4, the read-methods table (no `buttons` on the three overview methods — those surfaces render links, not buttons), and Ripples.

The design's whole button story — point 4 (`ACTION_FIELDS` + `buttons`, "validate shape: `{signal}: { visible: boolean }`"), point 5, D5, and the Ripples claim that it "overrules Part 40 review-2 #2/#6" — assumes Part 40 ships a **per-action authored `buttons.{signal}.visible` opt-out map**. It does not. Part 40 review-2 #2 was resolved by **dropping that map entirely**, and Part 40's final design states this directly:

- `40/design.md:125`: *"All other buttons (`submit`, `progress`, `approve`, `request_changes`, `resolve_error`) are **fixed** on the simple surface — no config map, no resolver, no global."*
- `40/design.md:245`: *"Per-action button config beyond `allow_not_required` — rejected as a requirement (D3)."*
- The rejection was on **requirements** grounds, not mechanism: `ui` specifies simple actions as *"no per-action customisation"* (`40/design.md:115`).

So `buttons` (shape `{signal}: { visible: boolean }`) is not a field that exists in authored config; the only per-action button input Part 40 leaves is the single boolean `allow_not_required` (action root), and that one already rides the action doc into state via `get_action` — it is not a `workflows_config` embed at all (`40/design.md:121`). Part 46's premise that there is a client `workflows_config`-read of a button map to debundle is false for buttons.

Two consequences for the design:

a. **Point 4 / "Validated config additions" — drop the `buttons` add to `ACTION_FIELDS`** (no such authored field), or, if the intent is genuinely to re-introduce a per-signal map, the design must say it is *reversing* Part 40 D3's requirements decision and justify it — not frame it as merely "overruling a client-side read." As written it silently resurrects a rejected requirement.

b. **D5's model of button visibility is incomplete.** Part 40 computes a button's `visible` as three ANDed terms (`40/design.md:89,101`): the **FSM source-stage check** (read at build time from the shared `enums/button_signal_sources.yaml` via `_ref`), the **per-verb role gate** (`visible_verbs`), and — for `not_required` only — `allow_not_required`. D5 describes the server-resolved answer as "authored opt-outs combined with the user's visible verbs," which omits the FSM-stage dimension that is actually the dominant term (`submit` only at `action-required`/`in-progress`/`changes-required`; `approve`/`request_changes` only at `in-review`; `resolve_error` only at `error`). A `buttons: { submit: true, cancel: false }` resolved without the stage term would be wrong.

**Fix.** Reconcile with Part 40 D3. The cleanest reading: Part 46 has **nothing to do for buttons** — `visible_verbs` is already in the three API responses, `allow_not_required` already rides the doc, and `button_signal_sources.yaml` is a shared (not per-workflow) FSM enum that is not part of the config-embed problem. Delete point 5, D5, the `buttons` line in point 4, and the OQ4/review-2 "overrule" claims in Ripples. *If* you instead want to fully server-resolve button visibility (server collapses all three dimensions, client renders dumb buttons — a legitimate goal, parallel to the link collapse), then say so explicitly, fold in the FSM-stage term, account for rewriting Part 40's already-shipped signal-button bar to consume `action.buttons.{signal}`, and justify reversing D3.

## Accuracy — reuse claims overstated

### 2. `evaluateVerbGate.js` is not plugin JS, and the link "collapse" is not existing JS

> **Resolved.** Verified: `evaluateVerbGate.js` is module-side (the `action_role_check.yaml` mirror), the plugin has only `gateAllows`, and the `edit > review > error > view` collapse is the `$switch` in `resolve_action_link.yaml` (`computeEngineLinks` returns the uncollapsed per-verb map). D2 was reworked in the #1 rescope to say "**this is a port, not reuse**," naming the three pieces to port (the four-key `visible_verbs` bag, the `_user.apps.{app}.roles` extraction, the link collapse). Size repriced **M–L → L–XL**, also covering the new `GetAction` port and the form-template/simple-surface rewrites.

D2 says the read-side YAML stages are *"re-implementations in aggregation YAML of logic the plugin already has in JS (`evaluateVerbGate.js`, `computeEngineLinks.js`)"*, and "The read methods" step 2 says the methods evaluate verbs and link selection *"with the existing JS (`evaluateVerbGate`, the `edit > review > error > view` collapse)."* Verified against source, this overstates what is reusable:

- **`evaluateVerbGate.js` is not in the plugin.** It lives at `modules/workflows/components/evaluateVerbGate.js` — a module-side mirror (`gateAllows` + `computeActionAllowed`) whose only purpose is to be inlined into `action_role_check.yaml`'s `_js` and unit-tested against the oracle (see its own header comment, lines 1–13). The plugin package cannot import it across the `modules/` ↔ `plugins/` package boundary. The plugin's own copy is `gateAllows` in `loadWorkflowState.js:28` — and that is the **per-gate** primitive only; neither the four-key `visible_verbs` bag builder nor the `_user.apps.{app}.roles` extraction exists in the plugin.
- **The `edit > review > error > view` collapse is not JS at all.** It lives in `modules/shared/workflow/resolve_action_link.yaml:31–61` (a `$switch`). `computeEngineLinks.js` returns the **per-verb map** `{ view, edit, review, error }` per slug (`computeEngineLinks.js:30`) and deliberately does **not** collapse it.

So the read methods must **port** three pieces of YAML/mirror logic into new plugin JS: (i) the `visible_verbs` four-key bag (`visible_verbs.yaml`), (ii) the link collapse (`resolve_action_link.yaml`), and (iii) the grouping + display join. That is real work, not "reuse." Reword D2 and "The read methods" step 2 accordingly, and consider whether the **M–L** size holds once the port (rather than reuse) is priced in.

### 3. "Consolidates verb/link/button policy to one implementation (One correct way)" is not achieved

> **Resolved.** The rescope makes the consolidation real. Because access/buttons are now resolved server-side and clients render dumb, the client mirror `action_role_check.yaml` (place 1) is **deleted** (D8). The new read-method JS (place 3) is the single implementation, shared with the submit-time gate (place 2). The only duplication left is the YAML stages kept solely for the timeline path (place 4) — the acknowledged D6 debt, deleted when that follow-up lands. D2/D6 reworked to say exactly this ("the last remaining duplication after this part retires the client mirror").

D2's headline benefit is consolidation to one implementation. After this part the verb-gate logic still exists in **four** places, not one:

1. `modules/workflows/components/evaluateVerbGate.js` — the client mirror, still used by `action_role_check.yaml`, which **stays** (Part 40 `design.md:178,203` keeps `action_role_check` to populate `_state.action_allowed` for client button gating).
2. `loadWorkflowState.js:28` `gateAllows` — the authoritative submit-time gate.
3. the new read-method JS this part adds.
4. `visible_verbs.yaml` / `resolve_action_link.yaml` — kept for the timeline path (D6, acknowledged).

D6 already flags (4). But the design should also acknowledge (1): because Part 40's surface computes button visibility client-side from `action_role_check` + the FSM enum (finding #1b), this part does **not** retire the client verb mirror. The "One correct way" framing is aspirational here — temper it, or pair it with the concrete follow-ups (retire the mirror once the surface consumes server-resolved buttons; land the D6 timeline port) that would actually deliver it.

## Gaps — under-specified mechanics

### 4. The read methods move off the `workflows-collection` connection onto `WorkflowAPI` — user/roles plumbing is unspecified

> **Resolved (user plumbing) / Rejected (checkRead-checkWrite).** Valid that the user input had to be pinned, now for four methods. Resolved with a **connection-level `user: { _user: true }` property** — resolved per-request like `changeLog.meta.user`, exposed as `context.user`, read against `context.connection.app_name`; the verb gate extracts `apps.{app_name}.roles` server-side ("The read methods"). The `.meta = { checkRead: true, checkWrite: false }` half is **rejected as inapplicable**: that optional read/write toggle doesn't fit a single connection serving both reads and writes (toggling reads/writes off per-method makes no sense for this plugin).

All three read APIs today run `type: MongoDBAggregation` against `_module.connectionId: workflows-collection` (`get-entity-workflows.yaml:5–7`, `get-workflow-overview.yaml:5–7`, `get-action-group-overview.yaml:5–7`), and the per-user verb filter is supplied **by Lowdefy** resolving `_user: apps.{app}.roles` as an operator inside `visible_verbs.yaml` at request time. Moving the logic into a `WorkflowAPI` connection method changes who supplies the user:

- The `WorkflowAPI` connection presently receives the user only as `changeLog.meta.user: { _user: true }` (`workflow-api.yaml:24–25`), consumed verbatim by `planChangeLog`. The new read methods need the user's **per-app roles** (`apps.{app_name}.roles`) to compute `visible_verbs`. The design says "_user reaches the method via endpoint properties (`_user`), as `changeLog.meta.user` already does" — but that is a connection-level property, evaluated once for change-logging, not a per-read-request input. Specify the actual wiring: a request property (e.g. `user: { _user: true }`) on each read API routine, threaded through `createEngineContext` (which already exposes `context.user`) and read against `context.connection.app_name` (already present, `workflow-api.yaml:13`).
- Also state that each new method needs `.meta = { checkRead: true, checkWrite: false }` and registration in `WorkflowAPI.js`'s `requests` map (the four current handlers are all `checkWrite`).

None of this is hard (the plugin architecture supports it cleanly), but "each routine becomes a single engine-method call" hides the contract change and the verb-input plumbing — pin it so the implementer doesn't rediscover it.

## Minor

### 5. `get-action-group-overview` must preserve `group.summary`/`status` (and likely a back-link), not just add display fields

> **Resolved.** Preservation captured: the response table now states `GetActionGroupOverview` reproduces `group.{id, status, summary}` and per-action `{type, status, message, link, visible_verbs}`, only *adding* display fields. The back-link question went further than the finding: the entity back-link was being built client-side from `_module.var: entities` + `workflow.{entity_collection, entity_id}`, which is the same client-link fork this part closes. Since the connection is configured per host app, the `entities` routing map moves onto it and the overview methods return a resolved `workflow.entity_link` (`{pageId, urlQuery, title}`); the `_module.var: entities` reads + client construction are deleted. So **no `group.link`** is needed — back-nav is the resolved `entity_link`. See "The read methods", the response table, and What gets deleted.

The response-additions table (line 94) lists only the *additions* for `get-action-group-overview` (`workflow.title`; `group.title`/`icon`; `form_meta`; `buttons`). The existing endpoint returns `group: { id, status, summary }` (`get-action-group-overview.yaml`, the `_js` in the `:return:`) and per-action `{ type, status, message, link, visible_verbs }`. The ported method must reproduce all of those (`status` via `$arrayElemAt`, `message` via the `app_name` concat, the `not-required` sort, the group `summary`) — "extended with display fields" is right but easy to under-build. One concrete omission to decide: `get-entity-workflows` groups gain a `link` (line 92), but the group-overview table lists no `group.link` — confirm whether the group-overview page needs a back/self link or genuinely doesn't.

### 6. "No client artifact carries any workflow config" overreaches

> **Resolved.** The rescope deletes both counterexamples the finding cited — `action_role_check` (client verb computation) is removed (D8) and the `button_signal_sources.yaml` `_ref` leaves the surfaces (D5); #5 also removed the `_module.var: entities` read. The closing claim was tightened to "no client artifact reads per-workflow config **at runtime**, and no client computes access/visibility," explicitly naming the two intended, out-of-scope exceptions: build-time generation (`makeActionPages`, D4) and app-level vars (`app_name`). The "Net client result" line was already precisely scoped.

The closing claim (line 15) and the "Net client result" (line 111) state that after this part no client artifact carries workflow config. Part 40's surface still reads `enums/button_signal_sources.yaml` via `_ref` at build time and still computes verbs client-side via `action_role_check` (finding #1b/#3). The FSM enum is shared/static (not per-workflow), so it is legitimately out of scope — but the absolute phrasing should carry that caveat ("no *per-workflow* config embed"), otherwise it reads as contradicting the surviving build-time enum and client verb mirror.

## Verified accurate (no action)

- Moving `makeActionFormConfigs`'s projection per-action into `makeWorkflowsConfig` (point 4 / "Validated config additions") **does** dissolve the cross-workflow `action.type` collision (review-2 #6 / the stub's OQ2): the current `makeActionFormConfigs.js:47` keys `out[action.type]` globally, whereas `pick(action, ACTION_FIELDS)` already runs per-workflow per-action, so `form_meta` lands on the right action with no keying. Sound.
- D3 (config stays on the connection): `validated_workflows_config.yaml` → `workflow-api.yaml:11` confirmed; the connection copy is server-side and pruned (no hooks/forms/events) per `makeWorkflowsConfig` — the stub's exposure claim was indeed wrong for the connection.
- D4 (shared overview pages stay) and the build-time resolvers staying: `makeWorkflowApis` (`module.lowdefy.yaml:149`) and `makeActionPages` (`:162`) confirmed present and unaffected.
- The titles-map and `action_form_configs` deletions: both `_ref` chains and all five call sites verified at the cited lines.
